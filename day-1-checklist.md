# Day 1 — 17 Aug 2026

Nothing gets built today. Day 1 exists to remove the two things that kill this submission
later: **unvalidated platform assumptions**, and **no accumulated history to demo**.

---

## A · Accounts (you must do these — I can't create accounts)

- [ ] Sign up at **hellominds.ai**
- [ ] **Register as Hacker / Apply Now** on the DoraHacks page
- [ ] Confirm two things on the live page while you're there:
  - [ ] **Deadline** — body text says 26 Aug, timeline + countdown + press say **28 Aug**
  - [ ] **Student Prize** amount, and whether you're eligible

> Submit BUIDL is a **separate step** from registering. Registering is not submitting.

---

## B · The four validations

Answer these before any architecture is locked on day 2. Paste the docs at me and I'll work
through the implications with you.

### 1. Is memory addressable per member?
Not "does it have memory" — can you store and retrieve facts keyed to *a specific member*,
and query across members? An opaque per-conversation blob is not enough.

**If no →** the whole concept needs reshaping on day 2. Everything depends on this.

### 2. Can the agent act with no human prompt?
Scheduled runs, cron, triggers, webhooks — anything that fires without a person typing.

**If no →** we supply an external scheduler. Scheduling is plumbing, not judgement, so this
doesn't weaken integration depth — the Mind still decides *what* to say and *whether* to say
anything. Autonomous follow-up remains a hard competition requirement either way: what must
be true is that no human prompts the observation, not that the clock lives inside Minds.

### 3. How much of Telegram can it see?
Full channel history, or only messages that @mention it? Can it read history from *before*
it joined?

**If mentions-only →** not fatal. The brief allows any tools or services provided the Mind is
integral to the *operation* — so we ingest Telegram ourselves and write into the Mind's
memory. This changes how much plumbing we build, not the concept. Still answer it.

### 4. Is the wallet programmatically usable?
Can the agent initiate a payment itself, or is it custodial / manual-approval only?

**If no →** costs us nothing. The payout layer was always optional and off by default; it
drops to an internal ledger plus a roadmap note.

---

## C · Secure the memory source — the sleeper item

**This is the one that quietly kills good submissions.** The demo needs *weeks* of real,
timestamped history. You cannot manufacture that on day 10. Start both tracks today:

- [ ] **Backfill.** Find a real Telegram community you can export history from.
  - Telegram Desktop → chat → ⋯ → Export chat history → JSON
  - **Get explicit consent from the community owner**, and consent from any member you plan
    to feature by name in the video. Note the provenance in the technical docs — judges will
    think about this even if they don't ask.
  - This solves cold-start instantly and is worth real effort today.
- [ ] **Seed.** Stand up your own Telegram group with real people and run it hot from today.
  Weaker history, but it's yours and it accumulates while you build.

Do both if you can. If you can only do one, chase the backfill — ten days of a seeded group
is thin material for a shot that needs to show two months.

---

## D · Decide day 2, not today

- ~~Name~~ → **Kith** (decided 16 Aug; "Steward" rejected — reserved Minds vocabulary for a Mind's owner)
- Which real member becomes the "Maya" of the demo
- The one-paragraph pitch. If it isn't sharp, the build won't save it.

---

## What I'll do once you're through B

Take the Minds docs and turn them into the actual architecture: memory schema, the
notable-state detectors, the baseline harness flag, and the scheduler wiring. The demo script
is already written (`demo-script.md`) and lists exactly what the build has to support — we
build to that list and nothing else.
