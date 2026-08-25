# Evidence — first real community: what 195 actual members broke, and proved

**Date:** 24 Aug 2026 · **Context:** first `detect` run against a real Discord community
(~195 members, months of history backfilled through the bot) · **Code state:** all fixes
below landed same day, 47/47 tests

---

## The run

Backfilled a real server through the Discord bot and ran the perception layer over it —
the first time Kith's detectors saw anything other than the synthetic fixture. No Mind
credits were spent; everything below is the local, deterministic layer.

Output: **60 raw observations**, 4 contributors ranked, 11 gap-drifts, 44 unanswered
newcomers batched into one item.

## Finding 1 — the thesis, happening for real

The community's median time-to-first-reply is **~2 minutes**. And yet:

> **44 people arrived over the last two months, said gm, and not one of their first
> messages was ever answered.** The longest-waiting has now been ignored for 67 days.

Nobody noticed because nobody can hold 195 members in their head. That is the exact
failure mode Kith exists for, confirmed in the first hour of real data. This single
output is the strongest evidence the product has.

## Finding 2 — "0.0 days": a baseline nobody can cite

The same run displayed the reply norm as *"this community normally replies within
**0.0 days**"*. The norm is two minutes; the formatter insisted on measuring the world
in days. A baseline that reads as zero is a baseline nobody can cite — a direct
violation of "cite or stay quiet," caused by presentation, not perception.

**Fix:** `fmtDuration` — minutes below an hour, hours below two days, days beyond.
The same run now reads *"normally replies within 2 min"*.

## Finding 3 — multiplicative patience collapses in fast rooms

D4 judges a newcomer "ignored" after `newcomerPatience × community norm`. With a
2-minute norm that is a **6-minute patience window**, so every one of the 44 fired at
confidence 1.0, forever. When every signal is maximal, no signal is.

**Fix:** `newcomerPatienceFloorH = 48` — "ignored" must mean something no matter how
fast the room talks. Effect, same data: the freshest case dropped out entirely (38h <
floor), and the next-youngest fell from conf 1.00 to 0.51. Ranking returned.

## Finding 4 — a hypothesis died against the data, correctly

On first sight the 11 gap-drifts looked like churn false positives — burst posters
with 986× and 4115× ratios. A churn gate (`minActiveSpanDays = 7`) was built and
tested to suppress "weekend visitors who never had a rhythm to break."

Then the states were inspected, and the hypothesis was **wrong**:

| Member | Messages | Active span | Median gap | Silent for |
|---|---|---|---|---|
| PR1M3 | 71 | 83.5 days | 2.1 h | 86.8 days |
| Anointing | 57 | 55.4 days | 0.6 h | 95.9 days |
| MistaGreat | 19 | 108.9 days | 0.7 h | 32.6 days |

These are not visitors. They are established regulars — months of daily presence, then
dark. **Eleven people quietly left this community and nobody noticed.** The detector
was right; the initial read of the output was not. The churn gate stays (it is correct
as a guard, and tested), but the lesson is the one this repository keeps re-learning:
*check the data before explaining it.*

## What this means

- **The near-zero-denominator lesson now has a fourth entry.** replyNormH (registry),
  gap rhythm (bursty poster, 24,000× ratio), and now the reply norm itself — any
  quantity derived from a fast community's median can be small enough that
  multiplication and display both break. Structural floors and human-unit formatting
  are not cosmetic; they are correctness.
- **First-run behaviour is a backlog, not a bug.** On the first cycle over real
  history, every past drift is "new" — 11 departures at once. That is genuinely what
  the creator cannot see. Steady-state cycles should be quiet; the first cycle is
  supposed to hurt.
- **No burnout composite fired** — the top contributors (191, 171, 134 answers) are
  all still active. The fixture's Maya-shaped story has not occurred in this community
  yet. That is honest absence, not failure; it needs time or a poll cycle to catch a
  contributor *beginning* to fade.

## Consequence

- Tests: 44 → **47** (churn gate, patience floor, name-cap regressions — each locking
  one real-data failure mode).
- `compose()` caps the newcomer headline at the 6 longest-waiting names + "and N
  others"; the full list survives in the composite's parts. A wall of 44 names is an
  ignored alert.
- Next: `npm run calibrate -- --store` against these real distributions, then — once
  credits allow — the Mind push and a fresh-conversation reasoning capture, which is
  the half of the slice this run deliberately did not touch.

---

## Addendum — the calibrate sweep, same day

`npm run calibrate -- --store`: 10,061 messages, 195 members, Sept 2025 → Aug 2026.

**The sweeps are flat, and flat is good.** Most thresholds barely move the count
across their entire sweep range — the defaults sit in a wide stable band, not on a
knife-edge. The three that showed real gradients on this data:

- `toneMads`: 0→62 surfaced, 1→59, 2→58 — the length-drop guard is earning its keep
  on real message textures, not just in the fixture.
- `newcomerPatienceFloorH`: 0→59, 48→58, 168→56 — the floor does exactly what it was
  built for here, and even a full week only trims the fringe.
- `contributionFloor`: at 0.1 a weak contributor (PR1M3, 71 messages) crosses the
  line and composes a burnout item; at 0.25+ they drop out. 0.4 keeps "contributor"
  meaning *one of the people holding this place together*.

**The discriminating case now holds on real data — after a harness fix.** The
original `findPair` chose the signal by raw ratio alone, and the highest raw ratio in
this community is **491,332×** — a burst poster whose median gap is seconds long,
correctly suppressed by `minRhythmHours`. The harness demanded that fire and reported
MISSES at every setting, testing a case that should never hold. Fixed: signal
candidates must pass the structural guards, with the excluded count printed (53 on
this data — burst/churn patterns, exactly what the guards are for).

The corrected pair is the thesis in one table:

> **signal:** Anointing — quiet 95.9 days, 4115× own rhythm → flagged at *every*
> `gapRatio` from 1.5 to 50.
> **control:** daviibanks — silent **164.8 days**, longer than anyone, but 1.0× own
> rhythm → never flagged.

A global threshold flags daviibanks and misses Anointing. Per-member baselines do
the opposite. That is the product, proven on the community's own history.
