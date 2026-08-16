/**
 * The message store: where backfilled history and live traffic become one stream.
 *
 * JSONL, append-only, deduplicated by message id. Chosen for boring reasons that
 * matter under a deadline:
 *   - a crashed or killed poll loses at most the last line, not the file
 *   - appending is O(1) regardless of how much history has accumulated
 *   - it is trivially inspectable when something looks wrong at 2am
 *
 * The store is gitignored. It contains real people's messages.
 */
import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { StoredEvent, StoredMessage } from "./telegram.ts";
import type { Community, MembershipEvent, Message } from "./types.ts";

export type StoreState = {
  /** highest Telegram update_id acknowledged — see the offset warning in telegram.ts */
  offset: number;
  chatId?: string;
  chatTitle?: string;
  messageCount: number;
  lastPolledAt?: string;
};

type Line =
  | { t: "m"; d: StoredMessage }
  | { t: "e"; d: StoredEvent };

export class MessageStore {
  // Explicit fields rather than constructor parameter properties: Node runs these
  // files with type-stripping only, which requires fully erasable syntax.
  readonly logPath: string;
  readonly statePath: string;

  constructor(logPath: string, statePath: string) {
    this.logPath = logPath;
    this.statePath = statePath;
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true });
    if (!existsSync(this.logPath)) await writeFile(this.logPath, "", "utf8");
  }

  async readState(): Promise<StoreState> {
    if (!existsSync(this.statePath)) return { offset: 0, messageCount: 0 };
    return JSON.parse(await readFile(this.statePath, "utf8")) as StoreState;
  }

  async writeState(s: StoreState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(s, null, 2), "utf8");
  }

  /**
   * Append, skipping anything already stored.
   *
   * Dedupe matters more than it looks: Telegram resends every update until the
   * offset acknowledges it, so a crash between "append" and "save offset" would
   * otherwise duplicate messages — inflating message counts and quietly corrupting
   * every personal baseline derived from them.
   */
  async append(
    messages: StoredMessage[],
    events: StoredEvent[],
  ): Promise<{ added: number }> {
    const { messageIds } = await this.readAll();
    const lines: string[] = [];
    let added = 0;

    for (const m of messages) {
      if (messageIds.has(m.id)) continue;
      messageIds.add(m.id);
      lines.push(JSON.stringify({ t: "m", d: m } satisfies Line));
      added++;
    }
    for (const e of events) {
      lines.push(JSON.stringify({ t: "e", d: e } satisfies Line));
    }

    if (lines.length) await appendFile(this.logPath, lines.join("\n") + "\n", "utf8");
    return { added };
  }

  async readAll(): Promise<{
    messages: StoredMessage[];
    events: StoredEvent[];
    messageIds: Set<string>;
  }> {
    const messages: StoredMessage[] = [];
    const events: StoredEvent[] = [];
    const messageIds = new Set<string>();

    if (!existsSync(this.logPath)) return { messages, events, messageIds };

    const raw = await readFile(this.logPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: Line;
      try {
        parsed = JSON.parse(trimmed) as Line;
      } catch {
        // A torn final line is expected after a kill; skip it rather than refuse
        // to start. Losing one message beats losing the whole store.
        continue;
      }
      if (parsed.t === "m") {
        if (messageIds.has(parsed.d.id)) continue;
        messageIds.add(parsed.d.id);
        messages.push(parsed.d);
      } else {
        events.push(parsed.d);
      }
    }
    return { messages, events, messageIds };
  }

  /** Convert the store into the same Community shape the export path produces. */
  async toCommunity(name: string): Promise<Community> {
    const { messages: sm, events: se } = await this.readAll();

    const messages: Message[] = sm
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

    const events: MembershipEvent[] = se
      .map((e) => ({
        ts: new Date(e.ts),
        actorId: e.actorId,
        actorName: e.actorName,
        action: e.action,
        kind: e.kind,
      }))
      .sort((a, b) => a.ts.getTime() - b.ts.getTime());

    if (messages.length === 0) {
      throw new Error(
        "Store is empty. Backfill an export with `npm run backfill <file>` " +
          "or collect live traffic with `npm run poll`.",
      );
    }

    return {
      name,
      messages,
      events,
      from: messages[0]!.ts,
      to: messages[messages.length - 1]!.ts,
    };
  }
}

/** Fold a parsed export into store rows so backfill and live share one path. */
export function communityToStoreRows(
  c: Community,
  chatId = "0",
  source: StoredMessage["source"] = "export",
): {
  messages: StoredMessage[];
  events: StoredEvent[];
} {
  return {
    messages: c.messages.map((m) => ({
      id: m.id,
      ts: m.ts.toISOString(),
      authorId: m.authorId,
      authorName: m.authorName,
      text: m.text,
      replyToId: m.replyToId,
      chatId,
      source,
    })),
    events: c.events
      .filter((e) => e.kind === "join" || e.kind === "leave")
      .map((e) => ({
        ts: e.ts.toISOString(),
        actorId: e.actorId,
        actorName: e.actorName,
        action: e.action,
        kind: e.kind as "join" | "leave",
        chatId,
        source,
      })),
  };
}
