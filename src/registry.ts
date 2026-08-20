/**
 * The bridge between our code and the Mind.
 *
 * Two payloads, deliberately separate:
 *
 *   registry — the durable member store, written to a Minds **Artifact**. Compact
 *     by design (~200–400 chars/member per docs/architecture.md) because reading
 *     it back costs context tokens, and context is metered.
 *
 *   briefing — the distilled observations for one cadence cycle. This is what the
 *     Mind actually reasons over. It must stay small: measured burn is ~2–4
 *     cognition per exchange, so raw traffic never goes near the Mind.
 *
 * The division this enforces: we compute the facts, the Mind holds them and judges.
 */
import type { Community, MemberState } from "./types.ts";
import type { Composite, Observation } from "./detectors.ts";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * replyNormH specifically needs finer precision than round1's one decimal
 * place: it's a MEDIAN across the whole community, and a genuinely active
 * Discord (people replying within a minute or two) has a true median well
 * under 0.05h — round1 rounds that straight down to a literal 0. That's
 * not just cosmetically wrong: replyNormH is a denominator wherever it's
 * used to judge "how many multiples of normal has this newcomer waited,"
 * and dividing by 0 turns every wait into an undefined/infinite ratio.
 * Confirmed live: a real 193-member community's push came back with
 * replyNormH 0 and Kith itself flagged that every newcomer's wait was
 * reading as ∞× normal because of it. Two decimals (down to ~36s
 * resolution) plus a hard floor so this can never be a literal 0.
 */
const roundReplyNorm = (n: number) => Math.max(0.01, Math.round(n * 100) / 100);

/** One member, compressed. Keys are short because this is stored and re-read often. */
export type RegistryEntry = {
  /** mirrors the Mind's own stream-entity convention: community.member.<slug> */
  key: string;
  name: string;
  joined: string;
  lastSeen: string;
  /** messages */
  n: number;
  /** median hours between posts — this person's rhythm */
  rhythmH: number;
  /** spread of that rhythm (MAD, hours) */
  spreadH: number;
  /**
   * Hours silent **as of `generatedAt`**, precomputed.
   *
   * Deliberately not left for the Mind to derive from lastSeen vs "today": on an
   * autonomous cycle nobody tells it the date, and if the registry is a few days
   * stale it would silently compute the wrong gap for everyone. Carry the answer.
   */
  quietForH: number;
  /** quietForH / rhythmH — how many of their own cycles they have missed */
  quietRatio: number;
  /** false when messageCount is too low for the rhythm to mean anything */
  baselineReliable: boolean;
  /** median message length, chars */
  lenC: number;
  /** questions answered */
  ans: number;
  /** answers given to people newer than they are */
  ansNew: number;
  /** distinct people helped */
  helped: number;
  /** true if they announced leaving */
  farewell: boolean;
  /**
   * Always "they/them" unless a member has explicitly stated otherwise.
   *
   * This is carried as *data on every entry* rather than left to a tenet, because
   * we tested the tenet route and it did not hold: with the principle committed to
   * long-term memory, the Mind still inferred gender from names ("she's been silent
   * for 9 days against her baseline"). Tenets are guidance, not guardrails.
   * A field the Mind reads at the same moment it reads the name is much harder to
   * skip past — and misgendering a real community member on camera is not a
   * recoverable error.
   */
  pronouns: string;
};

/**
 * Signals that are not per-member aggregates and therefore have no home in the
 * member table. Added after the Mind, running its first autonomous cycle, correctly
 * pointed out that it could not see unanswered newcomers from the member schema
 * alone — half the perception layer was invisible on exactly the cycle where it
 * mattered most.
 */
export type CommunitySignals = {
  /** newcomers whose first message never got a reply */
  unansweredNewcomers: Array<{
    name: string;
    key: string;
    joined: string;
    /** hours their first message has sat unanswered, as of generatedAt */
    waitingH: number;
    firstMessage: string;
  }>;
};

