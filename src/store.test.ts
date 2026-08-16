/**
 * Store round-trip tests.
 *
 * The store is where backfilled history and live traffic merge. If it loses or
 * duplicates anything, every personal baseline downstream is quietly wrong — and
 * quietly is the dangerous part, because the numbers still look plausible.
 *
 * Uses temp files so it never touches the real data/store.jsonl.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";
import { runAll } from "./detectors.ts";
import { MessageStore, communityToStoreRows } from "./store.ts";

const fixture = fileURLToPath(new URL("../data/dev-export.json", import.meta.url));

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), "kith-store-"));
  return {
    store: new MessageStore(join(dir, "store.jsonl"), join(dir, "state.json")),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

test("store round-trip preserves every message and event", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.init();
    const community = await loadExport(fixture);
    const rows = communityToStoreRows(community);

    const { added } = await store.append(rows.messages, rows.events);
    assert.equal(added, community.messages.length, "every message should be stored");

    const back = await store.toCommunity(community.name);
    assert.equal(back.messages.length, community.messages.length);
    assert.equal(back.from.getTime(), community.from.getTime());
    assert.equal(back.to.getTime(), community.to.getTime());

    // reply threading must survive, or D1 and D4 both silently collapse
    const originalReplies = community.messages.filter((m) => m.replyToId !== undefined).length;
    const storedReplies = back.messages.filter((m) => m.replyToId !== undefined).length;
    assert.equal(storedReplies, originalReplies, "reply links must survive the round trip");
  } finally {
    await cleanup();
  }
});

test("re-appending the same export adds nothing", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.init();
    const community = await loadExport(fixture);
    const rows = communityToStoreRows(community);

    await store.append(rows.messages, rows.events);
    const second = await store.append(rows.messages, rows.events);

    // Telegram resends anything the offset has not acknowledged, so this path is
    // hit for real every time a poll crashes mid-batch.
    assert.equal(second.added, 0, "dedupe must absorb a full replay");
    const back = await store.toCommunity(community.name);
    assert.equal(back.messages.length, community.messages.length);
  } finally {
    await cleanup();
  }
});

test("detectors agree whether read from the store or the export", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.init();
    const direct = await loadExport(fixture);
    const rows = communityToStoreRows(direct);
    await store.append(rows.messages, rows.events);
    const viaStore = await store.toCommunity(direct.name);

    const a = runAll(direct, buildMemberStates(direct), direct.to);
    const b = runAll(viaStore, buildMemberStates(viaStore), viaStore.to);

    assert.deepEqual(
      b.composites.map((c) => c.headline),
      a.composites.map((c) => c.headline),
      "the store path must produce identical judgements",
    );
  } finally {
    await cleanup();
  }
});

test("a torn final line does not destroy the store", async () => {
  const { store, cleanup } = await freshStore();
  try {
    await store.init();
    const community = await loadExport(fixture);
    const rows = communityToStoreRows(community);
    await store.append(rows.messages.slice(0, 50), []);

    // simulate a process killed mid-write
    const { appendFile } = await import("node:fs/promises");
    await appendFile(store.logPath, '{"t":"m","d":{"id":999,"ts":"2026', "utf8");

    const back = await store.readAll();
    assert.equal(back.messages.length, 50, "losing one torn line beats losing the file");
  } finally {
    await cleanup();
  }
});
