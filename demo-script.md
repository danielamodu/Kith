# Demo Video — Script v1

**Target: 1:50** (brief requires 1.5–2:00). Written before the build, deliberately —
everything gets built to make these shots real.

Working title below is `Kith`. Decide day 2.

---

## STATUS, 16 Aug — running on the synthetic fixture, not a real backfill

Real community access is still blocked on consent (see `docs/platform-findings.md` /
`architecture.md`). Rather than stall, we're proceeding with the enriched fixture
(`src/fixture.ts` — 17 members, boundary-tuned, D1–D4 all verified against it) as the demo
basis **for now**. This is a scope decision, not a concealment, and it changes two things
below:

1. **The creator-testimonial beat is cut.** There is no real creator to film, and a
   fabricated one is the single most reputationally dangerous thing we could put in this
   video — worse than not having the beat at all. Its 10 seconds folds into the problem
   framing instead (0:00–0:18 combined, see below).
2. **The video must disclose the data is illustrative**, on screen, once, plainly — not
   buried in the docs only. A judge who half-notices unusual data and finds no disclosure
   discounts the whole submission; a judge who sees an upfront "synthetic scenario" caption
   respects the honesty and evaluates the mechanism on its merits, which is what's actually
   real here: the detectors, the baselines, the Minds integration, the autonomy — all
   genuinely tested, just not yet on a real community's history.

**If real data lands before filming, revert this section and restore the original beat —
it is strictly stronger.** Don't let this become the permanent plan by default.

---

## Structure

| Time | Beat | Purpose |
|---|---|---|
| 0:00–0:18 | Problem + disclosure | Make the judge feel the loss; state the data is illustrative |
| 0:18–0:24 | What it is | One sentence |
| 0:24–1:12 | **Beat A — the A/B proof** | Prove memory is real, against a baseline |
| 1:12–1:38 | **Beat B — session boundary** | Prove continuity + autonomy |
| 1:38–1:50 | Viability + close | Investable, not a feature |

---

## 0:00–0:18 · Problem, with disclosure

**Screen:** a Telegram/Discord community scrolling fast. Too fast to read. Hundreds of
members. Small persistent caption, bottom third, present for this whole beat:
**"Illustrative synthetic community — used to demonstrate the mechanism honestly while we
secure a live one."** Plain text, no apology tone, no hedging beyond the one sentence.

**VO:**
> If you run a community, there's a number where you lose it. Past a few hundred people you
> stop being able to read everything — and you still care about every person in there. So
> nobody notices when a regular starts drifting, or when a newcomer's first message goes
> unanswered. We're showing that with a synthetic community today, built to carry the same
> patterns real ones do — everything you're about to see, the reasoning and the memory, is
> real.

> **Why disclose instead of just cutting the beat silently:** the alternative — real-looking
> names and timestamps with no caption — is indistinguishable from misrepresentation to a
> judge who notices, and noticing is their job. One honest sentence costs nothing and removes
> the risk entirely. It also reframes the ask correctly: judge the mechanism, which is real,
> not the cast, which isn't yet.

---

## 0:18–0:24 · What it is

**Screen:** cut to the agent, plainly, in Telegram.

**VO:**
> `Kith` is a Mind that remembers every member of your community, and tells you what you
> can't see anymore.

---

## 0:24–1:12 · Beat A — the proof

**This is the most important 48 seconds of the submission.** Everything else supports it.

**Screen:** split view, labelled unambiguously.
- **Left:** `Same model. Memory disabled.`
- **Right:** `Kith — two months in this community.`

Same question typed into both:

> *"Is anyone in the community struggling right now?"*

**Left returns something generic:**
> "I don't have information about specific members. You could check engagement metrics or
> ask the community directly."

**Right returns** (this is the tool's actual output style, verbatim in register — pull the
real line from `npm run detect` or the live Mind at filming time rather than retyping this
one; the exact numbers will have drifted since this was written):
> "Maya Okonkwo. They've answered 95 questions since joining in May, 8 of them from people
> newer than they are — ranked first in this community. They haven't posted in over 9 days,
> about 28× their usual gap, and their last few messages were far shorter than normal — 59
> characters against a 179-character norm. I think they're burning out. I'd reach out
> personally rather than in channel."

**Note the pronoun:** *they*, never inferred from the name. This is load-bearing, not a
style choice — see `docs/architecture.md`, the tenet that didn't hold until it was made
structural data on every registry entry. **If a take comes back with "she" or "he," it is
not usable footage** — it means the registry the Mind is reading wasn't the corrected one.
Re-verify before filming, not after.

