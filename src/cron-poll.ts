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
      if (composites.length > 0 && fingerprint !== config.lastDigestFingerprint) {
        // Fetch mods for action buttons
        const mods = await getMods(hostedToken, config.guildId);
        const digest = renderDigest(community, composites, config.guildId, mods);
        await postDigest(hostedToken, config.digestChannelId, digest.content, digest.components);
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
export async function runCycle(hostedToken: string): Promise<GuildCycleResult[]> {
  const guilds = await listGuilds();
  const out: GuildCycleResult[] = [];
  const deadlineAt = Date.now() + DEADLINE_MS;
  for (const config of guilds) {
    if (Date.now() >= deadlineAt) {
      out.push({ guildId: config.guildId, added: 0, artifactsPushed: false, digestPosted: false, skipped: "invocation out of time — next tick" });
      continue;
    }
    out.push(await pollGuild(hostedToken, config, { deadlineAt }));
  }
  return out;
}
