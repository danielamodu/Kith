/**
 * Discord REST client.
 *
 * The reason Discord is the better backfill path: **it can read history.**
 * `GET /channels/{id}/messages` paginates backwards 100 at a time, as far back as
 * the channel goes. Telegram's Bot API cannot do this at all, which is why that
 * platform needs a Desktop export. Here the bot simply joins and reads.
 *
 * The same endpoint also walks *forward* with `after`, so one function serves both
 * backfill and live collection — no gateway websocket needed for what Kith does.
 *
 * The trap here is the **Message Content privileged intent**. Without it enabled in
 * the Developer Portal, messages arrive with `content: ""` — the calls succeed, the
 * counts look right, and every message is empty. `checkContentAccess` catches that
 * explicitly rather than letting it look like a quiet community.
 */
import type { StoredEvent, StoredMessage } from "./telegram.ts";

const API = "https://discord.com/api/v10";

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
};

export type DiscordMessage = {
  id: string;
  channel_id: string;
  author: DiscordUser;
  content: string;
  timestamp: string;
  referenced_message?: { id: string } | null;
  /** 0 = default, 19 = reply, 7 = member join (a system message) */
  type: number;
};

export type DiscordChannel = {
  id: string;
  name: string;
  /** 0 = GUILD_TEXT */
  type: number;
};

const MSG_DEFAULT = 0;
const MSG_REPLY = 19;
const MSG_MEMBER_JOIN = 7;
const CHANNEL_TEXT = 0;

async function call<T>(token: string, path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bot ${token}` },
  });

  // Discord rate limits aggressively and tells you exactly how long to wait.
  // Respect it rather than hammering: a backfill of months is thousands of calls.
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retry_after?: number };
    const waitMs = Math.ceil((body.retry_after ?? 1) * 1000) + 100;
    if (attempt > 8) throw new Error(`Rate limited repeatedly on ${path}`);
    await new Promise((r) => setTimeout(r, waitMs));
    return call<T>(token, path, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function getMe(token: string): Promise<DiscordUser> {
  return call<DiscordUser>(token, "/users/@me");
}

export async function listTextChannels(
  token: string,
  guildId: string,
): Promise<DiscordChannel[]> {
  const all = await call<DiscordChannel[]>(token, `/guilds/${guildId}/channels`);
  return all.filter((c) => c.type === CHANNEL_TEXT);
}

/**
 * One page of messages, newest-first.
 * `before` walks into the past (backfill); `after` walks forward (live).
 */
export function fetchPage(
  token: string,
  channelId: string,
  opts: { before?: string; after?: string; limit?: number } = {},
): Promise<DiscordMessage[]> {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.before) q.set("before", opts.before);
  if (opts.after) q.set("after", opts.after);
  return call<DiscordMessage[]>(token, `/channels/${channelId}/messages?${q}`);
}

/**
 * Is the Message Content intent actually enabled?
 *
 * Without it every `content` is an empty string while the requests still succeed —
 * the single most confusing way for this to fail, because it looks like the channel
 * is full of stickers.
 */
export async function checkContentAccess(
  token: string,
  channelId: string,
): Promise<{ ok: boolean; sampled: number; withContent: number }> {
  const page = await fetchPage(token, channelId, { limit: 100 });
  const human = page.filter(
    (m) => !m.author.bot && (m.type === MSG_DEFAULT || m.type === MSG_REPLY),
  );
  const withContent = human.filter((m) => m.content.trim().length > 0).length;
  return {
    // an empty channel is inconclusive rather than a failure
    ok: human.length === 0 || withContent > 0,
    sampled: human.length,
    withContent,
  };
}

export function displayName(u: DiscordUser): string {
  return u.global_name?.trim() || u.username;
}

export function normalise(
  m: DiscordMessage,
): { message?: StoredMessage; event?: StoredEvent } {
  const ts = new Date(m.timestamp).toISOString();

  // Discord emits a system message when someone joins — free tenure data.
  if (m.type === MSG_MEMBER_JOIN) {
    return {
      event: {
        ts,
        actorId: `user${m.author.id}`,
        actorName: displayName(m.author),
        action: "join_guild",
        kind: "join",
        chatId: m.channel_id,
        source: "discord",
      },
    };
  }

  if (m.type !== MSG_DEFAULT && m.type !== MSG_REPLY) return {};
  // Bots are not community members; their traffic would distort every baseline.
  if (m.author.bot) return {};

  return {
    message: {
      id: m.id,
      ts,
      authorId: `user${m.author.id}`,
      authorName: displayName(m.author),
      text: m.content,
      replyToId: m.referenced_message?.id,
      chatId: m.channel_id,
      source: "discord",
    },
  };
}

/**
 * Page backwards through a channel's history.
 *
 * `onPage` is called as pages arrive so the caller can persist incrementally —
 * a backfill of months can be thousands of requests, and losing all of it to a
 * failure on the last page would be miserable.
 */
export async function walkHistory(
  token: string,
  channelId: string,
  onPage: (messages: StoredMessage[], events: StoredEvent[]) => Promise<void>,
  opts: { maxPages?: number; stopBefore?: Date } = {},
): Promise<{ pages: number; oldest?: Date }> {
  let before: string | undefined;
  let pages = 0;
  let oldest: Date | undefined;
  const maxPages = opts.maxPages ?? 10_000;

  while (pages < maxPages) {
    const page = await fetchPage(token, channelId, { before, limit: 100 });
    if (page.length === 0) break;

    const messages: StoredMessage[] = [];
    const events: StoredEvent[] = [];
    for (const m of page) {
      const n = normalise(m);
      if (n.message) messages.push(n.message);
      if (n.event) events.push(n.event);
    }
    await onPage(messages, events);

    pages++;
    before = page[page.length - 1]!.id;
    oldest = new Date(page[page.length - 1]!.timestamp);

    if (opts.stopBefore && oldest < opts.stopBefore) break;
    if (page.length < 100) break; // reached the start of the channel
  }

  return { pages, oldest };
}
