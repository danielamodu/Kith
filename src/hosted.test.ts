/**
 * Tests for the hosted-product layer: tenant secrets, the per-guild message
 * store, digest rendering, and the snowflake clock math.
 *
 * These run against the FileStore fallback (no KV env in tests), writing
 * under data/tenants/test-*.json and cleaning up after themselves.
 *
 * Run: node --test src/
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  encryptSecret,
  decryptSecret,
  appendGuildMessages,
  getGuildMessages,
  guildMessagesToCommunity,
  saveGuildConfig,
  getGuildConfig,
  listGuilds,
  removeGuild,
  type GuildConfig,
} from "./tenant-store.ts";
import { renderDigest } from "./digest.ts";
import { snowflakeAt } from "./cron-poll.ts";
import type { Community, Composite } from "./types.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
// Unique per run: file-backed state must never leak between runs, and a
// leftover store from a crashed earlier invocation would otherwise flip
// the dedupe assertions. The `after` cleanup is housekeeping, not a
// correctness dependency.
const GUILD = `test-guild-${Date.now()}`;

before(() => {
  process.env.SERVER_SECRET = "test-secret-for-the-hosted-layer-only";
});

after(async () => {
  delete process.env.SERVER_SECRET;
  await rm(root("data/tenants"), { recursive: true, force: true });
});

// ── secrets ──────────────────────────────────────────────────────────────────

test("creator keys round-trip through encrypt/decrypt", () => {
  const key = "builder-api-key-abc123";
  const enc = encryptSecret(key);
  assert.ok(enc.startsWith("v1:"), "ciphertext is versioned");
  assert.ok(!enc.includes(key), "plaintext must not appear in the ciphertext");
  assert.equal(decryptSecret(enc), key);
});

test("each encryption uses a fresh salt — same input, different ciphertext", () => {
  assert.notEqual(encryptSecret("same"), encryptSecret("same"));
});

test("a tampered ciphertext fails to decrypt rather than returning garbage", () => {
  const enc = encryptSecret("creator-key");
  const raw = Buffer.from(enc.slice(3), "base64");
  raw[raw.length - 20]! ^= 0xff; // flip a bit in the ciphertext body
  const tampered = "v1:" + raw.toString("base64");
  assert.throws(() => decryptSecret(tampered));
});

// ── per-guild message store ─────────────────────────────────────────────────

const msg = (id: string, ts: string, authorId = "u1") => ({
  id,
  ts,
  authorId,
  authorName: authorId,
  text: `message ${id}`,
  chatId: "c1",
  source: "discord" as const,
});

test("appending the same messages twice adds nothing — dedupe by id", async () => {
  const batch = [msg("m1", "2026-08-20T10:00:00Z"), msg("m2", "2026-08-20T11:00:00Z")];
  const first = await appendGuildMessages(GUILD, batch, []);
  const second = await appendGuildMessages(GUILD, batch, []);
  assert.equal(first.added, 2);
  assert.equal(second.added, 0);
  const stored = await getGuildMessages(GUILD);
  assert.equal(stored.messages.length, 2);
});

test("the analysis window is bounded — old messages fall out, order survives", async () => {
  const old = msg("m-old", "2026-01-01T00:00:00Z"); // >90 days before now (2026-08)
  const fresh = msg("m-fresh", new Date(Date.now() - 86_400_000).toISOString());
  await appendGuildMessages(GUILD, [old, fresh], []);
  const stored = await getGuildMessages(GUILD);
  assert.ok(!stored.messages.some((m) => m.id === "m-old"), "90-day window trims the past");
  assert.ok(stored.messages.some((m) => m.id === "m-fresh"));
  for (let i = 1; i < stored.messages.length; i++) {
    assert.ok(stored.messages[i]!.ts >= stored.messages[i - 1]!.ts, "sorted ascending");
  }
});

test("guild config round-trips and the Minds key is never stored in the clear", async () => {
  const config: GuildConfig = {
    guildId: "cfg-guild",
    channelIds: ["c1"],
    mindsKeyEnc: encryptSecret("super-secret-key"),
    mindId: "mind-1",
    connectedAt: "2026-08-25T00:00:00Z",
  };
  await saveGuildConfig(config);
  const loaded = await getGuildConfig("cfg-guild");
  assert.ok(loaded, "config persists");
  assert.equal(loaded!.mindsKeyEnc, config.mindsKeyEnc);
  assert.ok(!JSON.stringify(loaded).includes("super-secret-key"), "plaintext key absent from stored config");

  const all = await listGuilds();
  assert.ok(all.some((g) => g.guildId === "cfg-guild"), "indexed for the cron cycle");

  await removeGuild("cfg-guild");
  assert.equal(await getGuildConfig("cfg-guild"), null);
  assert.ok(!(await listGuilds()).some((g) => g.guildId === "cfg-guild"));
});

test("stored messages map to the Community shape the pipeline expects", async () => {
  await appendGuildMessages(
    GUILD,
    [msg("c1", "2026-08-20T10:00:00Z"), msg("c2", "2026-08-20T12:00:00Z")],
    [],
  );
  const stored = await getGuildMessages(GUILD);
  const community = guildMessagesToCommunity("Test Guild", stored);
  assert.equal(community.name, "Test Guild");
  assert.equal(community.messages.length, stored.messages.length);
  assert.equal(community.from.getTime(), new Date(stored.messages[0]!.ts).getTime());
});

// ── snowflake math ───────────────────────────────────────────────────────────

test("snowflakeAt maps a timestamp to Discord's id space", () => {
  // 2015-01-01T00:00:00Z is Discord's epoch — id should be ~0
  assert.equal(snowflakeAt("2015-01-01T00:00:00Z"), "0");
  // a modern timestamp must produce a plausible snowflake (large, numeric)
  const s = snowflakeAt("2026-08-25T00:00:00Z");
  assert.ok(/^[0-9]+$/.test(s));
  assert.ok(BigInt(s) > 10n ** 18n, "2026 snowflakes are ~1.4e18");
});

// ── digest ───────────────────────────────────────────────────────────────────

const composite = (name: string, claim: string, conf: number): Composite => ({
  memberId: name,
  memberName: name,
  headline: `${name} needs a check-in.`,
  parts: [
    {
      memberId: name,
      memberName: name,
      kind: "gap-drift",
      confidence: conf,
      claim,
      evidence: [{ at: new Date(), fact: "last seen" }],
      baseline: "their own rhythm",
    },
  ],
  weight: conf,
});

const fakeCommunity: Community = {
  name: "Creator Circle",
  messages: [],
  events: [],
  from: new Date("2026-08-01"),
  to: new Date("2026-08-25T12:00:00Z"),
};

test("an empty day renders the silence explicitly, not an error", () => {
  const text = renderDigest(fakeCommunity, []);
  assert.ok(text.includes("Quiet day"));
  assert.ok(text.includes("Creator Circle"));
});

test("the digest is headlines only — one line per case, no repeated detail", () => {
  const many: Composite = {
    ...composite("Maya", "claim-a", 1),
    parts: [
      { ...composite("Maya", "claim-a", 1).parts[0]! },
      { ...composite("Maya", "claim-b", 0.6).parts[0]! },
      { ...composite("Maya", "claim-c", 0.2).parts[0]! },
    ],
    weight: 2,
  };
  const text = renderDigest(fakeCommunity, [composite("Priya", "priya-claim", 0.5), many]);
  assert.ok(text.includes("Maya needs a check-in."));
  assert.ok(text.includes("Priya needs a check-in."));
  // the parts' claims are the headline's content repeated — a concise
  // digest must not print them
  assert.ok(!text.includes("claim-a"));
  assert.ok(!text.includes("priya-claim"));
  // exactly two case lines (▸ markers), not one per part
  assert.equal((text.match(/▸/g) ?? []).length, 2);
});

test("an absurdly large digest truncates under Discord's hard cap", () => {
  const many = Array.from({ length: 60 }, (_, i) => composite(`Member${i}`, "x".repeat(80), 0.5));
  const text = renderDigest(fakeCommunity, many);
  assert.ok(text.length <= 2000, `digest must fit Discord's limit, got ${text.length}`);
});
