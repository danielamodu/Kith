/**
 * D1–D4 per docs/perception-spec.md.
 *
 * Two rules govern everything here:
 *   1. Every signal is relative to the member's own baseline, never a global threshold.
 *      If a detector could be evaluated from a single snapshot, it does not belong.
 *   2. Every observation carries evidence with real timestamps. A claim Kith cannot
 *      cite is a claim it does not make.
 *
 * All constants are marked CALIBRATE — they are first guesses to be fitted against
 * real backfilled history, not values chosen on principle.
 */
import type { Community, MemberState, Message } from "./types.ts";

const HOUR = 1000 * 60 * 60;

/**
 * Human units, because "0.0 days" is how a five-minute reply norm displays
 * when you insist on measuring the world in days — and a baseline that reads
 * as zero is a baseline nobody can cite.
 */
const fmtDuration = (h: number) =>
  h < 1
    ? `${Math.max(1, Math.round(h * 60))} min`
    : h < 48
      ? `${Math.round(h)} h`
      : `${(h / 24).toFixed(1)} days`;

const fmtDays = fmtDuration;

export type Evidence = { at: Date; fact: string };

export type Observation = {
  memberId: string;
  memberName: string;
  kind: "contribution" | "gap-drift" | "tone-shift" | "unanswered-newcomer";
  /** 0..1, how far outside their own normal this is */
  confidence: number;
  claim: string;
  evidence: Evidence[];
  baseline: string;
};

/**
 * Every threshold in one place, and every one of them a knob rather than a
 * constant — because they must be *fitted* to a real community, not chosen on
 * principle. `npm run calibrate` sweeps these and shows the tradeoff.
 *
 * The defaults below are first guesses validated only against the synthetic
 * fixture. Treat them as unfitted until they have been run against real history.
 */
export type Thresholds = {
  /**
   * Below this many messages we cannot compute a trustworthy personal baseline.
   * Discovered empirically: a member posting monthly yields 2 observations over
   * 90 days, and a "41-day rhythm" from one gap is noise, not a baseline.
   * Saying nothing is always better than saying something confidently wrong.
   */
  minObservations: number;
  /** How many times their own median gap counts as "well outside their rhythm". */
  gapRatio: number;
  /** Additional robust-outlier guard, in MADs above the median. */
  gapMads: number;
  /**
   * Below this median gap (hours), a person posts too frequently for
   * "rhythm" to mean anything at hour granularity, and the ratio math
   * breaks down. Real bug, found live: a member with 1,584 messages
   * posted in rapid bursts had a true median gap of a few seconds
   * (rounds to 0.0 for display, but isn't literally 0) — a completely
   * normal 24h absence divided by that near-zero rhythm produced a
   * ~24,000× ratio, trivially clearing gapRatio and flagging a false
   * gap-drift for someone who was actually fine. The old guard
   * (`medianGapHours <= 0`) only excluded exactly zero, not "small
   * enough to be meaningless" — mirrors the same near-zero-denominator
   * bug replyNormH had in registry.ts.
   */
  minRhythmHours: number;
  /** Recent messages this fraction of their norm or shorter counts as tapering. */
  toneShrink: number;
  /**
   * The window BEFORE the recent one must also sit below this fraction of
   * their norm. Burnout ramps over days; a single burst of short replies is a
   * bad afternoon, not a signal. Requiring both windows is what separates them.
   */
  tonePriorShrink: number;
  /**
   * Robust-outlier guard for length, in MADs below their own norm — mirrors
   * gapMads. A drop their ordinary day-to-day variation already explains is
   * not a shift at all.
   */
  toneMads: number;
  /** A newcomer's first post is "ignored" past this multiple of the community norm. */
  newcomerPatience: number;
  /**
   * Floor on the patience window, in hours. In a firehose community the reply
   * norm is minutes, so patience×norm collapses to "a few minutes" — every
   * greeting older than lunch would flag forever at confidence 1.0. Found live:
   * a 195-member server with a minute-scale norm flagged 44 people at once.
   * "Ignored" has to mean something no matter how fast the room talks.
   */
  newcomerPatienceFloorH: number;
  /**
   * A member whose entire active life fits inside this span did not drift —
   * they tried the community and left. Churn is sad but it is not gap-drift:
   * drift is a *rhythm* breaking, and a weekend visitor never had one. Found
   * live: burst posters with 986× ratios drowning out genuine regulars.
   */
  minActiveSpanDays: number;
  /** A contributor must score at least this fraction of the top score to surface. */
  contributionFloor: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  minObservations: 8,
  gapRatio: 3,
  gapMads: 3,
  minRhythmHours: 0.5,
  toneShrink: 0.6,
  tonePriorShrink: 0.8,
  toneMads: 2,
  newcomerPatience: 3,
  newcomerPatienceFloorH: 48,
  minActiveSpanDays: 7,
  contributionFloor: 0.4,
};

