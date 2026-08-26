/**
 * The web UX layer — a thin presentation surface over what's already proven.
 *
 * This file does not touch detector logic, the registry builder, or the Minds
 * integration itself. It exists solely to make the two demo beats filmable:
 * Beat A (the memory-on vs memory-off comparison, with a receipts drill-down)
 * and Beat B (an unprompted message arriving with no human turn in between).
 *
 * Cost discipline: every route below is a free local file read except one —
 * POST /api/live-answer/refresh — which is the only thing in this whole file
 * that can spend cognition, and it requires an explicit confirmation from the
 * client. No route polls the live Mind on an interval.
 *
 * Run: npm run web        (node src/server.ts)
 *      npm run web:dev    (node --watch src/server.ts)
 */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { z } from "zod";
import {
  helmetMiddleware,
  corsMiddleware,
  apiRateLimiter,
  strictRateLimiter,
  authMiddleware,
  sanitizeBody,
  validateBody,
} from "./security.ts";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  freshAlias,
  getCognitionBalance,
  getHistory,
  sendOnly,
  findReply,
} from "./minds-client.ts";
import { readSession, markRestart } from "./demo-session.ts";
import {
  headlineFor,
  lastSeenFor,
  transformFeedMessages,
  findPronounIssues,
  type WatchEntry,
} from "./presentation.ts";
import type { Watchlist } from "./registry.ts";
import { createStore } from "./kv-store.ts";
import {
  verifyDiscordToken,
  listChannels,
  checkChannel,
  backfillCommunity,
  buildPayloads,
  startPush,
  checkPush,
  OnboardingError,
} from "./onboarding.ts";
import {
  encryptSecret,
  saveGuildConfig,
  getGuildConfig,
  listGuilds,
  appendGuildMessages,
  type GuildConfig,
} from "./tenant-store.ts";
import { runCycle } from "./cron-poll.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

