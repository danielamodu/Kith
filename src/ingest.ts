import { readFile } from "node:fs/promises";
import type {
  Community,
  MembershipEvent,
  Message,
  RawExport,
  RawMessage,
  RawText,
} from "./types.ts";

/**
 * Telegram's `text` field is either a string or an array mixing plain strings
 * and entity objects. Flatten to plain text; entity types are irrelevant to us
 * because every detector is about behaviour, not content.
 */
export function flattenText(raw: RawText | undefined): string {
  if (raw === undefined) return "";
  if (typeof raw === "string") return raw;
  return raw
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("");
}

/**
 * Telegram uses `from_id` like "user123456"; for older exports it can be absent,
 * in which case we fall back to the display name. Name collisions are possible
 * but rare, and a stable id is worth more than perfect disambiguation.
 */
function identify(m: RawMessage): { id: string; name: string } | null {
  const name = m.from ?? m.actor;
  const id = m.from_id ?? m.actor_id ?? (name ? `name:${name}` : undefined);
  if (!id || !name) return null;
  return { id, name };
}

function parseDate(m: RawMessage): Date {
  if (m.date_unixtime) return new Date(Number(m.date_unixtime) * 1000);
  return new Date(m.date);
}

const JOIN_ACTIONS = new Set([
  "join_group_by_link",
  "join_group_by_request",
  "invite_members",
]);
const LEAVE_ACTIONS = new Set(["remove_members", "left_group"]);

/**
 * A farewell suppresses drift signals — someone who said goodbye is not
 * "quietly pulling back", they left on purpose. Deliberately narrow: we would
 * rather miss a farewell than swallow a real signal.
 */
const FAREWELL = /\b(goodbye|farewell|i'?m out|leaving (the|this) (group|community)|signing off|last message here)\b/i;

export function normalise(raw: RawExport): Community {
  const messages: Message[] = [];
  const events: MembershipEvent[] = [];

  for (const m of raw.messages) {
    const who = identify(m);
    if (!who) continue;
    const ts = parseDate(m);
    if (Number.isNaN(ts.getTime())) continue;

    if (m.type === "service") {
      const action = m.action ?? "unknown";
      const kind = JOIN_ACTIONS.has(action)
        ? "join"
        : LEAVE_ACTIONS.has(action)
          ? "leave"
          : "other";
      events.push({ ts, actorId: who.id, actorName: who.name, action, kind });

      // invite_members names the invitees, who are the ones actually joining
      if (action === "invite_members" && m.members) {
        for (const invitee of m.members) {
          events.push({
            ts,
            actorId: `name:${invitee}`,
            actorName: invitee,
            action,
            kind: "join",
          });
        }
      }
      continue;
    }

    const text = flattenText(m.text);
    // Empty messages are stickers, media, or reactions. They are participation
    // but carry no length signal, so keep them and let D3 filter on length > 0.
    messages.push({
      id: m.id,
      ts,
      authorId: who.id,
      authorName: who.name,
      text,
      length: text.length,
      replyToId: m.reply_to_message_id,
    });
  }

  messages.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  events.sort((a, b) => a.ts.getTime() - b.ts.getTime());

  if (messages.length === 0) {
    throw new Error("Export contains no usable messages");
  }

  return {
    name: raw.name ?? "unnamed community",
    messages,
    events,
    from: messages[0]!.ts,
    to: messages[messages.length - 1]!.ts,
  };
}

export function isFarewell(text: string): boolean {
  return FAREWELL.test(text);
}

export async function loadExport(path: string): Promise<Community> {
  const buf = await readFile(path, "utf8");
  let raw: RawExport;
  try {
    raw = JSON.parse(buf) as RawExport;
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON. If you exported from Telegram Desktop, ` +
        `make sure Format was set to "Machine-readable JSON" and not HTML.`,
    );
  }
  if (!Array.isArray(raw.messages)) {
    throw new Error(
      `${path} has no "messages" array — this does not look like a Telegram export.`,
    );
  }
  return normalise(raw);
}
