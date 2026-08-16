import { isFarewell } from "./ingest.ts";
import type { Community, MemberState, Message } from "./types.ts";

const HOUR = 1000 * 60 * 60;

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Median absolute deviation — a spread measure that, unlike standard deviation,
 * is not dragged around by one outlier. Community data is full of outliers
 * (a holiday, a viral thread), so MAD is the right tool here.
 */
export function mad(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/**
 * Does this message look like it was asking for something? Used to distinguish
 * "answered someone's question" from "posted a lot". Volume is not contribution.
 */
const QUESTION = /\?|^(how|what|where|why|when|who|can|could|does|do|is|are|any(one|body)|has anyone|help)\b/i;

export function looksLikeQuestion(text: string): boolean {
  return QUESTION.test(text.trim());
}

/** How many hours a person's most recent messages should be sampled over for D3. */
const RECENT_SAMPLE = 5;

export function buildMemberStates(
  community: Community,
  asOf: Date = community.to,
): Map<string, MemberState> {
  const byId = new Map<number, Message>();
  for (const m of community.messages) byId.set(m.id, m);

  const grouped = new Map<string, Message[]>();
  for (const m of community.messages) {
    let list = grouped.get(m.authorId);
    if (!list) {
      list = [];
      grouped.set(m.authorId, list);
    }
    list.push(m);
  }

  // Joins can predate a member's first message — tenure should reflect that.
  const joinedAt = new Map<string, Date>();
  for (const e of community.events) {
    if (e.kind !== "join") continue;
    const existing = joinedAt.get(e.actorId);
    if (!existing || e.ts < existing) joinedAt.set(e.actorId, e.ts);
  }

  // First pass: establish firstSeen for everyone, so "newcomer" is resolvable
  // when we attribute replies below.
  const firstSeen = new Map<string, Date>();
  for (const [id, msgs] of grouped) {
    const join = joinedAt.get(id);
    const firstMsg = msgs[0]!.ts;
    firstSeen.set(id, join && join < firstMsg ? join : firstMsg);
  }
  for (const [id, ts] of joinedAt) {
    if (!firstSeen.has(id)) firstSeen.set(id, ts);
  }

  // Second pass: attribute replies.
  const answers = new Map<string, number>();
  const answersToNewcomers = new Map<string, number>();
  const repliedTo = new Map<string, Set<string>>();

  const bump = (m: Map<string, number>, k: string) =>
    m.set(k, (m.get(k) ?? 0) + 1);

  for (const m of community.messages) {
    if (m.replyToId === undefined) continue;
    const target = byId.get(m.replyToId);
    if (!target) continue;
    if (target.authorId === m.authorId) continue; // replying to yourself is not helping

    let set = repliedTo.get(m.authorId);
    if (!set) {
      set = new Set();
      repliedTo.set(m.authorId, set);
    }
    set.add(target.authorId);

    if (!looksLikeQuestion(target.text)) continue;
    bump(answers, m.authorId);

    const responderSince = firstSeen.get(m.authorId);
    const askerSince = firstSeen.get(target.authorId);
    if (responderSince && askerSince && askerSince > responderSince) {
      bump(answersToNewcomers, m.authorId);
    }
  }

  const states = new Map<string, MemberState>();

  for (const [id, msgs] of grouped) {
    const first = firstSeen.get(id) ?? msgs[0]!.ts;
    const last = msgs[msgs.length - 1]!.ts;

    // Inter-message gaps define this person's rhythm.
    const gaps: number[] = [];
    for (let i = 1; i < msgs.length; i++) {
      gaps.push((msgs[i]!.ts.getTime() - msgs[i - 1]!.ts.getTime()) / HOUR);
    }

    // Only messages with text carry a length signal; stickers and media do not.
    const lengths = msgs.filter((m) => m.length > 0).map((m) => m.length);
    const recentLengths = msgs
      .filter((m) => m.length > 0)
      .slice(-RECENT_SAMPLE)
      .map((m) => m.length);

    states.set(id, {
      id,
      name: msgs[msgs.length - 1]!.authorName,
      firstSeen: first,
      lastSeen: last,
      // Tenure is how long they have been here, measured to *now* — not the span
      // between their first and last message. Someone who posted twice in March
      // has been a member for months, not for two days.
      tenureDays: (asOf.getTime() - first.getTime()) / (HOUR * 24),
      activeSpanDays: (last.getTime() - first.getTime()) / (HOUR * 24),
      messageCount: msgs.length,
      medianGapHours: median(gaps),
      gapMadHours: mad(gaps),
      currentGapHours: (asOf.getTime() - last.getTime()) / HOUR,
      medianLength: median(lengths),
      recentMedianLength: median(recentLengths),
      answersGiven: answers.get(id) ?? 0,
      distinctRepliedTo: repliedTo.get(id)?.size ?? 0,
      answersToNewcomers: answersToNewcomers.get(id) ?? 0,
      saidFarewell: msgs.slice(-3).some((m) => isFarewell(m.text)),
    });
  }

  return states;
}