async function loadEnv(): Promise<Record<string, string>> {
  const path = root(".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const env = { ...(await loadEnv()), ...process.env };
const getApiKey = () => process.env.MINDS_BUILDER_API_KEY || env.MINDS_BUILDER_API_KEY;
const getMindId = () => process.env.KITH_MIND_ID || env.KITH_MIND_ID;

if (!getApiKey()) {
  console.error("MINDS_BUILDER_API_KEY is not set in .env — the live-answer route will fail.");
}
if (!getMindId()) {
  // No fallback to a hardcoded Mind on purpose: this repo is meant to be run
  // by anyone against their own Mind, and silently defaulting to ours would
  // mean a fresh clone talks to (and spends the cognition of) a Mind that
  // isn't theirs, without any indication that's what's happening.
  console.error(
    "KITH_MIND_ID is not set in .env — the live-answer route will fail.\n" +
      "  Find your Mind's id with: minds list --pretty",
  );
}

const DATA = root("data");
const CONTENT = root("content");
const SESSION_PATH = `${DATA}/demo-session.json`;
const COGNITION_LOG_PATH = `${DATA}/cognition-log.json`;
const LIVE_ANSWER_PATH = `${DATA}/last-live-answer.json`;

const app = express();

// ── Security middleware ───────────────────────────────────────────────────────
app.disable("x-powered-by");
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use(sanitizeBody);
app.use(apiRateLimiter);
app.use(authMiddleware);
app.use(express.static(root("public")));

// ── Zod validation schemas ──────────────────────────────────────────────────
const connectSchema = z.object({
  guildId: z.string().min(1),
  guildName: z.string().optional(),
  channelIds: z.array(z.string()).min(1),
  digestChannelId: z.string().optional(),
  apiKey: z.string().min(1),
  mindId: z.string().min(1),
});

const pushSchema = z.object({
  apiKey: z.string().min(1),
  mindId: z.string().min(1),
  registry: z.record(z.unknown()),
  watchlist: z.record(z.unknown()),
  confirm: z.literal(true),
});

const buildSchema = z.object({
  channelId: z.string().min(1),
  communityName: z.string().optional(),
  sinceDays: z.number().int().min(1).max(60).optional(),
  guildId: z.string().optional(),
});

// ── small helpers ────────────────────────────────────────────────────────────

async function readJson<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

// The live-answer cache and the cognition log are runtime state — written
// by one request, read by a later one — not build-time artifacts like
// registry/watchlist/briefing (those are plain readJson/writeJson on
// purpose: they're regenerated fresh at every deploy, nothing depends on a
// write from one request surviving to the next). Routed through
// kv-store.ts's SmallStore so they behave correctly on Vercel too; see that
// file's comment for why this specific state is the state that needed it.
const liveAnswerStore = createStore(() => LIVE_ANSWER_PATH);
const cognitionLogStore = createStore(() => COGNITION_LOG_PATH);

type CognitionLogEntry = {
  at: string;
  question: string;
  before: number;
  after: number;
  spent: number;
};

// ── free reads: registry / watchlist / briefing ─────────────────────────────

app.get("/api/registry", async (_req, res) => {
  const data = await readJson(`${DATA}/registry.json`, null);
  if (!data) {
    res.status(404).json({ error: "No registry.json yet — run `npm run registry` first." });
    return;
  }
  res.json(data);
});

app.get("/api/watchlist", async (_req, res) => {
  const data = await readJson<{ watching: WatchEntry[] } | null>(
    `${DATA}/watchlist.json`,
    null,
  );
  if (!data) {
    res.status(404).json({ error: "No watchlist.json yet — run `npm run registry` first." });
    return;
  }
  res.json({
    ...data,
    watching: data.watching.map((m) => ({
      ...m,
      headline: headlineFor(m),
      lastSeen: lastSeenFor(m.quietForH),
    })),
  });
});

app.get("/api/briefing", async (_req, res) => {
  const data = await readJson(`${DATA}/briefing.json`, null);
  if (!data) {
    res.status(404).json({ error: "No briefing.json yet — run `npm run registry` first." });
    return;
  }
  res.json(data);
});

// ── Beat A: baseline (free) and live answer (cached read + gated refresh) ──

app.get("/api/baseline", async (_req, res) => {
  const data = await readJson(`${CONTENT}/baseline-answer.json`, null);
  res.json(
    data ?? {
      question: "Is anyone in the community struggling right now?",
      answer: "I don't have information about specific members.",
      source: "hand-authored",
    },
  );
});

app.get("/api/live-answer", async (_req, res) => {
  const cached = await liveAnswerStore.read<{ answer?: string } | null>("live-answer", null);
  if (!cached) {
    res.json({
      question: null,
      answer: null,
      capturedAt: null,
      note: "No live answer captured yet. Use the refresh button to ask Kith once.",
    });
    return;
  }
  // Recomputed on every read, not just at capture time, so a registry change
  // (someone's stated pronoun gets added, say) re-evaluates this without
  // needing a fresh, paid capture.
  const registry = await readJson<{ members?: Array<{ name: string; pronouns: string }> }>(
    `${DATA}/registry.json`,
    { members: [] },
  );
  const pronounIssues = cached.answer
    ? findPronounIssues(cached.answer, registry.members ?? [])
    : [];
  res.json({ ...cached, pronounIssues });
});

const LIVE_QUESTION = "Is anyone in the community struggling right now?";
// Sent to the Mind, not shown on screen — the displayed "question" stays
// exactly what the baseline panel asks, for the side-by-side framing to
// hold. This is where the pronoun instruction gets reinforced: the
// structural fix (registry.pronouns) has been observed to hold for a
// question's primary subject but not reliably for people mentioned only in
// passing deeper in the answer (docs/evidence/2026-08-17-pronoun-guard
// -caught-a-real-case.md) — restating the rule explicitly, every time, is
// the cheap half of the fix; findPronounIssues below is the other half.
//
// The kith-watchlist steer is not cosmetic — it's the whole reason the
// registry/watchlist split exists at all (see registry.ts's own header
// comment). Without it, an open question like this one gives the Mind no
// reason to prefer the small watchlist artifact over the full registry,
// and on a real, large community it will fall back to reading the full
// thing cold. Confirmed live against a real 193-member community: the
// exact same question, sent without this steer, took over 75 minutes and
// never definitively returned — almost certainly a full-registry read, not
// a platform problem. The watchlist is ~66 members / ~5K tokens regardless
// of how large the registry gets, which is the entire point of building it
// as a separate, cadence-sized artifact in the first place.
const LIVE_PROMPT =
  `Check your kith-watchlist artifact (not the full kith-registry) to answer this: ${LIVE_QUESTION} ` +
  `The watchlist already contains everyone currently carrying a signal — you should not need the full ` +
  `registry to answer this question. When you refer to any member by name, including anyone ` +
  `mentioned only briefly or in passing, use their stated pronouns from the ` +
  `watchlist — they/them unless a pronoun is explicitly recorded for that ` +
  `specific person. This applies to every person named in your answer, not ` +
  `only whoever the answer is mainly about.`;

// Split into a fast kick-off (this route) plus a separate free poll
// (/api/live-answer/status, below) — same reason as the setup wizard's
// push: a real reply has measured 76-111s live, past what one Vercel
// function invocation can hold open (maxDuration 60s in vercel.json). This
// route used to block on a single call; that meant it could actually reach
// the Mind and spend real cognition, then still time out and report
// "failed" on a send that had already succeeded.
app.post("/api/live-answer/refresh", async (req, res) => {
  const apiKey = getApiKey();
  const mindId = getMindId();
  if (!apiKey || !mindId) {
    res.status(500).json({
      error: !apiKey
        ? "MINDS_BUILDER_API_KEY not configured on the server."
        : "KITH_MIND_ID not configured on the server — find yours with `minds list --pretty`.",
    });
    return;
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition. Resend with { confirm: true } to proceed.",
    });
    return;
  }

  // Cost bookkeeping, not the point of this route — a send that actually
  // goes through is real and paid-for regardless of whether this succeeds.
  const before = await getCognitionBalance(apiKey, mindId).then((b) => b.cognition).catch(() => null);
  const alias = freshAlias("kith-web-beata");
  try {
    const { sentAt, afterFingerprint } = await sendOnly(apiKey, mindId, alias, LIVE_PROMPT);
    res.json({ alias, sentAt, afterFingerprint, sentMessageText: LIVE_PROMPT, before });
  } catch (err) {
    res.status(502).json({ error: `Live query failed: ${(err as Error).message}` });
  }
});

