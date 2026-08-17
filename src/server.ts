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
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  freshAlias,
  getCognitionBalance,
  getHistory,
  sendAndVerify,
  SendVerifyError,
  plainText,
  type HistoryMessage,
} from "./minds-client.ts";
import { readSession, markRestart } from "./demo-session.ts";

// ── presentation transforms — the raw detector/Minds shapes stay untouched;
// these exist purely so the frontend gets specific, ready-to-render copy
// instead of generic filler. Kept here, not in registry.ts, since this is
// UI presentation, not detection.

type WatchEntry = {
  signals: string[];
  quietForH: number;
  quietRatio: number;
  ans: number;
};

function headlineFor(m: WatchEntry): string {
  if (m.signals.includes("gap-drift")) {
    const days = Math.round(m.quietForH / 24);
    return days >= 1
      ? `Quiet for ${days} day${days === 1 ? "" : "s"} — about ${m.quietRatio.toFixed(1)}× their usual rhythm.`
      : `Quiet for ${Math.round(m.quietForH)}h — about ${m.quietRatio.toFixed(1)}× their usual rhythm.`;
  }
  if (m.signals.includes("tone-shift")) {
    return "Recent messages have gotten noticeably shorter than usual.";
  }
  if (m.signals.includes("contribution")) {
    return `One of the most active people here — ${m.ans} question${m.ans === 1 ? "" : "s"} answered.`;
  }
  return "A signal worth a second look.";
}

function lastSeenFor(quietForH: number): string {
  if (quietForH < 1) return "active moments ago";
  if (quietForH < 24) return `active ${Math.round(quietForH)}h ago`;
  const days = Math.round(quietForH / 24);
  return `active ${days} day${days === 1 ? "" : "s"} ago`;
}

type FeedMessage = {
  id: string;
  author: string;
  isKith: boolean;
  text: string;
  createdAt: string;
  unprompted: boolean;
};

/** Same "no human turn since restart" logic that used to live client-side —
 *  moved server-side so it's computed once, correctly, for any frontend. */
function transformFeedMessages(
  messages: HistoryMessage[],
  restartAt: string | null,
): FeedMessage[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const restart = restartAt ? new Date(restartAt) : null;
  let sawHumanSinceRestart = false;
  return sorted.map((m) => {
    const isKith = m.senderType === 0;
    const ts = new Date(m.createdAt);
    const afterRestart = restart !== null && ts > restart;
    if (!isKith && afterRestart) sawHumanSinceRestart = true;
    const unprompted = isKith && afterRestart && !sawHumanSinceRestart;
    return {
      id: m.id,
      author: isKith ? "Kith" : "Steward",
      isKith,
      text: plainText(m.messageText),
      createdAt: m.createdAt,
      unprompted,
    };
  });
}

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
const API_KEY = env.MINDS_BUILDER_API_KEY;
const MIND_ID = env.KITH_MIND_ID;

if (!API_KEY) {
  console.error("MINDS_BUILDER_API_KEY is not set in .env — the live-answer route will fail.");
}
if (!MIND_ID) {
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
app.use(express.json());
app.use(express.static(root("public")));

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
  const cached = await readJson(LIVE_ANSWER_PATH, null);
  res.json(
    cached ?? {
      question: null,
      answer: null,
      capturedAt: null,
      note: "No live answer captured yet. Use the refresh button to ask Kith once.",
    },
  );
});

const LIVE_QUESTION = "Is anyone in the community struggling right now?";

app.post("/api/live-answer/refresh", async (req, res) => {
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

  // Balance checks are cost bookkeeping, not the point of this route — a
  // send that actually goes through is a real, paid-for result and must be
  // saved regardless of whether reading the balance before/after succeeds.
  // (This wasn't always true here: an earlier version let a balance-check
  // bug throw *after* a successful send, discarding a real answer that had
  // already cost real cognition. Never again — see getCognitionBalance's
  // own comment in minds-client.ts for what actually went wrong.)
  const before = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);

  let reply: Awaited<ReturnType<typeof sendAndVerify>>;
  const alias = freshAlias("kith-web-beata");
  try {
    reply = await sendAndVerify(API_KEY, MIND_ID, alias, LIVE_QUESTION);
  } catch (err) {
    const message = err instanceof SendVerifyError
      ? err.message
      : `Live query failed: ${(err as Error).message}`;
    res.status(502).json({ error: message });
    return;
  }

  const record = {
    question: LIVE_QUESTION,
    answer: reply.text,
    html: reply.html,
    capturedAt: reply.createdAt,
    alias,
  };
  await writeJson(LIVE_ANSWER_PATH, record);

  const after = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);
  if (before && after) {
    const log = await readJson<CognitionLogEntry[]>(COGNITION_LOG_PATH, []);
    log.push({
      at: new Date().toISOString(),
      question: LIVE_QUESTION,
      before: before.cognition,
      after: after.cognition,
      spent: Math.max(0, before.cognition - after.cognition),
    });
    await writeJson(COGNITION_LOG_PATH, log);
  }

  res.json(record);
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

// ── budget strip (free — local bookkeeping only) ────────────────────────────

app.get("/api/budget", async (_req, res) => {
  const log = await readJson<CognitionLogEntry[]>(COGNITION_LOG_PATH, []);
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
  res.sendFile(root("public/index.html"));
});

const PORT = Number(env.PORT ?? 3131);
app.listen(PORT, () => {
  console.log(`Kith web UI: http://localhost:${PORT}`);
});
