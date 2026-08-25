/**
 * Regression tests for the perception layer.
 *
 * These lock the *discriminating case*: two members with the same visible
 * behaviour where only one is a signal. If a threshold tweak ever makes Priya
 * fire or Maya go silent, the product thesis has broken and this fails loudly.
 *
 * Run: node --test src/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";
import { runAll, communityReplyNorm, d2GapDrift, d3ToneShift, d4UnansweredNewcomers, compose, DEFAULT_THRESHOLDS } from "./detectors.ts";
import { buildWatchlist, buildRegistry, estimateTokens } from "./registry.ts";
import type { MemberState } from "./types.ts";

// fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
const fixture = fileURLToPath(new URL("../data/dev-export.json", import.meta.url));

const community = await loadExport(fixture);
const states = buildMemberStates(community);
const { observations, composites } = runAll(community, states);

const named = (n: string) => observations.filter((o) => o.memberName === n);
const composedFor = (n: string) =>
  composites.filter((c) => c.memberName.includes(n));

test("the discriminating case: same silence, opposite conclusions", () => {
  const maya = states.get([...states.keys()].find((k) => states.get(k)!.name === "Maya Okonkwo")!)!;
  const priya = states.get([...states.keys()].find((k) => states.get(k)!.name === "Priya Anand")!)!;

  // Priya has actually been silent LONGER in absolute terms than Maya.
  assert.ok(
    priya.currentGapHours > maya.currentGapHours,
    "fixture invalid: Priya should be silent longer than Maya in absolute terms",
  );

  // And yet only Maya is a signal, because only Maya is outside her own rhythm.
  assert.equal(named("Maya Okonkwo").filter((o) => o.kind === "gap-drift").length, 1);
  assert.equal(named("Priya Anand").filter((o) => o.kind === "gap-drift").length, 0);
});

test("a member with too little history gets no baseline, not a guessed one", () => {
  // Priya posts monthly, so 90 days yields a handful of observations. Any
  // "rhythm" derived from that is noise. Saying nothing beats being confidently wrong.
  assert.equal(named("Priya Anand").length, 0);
});

test("a farewell suppresses drift", () => {
  // Rin is ~27x outside her rhythm and would otherwise fire — but she said goodbye.
  const rin = states.get([...states.keys()].find((k) => states.get(k)!.name === "Rin Watanabe")!)!;
  assert.ok(rin.saidFarewell, "fixture invalid: Rin should have said farewell");
  assert.equal(named("Rin Watanabe").filter((o) => o.kind === "gap-drift").length, 0);
});

test("volume is not contribution", () => {
  // Dev posts ~15x more than Maya and answers nobody. He must never surface.
  const dev = states.get([...states.keys()].find((k) => states.get(k)!.name === "Dev Raman")!)!;
  assert.ok(dev.messageCount > 3000, "fixture invalid: Dev should be high volume");
  assert.equal(dev.answersGiven, 0);
  assert.equal(composedFor("Dev Raman").length, 0);
});

test("burnout is composed, never a single signal", () => {
  const maya = composedFor("Maya Okonkwo");
  assert.equal(maya.length, 1);
  const kinds = new Set(maya[0]!.parts.map((p) => p.kind));
  assert.ok(kinds.has("contribution"), "needs sustained contribution");
  assert.ok(kinds.has("gap-drift"), "needs unusual silence");
  assert.ok(maya[0]!.parts.length >= 2, "a single signal is not a claim");
});

test("tone shift never stands alone", () => {
  const soloTone = composites.filter(
    (c) => c.parts.length === 1 && c.parts[0]!.kind === "tone-shift",
  );
  assert.equal(soloTone.length, 0);
});

/**
 * Real regression, hit live: a real member with 1,584 messages posted in
 * rapid bursts had a true median gap of a few seconds — rounds to 0.0h for
 * display, but the raw value used by the detector is nonzero, so the old
 * guard (`medianGapHours <= 0`) let it through. A completely normal 24.2h
 * absence divided by that near-zero rhythm produced a ratio in the tens of
 * thousands, trivially clearing gapRatio and flagging gap-drift for someone
 * who was actually fine. Kith itself caught this live and called it out as
 * a watchlist-construction artifact, not a real signal.
 */
function fakeMemberState(overrides: Partial<MemberState>): MemberState {
  return {
    id: "test-member",
    name: "Test Member",
    firstSeen: new Date("2026-01-01"),
    lastSeen: new Date("2026-08-01"),
    tenureDays: 213,
    activeSpanDays: 213,
    messageCount: 1584,
    medianGapHours: 0.001,
    gapMadHours: 0.001,
    currentGapHours: 24.2,
    medianLength: 40,
    lengthMad: 8,
    recentMedianLength: 40,
    priorRecentMedianLength: 40,
    answersGiven: 171,
    distinctRepliedTo: 100,
    answersToNewcomers: 157,
    saidFarewell: false,
    ...overrides,
  };
}

