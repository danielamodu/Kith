/**
 * slugify() — the regression is real: NFKD + diacritic stripping only
 * helps Latin-script names. A member whose name is entirely CJK, Arabic,
 * Cyrillic, Thai, or emoji has nothing left after [^a-z0-9]+ strips it,
 * so every such member collided on the same empty "community.member."
 * key, silently merging different people's histories in the Mind's memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./registry.ts";

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
