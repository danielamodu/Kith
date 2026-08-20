/**
 * slugify() — the regression is real: NFKD + diacritic stripping only
 * helps Latin-script names. A member whose name is entirely CJK, Arabic,
 * Cyrillic, Thai, or emoji has nothing left after [^a-z0-9]+ strips it,
 * so every such member collided on the same empty "community.member."
 * key, silently merging different people's histories in the Mind's memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify, buildRegistry } from "./registry.ts";
import type { Community } from "./types.ts";

test("slugify handles ordinary Latin names as before — no id needed", () => {
  assert.equal(slugify("Maya Okonkwo"), "maya-okonkwo");
  assert.equal(slugify("José García"), "jose-garcia");
});

test("slugify falls back to the member id when a name has nothing left to slug", () => {
  const withId = slugify("李明", "discord-9182736450");
  assert.notEqual(withId, "");
  assert.match(withId, /^id-/);
});

test("two different non-Latin members get different slugs via their ids, not the same empty one", () => {
  const a = slugify("田中太郎", "id-1111");
  const b = slugify("鈴木花子", "id-2222");
  assert.notEqual(a, b, "different people must not collide on the same registry key");
});

test("slugify never returns empty even with no id available", () => {
  assert.notEqual(slugify("🎉🎊"), "");
});

/**
 * Real regression, hit live: a genuinely active 193-member Discord's true
 * median reply latency was under 3 minutes (0.02-ish hours). round1 (one
 * decimal place) rounded that straight down to a literal 0, and Kith
 * itself flagged the consequence — every newcomer's wait read as "∞× the
 * community's normal reply time" because whatever was dividing by
 * replyNormH was dividing by zero. replyNormH must never be a literal 0.
 */
test("buildRegistry never reports a literal 0 replyNormH for a genuinely fast-replying community", () => {
  const community: Community = {
    name: "fast community",
    messages: [],
    events: [],
    from: new Date("2026-01-01"),
    to: new Date("2026-01-02"),
  };
  const registry = buildRegistry(community, new Map(), 0.02);
  assert.notEqual(registry.replyNormH, 0);
  assert.ok(registry.replyNormH > 0);
});

test("buildRegistry still rounds a normal (slower) replyNormH sensibly", () => {
  const community: Community = {
    name: "normal community",
    messages: [],
    events: [],
    from: new Date("2026-01-01"),
    to: new Date("2026-01-02"),
  };
  const registry = buildRegistry(community, new Map(), 1.8);
  assert.equal(registry.replyNormH, 1.8);
});
