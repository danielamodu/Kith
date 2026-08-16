/**
 * Fold a Telegram Desktop export into the store.
 *
 * Run: node src/cli-backfill.ts <export.json>
 *
 * This is the only way to get history from before the bot joined — the Bot API
 * cannot reach it. Backfill first, then poll forward; the store dedupes the
 * overlap by message id, so running both is safe and the seam is invisible.
 */
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { MessageStore, communityToStoreRows } from "./store.ts";

const path = process.argv[2];
if (!path) {
  console.error(`
usage: node src/cli-backfill.ts <export.json>

Export it from Telegram DESKTOP (not mobile, not web):
  group → ⋮ → Export chat history
  untick photos/videos/files, set Format to "Machine-readable JSON"
`);
  process.exit(1);
}

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

const community = await loadExport(path);
const store = new MessageStore(root("data/store.jsonl"), root("data/store-state.json"));
await store.init();

const before = await store.readState();
const rows = communityToStoreRows(community, before.chatId ?? "0", "export");
const { added } = await store.append(rows.messages, rows.events);

const total = (await store.readAll()).messages.length;
await store.writeState({
  ...before,
  chatTitle: before.chatTitle ?? community.name,
  messageCount: total,
});

const skipped = rows.messages.length - added;

console.log(`
${community.name}
  export contained   ${rows.messages.length} messages, ${rows.events.length} membership events
  added              ${added}
  already present    ${skipped}${skipped > 0 ? "  (dedupe worked)" : ""}
  store now holds    ${total} messages
  window             ${community.from.toISOString().slice(0, 10)} → ${community.to.toISOString().slice(0, 10)}

Next: npm run detect -- --store
`);
