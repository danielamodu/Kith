/**
 * Telegram Bot API client — live ingestion.
 *
 * Two hard limitations shape everything here:
 *
 *   1. **A bot cannot read history.** getUpdates returns only messages sent after
 *      the bot joined, and updates expire after ~24h if not collected. Live
 *      ingestion therefore accumulates *forward* and must be merged with the
 *      Desktop JSON export for anything before the bot arrived. This is why the
 *      backfill is not optional.
 *
 *   2. **Privacy mode is ON by default.** In groups, a bot with privacy enabled
 *      sees only messages that mention it or are commands — which would make Kith
 *      blind to the community it is supposed to perceive. The owner must disable it
 *      via BotFather (/setprivacy → Disable) and then re-add the bot to the group.
 *      `getMe().can_read_all_group_messages` reports the truth; we check it and
 *      refuse to run quietly misconfigured.
 */

const API = "https://api.telegram.org";

// ── Bot API shapes (only the fields we use) ──────────────────────────────────

export type TgUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

export type TgChat = {
  id: number;
  title?: string;
  type: "private" | "group" | "supergroup" | "channel";
};

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  /** unix seconds */
  date: number;
  text?: string;
  reply_to_message?: { message_id: number };
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
};

export type BotIdentity = {
  id: number;
  username?: string;
  first_name: string;
  /** false means privacy mode is ON and the bot is blind to normal group traffic */
  can_read_all_group_messages: boolean;
};

// ── client ───────────────────────────────────────────────────────────────────

async function call<T>(
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as
    | { ok: true; result: T }
    | { ok: false; description: string; error_code: number };

  if (!body.ok) {
    throw new Error(
      `Telegram ${method} failed (${body.error_code}): ${body.description}`,
    );
  }
  return body.result;
}

export function getMe(token: string): Promise<BotIdentity> {
  return call<BotIdentity>(token, "getMe");
}

/**
 * Long-polls for updates. `offset` must be (highest update_id seen + 1) — Telegram
 * treats sending an offset as acknowledgement and will not resend those updates,
 * so the offset must only advance once the batch is durably stored.
 */
export function getUpdates(
  token: string,
  offset: number,
  timeoutSec = 25,
): Promise<TgUpdate[]> {
  return call<TgUpdate[]>(token, "getUpdates", {
    offset,
    timeout: timeoutSec,
    allowed_updates: ["message"],
  });
}

// ── normalisation ────────────────────────────────────────────────────────────

/**
 * Bot API user ids are numeric and stable; the export format uses "user123456".
 * Emit the export convention so live and backfilled messages share an identity
 * space and describe the same person.
 */
export function authorId(u: TgUser): string {
  return `user${u.id}`;
}

export function displayName(u: TgUser): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.username || `user${u.id}`;
}

/** A message as we persist it — deliberately the same shape the export produces. */
export type StoredMessage = {
  id: number;
  ts: string;
  authorId: string;
  authorName: string;
  text: string;
  replyToId?: number;
  chatId: number;
};

export type StoredEvent = {
  ts: string;
  actorId: string;
  actorName: string;
  action: string;
  kind: "join" | "leave";
  chatId: number;
};

export function normaliseUpdate(u: TgUpdate): {
  messages: StoredMessage[];
  events: StoredEvent[];
} {
  const messages: StoredMessage[] = [];
  const events: StoredEvent[] = [];
  const m = u.message;
  if (!m) return { messages, events };

  const ts = new Date(m.date * 1000).toISOString();

  // membership changes carry no text but establish tenure
  if (m.new_chat_members?.length) {
    for (const member of m.new_chat_members) {
      if (member.is_bot) continue;
      events.push({
        ts,
        actorId: authorId(member),
        actorName: displayName(member),
        action: "join_group",
        kind: "join",
        chatId: m.chat.id,
      });
    }
  }
  if (m.left_chat_member && !m.left_chat_member.is_bot) {
    events.push({
      ts,
      actorId: authorId(m.left_chat_member),
      actorName: displayName(m.left_chat_member),
      action: "left_group",
      kind: "leave",
      chatId: m.chat.id,
    });
  }

  // Bots are not community members; their messages would pollute every baseline.
  if (m.from && !m.from.is_bot && typeof m.text === "string") {
    messages.push({
      id: m.message_id,
      ts,
      authorId: authorId(m.from),
      authorName: displayName(m.from),
      text: m.text,
      replyToId: m.reply_to_message?.message_id,
      chatId: m.chat.id,
    });
  }

  return { messages, events };
}