// Free — poll after /api/live-answer/refresh until { done: true }.
app.post("/api/live-answer/status", async (req, res) => {
  const apiKey = getApiKey();
  const mindId = getMindId();
  if (!apiKey) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  const { alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing alias." });
    return;
  }

  let reply: Awaited<ReturnType<typeof findReply>>;
  try {
    reply = await findReply(apiKey, alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : undefined,
      afterFingerprint: typeof afterFingerprint === "string" ? afterFingerprint : undefined,
      sentAfter: typeof sentAfter === "string" ? sentAfter : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }
  if (!reply) {
    res.json({ done: false });
    return;
  }

  const registry = await readJson<{ members?: Array<{ name: string; pronouns: string }> }>(
    `${DATA}/registry.json`,
    { members: [] },
  );
  const pronounIssues = findPronounIssues(reply.text, registry.members ?? []);
  const record = {
    question: LIVE_QUESTION,
    answer: reply.text,
    html: reply.html,
    capturedAt: reply.createdAt,
    alias,
    pronounIssues,
  };

  // The send already spent real cognition — that's real regardless of what
  // happens next. A persistence failure (e.g. no KV configured on a
  // read-only deployment) must never cost the caller the answer they
  // already paid for.
  try {
    await liveAnswerStore.write("live-answer", record);
  } catch (err) {
    console.error("Failed to persist live-answer (answer still returned):", err);
  }

  if (mindId && typeof before === "number") {
    try {
      const after = await getCognitionBalance(apiKey, mindId).catch(() => null);
      if (after) {
        const log = await cognitionLogStore.read<CognitionLogEntry[]>("cognition-log", []);
        log.push({
          at: new Date().toISOString(),
          question: LIVE_QUESTION,
          before,
          after: after.cognition,
          spent: Math.max(0, before - after.cognition),
        });
        await cognitionLogStore.write("cognition-log", log);
      }
    } catch (err) {
      console.error("Failed to update cognition log (answer still returned):", err);
    }
  }

  res.json({ done: true, ...record });
});

// ── Draft, don't send: a per-member check-in draft, never auto-sent ────────
//
// Mirrors /api/live-answer exactly — fast kick-off + free poll — scoped to
// one watchlist member instead of one fixed question. Nothing is ever sent
// anywhere on the creator's behalf: the Mind's reply IS the deliverable.
// Copying it and sending it themselves is a deliberate human step this
// route intentionally does not skip — there is no send-on-their-behalf path
// here, on purpose.
app.post("/api/draft/refresh", async (req, res) => {
  if (!API_KEY || !MIND_ID) {
    res.status(500).json({
      error: !API_KEY
        ? "MINDS_BUILDER_API_KEY not configured on the server."
        : "KITH_MIND_ID not configured on the server — find yours with `minds list --pretty`.",
    });
    return;
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition. Resend with { confirm: true } to proceed.",
    });
    return;
  }
  const memberKey = req.body?.memberKey;
  if (typeof memberKey !== "string" || !memberKey.trim()) {
    res.status(400).json({ error: "Missing memberKey." });
    return;
  }

  const watchlist = await readJson<Watchlist | null>(`${DATA}/watchlist.json`, null);
  const member = watchlist?.watching.find((m) => m.key === memberKey);
  if (!member) {
    res.status(404).json({
      error: "That member isn't on the current watchlist — run `npm run registry` again if this seems stale.",
    });
    return;
  }

  const headline = headlineFor(member);
  const prompt =
    `Draft a short, warm check-in message the creator could send to ${member.name}, a real member of this ` +
    `community you've been watching. Here's why they're flagged: ${headline} Use their stated pronouns from ` +
    `kith-watchlist if recorded, they/them otherwise. Keep it brief (2-4 sentences), personal, not corporate, ` +
    `and not presuming to know exactly what's wrong — an invitation to talk, not a diagnosis. Reply with ONLY ` +
    `the message text, nothing else — no preamble, no explanation, ready to copy and send as-is.`;

  // Cost bookkeeping, not the point of this route — a send that actually
  // goes through is real and paid-for regardless of whether this succeeds.
  const before = await getCognitionBalance(API_KEY, MIND_ID).then((b) => b.cognition).catch(() => null);
  const alias = freshAlias("kith-web-draft");
  try {
    const { sentAt, afterFingerprint } = await sendOnly(API_KEY, MIND_ID, alias, prompt);
    res.json({ alias, sentAt, afterFingerprint, sentMessageText: prompt, before, memberName: member.name });
  } catch (err) {
    res.status(502).json({ error: `Draft request failed: ${(err as Error).message}` });
  }
});

