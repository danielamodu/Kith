# Kith

**A Mind that remembers every member of your community, and tells you what you can't see
anymore.**

Built on [Minds by Animoca Brands](https://hellominds.ai) for Creative Minds Jam #1: Hong Kong
— Moderation & Community Assistance track.

---

## The problem

If you run a community, there's a number where you lose it. Somewhere past a few hundred
people you stop being able to read everything. You still care about every person in there —
you just can't hold them all in your head anymore.

So nobody notices when a regular starts drifting. Nobody notices the newcomer whose first
message never got a reply. The community erodes quietly from the inside, and by the time it
shows up in the metrics, those people are already gone.

That community is also the creator's economic asset. Churn among the core members who hold
the culture together is direct economic loss, and it is invisible precisely because it is
gradual.

## What Kith does

Kith sits in the community and remembers every member over months. It doesn't moderate,
and it doesn't punish. It notices, and it tells the creator:

> *"Maya has answered 31 newcomers' questions since June — more than anyone, including your
> mods. She hasn't posted in 9 days, and her last three messages were much shorter than her
> baseline. I think she's burning out. I'd reach out personally rather than in channel."*

The creator acts. Kith perceives. It doesn't replace the human relationship — it restores
one that scale destroyed.

## Why this needs a persistent Mind

Every signal Kith reports is measured against **that person's own baseline**, never a
global threshold. A member who posts three times a day going silent for nine days is a loud
signal; a member who posts monthly going silent for nine days is nothing.

Personal baselines cannot be computed without months of per-member history. Delete Kith's
memory and it doesn't degrade — **it goes blind.** It cannot perceive anything it exists to
report.

That claim is testable, and we test it: see the baseline comparison below.

## The baseline comparison

Kith ships with a `--no-memory` mode: the same model, the same prompt, memory removed,
nothing else changed. Asked *"is anyone in the community struggling right now?"*:

| | Response |
|---|---|
| **Memory disabled** | Generic. Suggests checking engagement metrics or asking the community. |
| **Kith** | Names the member, gives the reasoning, and cites the history it inferred from with timestamps. |

Results are reproducible from this repo. We consider this the central evidence for the
submission, and we'd rather be judged on it than on any claim we make about ourselves.

---

## Status — day 1 (16 Aug 2026)

Platform validated hands-on; perception layer built and tested.

| Component | State |
|---|---|
| Platform validation | **Done** — memory is Mind-global, proven (`docs/platform-findings.md`) |
| Architecture | **Settled** from testing, not assumption (`docs/architecture.md`) |
| Telegram ingest | **Done** — export schema parsed, entity-array text flattened |
| Member baselines | **Done** — median rhythm, MAD spread, length norms, contribution |
| Detectors D1–D4 | **Done** — 10 regression tests green |
| Registry + briefing payloads | **Done** — 4,135 messages distil to ~700 tokens |
| Real community backfill | **Blocked** — needs the consented export |
| Threshold calibration | Blocked on real data; all constants marked `CALIBRATE` |
| Writing registry into a Mind Artifact | Next |
| Autonomous digest via cadence cycles | Next |
| Baseline harness | Next |
| Optional payout layer | Off by default; wallet exists (`0xfA4F…` on Base) |

```bash
npm run fixture   # generate synthetic community
npm run detect    # what Kith would tell the creator
npm run registry  # build the payloads for the Mind
npm test          # 10 regression tests
```

### What the tests lock

The suite exists to protect the thesis, not the code. Its central case: **two members
go silent for the same length of time and only one is a signal.** Priya has actually
been quiet *longer* than Maya in absolute terms — and is correctly ignored, because
9 days is nothing for someone who posts monthly. If a threshold tweak ever makes Priya
fire or Maya go quiet, the product is broken and the suite says so.

It also asserts that a farewell suppresses drift, that volume is not contribution
(Dev Raman: 3,562 messages, 0 answers, never surfaces), that tone-shift never fires
alone, and that **no gendered pronoun is ever asserted about a member** — Kith doesn't
know anyone's pronouns and must never guess.

## Deliberately out of scope

Stated rather than left silent, because scope decisions are design decisions:

- Multi-tenant / multiple communities at once — Telegram and Discord ingestion both exist
  (`src/telegram.ts`, `src/discord.ts`) since a real community could show up on either, but
  Kith is scoped to one community's history at a time, done properly
- Image and video moderation
- Dashboards and web UI — the output is a sentence, not a chart
- Multi-tenant onboarding
- Resurfacing-conflict detection — real and valuable, too large for the window
- Sentiment analysis as a primary signal — unreliable on in-group speech, sarcasm and
  community in-jokes, which is most of what fills a creator community

## Design risks we're aware of

**Payment is off by default.** Kith can optionally settle recognition as a stablecoin
payout through the Mind's own wallet. It ships disabled, because paying for behaviour that
was freely given can crowd out the belonging that motivated it. Whether a community wants
that is the creator's call, not ours, and the default should be the one that can't do harm.

**Tone shift is never fired alone.** It is the weakest signal and the most likely to produce
a confidently wrong, faintly creepy claim about someone. It exists only to corroborate.

**A gap is a question, not a conclusion.** Holidays, exams, and time zones all look like
drift. Kith proposes; it never concludes on someone's behalf.

**Silence is a feature.** Kith holds observations until they compose into something worth a
creator's attention. A stream of single-signal alerts is a notification firehose — the thing
creators already ignore. An empty digest is usually the correct digest.

## Data and consent

**Current status, 16 Aug: the demo runs on the synthetic fixture (`src/fixture.ts`), not a
real backfill.** Real community access is blocked pending owner consent — see
`docs/platform-findings.md`. Rather than stall, we're proceeding on synthetic data now, with
two conditions that are non-negotiable: the fixture is clearly labelled illustrative
wherever it's shown (the demo video carries an on-screen disclosure caption, not a footnote),
and it never appears alongside a claim of realness. Disclosed synthetic data is an honest
weaker submission; undisclosed synthetic data is a dishonest one that risks the whole thing
being discounted if a judge notices — the two are not the same decision.

**If real community history lands before filming, this reverts:** the fixture is replaced,
this section is rewritten to describe the real source and the consent obtained (from the
owner, and separately from anyone featured by name), and the demo's disclosure caption comes
out. That is the stronger, intended version of this submission and remains the goal.

---

## Repository

```
src/
  types.ts, ingest.ts, members.ts, detectors.ts   perception layer — pure functions, tested
  registry.ts                                     durable member store + the small watchlist
                                                    the cadence cycle actually reads
  telegram.ts, discord.ts, store.ts               platform ingestion, merged into one store
  cli-*.ts                                        fixture, ingest, detect, registry, backfill,
                                                    poll, discord, calibrate
  *.test.ts                                        regression tests protecting the thesis,
                                                    not the code
docs/
  perception-spec.md      what Kith notices, why each signal needs memory, and calibration
  architecture.md          the Minds integration, settled from hands-on testing
  platform-findings.md     what was verified against the live Minds API, and when it corrected
                            an earlier assumption
  telegram-setup.md, discord-setup.md
  evidence/                dated records of things proven against the live Mind
demo-script.md             the 1:50 submission video, written before the build
day-1-checklist.md         platform validation gates
```

`npm test` runs the full suite against the fixture. See `docs/architecture.md` for status.