test("a bursty poster's near-zero rhythm doesn't turn a normal absence into false gap-drift", () => {
  const states = new Map([["bursty", fakeMemberState({ id: "bursty", name: "Bursty Poster" })]]);
  const observations = d2GapDrift(states, DEFAULT_THRESHOLDS);
  assert.equal(observations.filter((o) => o.memberName === "Bursty Poster").length, 0);
});

test("a genuinely slow, meaningful rhythm still correctly triggers gap-drift", () => {
  const states = new Map([
    [
      "slow",
      fakeMemberState({
        id: "slow",
        name: "Slow Poster",
        medianGapHours: 8,
        gapMadHours: 1,
        currentGapHours: 200,
      }),
    ],
  ]);
  const observations = d2GapDrift(states, DEFAULT_THRESHOLDS);
  assert.equal(observations.filter((o) => o.memberName === "Slow Poster").length, 1);
});

// ── D3 gates ────────────────────────────────────────────────────────────────
// Each gate exists to block a specific false positive; each test holds one
// gate open and the others satisfied, so a regression names the broken gate.

const d3 = (overrides: Partial<MemberState>) => {
  const states = new Map([["m", fakeMemberState({ id: "m", name: "Tone Member", ...overrides })]]);
  return d3ToneShift(states, DEFAULT_THRESHOLDS).length;
};

test("D3 fires on a sustained, robust taper", () => {
  // Both windows shortened, drop far outside their usual length variation.
  assert.equal(
    d3({ medianLength: 180, lengthMad: 20, recentMedianLength: 60, priorRecentMedianLength: 110 }),
    1,
  );
});

test("D3 ignores one bad day — the taper must persist into the prior window", () => {
  // Recent window dipped hard, but the window before it was at their norm.
  assert.equal(
    d3({ medianLength: 180, lengthMad: 20, recentMedianLength: 40, priorRecentMedianLength: 175 }),
    0,
  );
});

test("D3 stays quiet when the drop is within the person's ordinary variation", () => {
  // 25% shorter, but this person's lengths routinely swing that much.
  assert.equal(
    d3({ medianLength: 100, lengthMad: 35, recentMedianLength: 55, priorRecentMedianLength: 60 }),
    0,
  );
});

test("D3 refuses to speak when persistence cannot be established", () => {
  // No prior window (short history): even a dramatic shrink is unproven.
  assert.equal(
    d3({ medianLength: 180, lengthMad: 10, recentMedianLength: 30, priorRecentMedianLength: 0 }),
    0,
  );
});

// ── Real-community regressions (found in the first 195-member Discord run) ──

test("a weekend visitor who vanished is churn, not gap-drift", () => {
  // Real case: burst poster, 8+ messages in ~2 days, silent 86 days, 986×
  // ratio. Arithmetic yes; signal no — they never had a rhythm to break.
  const churn = new Map([
    [
      "churn",
      fakeMemberState({
        id: "churn",
        name: "Weekend Visitor",
        messageCount: 30,
        medianGapHours: 2,
        gapMadHours: 1,
        currentGapHours: 24 * 86,
        activeSpanDays: 2,
      }),
    ],
  ]);
  assert.equal(d2GapDrift(churn, DEFAULT_THRESHOLDS).length, 0);

  // Same person with a real history behind them: now it is drift.
  const regular = new Map([
    [
      "regular",
      fakeMemberState({
        id: "regular",
        name: "Established Regular",
        messageCount: 30,
        medianGapHours: 2,
        gapMadHours: 1,
        currentGapHours: 24 * 86,
        activeSpanDays: 60,
      }),
    ],
  ]);
  assert.equal(d2GapDrift(regular, DEFAULT_THRESHOLDS).length, 1);
});

test("a minute-scale reply norm cannot shrink the patience window to nothing", () => {
  // Real case: 195-member server, median reply latency in minutes, 44 people
  // flagged at confidence 1.0 because 3× minutes is no patience at all.
  const t0 = new Date("2026-08-24T00:00:00Z");
  const msg = (id: string, authorId: string, minsAfter: number, replyToId?: string) => ({
    id,
    ts: new Date(t0.getTime() + minsAfter * 60000),
    authorId,
    authorName: authorId,
    text: "hello",
    length: 5,
    replyToId,
  });
  const community = {
    name: "firehose",
    messages: [
      // the only reply in the community lands one minute later — norm = 1 min
      msg("a", "alice", 0),
      msg("b", "bob", 1, "a"),
      // newcomer's first message, 40 hours ago, never answered
      msg("c", "carol", 10, undefined),
    ],
    events: [],
    from: t0,
    to: new Date(t0.getTime() + 41 * HOUR),
  };
  const carolState = (): MemberState => ({
    ...fakeMemberState({ id: "carol", name: "Carol" }),
    tenureDays: 1.7,
    messageCount: 1,
  });
  const states = new Map([["carol", carolState()]]);

  const obs = d4UnansweredNewcomers(community, states, community.to, DEFAULT_THRESHOLDS);
  // 40h < the 48h floor, even though 3× the one-minute norm is 3 minutes.
  assert.equal(obs.length, 0);
});