// Free — poll after /api/draft/refresh until { done: true }.
app.post("/api/draft/status", async (req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  const { alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing alias." });
    return;
  }

  let reply: Awaited<ReturnType<typeof findReply>>;
  try {
    reply = await findReply(API_KEY, alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : undefined,
      afterFingerprint: typeof afterFingerprint === "string" ? afterFingerprint : undefined,
      sentAfter: typeof sentAfter === "string" ? sentAfter : undefined,
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
    return;
  }
  if (!reply) {
    res.json({ done: false });
    return;
  }

  // The send already spent real cognition regardless of what happens below —
  // a bookkeeping failure must never cost the caller the draft they already
  // paid for.
  if (MIND_ID && typeof before === "number") {
    try {
      const after = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);
      if (after) {
        const log = await cognitionLogStore.read<CognitionLogEntry[]>("cognition-log", []);
        log.push({
          at: new Date().toISOString(),
          question: "draft check-in message",
          before,
          after: after.cognition,
          spent: Math.max(0, before - after.cognition),
        });
        await cognitionLogStore.write("cognition-log", log);
      }
    } catch (err) {
      console.error("Failed to update cognition log (draft still returned):", err);
    }
  }

  res.json({ done: true, draft: reply.text, capturedAt: reply.createdAt });
});

// ── Beat B: fixed-alias live feed, restart marker ───────────────────────────

app.get("/api/session", async (_req, res) => {
  res.json(await readSession(SESSION_PATH));
});

app.post("/api/session/mark-restart", async (_req, res) => {
  res.json(await markRestart(SESSION_PATH));
});

