/**
 * Presentation-layer tests.
 *
 * Everything the web UI actually reads through — the pronoun guard
 * especially. The regression case here is real text a live Mind actually
 * produced, not a constructed example: see
 * docs/evidence/2026-08-17-pronoun-guard-caught-a-real-case.md. If this test
 * ever starts failing because findPronounIssues stops catching it, that's
 * the same failure mode shipping again, silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  headlineFor,
  lastSeenFor,
  transformFeedMessages,
  findPronounIssues,
} from "./presentation.ts";
import type { HistoryMessage } from "./minds-client.ts";

test("headlineFor prioritises gap-drift with the real numbers", () => {
  const h = headlineFor({ signals: ["contribution", "gap-drift", "tone-shift"], quietForH: 222.7, quietRatio: 27.8, ans: 93 });
  assert.match(h, /Quiet for 9 days/);
  assert.match(h, /27\.8× their usual rhythm/);
});

test("headlineFor falls back to tone-shift when there's no gap-drift", () => {
  assert.match(headlineFor({ signals: ["tone-shift"], quietForH: 0, quietRatio: 0, ans: 0 }), /shorter than usual/);
});

test("headlineFor falls back to contribution when that's the only signal", () => {
  const h = headlineFor({ signals: ["contribution"], quietForH: 6.2, quietRatio: 0.4, ans: 48 });
  assert.match(h, /48 questions answered/);
});

test("lastSeenFor buckets correctly at the hour/day boundaries", () => {
  assert.equal(lastSeenFor(0.5), "active moments ago");
  assert.equal(lastSeenFor(6), "active 6h ago");
  assert.equal(lastSeenFor(48), "active 2 days ago");
});

test("transformFeedMessages marks a Kith message unprompted only with no human turn since restart", () => {
  const restartAt = "2026-08-18T00:00:00.000Z";
  const messages: HistoryMessage[] = [
    { id: "1", fingerprint: "f1", conversationId: "c", messageId: "m1", senderId: "human", senderType: 1, senderEmail: "s@e", recipientId: "kith", recipientEmail: "k@e", messageText: "<p>hi</p>", attachments: [], status: "sent", createdAt: "2026-08-17T23:00:00.000Z" },
    { id: "2", fingerprint: "f2", conversationId: "c", messageId: "m2", senderId: "kith", senderType: 0, senderEmail: "k@e", recipientId: "human", recipientEmail: "s@e", messageText: "<p>reply</p>", attachments: [], status: "sent", createdAt: "2026-08-18T00:05:00.000Z" },
    { id: "3", fingerprint: "f3", conversationId: "c", messageId: "m3", senderId: "human", senderType: 1, senderEmail: "s@e", recipientId: "kith", recipientEmail: "k@e", messageText: "<p>ok</p>", attachments: [], status: "sent", createdAt: "2026-08-18T00:10:00.000Z" },
    { id: "4", fingerprint: "f4", conversationId: "c", messageId: "m4", senderId: "kith", senderType: 0, senderEmail: "k@e", recipientId: "human", recipientEmail: "s@e", messageText: "<p>followup</p>", attachments: [], status: "sent", createdAt: "2026-08-18T00:15:00.000Z" },
  ];
  const out = transformFeedMessages(messages, restartAt);
  assert.equal(out[0]!.unprompted, false, "human messages are never unprompted");
  assert.equal(out[1]!.unprompted, true, "Kith spoke after restart with no human turn since — this is the proof");
  assert.equal(out[2]!.unprompted, false, "human message resets the window");
  assert.equal(out[3]!.unprompted, false, "a human turn happened since restart, so this reply isn't unprompted");
});

// The registry always carries "(not stated)" unless a pronoun is explicitly
// recorded — see docs/architecture.md. Both members below are on that
// default, so any gendered pronoun near their name is a real violation.
const registry = [
  { name: "Maya Okonkwo", pronouns: "they/them (not stated)" },
  { name: "Lena Fischer", pronouns: "they/them (not stated)" },
  { name: "Priya Anand", pronouns: "they/them (not stated)" },
];

test("findPronounIssues catches the actual regression this guard exists for", () => {
  // Verbatim from a real live capture, 17 Aug 2026 — the primary subject
  // (Maya) correctly used "their" throughout; two people mentioned only in
  // passing, deeper in the answer, did not.
  const realBadAnswer =
    "Maya Okonkwo is the standout signal. Roughly 27 of their own baseline " +
    "cycles missed against a tight rhythm that doesn't normally wobble that much. " +
    "I would not act on the others based on their own baselines: " +
    "Lena Fischer: 23.3h gap fits her 42.1h rhythm (quietRatio 0.6) " +
    "Priya Anand: 25.6-day gap is below her ~41-day rhythmH (990.3h), so in-pattern";

  const issues = findPronounIssues(realBadAnswer, registry);
  const flagged = issues.map((i) => i.member).sort();

  assert.deepEqual(flagged, ["Lena Fischer", "Priya Anand"]);
  assert.equal(issues.find((i) => i.member === "Lena Fischer")?.pronounUsed.toLowerCase(), "her");
  assert.equal(issues.find((i) => i.member === "Priya Anand")?.pronounUsed.toLowerCase(), "her");
  // Maya was referred to correctly and must not show up as a false positive.
  assert.ok(!flagged.includes("Maya Okonkwo"));
});

test("findPronounIssues has no false positives on the corrected version of the same answer", () => {
  const cleanAnswer =
    "Maya Okonkwo is the standout signal. Roughly 27 of their own baseline " +
    "cycles missed against a tight rhythm that doesn't normally wobble that much. " +
    "I would not act on the others based on their own baselines: " +
    "Lena Fischer: 23.3h gap fits their 42.1h rhythm (quietRatio 0.6) " +
    "Priya Anand: 25.6-day gap is below their ~41-day rhythmH (990.3h), so in-pattern";

  assert.deepEqual(findPronounIssues(cleanAnswer, registry), []);
});

test("findPronounIssues does not flag a member with an actually stated pronoun", () => {
  const withStatedPronoun = [{ name: "Sam Ojo", pronouns: "she/her (stated 2026-07-01)" }];
  const answer = "Sam Ojo has been quiet — her rhythm usually holds steady on weekdays.";
  assert.deepEqual(findPronounIssues(answer, withStatedPronoun), []);
});

test("findPronounIssues doesn't false-positive on a name that happens to contain pronoun-like substrings", () => {
  // "Sherry" contains "her"; "hero" contains "he" and "her" — the \b word
  // boundaries in the regex must reject these, not just get lucky.
  const tricky = [{ name: "Sherry Chen", pronouns: "they/them (not stated)" }];
  assert.deepEqual(findPronounIssues("Sherry Chen posted a hero image yesterday.", tricky), []);
});