export type Registry = {
  community: string;
  /**
   * Every hour-count in this file is measured to this instant, not to "now".
   * The Mind must reason against this, never against today's date.
   */
  generatedAt: string;
  window: { from: string; to: string };
  memberCount: number;
  /** community median time-to-first-reply, hours — the norm newcomer silence is judged against */
  replyNormH: number;
  signals: CommunitySignals;
  members: RegistryEntry[];
};

/**
 * NFKD + diacritic-stripping only helps Latin-script names — a name that's
 * entirely CJK, Arabic, Cyrillic, Thai, or emoji has nothing left after
 * `[^a-z0-9]+` strips it, so every such member collides on the same empty
 * slug ("community.member." for all of them), silently merging different
 * people's histories under one key. `id` (the platform's own stable member
 * id — Discord/Telegram user id) is the fallback specifically for that
 * empty case, not applied otherwise: changing the slug format for the
 * common Latin-name case would touch every existing key and test for a
 * problem that case doesn't have.
 */
export function slugify(name: string, id?: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base) return base;
  if (id) return `id-${id.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12).toLowerCase()}`;
  return "unnamed";
}

/** Mirrors MIN_OBSERVATIONS in detectors.ts — below this a rhythm is noise. */
const RELIABLE_AT = 8;

export function buildRegistry(
  community: Community,
  states: Map<string, MemberState>,
  replyNormHours: number,
  newcomerObservations: Observation[] = [],
  generatedAt: Date = new Date(),
): Registry {
  const members: RegistryEntry[] = [...states.values()]
    .sort((a, b) => b.messageCount - a.messageCount)
    .map((s) => {
      const rhythm = round1(s.medianGapHours);
      const quiet = round1(s.currentGapHours);
      return {
        key: `community.member.${slugify(s.name, s.id)}`,
        name: s.name,
        joined: isoDay(s.firstSeen),
        lastSeen: isoDay(s.lastSeen),
        n: s.messageCount,
        rhythmH: rhythm,
        spreadH: round1(s.gapMadHours),
        quietForH: quiet,
        quietRatio: rhythm > 0 ? round1(quiet / rhythm) : 0,
        baselineReliable: s.messageCount >= RELIABLE_AT,
        lenC: Math.round(s.medianLength),
        ans: s.answersGiven,
        ansNew: s.answersToNewcomers,
        helped: s.distinctRepliedTo,
        farewell: s.saidFarewell,
        pronouns: "they/them (not stated)",
      };
    });

  const unansweredNewcomers = newcomerObservations
    .filter((o) => o.kind === "unanswered-newcomer")
    .map((o) => {
      const s = states.get(o.memberId);
      const first = o.evidence[0];
      const waited = o.evidence[1];
      return {
        name: o.memberName,
        key: `community.member.${slugify(o.memberName, o.memberId)}`,
        joined: s ? isoDay(s.firstSeen) : "",
        waitingH: waited
          ? round1(
              (new Date(waited.at).getTime() - new Date(first!.at).getTime()) /
                (1000 * 60 * 60),
            )
          : 0,
        firstMessage: first ? first.fact.replace(/^first message: /, "") : "",
      };
    });

  return {
    community: community.name,
    generatedAt: generatedAt.toISOString(),
    window: { from: isoDay(community.from), to: isoDay(community.to) },
    memberCount: members.length,
    replyNormH: roundReplyNorm(replyNormHours),
    signals: { unansweredNewcomers },
    members,
  };
}

/**
 * What we actually say to the Mind on a cadence cycle.
 *
 * Note what is NOT here: no message text, no member list, no raw history. Only
 * the composed cases and their evidence. If nothing composed, the briefing is
 * empty and we send nothing at all — silence is a feature, and it is also free.
 */
export type Briefing = {
  community: string;
  asOf: string;
  /** empty is the common, correct case */
  cases: Array<{
    headline: string;
    member: string;
    signals: Array<{ kind: string; claim: string; baseline: string }>;
    evidence: Array<{ at: string; fact: string }>;
  }>;
};

