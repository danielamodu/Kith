/**
 * Pull a Discord channel into the store — history and all.
 *
 * Run: node src/cli-discord.ts --check                 verify setup, store nothing
 *      node src/cli-discord.ts --channels <guildId>    list text channels
 *      node src/cli-discord.ts <channelId>             backfill full history
 *      node src/cli-discord.ts <channelId> --since 90  last 90 days only
 *
 * Needs DISCORD_BOT_TOKEN in .env. See docs/discord-setup.md — in particular the
 * Message Content intent, without which every message arrives empty.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import {
  getMe,
  listTextChannels,
  checkContentAccess,
  walkHistory,
} from "./discord.ts";
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
const token = env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error(`
DISCORD_BOT_TOKEN is not set.

  1. https://discord.com/developers/applications → New Application → Bot
  2. Reset Token, copy it into .env as DISCORD_BOT_TOKEN=...
  3. IMPORTANT: on the Bot page enable "MESSAGE CONTENT INTENT"
     Without it every message arrives with empty content and the channel
     looks silent. Free toggle under 100 servers.
  4. OAuth2 → URL Generator → scope "bot", permissions
     "View Channels" + "Read Message History" → open the URL, add to server

See docs/discord-setup.md
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const me = await getMe(token);
console.log(`bot: ${me.username} (id ${me.id})`);

// ── list channels ────────────────────────────────────────────────────────────

const guildId = value("--channels");
if (guildId) {
  const channels = await listTextChannels(token, guildId);
  console.log(`\ntext channels in guild ${guildId}:\n`);
  for (const c of channels) console.log(`  ${c.id}  #${c.name}`);
  console.log(`\nBackfill one with: npm run discord -- ${channels[0]?.id ?? "<channelId>"}\n`);
  process.exit(0);
}

const channelId = args.find((a) => /^\d{15,}$/.test(a));

if (!channelId) {
  console.error(`
No channel id given.

  list channels:  npm run discord -- --channels <guildId>
  backfill:       npm run discord -- <channelId>

Enable Developer Mode in Discord (Settings → Advanced) to copy ids by
right-clicking a server or channel.
`);
  process.exit(1);
}

// ── content intent check ─────────────────────────────────────────────────────

const access = await checkContentAccess(token, channelId);
if (!access.ok) {
  console.error(`
MESSAGE CONTENT INTENT IS OFF.

Sampled ${access.sampled} human messages and every one had empty content.
The requests succeed, the counts look right, and Kith would perceive a
community of blank messages — the most confusing possible failure.

Fix: Developer Portal → your app → Bot → enable MESSAGE CONTENT INTENT.
No need to re-invite; it takes effect immediately.

Refusing to store an empty view of the community.
`);
  process.exit(1);
}
console.log(
  `message content: readable ✓  (${access.withContent}/${access.sampled} sampled)`,
);

if (flag("--check")) {
  console.log("\n--check: setup looks good, storing nothing.");
  process.exit(0);
}

// ── backfill ─────────────────────────────────────────────────────────────────

const sinceDays = value("--since") ? Number(value("--since")) : undefined;
const stopBefore = sinceDays
  ? new Date(Date.now() - sinceDays * 86_400_000)
  : undefined;

const store = new MessageStore(root("data/store.jsonl"), root("data/store-state.json"));
await store.init();
const before = await store.readState();

console.log(
  `\nwalking history${stopBefore ? ` back to ${stopBefore.toISOString().slice(0, 10)}` : " (full channel)"}...`,
);

let stored = 0;
let seen = 0;
let pagesLogged = 0;

const { pages, oldest } = await walkHistory(
  token,
  channelId,
  async (messages, events) => {
    seen += messages.length;
    // Persist per page: a months-long backfill is thousands of requests, and
    // losing all of it to a failure on the last page would be miserable.
    const { added } = await store.append(messages, events);
    stored += added;
    if (pagesLogged++ % 10 === 0) {
      process.stdout.write(`\r  ${seen} messages seen, ${stored} new stored...`);
    }
  },
  { stopBefore },
);

const total = (await store.readAll()).messages.length;
await store.writeState({
  ...before,
  chatId: channelId,
  chatTitle: before.chatTitle ?? `discord:${channelId}`,
  messageCount: total,
  lastPolledAt: new Date().toISOString(),
});

console.log(`
  pages fetched    ${pages}
  messages seen    ${seen}
  newly stored     ${stored}
  already present  ${seen - stored}
  oldest reached   ${oldest ? oldest.toISOString().slice(0, 10) : "n/a"}
  store now holds  ${total} messages

Next: npm run detect -- --store
`);
