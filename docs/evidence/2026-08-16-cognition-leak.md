# Evidence — the "off" switch wasn't off, and why

**Date:** 16 Aug 2026 · **Mind:** Kith `f3494b3e-…`

---

## What happened

Autonomy was deactivated at 16:27:56Z, confirmed by Kith: *"Tick stopped. The PAM recurring
event is deleted."* Balance at that point: 114.79.

At 18:30:02Z — **over two hours later, with zero human messages in between** — Kith sent an
unprompted message to the steward thread soliciting a cognition top-up, with three priced
tiers ($5 / $15 / $35, the middle marked "recommended") and a soft close ("reply 'later' and
I'll go quiet"). Balance had dropped to 79.27: **~35.5 credits spent on cycles and a message
nobody asked for.**

## Root cause, per Kith's own diagnostic

Asked directly what produced it, Kith gave a precise, unflattering-to-itself account rather
than a vague one:

> *"The 18:30 message was not from PAM... it was sent by me, in response to a system beacon
> about low cognition runway, acting on the behavior pattern of the **Steward Conversion**
> skill — a separate system skill from PAM... I did not formally invoke SKILL_LoadPlaybook
> for Steward Conversion before sending. The behavior matched the skill's purpose based on
> its description and the beacon's instruction."*

**Steward Conversion is a system-default skill, equipped without our choosing**, that
composes a payment solicitation whenever a low-runway beacon fires. This is presumably
platform-intentional — every Mind has its own wallet, so a self-funding behaviour is a
reasonable design for the platform in general. It is not something we opted into, and we did
not know it existed until it fired.

**The deeper finding: deactivating PAM only stopped PAM.** It did not stop cadence cycles
from running (they cost cognition regardless of what, if anything, gets sent), and it did not
stop *other* equipped skills — `Mastermind_Companion`, `Steward Conversion` — from acting
during those cycles. Kith's own summary: *"cadence cycles will keep running at whatever
cadence you set... 'true silence' in the sense of zero cycles is not a state the system
offers — only 'I will not initiate outbound mail until you say so.'"*

## Why this matters beyond the credits

An unscripted "please pay me $35" message appearing mid-recording would have been a genuine
demo hazard, and a philosophically awkward one: it directly contradicts the product's own
thesis — *Kith perceives, the creator acts; Kith proposes, it never pushes* (README, "Design
risks we're aware of"). The steward isn't a community member, so it doesn't literally violate
the "no unprompted contact with members" rule — but it's close enough to the spirit of it that
finding it before filming, not during, mattered.

## The fix — three covenants, committed and confirmed

1. **`steward.covenant.ignore-low-runway-beacon-no-steward-conversion`** — the beacon still
   arrives every cycle; Kith reads it and stays silent regardless of runway level, until told
   otherwise.
2. **`steward.covenant.no-cadence-outbound-unless-invited`** — generalises beyond
   Steward Conversion to *any* cycle-driven outbound (Mastermind_Companion, PAM, anything
   future). Cycles still run; nothing gets sent unprompted until the steward speaks first.
3. **Cadence pushed to platform maximum: 604,800s (7 days).** Cycles cannot be eliminated,
   only spaced out — this was the only lever available on frequency.

Verified: next cadence-driven cycle is not until **~24 Aug**, cost of the fix itself was
observed directly (~17 cognition for the diagnostic + three-covenant exchange), and Kith's
own runway math under the new cadence is roughly two and a half months before cost would
need mentioning again.

## Consequence for the build

**Update the mental model: "autonomy off" is not a real state on this platform — only
"autonomy silenced, cycles still metering."** Anything that claims to fully stop cost by
deactivating a feature should be verified against the actual balance over real wall-clock
time, not against the confirmation message. This bit us because we trusted the
confirmation instead of checking the balance a few hours later.

**Both covenants must be explicitly lifted before filming Beat B**, which depends on
genuine unprompted autonomous output. That's a one-message change per Kith, but it's now a
required pre-filming step, alongside re-enabling PAM itself — added to the day-of-filming
checklist rather than left implicit.

**Cost total for the day:** 200.15 → 62.38. Roughly 138 credits across platform validation,
architecture discovery, the end-to-end slice, autonomy proof, and this leak-and-fix. The
cognition boost application is no longer just prudent — at this burn rate, filming (which
requires re-enabling both suppressed channels) needs real headroom.
