/**
 * Threshold calibration.
 *
 * Every constant in the detectors is a first guess until it has been fitted to a
 * real community. This sweeps each one and shows what changes, so the numbers get
 * *chosen against evidence* rather than picked because they sounded reasonable.
 *
 * There is no ground truth here, so this does not report accuracy. What it reports
 * is the shape of the tradeoff — how many people a threshold surfaces, and which
 * ones — plus the one invariant that must hold at any setting:
 *
 *   the discriminating case: two members with comparable silence where only one
 *   is outside their own rhythm. If a setting fires on both, that setting is
 *   using a global threshold in disguise and is wrong regardless of how good the
 *   other numbers look.
 *
 * Run: node src/calibrate.ts [export-path]
 */
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";
import { runAll, DEFAULT_THRESHOLDS, type Thresholds } from "./detectors.ts";
import { MessageStore } from "./store.ts";
import type { Community, MemberState } from "./types.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// --store sweeps against the accumulated real-community store (Discord backfill
// + live); otherwise a single export file, which defaults to the fixture.
const useStore = process.argv.includes("--store");
const path =
  process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) ??
  root("data/dev-export.json");

const community = useStore
  ? await new MessageStore(root("data/store.jsonl"), root("data/store-state.json")).toCommunity(
      (await new MessageStore(root("data/store.jsonl"), root("data/store-state.json")).readState())
        .chatTitle ?? "community",
    )
  : await loadExport(path);
const states = buildMemberStates(community);
const asOf = community.to;

type Row = {
  value: number;
  surfaced: number;
  composed: number;
  who: string;
};

function evaluate(t: Thresholds): {
  surfaced: Set<string>;
  composed: string[];
  /** name → which detectors fired, so we can ask about a specific signal */
  kinds: Map<string, Set<string>>;
} {
  const { observations, composites } = runAll(community, states, asOf, t);
  const kinds = new Map<string, Set<string>>();
  for (const o of observations) {
    let set = kinds.get(o.memberName);
    if (!set) {
      set = new Set();
      kinds.set(o.memberName, set);
    }
    set.add(o.kind);
  }
  return {
    surfaced: new Set(observations.map((o) => o.memberName)),
    composed: composites.map((c) => c.memberName),
    kinds,
  };
}