// ─────────────────────────────────────────────────────────────────────────────
// D1 · Contribution — who is holding this place together
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ranked within this community, not absolute: ten answers is extraordinary in a
 * group of 80 and unremarkable in a group of 5,000. Weighted toward answering
 * *newcomers*, and toward breadth of people helped rather than reply count —
 * volume is not contribution, and rewarding volume rewards the loudest person.
 */
export function d1Contribution(
  states: Map<string, MemberState>,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Observation[] {
  const scored = [...states.values()].map((s) => ({
    s,
    score: s.answersGiven + s.answersToNewcomers * 2 + s.distinctRepliedTo * 0.5,
  }));

  const scores = scored.map((x) => x.score).sort((a, b) => b - a);
  const top = scores[0] ?? 0;
  if (top <= 0) return [];

  const out: Observation[] = [];
  for (const { s, score } of scored) {
    if (score <= 0) continue;
    const rank = scores.indexOf(score) + 1;
    // only surface genuine standouts
    if (score < top * t.contributionFloor) continue;

    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "contribution",
      confidence: Math.min(1, score / top),
      claim:
        `${s.name} has answered ${s.answersGiven} questions` +
        (s.answersToNewcomers > 0
          ? `, ${s.answersToNewcomers} of them from people newer than they are`
          : "") +
        ` — ranked ${rank} of ${scored.length} in this community.`,
      evidence: [
        { at: s.firstSeen, fact: `joined; ${Math.round(s.tenureDays)} days of history` },
        { at: s.lastSeen, fact: `${s.messageCount} messages, ${s.answersGiven} answers, ${s.distinctRepliedTo} distinct people helped` },
      ],
      baseline: `top contributor score in this community is ${top.toFixed(1)}`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// D2 · Gap drift — someone is going quiet, relative to their own rhythm
// ─────────────────────────────────────────────────────────────────────────────

export function d2GapDrift(
  states: Map<string, MemberState>,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Observation[] {
  const out: Observation[] = [];

  for (const s of states.values()) {
    // A gap is a question, never a conclusion — and these guards are
    // where most false positives die.
    if (s.messageCount < t.minObservations) continue; // unreliable baseline
    if (s.saidFarewell) continue; // they left on purpose, that isn't drift
    // Below minRhythmHours the ratio's denominator is too small for the
    // ratio to mean anything — see the field's own comment on Thresholds.
    if (s.medianGapHours < t.minRhythmHours) continue;
    // Churn, not drift: someone active for a weekend and then gone never had
    // a rhythm to break. Their 900× ratio is arithmetic, not a signal.
    if (s.activeSpanDays < t.minActiveSpanDays) continue;

    const ratio = s.currentGapHours / s.medianGapHours;
    const madGuard = s.medianGapHours + t.gapMads * s.gapMadHours;

    if (ratio < t.gapRatio) continue;
    if (s.currentGapHours < madGuard) continue;

    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "gap-drift",
      confidence: Math.min(1, ratio / (t.gapRatio * 4)),
      claim:
        `${s.name} hasn't posted in ${fmtDays(s.currentGapHours)} — ` +
        `about ${ratio.toFixed(0)}× their usual gap.`,
      evidence: [
        { at: s.lastSeen, fact: `last message` },
        {
          at: s.firstSeen,
          fact: `normal rhythm is roughly one message every ${fmtDays(s.medianGapHours)}, measured over ${s.messageCount} messages`,
        },
      ],
      baseline: `median gap ${fmtDays(s.medianGapHours)} (± ${fmtDays(s.gapMadHours)})`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// D3 · Tone shift — the texture of their messages changed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The weakest signal and the most likely to produce a confidently wrong, faintly
 * creepy claim about a person. It NEVER fires alone — `compose()` will not emit
 * a tone-shift observation unless another detector already fired on that member.
 *
 * Three gates must all pass before it speaks:
 *   1. Shrink — the most recent window sits far below their norm.
 *   2. Persistence — the window before that is shortened too. Burnout ramps;
 *      one burst of short replies is a Tuesday.
 *   3. Robust outlier — the drop exceeds what their ordinary length variation
 *      explains (MADs below their own norm), mirroring the gapMads guard in D2.
 * If persistence cannot be established (no prior window), it stays quiet.
 */
export function d3ToneShift(
  states: Map<string, MemberState>,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Observation[] {
  const out: Observation[] = [];
  for (const s of states.values()) {
    if (s.messageCount < t.minObservations) continue;
    if (s.medianLength <= 0) continue;

    // 1 · shrink
    const shrink = s.recentMedianLength / s.medianLength;
    if (shrink > t.toneShrink) continue;

    // 2 · persistence — no prior window means we cannot prove a trend; stay quiet.
    if (!(s.priorRecentMedianLength > 0)) continue;
    const priorShrink = s.priorRecentMedianLength / s.medianLength;
    if (priorShrink > t.tonePriorShrink) continue;

    // 3 · robust outlier
    if (s.medianLength - s.recentMedianLength < t.toneMads * s.lengthMad) continue;

    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "tone-shift",
      confidence: Math.min(1, (t.toneShrink - shrink) / t.toneShrink),
      claim:
        `${s.name}'s last ten or so messages have been much shorter than usual — ` +
        `about ${Math.round(s.recentMedianLength)} characters against their norm of ${Math.round(s.medianLength)}, ` +
        `and the window before that was already shortened (${Math.round(s.priorRecentMedianLength)} chars).`,
      evidence: [
        { at: s.lastSeen, fact: `recent messages median ${Math.round(s.recentMedianLength)} chars` },
        {
          at: s.lastSeen,
          fact: `the five before those median ${Math.round(s.priorRecentMedianLength)} chars — the taper is sustained`,
        },
        { at: s.firstSeen, fact: `personal norm ${Math.round(s.medianLength)} chars over ${s.messageCount} messages` },
      ],
      baseline: `${Math.round(s.medianLength)} chars ± ${Math.round(s.lengthMad)} is normal for this person`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// D4 · Unanswered newcomer — someone arrived and nobody said anything
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Measured against the *community's* usual time-to-first-reply, not a fixed number
 * of hours: a slow thoughtful group and a fast chatty group have different silences.
 */
/**
 * How long this community normally takes to answer someone. A slow, thoughtful
 * group and a fast, chatty group have different silences, so newcomer neglect is
 * judged against this rather than a fixed number of hours.
 */
export function communityReplyNorm(community: Community): number {
  const byId = new Map<string, Message>();
  for (const m of community.messages) byId.set(m.id, m);

  const latencies: number[] = [];
  for (const m of community.messages) {
    if (m.replyToId === undefined) continue;
    const target = byId.get(m.replyToId);
    if (!target || target.authorId === m.authorId) continue;
    latencies.push((m.ts.getTime() - target.ts.getTime()) / HOUR);
  }
  latencies.sort((a, b) => a - b);
  return latencies.length ? latencies[Math.floor(latencies.length / 2)]! : 24;
}

export function d4UnansweredNewcomers(
  community: Community,
  states: Map<string, MemberState>,
  asOf: Date,
  t: Thresholds = DEFAULT_THRESHOLDS,
): Observation[] {
  const byId = new Map<string, Message>();
  for (const m of community.messages) byId.set(m.id, m);

  const normHours = communityReplyNorm(community);

  // who replied to what
  const gotReply = new Set<string>();
  for (const m of community.messages) {
    if (m.replyToId === undefined) continue;
    const target = byId.get(m.replyToId);
    if (target && target.authorId !== m.authorId) gotReply.add(m.replyToId);
  }

  const out: Observation[] = [];
  // The floor keeps "ignored" meaningful in firehose communities where the
  // reply norm is minutes — see newcomerPatienceFloorH.
  const patience = Math.max(normHours * t.newcomerPatience, t.newcomerPatienceFloorH);

  for (const s of states.values()) {
    // "newcomer" = arrived recently relative to the community's own span
    const communitySpanDays =
      (community.to.getTime() - community.from.getTime()) / (HOUR * 24);
    const isNewcomer = s.tenureDays < Math.max(14, communitySpanDays * 0.2);
    if (!isNewcomer) continue;

    const theirs = community.messages.filter(
      (m) => m.authorId === s.id && m.length > 0,
    );
    const first = theirs[0];
    if (!first) continue;

    const ageHours = (asOf.getTime() - first.ts.getTime()) / HOUR;
    if (ageHours < patience) continue; // not yet ignored, just recent
    if (gotReply.has(first.id)) continue;

    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "unanswered-newcomer",
      confidence: Math.min(1, ageHours / (patience * 2)),
      claim:
        `${s.name} joined ${Math.round(s.tenureDays)} days ago and their first message never got a reply.`,
      evidence: [
        { at: first.ts, fact: `first message: "${first.text.slice(0, 80)}"` },
        {
          at: asOf,
          fact: `still unanswered after ${fmtDays(ageHours)}; this community normally replies within ${fmtDays(normHours)}`,
        },
      ],
      baseline: `community median time-to-first-reply is ${fmtDays(normHours)}`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition — where the actual claim lives
// ─────────────────────────────────────────────────────────────────────────────

export type Composite = {
  memberId: string;
  memberName: string;
  headline: string;
  parts: Observation[];
  /** combined weight, used to decide whether this is worth a creator's attention */
  weight: number;
};

/**
 * None of D1–D4 alone is the product. "Maya is burning out" is D1+D2+D3 in the
 * same person at the same time. A stream of single-detector alerts is a
 * notification firehose, which is the thing creators already ignore.
 *
 * Silence is a feature: this returns an empty array most days, and that is correct.
 */
export function compose(all: Observation[]): Composite[] {
  const out: Composite[] = [];

  // ── Unanswered newcomers batch into ONE item, never one alert per person.
  // Three separate "nobody replied to X" notifications is the firehose that
  // creators already ignore; "four people joined and none got a reply" is a
  // single fact they can act on in one sitting.
  const newcomers = all.filter((o) => o.kind === "unanswered-newcomer");
  if (newcomers.length > 0) {
    // A wall of 44 names is not readable, and an unreadable alert is an
    // ignored alert. Show the longest-waiting few; the parts carry the rest.
    const MAX_NAMES = 6;
    const byWait = [...newcomers].sort(
      (a, b) => a.evidence[0]!.at.getTime() - b.evidence[0]!.at.getTime(),
    );
    const names = byWait.map((n) => n.memberName);
    const shown = names.slice(0, MAX_NAMES);
    const others = names.length - shown.length;
    const list =
      others > 0
        ? `${shown.join(", ")}, and ${others} others`
        : names.length === 1
          ? names[0]!
          : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    out.push({
      memberId: newcomers.map((n) => n.memberId).join(","),
      memberName: list,
      headline:
        newcomers.length === 1
          ? `${list} arrived recently and nobody has replied to them yet.`
          : `${newcomers.length} people arrived recently and none of them got a reply — ${list}.`,
      parts: newcomers,
      // batched, so weight is the strongest case rather than the sum: a pile of
      // newcomers should not outrank a person quietly burning out
      weight: Math.max(...newcomers.map((n) => n.confidence)),
    });
  }

  // ── Per-member composites for everything else
  const byMember = new Map<string, Observation[]>();
  for (const o of all) {
    if (o.kind === "unanswered-newcomer") continue;
    let list = byMember.get(o.memberId);
    if (!list) {
      list = [];
      byMember.set(o.memberId, list);
    }
    list.push(o);
  }

  for (const [memberId, parts] of byMember) {
    const kinds = new Set(parts.map((p) => p.kind));

    // D3 never stands alone — it exists only to corroborate.
    if (kinds.size === 1 && kinds.has("tone-shift")) continue;

    // The burnout composite: sustained contribution AND unusual silence.
    // Contribution alone is not news, and drift alone on a low contributor is thin.
    if (!(kinds.has("contribution") && kinds.has("gap-drift"))) continue;

    const name = parts[0]!.memberName;
    const tapering = kinds.has("tone-shift");

    out.push({
      memberId,
      memberName: name,
      headline:
        `${name} has been one of the people holding this community together, ` +
        `and has now gone quiet well beyond their own normal rhythm` +
        (tapering ? `, with their last messages tapering off first.` : `.`) +
        ` Worth reaching out personally.`,
      parts,
      weight: parts.reduce((sum, p) => sum + p.confidence, 0),
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}

export function runAll(
  community: Community,
  states: Map<string, MemberState>,
  asOf: Date = community.to,
  t: Thresholds = DEFAULT_THRESHOLDS,
): { observations: Observation[]; composites: Composite[] } {
  const observations = [
    ...d1Contribution(states, t),
    ...d2GapDrift(states, t),
    ...d3ToneShift(states, t),
    ...d4UnansweredNewcomers(community, states, asOf, t),
  ];
  return { observations, composites: compose(observations) };
}