app.get("/api/live-feed", async (_req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  // Deliberately ignores any client-supplied alias — always the one stored
  // session alias, so there is no path to typing a contaminated old test
  // thread (memtest-a, memtest-b) into the UI. See demo-session.ts.
  const session = await readSession(SESSION_PATH);
  try {
    const history = await getHistory(API_KEY, session.alias);
    res.json({
      alias: session.alias,
      restartAt: session.restartAt,
      messages: transformFeedMessages(history, session.restartAt),
    });
  } catch (err) {
    const message = (err as Error).message;
    const notFound = /404|NOT_FOUND|Conversation not found/i.test(message);
    res.status(notFound ? 200 : 502).json(
      notFound
        ? {
            alias: session.alias,
            restartAt: session.restartAt,
            messages: [],
            note:
              `"${session.alias}" hasn't been created yet — it comes into being the first ` +
              `time a message is sent to it. Before filming Beat B, send it one message ` +
              `(e.g. via \`minds chat create\`) to initialise it, then mark a restart.`,
          }
        : { error: message },
    );
  }
});

// ── setup wizard: build a creator's own registry, in memory, per-request ───
//
// Every credential here (Discord bot token, Minds Builder API key) is read
// from the request body and never persisted — used for the one call it's
// needed for, then discarded when the request ends. Nothing about this flow
// touches our own Mind, our own data files, or any other creator's request.

function onboardingError(res: express.Response, err: unknown): void {
  if (err instanceof OnboardingError) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(502).json({ error: (err as Error).message });
  }
}

/**
 * Token resolution for the setup flow: a pasted token (self-host path)
 * wins; otherwise the hosted bot speaks for the creator (hosted path).
 * This is the seam that lets the same routes serve both — the hosted
 * frontend simply omits the token field.
 */
function resolveToken(pasted: unknown): string | null {
  if (typeof pasted === "string" && pasted.trim()) return pasted.trim();
  const hosted = process.env.DISCORD_BOT_TOKEN;
  return hosted && hosted.trim() ? hosted.trim() : null;
}

// ── hosted-product routes ────────────────────────────────────────────────────

// The invite link that replaces the developer-portal ritual: one click adds
// the hosted bot to the creator's server with exactly the permissions Kith
// needs and nothing more. Requires DISCORD_CLIENT_ID (the hosted bot's
// application id) in the deployment environment.
app.get("/api/invite-url", (_req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_CLIENT_ID)." });
    return;
  }
  // View Channels + Read Message History + Send Messages (digest) — the
  // whole permission surface, deliberately minimal.
  const permissions = "66560";
  res.json({
    url: `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${permissions}`,
  });
});

// The guilds the hosted bot is actually in — the wizard's "pick your
// server" dropdown. Zero typing for the creator: invite, detect, pick.
app.get("/api/setup/guilds", async (_req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    const res2 = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res2.ok) {
      res.status(502).json({ error: `Discord guild list failed (${res2.status}).` });
      return;
    }
    const guilds = (await res2.json()) as Array<{ id: string; name: string }>;
    res.json({ guilds: guilds.map((g) => ({ id: g.id, name: g.name })) });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// The creator connects their Mind: verify the key works, encrypt it, store
// the guild config. The key is returned nowhere after this call.
app.post("/api/setup/connect", strictRateLimiter, validateBody(connectSchema), async (req, res) => {
  const { guildId, guildName, channelIds, digestChannelId, apiKey, mindId } = req.body ?? {};
  if (typeof guildId !== "string" || !guildId.trim()) {
    res.status(400).json({ error: "Missing server (guild) id." });
    return;
  }
  if (!Array.isArray(channelIds) || channelIds.length === 0 || !channelIds.every((c) => typeof c === "string")) {
    res.status(400).json({ error: "Missing channels to watch." });
    return;
  }
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof mindId !== "string" || !mindId.trim()) {
    res.status(400).json({ error: "Missing Minds Builder API key or Mind id." });
    return;
  }
  try {
    // Verify before storing — a typo'd key should fail here, at connect
    // time, not silently on the third nightly cycle.
    const balance = await getCognitionBalance(apiKey.trim(), mindId.trim());
    const existing = await getGuildConfig(guildId.trim());
    const config: GuildConfig = {
      guildId: guildId.trim(),
      ...(typeof guildName === "string" && guildName.trim() ? { guildName: guildName.trim() } : {}),
      channelIds: channelIds as string[],
      ...(typeof digestChannelId === "string" && digestChannelId.trim() ? { digestChannelId: digestChannelId.trim() } : {}),
      mindsKeyEnc: encryptSecret(apiKey.trim()),
      mindId: mindId.trim(),
      connectedAt: existing?.connectedAt ?? new Date().toISOString(),
      ...(existing?.lastPollAt ? { lastPollAt: existing.lastPollAt } : {}),
      ...(existing?.lastWatchlistJson ? { lastWatchlistJson: existing.lastWatchlistJson } : {}),
      ...(existing?.lastDigestFingerprint ? { lastDigestFingerprint: existing.lastDigestFingerprint } : {}),
    };
    await saveGuildConfig(config);
    res.json({ ok: true, cognition: balance.cognition, guilds: (await listGuilds()).length });
  } catch (err) {
    onboardingError(res, err);
  }
});