function sweep(
  label: string,
  key: keyof Thresholds,
  values: number[],
): void {
  console.log(`\n${label}   (default ${DEFAULT_THRESHOLDS[key]})`);
  console.log("  " + "-".repeat(88));
  console.log(
    "  " +
      "value".padStart(7) +
      "surfaced".padStart(10) +
      "composed".padStart(10) +
      "   who is flagged",
  );
  for (const value of values) {
    const t = { ...DEFAULT_THRESHOLDS, [key]: value };
    const { surfaced, composed } = evaluate(t);
    const marker = value === DEFAULT_THRESHOLDS[key] ? " ←" : "  ";
    const who = composed.length ? composed.join("; ") : "(nobody)";
    console.log(
      "  " +
        String(value).padStart(7) +
        String(surfaced.size).padStart(10) +
        String(composed.length).padStart(10) +
        `${marker} ` +
        (who.length > 60 ? who.slice(0, 57) + "..." : who),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${community.name}`);
console.log(
  `${community.messages.length} messages · ${states.size} members · ` +
    `${community.from.toISOString().slice(0, 10)} → ${community.to.toISOString().slice(0, 10)}`,
);

sweep("minObservations — below this, no baseline is trustworthy", "minObservations", [2, 4, 6, 8, 12, 20, 40]);
sweep("gapRatio — multiples of their OWN rhythm before silence counts", "gapRatio", [1.5, 2, 3, 5, 8, 15, 30]);
sweep("gapMads — robust outlier guard, in MADs above their median", "gapMads", [0, 1, 2, 3, 5, 10]);
sweep("toneShrink — recent length as a fraction of their norm", "toneShrink", [0.3, 0.4, 0.5, 0.6, 0.75, 0.9]);
sweep("tonePriorShrink — how shortened the PRIOR window must also be", "tonePriorShrink", [0.5, 0.65, 0.8, 0.9, 1.01]);
sweep("toneMads — length-drop robust outlier guard, in MADs below their norm", "toneMads", [0, 1, 2, 3, 5]);
sweep("newcomerPatience — multiples of the community reply norm", "newcomerPatience", [1, 2, 3, 6, 12, 48]);
sweep("newcomerPatienceFloorH — floor on the patience window, in hours", "newcomerPatienceFloorH", [0, 12, 24, 48, 96, 168]);
sweep("minActiveSpanDays — history required before silence counts as drift", "minActiveSpanDays", [0, 3, 7, 14, 30]);
sweep("contributionFloor — fraction of top score needed to surface", "contributionFloor", [0.1, 0.25, 0.4, 0.6, 0.8]);

// ─────────────────────────────────────────────────────────────────────────────
// The invariant that outranks every number above
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(90)}`);
console.log("DISCRIMINATING CASE — must hold at any setting");
console.log("═".repeat(90));

/**
 * Find the pair that matters automatically rather than hardcoding fixture names,
 * so this keeps working on the real community: the member with the highest
 * ratio-to-own-rhythm, and the member with the longest *absolute* silence who is
 * nonetheless still inside their own rhythm.
 *
 * The signal candidate must pass the structural guards. The highest raw ratio in
 * a real community belongs to a burst poster whose "rhythm" is seconds long —
 * minRhythmHours suppresses them *by design*, and if the harness picks them as
 * the signal, the table below demands a fire that should never happen and
 * reports MISSES at every setting. Found live: a 491,332× ratio on a 0.00-day
 * rhythm, "missed" at every gapRatio.
 */
function findPair(states: Map<string, MemberState>) {
  const all = [...states.values()].filter((s) => s.medianGapHours > 0);
  const eligible = all.filter(
    (s) =>
      s.messageCount >= DEFAULT_THRESHOLDS.minObservations &&
      !s.saidFarewell &&
      s.medianGapHours >= DEFAULT_THRESHOLDS.minRhythmHours &&
      s.activeSpanDays >= DEFAULT_THRESHOLDS.minActiveSpanDays,
  );
  const signal = eligible.sort(
    (a, b) =>
      b.currentGapHours / b.medianGapHours - a.currentGapHours / a.medianGapHours,
  )[0];
  const control = all
    .filter((s) => s.currentGapHours / s.medianGapHours < 1 && s !== signal)
    .sort((a, b) => b.currentGapHours - a.currentGapHours)[0];
  const suppressed = all.filter(
    (s) =>
      s.messageCount >= DEFAULT_THRESHOLDS.minObservations &&
      !eligible.includes(s),
  );
  return { signal, control, suppressed };
}

const { signal, control, suppressed } = findPair(states);

if (!signal || !control) {
  console.log("\n  Could not identify a discriminating pair in this data.");
  console.log("  That is itself informative: this community may lack the contrast");
  console.log("  the demo depends on. Check before filming.\n");
} else {
  if (suppressed.length > 0) {
    console.log(
      `\n  note: ${suppressed.length} high-ratio member(s) excluded from signal` +
        ` consideration — burst/churn patterns the guards correctly suppress` +
        ` (e.g. ${suppressed[0]!.name}).`,
    );
  }
  const r = (s: MemberState) => s.currentGapHours / s.medianGapHours;
  console.log(
    `\n  signal :  ${signal.name.padEnd(20)} quiet ${(signal.currentGapHours / 24).toFixed(1)}d · ` +
      `rhythm ${(signal.medianGapHours / 24).toFixed(2)}d · ${r(signal).toFixed(1)}× own`,
  );
  console.log(
    `  control:  ${control.name.padEnd(20)} quiet ${(control.currentGapHours / 24).toFixed(1)}d · ` +
      `rhythm ${(control.medianGapHours / 24).toFixed(2)}d · ${r(control).toFixed(1)}× own`,
  );

  if (control.currentGapHours > signal.currentGapHours) {
    console.log(
      `\n  Note: the control has been silent LONGER in absolute terms ` +
        `(${(control.currentGapHours / 24).toFixed(1)}d vs ${(signal.currentGapHours / 24).toFixed(1)}d).`,
    );
    console.log("  A global threshold flags the wrong person. This is the whole thesis.");
  }

  // Ask specifically about gap-drift, not "did this person surface at all" — the
  // signal member also surfaces via contribution, which would mask a threshold
  // that has stopped detecting the silence entirely.
  console.log("\n  gapRatio  signal drift?  control drift?  verdict");
  console.log("  " + "-".repeat(60));
  for (const value of [1.5, 2, 3, 5, 8, 15, 30, 50]) {
    const t = { ...DEFAULT_THRESHOLDS, gapRatio: value };
    const { kinds } = evaluate(t);
    const sig = kinds.get(signal.name)?.has("gap-drift") ?? false;
    const ctl = kinds.get(control.name)?.has("gap-drift") ?? false;
    const verdict = sig && !ctl ? "OK" : !sig ? "MISSES the signal" : "FALSE POSITIVE";
    console.log(
      "  " +
        String(value).padStart(8) +
        (sig ? "yes" : "no").padStart(15) +
        (ctl ? "yes" : "no").padStart(16) +
        "  " +
        verdict,
    );
  }
}

console.log(`
How to use this against a real export:
  1. Read the sweeps for the shape, not for a maximum. A threshold that surfaces
     everybody is a firehose; one that surfaces nobody is a silent product.
  2. Prefer the setting that keeps the discriminating case OK across the widest
     band — robustness beats a knife-edge optimum, because next month's data will
     differ from this month's.
  3. Sanity-check the named output by hand against people the creator knows. This
     is the only real ground truth available, and it is worth asking for.
  4. Write the chosen values into DEFAULT_THRESHOLDS and record why in the docs.
`);