export function buildBriefing(
  community: Community,
  composites: Composite[],
  asOf: Date,
): Briefing {
  return {
    community: community.name,
    asOf: asOf.toISOString(),
    cases: composites.map((c) => ({
      headline: c.headline,
      member: c.memberName,
      signals: c.parts.map((p: Observation) => ({
        kind: p.kind,
        claim: p.claim,
        baseline: p.baseline,
      })),
      evidence: c.parts.flatMap((p: Observation) =>
        p.evidence.map((e) => ({
          at: e.at.toISOString().slice(0, 16).replace("T", " "),
          fact: e.fact,
        })),
      ),
    })),
  };
}

/** Rough guard so we notice before a payload gets expensive to reason over. */
export function estimateTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist — what the cadence cycle actually reads
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The registry grows with the community; the watchlist does not.
 *
 * A cadence cycle runs on a schedule and costs ~2 cognition each time, most of
 * which is reading the artifact. Handing the Mind 500 members every cycle to
 * find the two that matter is both expensive and pointless — we already know
 * which two, because we computed them.
 *
 * So the split is by *purpose*, not by size tier:
 *   kith-registry  — the full durable store. Read on demand, when someone asks
 *                    about a specific person.
 *   kith-watchlist — refreshed each cycle. Only members carrying a live signal,
 *                    plus community-level signals. Stays small at any scale.
 *
 * Members with no signal are deliberately absent. Their absence is the message.
 */
export type Watchlist = {
  community: string;
  generatedAt: string;
  /** total members in the community — so "3 of 500" is legible */
  memberCount: number;
  /** members carrying at least one live signal */
  watching: Array<{
    key: string;
    name: string;
    pronouns: string;
    /** why this person is on the list at all */
    signals: string[];
    quietForH: number;
    quietRatio: number;
    rhythmH: number;
    baselineReliable: boolean;
    ans: number;
    ansNew: number;
    n: number;
  }>;
  signals: CommunitySignals;
  /**
   * True when nothing at all composed. The Mind should send nothing on these
   * cycles — an empty digest is the correct digest most days.
   */
  quiet: boolean;
};

export function buildWatchlist(
  community: Community,
  states: Map<string, MemberState>,
  observations: Observation[],
  generatedAt: Date,
): Watchlist {
  const signalsByMember = new Map<string, string[]>();
  for (const o of observations) {
    if (o.kind === "unanswered-newcomer") continue; // carried at community level
    let list = signalsByMember.get(o.memberId);
    if (!list) {
      list = [];
      signalsByMember.set(o.memberId, list);
    }
    list.push(o.kind);
  }

  const watching = [...signalsByMember.entries()]
    .map(([id, kinds]) => {
      const s = states.get(id)!;
      const rhythm = round1(s.medianGapHours);
      const quiet = round1(s.currentGapHours);
      return {
        key: `community.member.${slugify(s.name, s.id)}`,
        name: s.name,
        pronouns: "they/them (not stated)",
        signals: kinds,
        quietForH: quiet,
        quietRatio: rhythm > 0 ? round1(quiet / rhythm) : 0,
        rhythmH: rhythm,
        baselineReliable: s.messageCount >= RELIABLE_AT,
        ans: s.answersGiven,
        ansNew: s.answersToNewcomers,
        n: s.messageCount,
      };
    })
    .sort((a, b) => b.quietRatio - a.quietRatio);

  const unanswered = observations
    .filter((o) => o.kind === "unanswered-newcomer")
    .map((o) => {
      const s = states.get(o.memberId);
      const first = o.evidence[0];
      const waited = o.evidence[1];
      return {
        name: o.memberName,
        key: `community.member.${slugify(o.memberName, o.memberId)}`,
        joined: s ? isoDay(s.firstSeen) : "",
        waitingH: waited
          ? round1(
              (new Date(waited.at).getTime() - new Date(first!.at).getTime()) /
                (1000 * 60 * 60),
            )
          : 0,
        firstMessage: first ? first.fact.replace(/^first message: /, "") : "",
      };
    });

  return {
    community: community.name,
    generatedAt: generatedAt.toISOString(),
    memberCount: states.size,
    watching,
    signals: { unansweredNewcomers: unanswered },
    quiet: watching.length === 0 && unanswered.length === 0,
  };
}
