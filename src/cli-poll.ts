/**
 * Collect live Telegram traffic into the store.
 *
 * Run: node src/cli-poll.ts            (long-poll until interrupted)
 *      node src/cli-poll.ts --once     (single batch, for cron)
 *      node src/cli-poll.ts --check    (verify setup, collect nothing)
 *
 * Needs TELEGRAM_BOT_TOKEN in .env. See docs/telegram-setup.md — in particular
 * privacy mode, which is ON by default and would make Kith blind to the group.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { getMe, getUpdates, normaliseUpdate } from "./telegram.ts";
import { MessageStore } from "./store.ts";

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
const token = env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error(`
TELEGRAM_BOT_TOKEN is not set.

  1. Message @BotFather on Telegram, send /newbot, follow the prompts
  2. Copy the token it gives you into .env as TELEGRAM_BOT_TOKEN=...
  3. IMPORTANT: send /setprivacy, pick your bot, choose Disable
     Without this the bot only sees messages that mention it, and Kith
     cannot perceive a community it cannot read.
  4. Add the bot to the group (re-add it if privacy was changed after)

See docs/telegram-setup.md
`);
  process.exit(1);
}

const once = process.argv.includes("--once");
const checkOnly = process.argv.includes("--check");

const store = new MessageStore(root("data/store.jsonl"), root("data/store-state.json"));
await store.init();

// ── setup check ──────────────────────────────────────────────────────────────

const me = await getMe(token);
console.log(`bot: @${me.username ?? me.first_name} (id ${me.id})`);

if (!me.can_read_all_group_messages) {
  console.error(`
PRIVACY MODE IS ON — this bot can only see messages that mention it.

Kith would be blind to normal community traffic, which is the entire point.
Fix it: BotFather → /setprivacy → pick this bot → Disable, then REMOVE and
RE-ADD the bot to the group. The setting only takes effect on re-join.

Refusing to collect a misleading partial view of the community.
`);
  process.exit(1);
}
console.log("privacy mode: off — can read all group messages ✓");

const state = await store.readState();
console.log(
  `store: ${state.messageCount} messages, offset ${state.offset}` +
    (state.lastPolledAt ? `, last polled ${state.lastPolledAt}` : ", never polled"),
);

if (checkOnly) {
  console.log("\n--check: setup looks good, collecting nothing.");
  process.exit(0);
}

// ── poll ─────────────────────────────────────────────────────────────────────

let running = true;
process.on("SIGINT", () => {
  console.log("\nstopping after this batch...");
  running = false;
});

let offset = state.offset;
let total = state.messageCount;

do {
  const updates = await getUpdates(token, offset, once ? 0 : 25);

  if (updates.length > 0) {
    const messages = [];
    const events = [];
    for (const u of updates) {
      const n = normaliseUpdate(u);
      messages.push(...n.messages);
      events.push(...n.events);
      offset = Math.max(offset, u.update_id + 1);
    }

    // Store first, THEN advance the offset. Telegram resends anything the offset
    // has not acknowledged, so this ordering makes a crash cost a duplicate
    // delivery (which dedupe absorbs) rather than a silently lost message.
    const { added } = await store.append(messages, events);
    total += added;

    const chat = updates.find((u) => u.message)?.message?.chat;
    await store.writeState({
      offset,
      chatId: chat?.id === undefined ? undefined : String(chat.id),
      chatTitle: chat?.title,
      messageCount: total,
      lastPolledAt: new Date().toISOString(),
    });

    if (added > 0 || events.length > 0) {
      console.log(
        `[${new Date().toISOString().slice(11, 19)}] +${added} messages` +
          (events.length ? `, ${events.length} membership events` : "") +
          ` (total ${total})`,
      );
    }
  }
} while (running && !once);

console.log(`\nstored ${total} messages total → data/store.jsonl`);
