# Perception Spec — what Kith notices, and how

This is the intellectual core of the product and it is platform-independent. Minds provides
*storage* of memory; this document defines *what is worth remembering and what it means*. No
agent platform gives you this.

---

## The organising principle

> **Every signal is measured against the person's own baseline, never a global threshold.**

This is not a refinement — it is the whole design, and it is what makes the product
memory-dependent rather than merely stateful.

A member who posts three times a day going silent for nine days is a loud signal. A member
who posts once a month going silent for nine days is nothing at all. A global rule
(`silent > 7 days → alert`) fires on both and is worthless. It is also *computable without
memory*, which means any stateless competitor can do it.

Personal baselines cannot be computed without months of per-member history. **Every detector
below must be baseline-relative. If a detector can be evaluated from a single snapshot, it
does not belong in this product** — it hands away criterion #1.

**Second rule: every detector emits evidence, not a score.** A claim Kith cannot cite is a
claim it does not make. The receipts view in the demo is not a UI feature bolted on; it is a
constraint on the detector interface.

---

## Detector interface

Each detector returns an observation or nothing:

```
Observation {
  member          — who
  kind            — which detector fired
  confidence      — how strongly, relative to their baseline
  claim           — one plain sentence a creator can act on
  evidence[]      — { timestamp, excerpt-or-fact } — what this is inferred from
  baseline        — what "normal" is for this person, so the deviation is legible
}
```

`evidence[]` is mandatory and must carry real timestamps. An observation without evidence is
discarded, not downgraded.

---

## D1 · Contribution — who is actually holding this place together

**Claim shape:** *"Maya has answered 31 newcomers' questions since June — more than anyone,
including your mods."*

**Signal:** messages that are *responsive to another member's need* — a reply to a question,
to a newcomer's first post, to someone struggling. Not raw message count; volume is not
contribution, and rewarding volume rewards the loudest person in the room.

**Why memory is required:** contribution is diffuse. Thirty small helpful acts spread across
ten thousand messages and three months. No snapshot contains it. This is the single clearest
demonstration of why the product needs persistence.

**Baseline:** ranked within *this* community, not absolute. Ten answers is extraordinary in a
group of 80 and unremarkable in a group of 5,000.

**Failure mode to guard:** someone who replies constantly but unhelpfully. Weight by whether
the recipient responded positively or the thread resolved, not by reply count.

---

## D2 · Gap drift — someone is going quiet

**Claim shape:** *"She hasn't posted in 9 days."*

**Signal:** current silence measured against that member's own posting rhythm.

**Baseline:** their typical inter-post interval and its variance, computed over their full
history. Fire when the current gap is a strong outlier *for them* — not at a fixed day count.

**Why memory is required:** stated above; a fixed threshold is stateless and useless.

**Failure modes to guard:**
- Holidays, exams, time zones. A gap is a question, never a conclusion.
- Members whose rhythm is genuinely irregular — high variance should raise the bar to fire,
  not lower it.
- Someone who left deliberately and said so. Check for a farewell before flagging drift.

---

## D3 · Tone shift — the texture of their messages changed

**Claim shape:** *"Her last three messages were much shorter than her baseline."*

**Signal:** deviation in message length, response latency, and engagement register (questions
asked, replies given) versus that member's own norm.

**Baseline:** strictly personal. Some people write essays; some write three words. Only the
*change* is information.

**Why memory is required:** "short message" means nothing without knowing what long means for
this person.

**Failure mode to guard:** this is the weakest signal on its own and the most likely to
produce a false, slightly creepy claim. **Never fire D3 alone.** It exists to corroborate.

---

## D4 · Unanswered newcomer — someone arrived and nobody said anything

**Claim shape:** *"Four people joined last week and none of them got a reply to their first
message."*

**Signal:** a member's first substantive post receives no reply within the community's normal
response window.

**Baseline:** the *community's* usual time-to-first-reply, not a fixed number of hours. A
slow, thoughtful group and a fast, chatty group have different silences.

**Why memory is required:** requires knowing who is new (tenure), what the community's normal
responsiveness is, and whether this is a pattern or a one-off.

**Note:** this is the highest-value detector for the creator and the easiest to act on. It is
also the one whose fix is genuinely cheap — a creator can say hello. Weight it accordingly.

---

## The composite — where the actual claim lives

None of the above is the demo. **"Maya is burning out" is D1 + D2 + D3 together**, and the
composite is what no single detector, and no stateless tool, can produce:

> High contribution over months *and* an unusual gap opening *and* a shortening tone,
> in the same person, at the same time.

Any one of those alone is noise. All three at once, in someone with two months of sustained
generosity behind them, is a person running out — and it is a specific, checkable, human
claim.

**Design rule:** Kith should hold observations until they compose into something worth a
creator's attention. A stream of single-detector alerts is a notification firehose, which is
the thing creators already ignore. **Silence is a feature.** The daily digest is often
correctly empty.

---

## Calibration

**Every constant in this document is deliberately unspecified.** Thresholds, window sizes,
and outlier bounds must be fitted against the real backfilled community, not chosen in
advance. Picking numbers before seeing data is how this produces confident nonsense on
camera.

Calibration is a day 5–6 task and requires the backfill (task #3) to have landed.

---

## Out of scope for the submission

- **Resurfacing conflict detection** — real, valuable, and too large for 12 days.
- **Sentiment analysis as a primary signal.** Off-the-shelf sentiment is unreliable on
  in-group speech, sarcasm, and community in-jokes — exactly the register that fills creator
  communities. Behavioural signals (gaps, lengths, reply patterns) are more robust and more
  defensible under questioning.
- Cross-community reputation, anything predictive of churn as a score, dashboards.

---

## The test this spec must pass

Take any observation Kith produces and ask: **could a tool with no memory of this person
have produced it?**

If yes, the detector is wrong and must be made baseline-relative or cut. That question is
also, word for word, what criterion #1 is measuring.
