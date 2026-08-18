/**
 * The web setup wizard's pipeline — same three stages as cli-setup.ts
 * (ingest → build registry → push), rewritten to run in memory for a
 * multi-tenant HTTP request instead of a single local .env-configured run.
 *
 * Why this isn't just cli-discord.ts/cli-registry.ts called as child
 * processes, the way cli-setup.ts calls them: those write to
 * data/store.jsonl and data/registry.json on disk, which is fine for one
 * person's own machine but wrong here — concurrent requests from different
 * creators would clobber the same files, and Vercel's filesystem outside
 * /tmp is read-only anyway. Every function below takes its input as
 * arguments and returns its output as a value; nothing touches disk.
 *
 * A creator's bot token and Builder API key pass through these functions
 * for the duration of one request and are never written anywhere or logged.
 */
import type { StoredEvent, StoredMessage } from "./telegram.ts";
import type { Community, MembershipEvent, Message } from "./types.ts";
import {
  getMe,
  listTextChannels,
  checkContentAccess,
  walkHistory,
  type DiscordChannel,
} from "./discord.ts";
import { buildMemberStates } from "./members.ts";
import { runAll, communityReplyNorm } from "./detectors.ts";
import {
  buildRegistry,
  buildBriefing,
  buildWatchlist,
  estimateTokens,
  type Registry,
  type Briefing,
  type Watchlist,
} from "./registry.ts";
import {
  freshAlias,
  sendOnly,
  findReply,
  pushInstruction,
  getCognitionBalance,
} from "./minds-client.ts";

export class OnboardingError extends Error {}

export async function verifyDiscordToken(
  token: string,
): Promise<{ username: string; id: string }> {
  try {
    const me = await getMe(token);
    return { username: me.username, id: me.id };
  } catch (err) {
    throw new OnboardingError(
      `Couldn't authenticate with that bot token: ${(err as Error).message}`,
    );
  }
}

export async function listChannels(
  token: string,
  guildId: string,
): Promise<DiscordChannel[]> {
  try {
    return await listTextChannels(token, guildId);
  } catch (err) {
    throw new OnboardingError(
      `Couldn't list channels for that server id: ${(err as Error).message}`,
    );
  }
}

export async function checkChannel(
  token: string,
  channelId: string,
): Promise<{ ok: boolean; sampled: number; withContent: number }> {
  try {
    return await checkContentAccess(token, channelId);
  } catch (err) {
    throw new OnboardingError(
      `Couldn't read that channel: ${(err as Error).message}`,
    );
  }
}

