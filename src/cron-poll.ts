/**
 * The hosted runtime — the thing that makes Kith a product instead of a
 * ritual. Vercel cron hits /api/cron/poll on a schedule; each invocation
 * walks every connected guild, collects what arrived since last time,
 * rebuilds the registry and watchlist locally (free), re-pushes the
 * artifacts into that creator's Mind, and posts the digest to their
 * private channel when there is something worth saying.
 *
 * Cost model per guild per cycle: Discord reads (free), local compute
 * (free), one Mind push only when the watchlist actually changed (a few
 * cognitions), digest post (free). A quiet guild costs nothing but two
 * Discord reads.
 *
 * Serverless discipline: the invocation is time-boxed under maxDuration
 * and processes guilds until the box is full; the rest wait for the next
 * tick. Each guild's work is atomic enough — messages persist per page,
 * the cursor advances last, and a crashed cycle simply means the next one
 * collects a slightly bigger `after` window.
 */
import {
  listGuilds,
  getGuildMessages,
  appendGuildMessages,
  getCursor,
  setCursor,
  guildMessagesToCommunity,
  getGuildMindsKey,
  saveGuildConfig,
  type GuildConfig,
} from "./tenant-store.ts";
import { walkForward } from "./discord.ts";
import { buildMemberStates } from "./members.ts";
import { runAll } from "./detectors.ts";
import { buildPayloads } from "./onboarding.ts";
import { freshAlias, sendOnly, pushInstruction } from "./minds-client.ts";
import { renderDigest, postDigest } from "./digest.ts";
import { getMods } from "./mod-cache.ts";
import { seedOpenCases } from "./team-inbox.ts";

const DEADLINE_MS = 45_000; // headroom under maxDuration 60
const MAX_PAGES_PER_CHANNEL = 10;

export type GuildCycleResult = {
  guildId: string;
  added: number;
  artifactsPushed: boolean;
  digestPosted: boolean;
  skipped?: string;
  error?: string;
};

/**
 * One full cycle for one guild. Returns a result object rather than
 * throwing wherever possible — one broken guild must never stop the
 * others from being polled in the same invocation.
 */
export async function pollGuild(
  hostedToken: string,
  config: GuildConfig,
  opts: { deadlineAt: number; forcePush?: boolean } = { deadlineAt: Date.now() + DEADLINE_MS },
): Promise<GuildCycleResult> {
  const result: GuildCycleResult = {
    guildId: config.guildId,
    added: 0,
    artifactsPushed: false,
    digestPosted: false,
  };

  try {
    // ── 1 · collect new messages across every configured channel
    const cursor = await getCursor(config.guildId);
    let newest: string | undefined = cursor?.lastMessageId;

    for (const channelId of config.channelIds) {
      if (Date.now() >= opts.deadlineAt) break;
      const after = newest ?? snowflakeAt(config.connectedAt);
      const walk = await walkForward(hostedToken, channelId, after, async (messages, events) => {
        const r = await appendGuildMessages(config.guildId, messages, events);
        result.added += r.added;
      }, { maxPages: MAX_PAGES_PER_CHANNEL, deadlineMs: Math.max(5_000, opts.deadlineAt - Date.now()) });
      if (walk.newest) newest = walk.newest;
    }

    if (newest && newest !== cursor?.lastMessageId) {
      await setCursor(config.guildId, { lastMessageId: newest, lastTs: new Date().toISOString() });
    }

    // ── 2 · rebuild locally — free, deterministic, instant
    const stored = await getGuildMessages(config.guildId);
    if (stored.messages.length === 0) {
      result.skipped = "no messages stored yet";
      return result;
    }
    const community = guildMessagesToCommunity(config.guildName ?? config.guildId, stored);
    const payloads = buildPayloads(community);

    // ── 3 · re-push artifacts into the creator's Mind when something moved
    const watchlistJson = JSON.stringify(payloads.watchlist);
    if (opts.forcePush || watchlistJson !== config.lastWatchlistJson) {
      const apiKey = getGuildMindsKey(config);
      const alias = freshAlias("kith-cycle");
      await sendOnly(
        apiKey,
        config.mindId,
        alias,
        pushInstruction(JSON.stringify(payloads.registry), watchlistJson),
      );
      result.artifactsPushed = true;
      // The push's verification reply is deliberately NOT awaited — same
      // reasoning as onboarding.ts: the artifacts land regardless, the
      // Mind's reply is slow and unbounded, and the next cycle overwrites.
      config.lastWatchlistJson = watchlistJson;
    }

    // ── 4 · digest — only when there is something worth saying, and only
    //         when it differs from what the last digest said
    if (config.digestChannelId) {
      const states = buildMemberStates(community);
      const { composites } = runAll(community, states);
      const fingerprint = composites.map((c) => c.memberId).sort().join("|");
      // Keep the team inbox in lockstep with the digest — every composite
      // that warrants a digest line warrants an inbox case. Seeded once;
      // assigned/resolved status is never overwritten by a re-seed.
      await seedOpenCases(
        config.guildId,
        composites.map((c) => ({ memberId: c.memberId, memberName: c.memberName, headline: c.headline })),
      );
      if (composites.length > 0 && (opts.forcePush || fingerprint !== config.lastDigestFingerprint)) {
        // Fetch mods for action buttons
        const mods = await getMods(hostedToken, config.guildId);
        const digest = renderDigest(community, composites, config.guildId, mods);
        const sent = await postDigest(hostedToken, config.digestChannelId, digest.content, digest.components);
        // Thread with receipts + dashboard link — the digest is the 10s scan, the thread is the receipts.
        const threadContent = buildReceiptsThread(community, composites, config.guildId);
        await postReceiptsThread(hostedToken, config.digestChannelId, sent.id, threadContent, config.guildId);
        result.digestPosted = true;
        config.lastDigestFingerprint = fingerprint;
      }
    }

    await saveGuildConfig({ ...config, lastPollAt: new Date().toISOString() });
    return result;
  } catch (err) {
    result.error = (err as Error).message;
    return result;
  }
}

