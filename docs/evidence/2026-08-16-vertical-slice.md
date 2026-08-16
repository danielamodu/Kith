# Evidence — end-to-end slice, and why tenets are not guardrails

**Date:** 16 Aug 2026 · **Mind:** Kith `f3494b3e-…` · **Artifact:** `kith-registry` `884F4B3E-…`

---

## The slice works

Our code → Artifact → Mind → creator message, verified across conversation boundaries.

1. `npm run registry` distilled **4,135 messages into a ~694-token registry**.
2. Pushed to the Mind, stored as a durable Artifact.
3. From a **fresh conversation** that had never seen the data, the Mind read the artifact and
   produced the correct judgement unaided.

It computed the ratio itself — *"216 / 8 = ~27 posts missed vs. their own baseline"* — and
rejected every control case for the right reason:

| Member | Verdict | The Mind's reasoning |
|---|---|---|
| **Maya Okonkwo** | **flag** | 27× own baseline, high contribution, only member answering newcomers |
| Priya Anand | leave | *"25-day gap is actually below their ~41-day baseline… in-pattern rather than a regression"* |
| Rin Watanabe | leave | *"said goodbye in July (farewell = true), which is a different kind of conversation"* |
| Dev Raman | leave | active today; *"a presence, not a contributor"* |
| Chloe / Yusuf / Nora | leave | *"don't have enough history for silence to mean anything"* |

That last row is notable: **the Mind independently derived our `MIN_OBSERVATIONS` rule** from
the data, without being told it. It also volunteered its own limit — *"I don't know why Maya
went quiet. The artifact has no field for that."*

---

## Finding: tenets are guidance, not guardrails

**This is the important lesson of the day and it generalises.**

The Mind's first pass inferred gender from names: *"she's been silent for 9 days against her
baseline"*, *"Lena Fischer's 24-hour gap fits her 42-hour rhythm."* Nobody had stated pronouns.

We committed an explicit tenet — `community.tenets.pronouns-default-theythem` — as a permanent
covenant at highest salience. The Mind confirmed it was stored.

**It kept misgendering people anyway.** Same phrasing, next conversation.

### What actually fixed it

Carrying `pronouns: "they/them (not stated)"` as a **field on every registry entry**, so the
Mind reads it at the same instant it reads the name.

Re-tested from a fresh conversation: **974 characters, zero gendered pronouns**, reasoning
unchanged in quality.

> **Rule for the build: anything correctness-critical must be structural — in the data the
> Mind reads, or enforced in our code. Tenets shape tone and priorities. They do not enforce
> constraints.**

This applies well beyond pronouns. Restraint, citation discipline, and "a gap is a question
not a conclusion" are all currently tenets. Any of them that must not fail needs a structural
backstop too.

### Residual

The fixed output reads slightly awkwardly in one spot — *"they/them are the only member"* —
where the Mind used the literal field value as a phrase. Cosmetic, strongly preferable to
misgendering, but worth smoothing before filming.

---

## Operational notes

- **`minds send --wait` can return a stale reply.** It returned the *previous* message once.
  For anything that matters, verify with `minds history` rather than trusting the `--wait`
  payload.
- **A send can silently fail.** One `send` created the conversation but never delivered
  (`lastMessageAt: null`) while still appearing to succeed. Never pipe send output to null.
- **Payload size drives cost.** A 3.5 KB registry push cost noticeably more than a plain
  question. Keep artifacts lean.
- **Key conventions:** entities `community.member.<slug>`, tenets `community.tenets.<slug>`.

## Cognition spent today

200.15 → **134.10**. 66 credits bought: platform validation, the memory-layer discovery,
architecture, the end-to-end slice, and the pronoun fix. Remaining runway is roughly 30–40
substantive exchanges — filming included. **The boost application matters.**