/** Mirrors MessageStore.toCommunity's mapping, without the store. */
function storedToCommunity(
  name: string,
  messages: StoredMessage[],
  events: StoredEvent[],
): Community {
  const mapped: Message[] = messages
    .map((m) => ({
      id: m.id,
      ts: new Date(m.ts),
      authorId: m.authorId,
      authorName: m.authorName,
      text: m.text,
      length: m.text.length,
      replyToId: m.replyToId,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const mappedEvents: MembershipEvent[] = events
    .map((e) => ({
      ts: new Date(e.ts),
      actorId: e.actorId,
      actorName: e.actorName,
      action: e.action,
      kind: e.kind,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  if (mapped.length === 0) {
    throw new OnboardingError(
      "That channel has no human messages in the window checked — nothing to build a memory from yet.",
    );
  }

  return {
    name,
    messages: mapped,
    events: mappedEvents,
    from: mapped[0]!.ts,
    to: mapped[mapped.length - 1]!.ts,
  };
}

export type BackfillStats = {
  pages: number;
  messagesSeen: number;
  oldest?: string;
  windowDays: number;
  capped: boolean;
};

/**
 * Bounded two ways, both needed: `maxPages` caps the request count, and
 * `deadlineMs` caps actual wall-clock time — a Vercel function has a hard
 * time limit (maxDuration in vercel.json), and Discord's own 429 retry
 * backoff inside each page fetch means a small page count can still run
 * long under rate-limiting. `npm run setup` / `npm run discord` remain the
 * path for a deep, full-history backfill run locally with no time limit.
 */
export async function backfillCommunity(
  token: string,
  channelId: string,
  communityName: string,
  opts: { sinceDays?: number; maxPages?: number; deadlineMs?: number } = {},
): Promise<{ community: Community; stats: BackfillStats }> {
  const sinceDays = opts.sinceDays ?? 14;
  const maxPages = opts.maxPages ?? 30; // 30 pages * 100 = up to 3,000 messages
  // Leaves headroom under vercel.json's 60s maxDuration for the registry
  // build (CPU-bound, runs synchronously right after this) and response
  // serialization that follow in the same request.
  const deadlineMs = opts.deadlineMs ?? 40_000;
  const stopBefore = new Date(Date.now() - sinceDays * 86_400_000);

  const messages: StoredMessage[] = [];
  const events: StoredEvent[] = [];

  const { pages, oldest, deadlineHit } = await walkHistory(
    token,
    channelId,
    async (m, e) => {
      messages.push(...m);
      events.push(...e);
    },
    { stopBefore, maxPages, deadlineMs },
  );

  const community = storedToCommunity(communityName, messages, events);

  return {
    community,
    stats: {
      pages,
      messagesSeen: messages.length,
      oldest: oldest?.toISOString().slice(0, 10),
      windowDays: sinceDays,
      // Either bound tripping means the backfill is a partial window, not
      // the full range requested — worth telling the caller either way.
      capped: pages >= maxPages || Boolean(deadlineHit),
    },
  };
}

export type OnboardingPayloads = {
  registry: Registry;
  briefing: Briefing;
  watchlist: Watchlist;
  tokens: { registry: number; briefing: number; watchlist: number };
};

export function buildPayloads(community: Community): OnboardingPayloads {
  const states = buildMemberStates(community);
  const asOf = community.to;
  const { observations, composites } = runAll(community, states, asOf);

  const registry = buildRegistry(
    community,
    states,
    communityReplyNorm(community),
    observations,
    asOf,
  );
  const briefing = buildBriefing(community, composites, asOf);
  const watchlist = buildWatchlist(community, states, observations, asOf);

  return {
    registry,
    briefing,
    watchlist,
    tokens: {
      registry: estimateTokens(registry),
      briefing: estimateTokens(briefing),
      watchlist: estimateTokens(watchlist),
    },
  };
}

/**
 * The one cognition-spending step, split into a fast kick-off plus a
 * separate free poll (see checkPush below) rather than one long blocking
 * call — measured live, a real reply to a registry-store instruction has
 * taken 76–111s, well past what one Vercel function invocation can hold
 * open (maxDuration 60s in vercel.json). The send itself is fast; only the
 * Mind's own reply is slow and genuinely unbounded.
 */
export async function startPush(
  apiKey: string,
  mindId: string,
  registry: Registry,
): Promise<{
  alias: string;
  sentAt: string;
  afterFingerprint?: string;
  sentMessageText: string;
  before: number | null;
}> {
  const registryJson = JSON.stringify(registry);
  const alias = freshAlias("kith-onboard");
  const text = pushInstruction(registryJson);
  // Best-effort, and captured before the send: this is display/log
  // bookkeeping only (mirrors cli-push.ts and /api/live-answer/refresh, the
  // two existing paid call sites — see their own comments on why a balance
  // read failing here must never be treated as fatal to the actual send).
  const before = await getCognitionBalance(apiKey, mindId).then((b) => b.cognition).catch(() => null);
  try {
    const { sentAt, afterFingerprint } = await sendOnly(apiKey, mindId, alias, text);
    return {
      alias,
      sentAt,
      ...(afterFingerprint !== undefined ? { afterFingerprint } : {}),
      sentMessageText: text,
      before,
    };
  } catch (err) {
    throw new OnboardingError((err as Error).message);
  }
}

/** Free — one history read. Poll this after startPush until it returns non-null. */
export async function checkPush(
  apiKey: string,
  alias: string,
  ctx: { sentMessageText: string; afterFingerprint?: string; sentAfter?: string },
): Promise<{ text: string; createdAt: string } | null> {
  try {
    const reply = await findReply(apiKey, alias, ctx);
    return reply ? { text: reply.text, createdAt: reply.createdAt } : null;
  } catch (err) {
    throw new OnboardingError((err as Error).message);
  }
}
