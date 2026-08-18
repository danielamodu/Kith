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

The Compare view (`npm run web`, or the deployed instance) puts this side by side, live: the
same question, asked of a hand-authored memory-disabled baseline and of Kith reading the
community it remembers. There is no `--no-memory` mode on Kith itself — a second, always-on
Mind kept purely for a live baseline would repeat the cognition-cost leak documented below on
a second surface, so the left panel is a genuinely separate, memory-less capture, disclosed as
such rather than re-queried live every take.

| | Response |
|---|---|
| **Memory disabled** | Generic. Suggests checking engagement metrics or asking the community. |
| **Kith** | Names the member, gives the reasoning, and cites the history it drew on with real timestamps. |

Results are reproducible from this repo. We consider this the central evidence for the
submission, and we'd rather be judged on it than on any claim we make about ourselves.

## Try it

- **Live:** the app is deployable straight to Vercel — `vercel.json` handles the build
  (regenerates the fixture, builds the registry, builds the frontend) and routes; set
  `MINDS_BUILDER_API_KEY` and `KITH_MIND_ID` as environment variables and it runs the same
  live queries this README describes.
- **Local:** `npm install && npm run web`, then open `http://localhost:3131`.
- **Your own community:** see `docs/self-hosting.md` — point it at your own Mind and your own
  Telegram or Discord history instead of the synthetic fixture.

---

## Where this actually stands

Everything below has been proven hands-on against the live Minds API, not assumed —
see `docs/evidence/` for dated writeups of each finding, including the ones that went wrong
before they were fixed.

| Area | State |
|---|---|
| Perception layer (detectors, baselines, registry) | Built and tested — 16 regression tests, all passing |
| Memory persistence | Proven cross-conversation via a Mind Artifact, not a context window |
| Autonomous follow-up | Proven to fire unprompted, with timestamps, on its own cadence |
| Cost model | A real leak was found (a default skill solicited payment unprompted) and fixed; an always-on Mind's true running cost is now measured, not assumed |
| Pronoun safety | Structural fix (data, not a tenet) holds for a question's primary subject; a UI-level guard catches the case where it doesn't, for people mentioned in passing — both documented, including the case it actually caught |
| Web UI | Built, wired to the live backend, deployable to Vercel or run locally |
| Real community backfill | Blocked on owner consent — running on a disclosed synthetic fixture in the meantime |
| Threshold calibration | Blocked on real data; constants marked `CALIBRATE` until then |
| Optional payout layer | Off by default; a Mind-owned wallet exists but nothing spends from it |

```bash
npm install
npm run fixture   # generate the synthetic community
npm run detect    # what Kith would tell the creator, from the command line
npm run registry  # build the payloads the Mind reads
npm run push      # push the registry into your Mind's memory as an Artifact (spends cognition)
npm run web       # the web UI, at http://localhost:3131
npm test          # 16 regression tests
```

### What the tests actually lock down

The suite exists to protect the thesis, not the code. Its central case: **two members go
silent for the same length of time, and only one of them is a signal.** Priya has actually
been quiet *longer* than Maya in absolute terms — and is correctly ignored, because nine
days is nothing for someone who posts monthly. If a threshold tweak ever makes Priya fire or
Maya go quiet, the product is broken and the suite says so.

It also asserts that a farewell suppresses drift, that volume isn't contribution (one member
posts 3,562 messages and never answers a single question, and never surfaces), that tone
shift never fires alone, and that **no gendered pronoun is ever asserted about a member** —
Kith doesn't know anyone's pronouns and must never guess.

## The bigger idea

Kith today is one live Mind. It isn't a hosted product — there's no signup, no account,
nobody's servers but yours. The path to reach more than one community isn't us running
infrastructure for every creator's Mind; it's publishing this as an equippable Skill on the
Minds Bazaar, so a creator's own Mind can become a Kith. That part hasn't been built —
publishing a Skill requires a conversational authoring flow this project has never gone
through — but the mechanism it would package already exists and already works: everything in
`src/` is designed to run against *any* Mind, not just this one. See `docs/self-hosting.md`
for the version of this that's real today.

## Deliberately out of scope

Stated rather than left silent, because scope decisions are design decisions:

- Multi-tenant / multiple communities at once — Telegram and Discord ingestion both exist
  (`src/telegram.ts`, `src/discord.ts`) since a real community could show up on either, but
  Kith is scoped to one community's history at a time, done properly
- Image and video moderation
- Hosted multi-tenant onboarding — see "The bigger idea" above for why
- Resurfacing-conflict detection — real and valuable, too large for the window
- Sentiment analysis as a primary signal — unreliable on in-group speech, sarcasm and
  community in-jokes, which is most of what fills a creator community