**Then show the receipts.** The agent expands the history it's drawing on — **real, legible
timestamps spanning the fixture's actual window.** Joined May 20 · steady rhythm through
June and July · last post Aug 7. Hold long enough to read. This is the shot that defeats
"that's just a context window" — and it's also the shot the synthetic-data disclosure at
0:00 makes honest: the *mechanism* reading real accumulated state is what's being proven,
not the identity of the person in it.

**VO over the reveal:**
> Same model. Same prompt. The only difference is that one of them has been in the room for
> two months, and remembers everyone in it.

---

## 1:12–1:38 · Beat B — session boundary

**Pre-filming checklist for this beat specifically** (16 Aug finding — see
`docs/evidence/2026-08-16-cognition-leak.md`): Kith currently has two committed covenants
suppressing *all* unprompted outbound messages, applied after a system-default skill sent
an unwanted payment solicitation. Both must be explicitly lifted before this beat can work
— re-enable PAM, and tell Kith the no-cadence-outbound covenant is lifted for this session.
Re-apply both immediately after filming; leaving them off burns credits with nothing to
show for it.

**Screen:** show the restart *explicitly* — process stopped, relaunched. Then a visible date
change. Four days later.

**Unprompted message arrives in the creator's Telegram:**
> "Following up on Maya — she posted again yesterday, after you reached out. Separately: four
> people joined last week and none of them got a reply to their first message. I'd welcome
> them before they go quiet too."

**VO:**
> Nobody asked it to do that. It picked up an open thread from four days earlier, after a
> full restart, and acted on its own.

---

## 1:38–1:50 · Close

**VO:**
> It doesn't moderate. It doesn't punish. It notices — and gives the creator back the one
> thing scale took away. Every month it runs, it knows the community better.
>
> `Kith`. Built on Minds.

---

## Production rules — these are the ones that get broken under deadline pressure

1. **The baseline must be an honest test.** Same model, same prompt, memory removed, nothing
   else changed. If it's rigged to look stupid, a judge will spot it and it costs more than
   it gains. State the test conditions on screen.
2. **Timestamps must be legible, and their status must be truthful.** If real data lands
   before filming: real, verified, un-cherry-picked history — fabricating it would sink the
   submission outright. On the current synthetic path: legible is still required, but honesty
   comes from the disclosure caption (0:00–0:18), not from pretending the dates are real.
   Never combine synthetic data with a claim of realness — that combination, not synthetic
   data itself, is the disqualifying move.
3. **Show the restart.** Don't cut around it. The restart *is* the proof of persistence.
4. **Maya, as currently scripted, is the synthetic fixture's Maya Okonkwo** — one of the
   boundary-tuned personas in `src/fixture.ts`, not a real person. That's fine *because it's
   disclosed*. **If real data lands before filming, she must be replaced by a real member (or
   consented stand-in) with genuinely accumulated history, consent obtained and recorded in
   the docs, and the 0:00 disclosure caption removed.** Do not blend the two — either the
   whole community is real and undisclosed-as-synthetic, or the whole thing is synthetic and
   disclosed. No partial versions.
5. **No music swells, no logo animation.** Judges have watched forty of these. Every second
   spent on polish is a second not spent on evidence.
6. **Record at readable resolution.** Text-heavy demo — if the timestamps aren't legible on a
   laptop screen, the proof doesn't land.
7. **Refuse to show more.** Whatever else the agent ends up doing, it does not go in this
   video. Feature-rich demos are forgettable; every extra capability shown steals seconds from
   the proof. If a shot doesn't serve Beat A or Beat B, cut it. This rule will feel wrong on
   day 11 — follow it anyway.
8. **No gendered pronoun in any take.** Structural, not stylistic — see rule under Beat A.

---

## Dependencies this script creates for the build

Working backwards, the product must be able to:

- Answer an open question about *who* is struggling, naming a specific member with reasoning
- Cite the underlying history it used, with timestamps — **the receipts view is a build item**,
  not a nice-to-have
- Run with memory disabled, as a flag, for the baseline comparison
- Survive a full restart and resume an open thread
- Detect: contribution volume, posting-gap drift, message-length change vs. personal baseline,
  unanswered newcomers
- Push an unprompted follow-up on its own schedule

Anything not on this list is out of scope until these work.