function buildReceiptsThread(community: import("./types.ts").Community, composites: import("./types.ts").Composite[], guildId: string): string {
  const lines: string[] = [
    `Full watchlist → https://kithxbt.vercel.app/team/${guildId}`,
    `Window: ${community.from.toISOString().slice(0, 10)} → ${community.to.toISOString().slice(0, 10)} · ${community.messages.length} messages · ${community.events.length} events`,
    "",
  ];
  for (const c of composites) {
    lines.push(`**${c.memberName}** — ${c.headline}`);
    for (const p of c.parts) {
      lines.push(`· _${p.kind}_ — ${p.claim}`);
      lines.push(`  evidence: ${p.evidence.map((e) => `${e.fact} @ ${e.at.toISOString().slice(0, 10)}`).join(" | ")}`);
      lines.push(`  baseline: ${p.baseline}`);
    }
    lines.push("");
  }
  const text = lines.join("\n");
  return text.length > 1900 ? text.slice(0, 1897) + "…" : text;
}

async function postReceiptsThread(
  token: string,
  channelId: string,
  messageId: string,
  content: string,
  guildId: string,
): Promise<void> {
  // Try to create a thread from the digest message; fall back to a reply in-channel.
  let threadId: string | null = null;
  try {
    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/threads`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Receipts — ${new Date().toISOString().slice(0, 10)}`, auto_archive_duration: 1440 }),
    });
    if (r.ok) {
      const t = (await r.json()) as { id: string };
      threadId = t.id;
    }
  } catch {}
  const targetChannel = threadId ?? channelId;
  const body: Record<string, unknown> = threadId
    ? { content }
    : { content, message_reference: { message_id: messageId }, allowed_mentions: { parse: [] } };
  try {
    await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {}
}

/**
 * A snowflake id from a moment in time — Discord ids encode their creation
 * timestamp, so "everything since the creator connected" has a precise id
 * even before the first cursor exists.
 */
export function snowflakeAt(iso: string): string {
  const ms = new Date(iso).getTime() - 1_420_070_400_000; // Discord epoch
  return (BigInt(Math.max(0, ms)) << 22n).toString();
}

/** The whole hosted cycle: every guild, time-boxed. */
export async function runCycle(
  hostedToken: string,
  opts: { force?: boolean } = {},
): Promise<GuildCycleResult[]> {
  const guilds = await listGuilds();
  const out: GuildCycleResult[] = [];
  const deadlineAt = Date.now() + DEADLINE_MS;
  for (const config of guilds) {
    if (Date.now() >= deadlineAt) {
      out.push({ guildId: config.guildId, added: 0, artifactsPushed: false, digestPosted: false, skipped: "invocation out of time — next tick" });
      continue;
    }
    out.push(await pollGuild(hostedToken, config, { deadlineAt, ...(opts.force ? { forcePush: true } : {}) }));
  }
  return out;
}