## Design risks we're aware of

**Payment is off by default.** Kith can optionally settle recognition as a stablecoin payout
through the Mind's own wallet. It ships disabled, because paying for behaviour that was
freely given can crowd out the belonging that motivated it. Whether a community wants that is
the creator's call, not ours, and the default should be the one that can't do harm.

**Tone shift is never fired alone.** It's the weakest signal and the most likely to produce a
confidently wrong, faintly creepy claim about someone. It exists only to corroborate.

**A gap is a question, not a conclusion.** Holidays, exams, and time zones all look like
drift. Kith proposes; it never concludes on someone's behalf.

**Silence is a feature.** Kith holds observations until they compose into something worth a
creator's attention. A stream of single-signal alerts is a notification firehose — the thing
creators already ignore. An empty digest is usually the correct digest.

**An always-on Mind has a real, unavoidable running cost.** Cadence cycles meter cognition
whether or not anything gets sent, and can't be fully disabled — only spaced out, to a
platform maximum of 7 days. A system-default skill also composed and sent an unprompted
payment solicitation to the steward the first time runway ran low, unprompted, something
never designed in and had to be explicitly suppressed. Full account in
`docs/evidence/2026-08-16-cognition-leak.md`. This is load-bearing for the viability story:
a real deployment needs a funded, monitored cadence, not a "set and forget" Mind.

**The pronoun fix holds reliably for a question's primary subject, less reliably for people
mentioned in passing.** The structural fix — carrying `pronouns` as registry data, not just a
tenet — was proven against the member a question is actually about, and held under direct
adversarial pressure. A live capture still used a gendered pronoun once, for a different
member referenced briefly deeper in the same answer. Caught by a second, independent
safeguard: the UI scans every cached answer for a gendered pronoun and shows a visible
warning instead of displaying it silently. Documented, including the case it actually caught,
in `docs/evidence/2026-08-17-pronoun-guard-caught-a-real-case.md`.

## Data and consent

**Running on a disclosed synthetic fixture (`src/fixture.ts`), not a real backfill, while
real community access stays blocked on owner consent.** Two conditions are non-negotiable
while that's true: the fixture is labelled illustrative wherever it's shown — on screen, not
buried in a footnote — and it never appears alongside a claim of realness. Disclosed
synthetic data is an honest weaker submission; undisclosed synthetic data is a dishonest one
that risks the whole thing being discounted the moment a judge notices. Those are not the
same decision.

If real community history lands, this reverts: the fixture is replaced, this section is
rewritten to describe the real source and the consent obtained — from the owner, and
separately from anyone featured by name — and any synthetic-data disclosure comes out. That
remains the goal.

---

## Repository

```
src/
  types.ts, ingest.ts, members.ts, detectors.ts    perception layer — pure functions, tested
  registry.ts                                       durable member store + the small watchlist
                                                      the cadence cycle actually reads
  telegram.ts, discord.ts, store.ts                platform ingestion, merged into one store
  minds-client.ts                                   fetch()-based Minds Builder API client —
                                                      every read is direct HTTP; sending shells
                                                      out to the CLI as a Windows-safe fallback
  demo-session.ts, server.ts                        the web backend — also the Vercel entry
                                                      point, via api/index.ts
  cli-*.ts                                          fixture, ingest, detect, registry, backfill,
                                                      poll, discord, calibrate, push
  *.test.ts                                          regression tests protecting the thesis,
                                                      not the code
api/index.ts               wraps src/server.ts as a Vercel serverless function
frontend/                  the web UI's real source (React/Vite) — public/ is its built output
public/                    built frontend output, served by src/server.ts; `npm run web`
content/
  baseline-answer.json     the hand-authored Beat A "memory disabled" panel — tracked in git,
                            unlike data/ which holds derived community data
docs/
  perception-spec.md       what Kith notices, why each signal needs memory, and calibration
  architecture.md          the Minds integration, settled from hands-on testing
  platform-findings.md     what was verified against the live Minds API, and when it corrected
                            an earlier assumption
  self-hosting.md          run this on your own community — the full setup, end to end
  manus-ux-brief.md        sitemap and API contract the frontend was built against
  telegram-setup.md, discord-setup.md
  evidence/                dated records of things proven against the live Mind, wins and
                            failures both
```

`npm test` runs the full suite against the fixture. `npm run web:build` builds the frontend
and deploys its output into `public/` — see `scripts/deploy-frontend.ts`.