// The hosted runtime's entry point. Vercel cron sends GET with a bearer
// CRON_SECRET; a manual POST with the same secret works for on-demand
// cycles. No secret configured → local/dev only, refuse on Vercel.
function cronAuthorized(req: express.Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${secret}`;
}

app.get("/api/cron/poll", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    res.json({ results: await runCycle(token) });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.post("/api/cron/poll", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    res.json({ results: await runCycle(token) });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

const verifyDiscordSchema = z.object({ token: z.string().min(1) });

app.post("/api/setup/verify-discord", validateBody(verifyDiscordSchema), async (req, res) => {
  const token = resolveToken(req.body?.token);
  if (!token) {
    res.status(400).json({ error: "Missing Discord bot token (and no hosted bot configured)." });
    return;
  }
  try {
    res.json(await verifyDiscordToken(token));
  } catch (err) {
    onboardingError(res, err);
  }
});

const listChannelsSchema = z.object({ guildId: z.string().min(1) });

app.post("/api/setup/list-channels", validateBody(listChannelsSchema), async (req, res) => {
  const { guildId } = req.body ?? {};
  const token = resolveToken(req.body?.token);
  if (typeof guildId !== "string" || !guildId.trim()) {
    res.status(400).json({ error: "Missing server (guild) id." });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  try {
    const channels = await listChannels(token, guildId.trim());
    res.json({ channels });
  } catch (err) {
    onboardingError(res, err);
  }
});

const checkChannelSchema = z.object({ channelId: z.string().min(1) });

app.post("/api/setup/check-channel", validateBody(checkChannelSchema), async (req, res) => {
  const { channelId } = req.body ?? {};
  const token = resolveToken(req.body?.token);
  if (typeof channelId !== "string" || !channelId.trim()) {
    res.status(400).json({ error: "Missing channel id." });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  try {
    res.json(await checkChannel(token, channelId.trim()));
  } catch (err) {
    onboardingError(res, err);
  }
});

app.post("/api/setup/build", validateBody(buildSchema), async (req, res) => {
  const { channelId, communityName, sinceDays, guildId } = req.body;
  const token = resolveToken(req.body?.token);
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  const days = Math.min(60, Math.max(1, Number(sinceDays) || 14));
  try {
    const { community, stats } = await backfillCommunity(
      token,
      channelId.trim(),
      typeof communityName === "string" && communityName.trim() ? communityName.trim() : "your community",
      { sinceDays: days },
    );
    // Persist into the hosted store when this build belongs to a connected
    // guild — the wizard's in-memory payloads die with the response, and
    // without this the nightly cycle starts from an empty room ("no
    // messages stored yet"). Found live: first real walkthrough of the
    // hosted product.
    if (typeof guildId === "string" && guildId.trim()) {
      const stored = community.messages.map((m) => ({
        id: m.id,
        ts: m.ts.toISOString(),
        authorId: m.authorId,
        authorName: m.authorName,
        text: m.text,
        replyToId: m.replyToId,
        chatId: channelId.trim(),
        source: "discord" as const,
      }));
      const events = community.events.map((e) => ({
        ts: e.ts.toISOString(),
        actorId: e.actorId,
        actorName: e.actorName,
        action: e.action,
        kind: e.kind,
        chatId: channelId.trim(),
        source: "discord" as const,
      }));
      await appendGuildMessages(guildId.trim(), stored, events);
    }
    const payloads = buildPayloads(community);
    res.json({ ...payloads, stats });
  } catch (err) {
    onboardingError(res, err);
  }
});

// The one cognition-spending step in this flow — gated behind an explicit
// confirm, same pattern as /api/live-answer/refresh above. Split into a
// fast kick-off (this route) and a separate free poll (below): the send
// itself is quick, but a real reply has measured 76-111s live, past what
// one function invocation can hold open — see startPush's own comment.
app.post("/api/setup/push", strictRateLimiter, validateBody(pushSchema), async (req, res) => {
  const { apiKey, mindId, registry, watchlist, confirm } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof mindId !== "string" || !mindId.trim()) {
    res.status(400).json({ error: "Missing Minds Builder API key or Mind id." });
    return;
  }
  if (!registry || typeof registry !== "object") {
    res.status(400).json({ error: "Missing registry — build it first." });
    return;
  }
  if (!watchlist || typeof watchlist !== "object") {
    res.status(400).json({ error: "Missing watchlist — build it first." });
    return;
  }
  if (confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition on your Mind. Resend with { confirm: true } to proceed.",
    });
    return;
  }
  try {
    res.json(await startPush(apiKey.trim(), mindId.trim(), registry, watchlist));
  } catch (err) {
    onboardingError(res, err);
  }
});

// Free — poll after /api/setup/push until { done: true }. Also where the
// creator's own spend gets surfaced back to them: startPush captures
// `before` and hands it back to the client, which resends it here once a
// reply is found, and this computes `spent` for the response. This is the
// fix for the earlier gap where the web wizard's push spent real cognition
// on a creator's own Mind with no record of it anywhere the app showed
// them. Deliberately NOT written to cognitionLogStore/GET /api/budget —
// that store and the budget strip it feeds are specifically this site's
// own demo-Mind spend tracking; folding a third-party creator's spend on
// their own, different Mind into that shared number would corrupt it, not
// add transparency. This response is where their own spend is transparent
// to them instead.
app.post("/api/setup/push/status", async (req, res) => {
  const { apiKey, mindId, alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing apiKey or alias." });
    return;
  }
  try {
    const reply = await checkPush(apiKey.trim(), alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : "",
      ...(typeof afterFingerprint === "string" ? { afterFingerprint } : {}),
      ...(typeof sentAfter === "string" ? { sentAfter } : {}),
    });
    if (!reply) {
      res.json({ done: false });
      return;
    }
    let spent: number | null = null;
    if (typeof mindId === "string" && mindId.trim() && typeof before === "number") {
      const after = await getCognitionBalance(apiKey.trim(), mindId.trim()).catch(() => null);
      if (after) spent = Math.max(0, before - after.cognition);
    }
    res.json({ done: true, ...reply, spent });
  } catch (err) {
    onboardingError(res, err);
  }
});

// ── budget strip (free — local bookkeeping only) ────────────────────────────

app.get("/api/budget", async (_req, res) => {
  const log = await cognitionLogStore.read<CognitionLogEntry[]>("cognition-log", []);
  const totalSpent = log.reduce((sum, e) => sum + e.spent, 0);
  res.json({ liveCallCount: log.length, totalSpent, entries: log });
});

// ── SPA fallback ─────────────────────────────────────────────────────────
//
// The frontend is a client-side-routed single-page app (wouter) — routes
// like /demo and /demo/feed only exist in the browser's router, not as real
// files. A link clicked *inside* the app works fine (client-side
// navigation), but a fresh browser request for /demo — a direct URL, a
// bookmark, a hard refresh — hits this server directly and needs to get
// index.html back so the client router can take over and render the right
// page. Scoped to skip /api/* so an unmatched API route still 404s as JSON
// instead of silently returning the whole HTML page.
app.get(/^(?!\/api\/).*/, (_req, res) => {
  const indexPath = root("public/index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).send("Frontend page not found.");
      }
    });
  } else {
    res.status(404).send("Frontend build not found — run `npm run web:build` first.");
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Server error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: (err as Error)?.message || "Internal server error" });
  }
});

// Vercel imports this module and calls the exported handler directly per
// request — it must not also bind a port itself. VERCEL is set automatically
// in both its build and runtime environments, unset everywhere else.
if (!process.env.VERCEL) {
  const PORT = Number(env.PORT ?? 3131);
  app.listen(PORT, () => {
    console.log(`Kith web UI: http://localhost:${PORT}`);
  });
}

export default app;
