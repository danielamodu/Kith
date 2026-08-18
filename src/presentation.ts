/**
 * Presentation-layer transforms: turn the raw detector/Minds shapes into
 * specific, ready-to-render copy. Pulled out of server.ts into its own
 * side-effect-free module so these pure functions are actually unit
 * testable without booting the whole Express app.
 */
import { plainText, type HistoryMessage } from "./minds-client.ts";

export type WatchEntry = {
  signals: string[];
  quietForH: number;
  quietRatio: number;
  ans: number;
};

export function headlineFor(m: WatchEntry): string {
  if (m.signals.includes("gap-drift")) {
    const days = Math.round(m.quietForH / 24);
    return days >= 1
      ? `Quiet for ${days} day${days === 1 ? "" : "s"} — about ${m.quietRatio.toFixed(1)}× their usual rhythm.`
      : `Quiet for ${Math.round(m.quietForH)}h — about ${m.quietRatio.toFixed(1)}× their usual rhythm.`;
  }
  if (m.signals.includes("tone-shift")) {
    return "Recent messages have gotten noticeably shorter than usual.";
  }
  if (m.signals.includes("contribution")) {
    return `One of the most active people here — ${m.ans} question${m.ans === 1 ? "" : "s"} answered.`;
  }
  return "A signal worth a second look.";
}

export function lastSeenFor(quietForH: number): string {
  if (quietForH < 1) return "active moments ago";
  if (quietForH < 24) return `active ${Math.round(quietForH)}h ago`;
  const days = Math.round(quietForH / 24);
  return `active ${days} day${days === 1 ? "" : "s"} ago`;
}

export type FeedMessage = {
  id: string;
  author: string;
  isKith: boolean;
  text: string;
  createdAt: string;
  unprompted: boolean;
};

/** Same "no human turn since restart" logic that used to live client-side —
 *  moved server-side so it's computed once, correctly, for any frontend. */
export function transformFeedMessages(
  messages: HistoryMessage[],
  restartAt: string | null,
): FeedMessage[] {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const restart = restartAt ? new Date(restartAt) : null;
  let sawHumanSinceRestart = false;
  return sorted.map((m) => {
    const isKith = m.senderType === 0;
    const ts = new Date(m.createdAt);
    const afterRestart = restart !== null && ts > restart;
    if (!isKith && afterRestart) sawHumanSinceRestart = true;
    const unprompted = isKith && afterRestart && !sawHumanSinceRestart;
    return {
      id: m.id,
      author: isKith ? "Kith" : "Steward",
      isKith,
      text: plainText(m.messageText),
      createdAt: m.createdAt,
      unprompted,
    };
  });
}

export type PronounIssue = { member: string; pronounUsed: string; context: string };

/**
 * Precise, per-member pronoun checking — not just "a gendered pronoun exists
 * somewhere in this text."
 *
 * The structural fix (registry.pronouns, not a tenet) holds for a question's
 * primary subject but has been observed to fail for people mentioned only in
 * passing, deeper in the same answer (docs/evidence/2026-08-17-pronoun-guard
 * -caught-a-real-case.md). A blanket "this answer has a problem somewhere"
 * warning made that hard to act on. This finds *which* member, *where*, so a
 * reviewer doesn't have to hunt for it — and so the frontend can say
 * something specific instead of "the answer needs a gentle pause."
 *
 * Deliberately does not auto-correct the text: silently rewriting a gendered
 * pronoun risks producing something grammatically broken ("she was" ->
 * "they was"), and more importantly would mean showing content that isn't
 * genuinely what the Mind said. The demo script's own rule is that a take
 * with a wrong pronoun isn't usable footage, not that it gets patched and
 * used anyway — this function exists to make that call fast, not to avoid it.
 */
export function findPronounIssues(
  answer: string,
  members: Array<{ name: string; pronouns: string }>,
): PronounIssue[] {
  const GENDERED = /\b(he|him|his|she|her|hers)\b/gi;
  const issues: PronounIssue[] = [];

  for (const m of members) {
    // A stated pronoun (anything other than the "not stated" default) means
    // a gendered pronoun for THIS member is correct, not a violation.
    if (!/\(not stated\)/i.test(m.pronouns)) continue;

    const firstName = m.name.split(" ")[0]!;
    for (const needle of [m.name, firstName]) {
      let from = 0;
      while (true) {
        const idx = answer.indexOf(needle, from);
        if (idx === -1) break;
        from = idx + needle.length;

        // Search window: from the name to the next sentence boundary or
        // ~200 chars, whichever comes first — far enough to catch "Lena
        // Fischer (23.3h gap fits her 42.1h rhythm)", not so far it spills
        // into a sentence about someone else.
        const windowEnd = Math.min(answer.length, idx + needle.length + 200);
        let window = answer.slice(idx + needle.length, windowEnd);
        const sentenceEnd = window.search(/[.!?]\s|\n/);
        if (sentenceEnd !== -1) window = window.slice(0, sentenceEnd);

        GENDERED.lastIndex = 0;
        const match = GENDERED.exec(window);
        if (match) {
          issues.push({
            member: m.name,
            pronounUsed: match[0],
            context: `…${needle}${window.slice(0, match.index + match[0].length + 20)}…`,
          });
        }
      }
    }
  }

  // De-dupe: the same member can be caught twice (full name + first name
  // both matching near the same pronoun) — keep one entry per member.
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.member) ? false : (seen.add(i.member), true)));
}