test("a wall of unanswered newcomers shows the longest-waiting few, not all of them", () => {
  const t0 = new Date("2026-08-24T00:00:00Z");
  const obs = Array.from({ length: 44 }, (_, i) => ({
    memberId: `m${i}`,
    memberName: i === 3 ? "Oldest Waiter" : `Member ${i}`,
    kind: "unanswered-newcomer" as const,
    confidence: 1,
    claim: "unanswered",
    evidence: [
      { at: new Date(t0.getTime() - (44 - i) * DAY), fact: "first message" },
      { at: t0, fact: "still unanswered" },
    ],
    baseline: "n/a",
  }));
  const [composite] = compose(obs);
  assert.ok(composite, "44 newcomers must compose into one batched item");
  assert.ok(composite.memberName.includes("Oldest Waiter"), "longest-waiting is named first");
  assert.ok(!composite.memberName.includes("Member 6"), "names beyond the cap are hidden");
  assert.ok(composite.memberName.includes("38 others"), "the count of the rest is stated");
  assert.equal(composite.parts.length, 44, "the full list survives in the parts");
});

const HOUR = 1000 * 60 * 60;
const DAY = 24 * HOUR;

test("unanswered newcomers batch into one item, not one alert each", () => {
  const newcomerObs = observations.filter((o) => o.kind === "unanswered-newcomer");
  assert.ok(newcomerObs.length > 1, "fixture invalid: need several ignored newcomers");
  const newcomerComposites = composites.filter((c) =>
    c.parts.every((p) => p.kind === "unanswered-newcomer"),
  );
  assert.equal(newcomerComposites.length, 1, "should be exactly one batched item");
});

test("a burning-out contributor outranks a pile of newcomers", () => {
  // Ordering matters: the person quietly leaving is the harder, more valuable
  // thing to notice. Newcomers are batched precisely so they cannot drown it.
  assert.ok(composites.length >= 2);
  assert.ok(
    composites[0]!.memberName.includes("Maya"),
    "the burnout case should rank first",
  );
});

test("no gendered pronouns are ever asserted about a member", () => {
  // Kith does not know anyone's pronouns and must never guess. A wrong guess
  // misgenders a real person in a way the neutral default never does.
  const text = [
    ...composites.map((c) => c.headline),
    ...observations.map((o) => o.claim),
    ...observations.map((o) => o.baseline),
  ].join(" ");
  const gendered = text.match(/\b(he|him|his|she|her|hers)\b/gi);
  assert.equal(
    gendered,
    null,
    `output asserted gendered pronouns: ${gendered?.join(", ")}`,
  );
});

test("the watchlist contains only members carrying a live signal", () => {
  const wl = buildWatchlist(community, states, observations, community.to);
  const watched = wl.watching.map((w) => w.name);

  assert.ok(watched.includes("Maya Okonkwo"), "the burnout case must be watched");

  // The quiet majority must be absent. Their absence IS the message — and it is
  // what keeps the cycle read cheap no matter how large the community gets.
  for (const absent of ["Priya Anand", "Dev Raman", "Rin Watanabe", "Sam Ojo"]) {
    assert.ok(
      !watched.includes(absent),
      `${absent} has no live signal and must not be on the watchlist`,
    );
  }
});

test("the watchlist scales with signals, not members", () => {
  const wl = buildWatchlist(community, states, observations, community.to);
  const full = estimateTokens(
    buildRegistry(community, states, communityReplyNorm(community), observations, community.to),
  );
  const cycle = estimateTokens(wl);

  // The cadence cycle reads the watchlist, and it runs on a schedule forever.
  // If this ever approaches the full registry, the cost model is broken.
  assert.ok(
    cycle < full / 2,
    `watchlist (${cycle} tokens) should be far smaller than the registry (${full})`,
  );
  assert.ok(wl.watching.length < wl.memberCount, "not everyone should be watched");
});

test("every observation carries citable evidence with real timestamps", () => {
  for (const o of observations) {
    assert.ok(o.evidence.length > 0, `${o.kind} for ${o.memberName} has no evidence`);
    for (const e of o.evidence) {
      assert.ok(
        e.at instanceof Date && !Number.isNaN(e.at.getTime()),
        `${o.kind} for ${o.memberName} has an invalid timestamp`,
      );
    }
  }
});
