/**
 * Cycle-over-cycle memory for the watchlist itself.
 *
 * The registry/watchlist split (registry.ts) already gives the Mind a durable
 * per-member store. What it doesn't give the Mind is a durable record of its
 * *own past attention* — whether a name on today's watchlist is new, or is
 * the same person it flagged three cycles running. Without that, "picks up
 * where it left off" autonomous follow-up has nothing concrete to reference
 * and either repeats itself as if noticing for the first time, or has to
 * trust its own opaque memory to reconstruct a timeline it was never
 * actually handed.
 *
 * This module is deliberately pure — no disk I/O, no clock reads — so the
 * streak logic can be tested without a filesystem. cli-registry.ts owns
 * reading/writing data/watchlist-history.json around it.
 */
import type { Watchlist } from "./registry.ts";

export type WatchlistSnapshot = {
  at: string;
  watching: Array<{ key: string; name: string; signals: string[] }>;
};

export type ContinuityInfo = {
  /** the oldest snapshot, in the unbroken streak ending now, that flagged this member */
  firstFlaggedAt: string;
  /** how many consecutive cycles, including this one, this member has been on the watchlist */
  cyclesFlagged: number;
};

/**
 * Walks history newest-to-oldest per member, stopping at the first cycle
 * that *doesn't* carry them — a member dropping off and later returning
 * starts a new streak, which is the correct read: continuity claims
 * "this has been going on," and a gap means it stopped for a while.
 */
export function computeContinuity(
  history: WatchlistSnapshot[],
  currentWatching: Array<{ key: string; signals: string[] }>,
  generatedAt: string,
): Map<string, ContinuityInfo> {
  const chronological = [...history].sort((a, b) => a.at.localeCompare(b.at));
  const result = new Map<string, ContinuityInfo>();

  for (const member of currentWatching) {
    let cyclesFlagged = 1; // this cycle
    let firstFlaggedAt = generatedAt;
    for (let i = chronological.length - 1; i >= 0; i--) {
      const snap = chronological[i]!;
      const present = snap.watching.some((w) => w.key === member.key);
      if (!present) break;
      cyclesFlagged++;
      firstFlaggedAt = snap.at;
    }
    result.set(member.key, { firstFlaggedAt, cyclesFlagged });
  }

  return result;
}

/** Decorates a built Watchlist's entries with continuity info. Returns a new object. */
export function applyContinuity(
  watchlist: Watchlist,
  continuity: Map<string, ContinuityInfo>,
): Watchlist {
  return {
    ...watchlist,
    watching: watchlist.watching.map((w) => {
      const info = continuity.get(w.key);
      return info ? { ...w, continuity: info } : w;
    }),
  };
}

/**
 * Records this cycle's watchlist onto the history log, oldest-first, capped
 * to maxHistory entries. Every real cycle is appended unconditionally (even
 * an unchanged one) — computeContinuity's streak counting depends on cycles
 * being literal time points, so silently dropping "nothing changed" cycles
 * would undercount how long a signal has actually persisted.
 */
export function appendSnapshot(
  history: WatchlistSnapshot[],
  watchlist: Watchlist,
  maxHistory = 20,
): WatchlistSnapshot[] {
  const snapshot: WatchlistSnapshot = {
    at: watchlist.generatedAt,
    watching: watchlist.watching.map((w) => ({ key: w.key, name: w.name, signals: w.signals })),
  };
  const next = [...history, snapshot];
  return next.length > maxHistory ? next.slice(next.length - maxHistory) : next;
}
