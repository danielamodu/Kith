/**
 * continuity.ts is pure — no disk, no clock — so these lock the streak
 * logic directly against hand-built history, the same way detectors.test.ts
 * locks the discriminating case rather than trusting the real fixture alone.
 *
 * Run: node --test src/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeContinuity, appendSnapshot, type WatchlistSnapshot } from "./continuity.ts";
import type { Watchlist } from "./registry.ts";

test("a member on the watchlist for the first time gets a fresh streak of 1", () => {
  const continuity = computeContinuity([], [{ key: "community.member.maya", signals: ["gap-drift"] }], "2026-08-20T00:00:00.000Z");
  const maya = continuity.get("community.member.maya");
  assert.ok(maya);
  assert.equal(maya!.cyclesFlagged, 1);
  assert.equal(maya!.firstFlaggedAt, "2026-08-20T00:00:00.000Z");
});

test("three unbroken prior cycles plus this one is a streak of 4, dated to the oldest", () => {
  const history: WatchlistSnapshot[] = [
    { at: "2026-08-17T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
    { at: "2026-08-18T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
    { at: "2026-08-19T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
  ];
  const continuity = computeContinuity(history, [{ key: "community.member.maya", signals: ["gap-drift"] }], "2026-08-20T00:00:00.000Z");
  const maya = continuity.get("community.member.maya")!;
  assert.equal(maya.cyclesFlagged, 4);
  assert.equal(maya.firstFlaggedAt, "2026-08-17T00:00:00.000Z");
});

test("a gap in the middle breaks the streak — only the cycles since the return count", () => {
  const history: WatchlistSnapshot[] = [
    { at: "2026-08-15T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
    { at: "2026-08-16T00:00:00.000Z", watching: [] }, // dropped off — streak breaks here
    { at: "2026-08-17T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
    { at: "2026-08-18T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
  ];
  const continuity = computeContinuity(history, [{ key: "community.member.maya", signals: ["gap-drift"] }], "2026-08-19T00:00:00.000Z");
  const maya = continuity.get("community.member.maya")!;
  assert.equal(maya.cyclesFlagged, 3, "should count 08-17, 08-18, and today — not the pre-gap 08-15 cycle");
  assert.equal(maya.firstFlaggedAt, "2026-08-17T00:00:00.000Z");
});

test("history entries are re-sorted chronologically before walking — order in the log file must not matter", () => {
  const history: WatchlistSnapshot[] = [
    { at: "2026-08-19T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
    { at: "2026-08-18T00:00:00.000Z", watching: [{ key: "community.member.maya", name: "Maya", signals: ["gap-drift"] }] },
  ];
  const continuity = computeContinuity(history, [{ key: "community.member.maya", signals: ["gap-drift"] }], "2026-08-20T00:00:00.000Z");
  assert.equal(continuity.get("community.member.maya")!.cyclesFlagged, 3);
});

test("appendSnapshot caps history to maxHistory, dropping the oldest first", () => {
  const history: WatchlistSnapshot[] = Array.from({ length: 5 }, (_, i) => ({
    at: `2026-08-1${i}T00:00:00.000Z`,
    watching: [],
  }));
  const watchlist = { generatedAt: "2026-08-20T00:00:00.000Z", watching: [] } as unknown as Watchlist;
  const next = appendSnapshot(history, watchlist, 3);
  assert.equal(next.length, 3);
  assert.equal(next[0]!.at, "2026-08-13T00:00:00.000Z");
  assert.equal(next[2]!.at, "2026-08-20T00:00:00.000Z");
});

test("appendSnapshot appends unconditionally, even when nothing changed", () => {
  const snap: WatchlistSnapshot = { at: "2026-08-19T00:00:00.000Z", watching: [{ key: "a", name: "A", signals: ["x"] }] };
  const watchlist = {
    generatedAt: "2026-08-20T00:00:00.000Z",
    watching: [{ key: "a", name: "A", signals: ["x"] }],
  } as unknown as Watchlist;
  const next = appendSnapshot([snap], watchlist);
  assert.equal(next.length, 2, "an unchanged cycle must still be recorded, or streak counts would undercount");
});
