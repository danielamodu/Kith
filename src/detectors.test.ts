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
import { runAll, communityReplyNorm } from "./detectors.ts";
import { buildWatchlist, buildRegistry, estimateTokens } from "./registry.ts";

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
