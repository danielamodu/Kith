# Evidence — baseline-relative reasoning works

**Date:** 16 Aug 2026 · **Mind:** Kith `f3494b3e-f36b-1410-8466-00039ce7df11`
**Model:** `minimax/minimax-m3` · **Cost:** ~8.5 cognition for this exchange pair

Test of the core product loop: given structured per-member facts, can the Mind produce a
correct, baseline-relative judgement — and correctly *decline* to flag someone whose
identical-looking behaviour is normal for them?

---

## Setup

Three members planted in conversation `memtest-a`, deliberately contrasting:

| Member | Baseline rhythm | Contribution | Last posted | Extra signal |
|---|---|---|---|---|
| **Maya Okonkwo** | ~3/day | 31 newcomer questions in June | **9 days ago** | last 3 messages much shorter than usual |
| **Dev Raman** | ~40/day | never answered a newcomer | 2 hours ago | one-word reactions and memes |
| **Priya Anand** | **~once a month** | 2 newcomer questions total | **9 days ago** | — |

Maya and Priya have the **same 9-day silence**. Only one of them is a signal. No hint was
given as to the expected answer.

## The question

Asked from `memtest-b` — a *different conversation*, testing cross-conversation recall and
reasoning together:

> "Looking at the community members you know about, is anyone struggling or worth reaching out
> to right now? Be specific about who, and explain your reasoning."

## The reply (verbatim)

> Yeah, one stands out: Maya Okonkwo.
>
> Three things add up. She's not just a passive member — 31 newcomer questions answered in June
> is real contribution, the kind that shapes how new people experience the group. Her silence
> isn't normal fluctuation either; ~3 messages a day is her rhythm, and 9 days of nothing is
> well outside that. And the detail that actually makes me want to flag her: her last three
> messages before she went quiet were shorter than her usual length. That's a tapering pattern.
> People who disengage abruptly usually just stop; people who are quietly pulling back often
> send shorter things first, then disappear.
>
> So: a high-value contributor whose recent behavior shows a shift, not just a dip. That's
> worth a real, personal message — not a "we miss you" broadcast, but something specific that
> says you noticed. […]
>
> Dev Raman isn't struggling — he's active, just not in a way that helps newcomers. […]
> **Priya Anand's 9-day silence fits her ~once-a-month rhythm, so I don't have a signal that
> anything's off for her.**
>
> So: Maya, specifically. The others I wouldn't act on right now.

## What this proves

1. **Baseline-relative reasoning works.** Same 9-day silence, opposite conclusions, for the
   stated reason that the baselines differ. This is the product's central thesis, confirmed.
2. **It declines to fire on noise.** Priya was correctly left alone. A global threshold would
   have flagged her. Restraint is achievable.
3. **It composes signals.** Contribution + gap + tapering length treated as a cumulative case,
   not three separate alerts — matching the D1+D2+D3 composite in the perception spec.
4. **Memory crossed the conversation boundary** while doing it.
5. **The output has judgement, not just detection** — it distinguished "not a check-in
   situation" for Dev, and advised a personal message over a broadcast.

## What this does *not* prove

- **Durability over months.** All facts were planted minutes earlier. Whether an eight-week-old
  fact survives history rotation is untested and is what the whole product depends on.
- **Scale.** Three members, not five hundred.
- **That it can derive the facts itself.** It was *given* "31 newcomer questions" and "~3/day."
  Computing those from raw Telegram history is our job.

## Consequence for the architecture

The division of labour is now settled empirically:

> **We compute the facts. The Mind holds them and judges.**

Detectors D1–D4 turn raw Telegram history into structured per-member facts — contribution
counts, baseline rhythm, current gap, length deviation. The Mind cannot count 31 answers across
ten thousand messages. But given the facts, its judgement is good, and that judgement is the
product.
