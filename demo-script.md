# Demo Video — Script v1

**Target: 1:50** (brief requires 1.5–2:00). Written before the build, deliberately —
everything gets built to make these shots real.

Working title below is `Kith`. Decide day 2.

---

## Structure

| Time | Beat | Purpose |
|---|---|---|
| 0:00–0:08 | Problem | Make the judge feel the loss before seeing the fix |
| 0:08–0:18 | **Real creator, own words** | Third-party proof the problem exists |
| 0:18–0:24 | What it is | One sentence |
| 0:24–1:12 | **Beat A — the A/B proof** | Prove memory is real, against a baseline |
| 1:12–1:38 | **Beat B — session boundary** | Prove continuity + autonomy |
| 1:38–1:50 | Viability + close | Investable, not a feature |

---

## 0:00–0:08 · Problem

**Screen:** a Telegram community scrolling fast. Too fast to read. Hundreds of members.

**VO:**
> If you run a community, there's a number where you lose it. Past a few hundred people you
> stop being able to read everything — and you still care about every person in there.

---

## 0:08–0:18 · The creator, in their own words

**Screen:** the actual owner of the community we backfilled. Talking head, or voice over
their own channel. Lower third with their real name and community.

**Ask them to answer, unscripted:** *"What do you miss now that you couldn't miss when the
group was small?"*

Use their sentence, not ours. Something in the register of *"I find out someone left weeks
after they left."*

> **Why this beat exists:** it is third-party evidence that the problem is real, from someone
> with no stake in our scoring. Ten seconds of a genuine creator naming the pain outscores any
> amount of our own narration, and it partially closes the gap against any competing team that
> has real distribution. Almost nobody else will bother to film this.

**If no creator will go on camera:** a written quote on screen with their name and consent is
a weaker but acceptable substitute. Do not fabricate one, and do not use a paraphrase — a
made-up testimonial is unrecoverable if noticed.

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

**Right returns:**
> "Maya. She's answered 31 newcomers' questions since June — more than anyone, including
> your mods. She hasn't posted in 9 days, and her last three messages were much shorter than
> her baseline. I think she's burning out. I'd reach out personally rather than in channel."

**Then show the receipts.** The agent expands the history it's drawing on — **real, legible
timestamps spanning weeks.** Jun 14 · Jun 22 · Jul 3 · Jul 19 · Aug 2 · last post Aug 9.
Hold long enough to read. This is the shot that defeats "that's just a context window."

**VO over the reveal:**
> Same model. Same prompt. The only difference is that one of them has been in the room for
> two months, and remembers everyone in it.

---

## 1:12–1:38 · Beat B — session boundary

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
2. **Timestamps must be real and legible.** Fabricated history is the one thing that would
   sink the submission outright. Hold the shot long enough to actually read the dates.
3. **Show the restart.** Don't cut around it. The restart *is* the proof of persistence.
4. **Maya must be a real member** (or a consented stand-in) with genuinely accumulated
   history. Get consent to feature them and say so in the docs.
5. **No music swells, no logo animation.** Judges have watched forty of these. Every second
   spent on polish is a second not spent on evidence.
6. **Record at readable resolution.** Text-heavy demo — if the timestamps aren't legible on a
   laptop screen, the proof doesn't land.
7. **Refuse to show more.** Whatever else the agent ends up doing, it does not go in this
   video. Feature-rich demos are forgettable; every extra capability shown steals seconds from
   the proof. If a shot doesn't serve Beat A or Beat B, cut it. This rule will feel wrong on
   day 11 — follow it anyway.

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
