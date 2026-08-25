# Kith

**A Mind that remembers every member of your community, and tells you what you can't see
anymore.**

Built on [Minds by Animoca Brands](https://hellominds.ai).

---

## The 30-second version

Past a few hundred members, a creator can't read everything anymore — and the quiet
erosion is invisible until the members are already gone: a regular fading away, a
newcomer's first message sitting unanswered. Kith is a Mind skill that remembers every
member's *own* baseline — their rhythm, their message length, who they help — and runs
itself: a daily cycle reads what's new in the community, updates the memory inside the
creator's Mind, and posts a digest only when someone actually needs attention. Every
signal is measured against that specific person's history, never a global threshold.
Most days Kith says nothing. Silence means nobody is slipping away.

---

## What it does

Past a few hundred members, a creator loses the ability to read everything. They still care
about every person in the room — they just can't hold them all in their head anymore. A
regular starts drifting and nobody notices. A newcomer's first message goes unanswered and
nobody notices that either. The community erodes quietly, and by the time it shows up in the
metrics, those people are already gone.

Kith sits in the community and remembers every member over months. It doesn't moderate, and
it doesn't punish. It notices, and it tells the creator:

> *"Maya has answered 31 newcomers' questions since June — more than anyone, including your
> mods. She hasn't posted in 9 days, and her messages have been getting shorter for two
> weeks. I think she's burning out. I'd reach out personally rather than in channel."*

*(Synthetic example, generated from Kith's fixture community — no real person's data is
shown anywhere in this README. The creator acts. Kith perceives.)*

---

## Add it to your Mind

Kith is published as a **Skill on the Minds Bazaar** — any creator's own Mind can equip it and
start reasoning the same way, over their own community:

```bash
minds mind skills equip --mind <your-mind-id> --id EFCE4B3E-F36B-1410-8466-00039CE7DF11
```

Or find "Kith" in the [Bazaar](https://hellominds.ai/bazaar/skills) and install it directly.
This is not a hosted service — nothing runs on our servers, nothing routes through us. Your
Mind, your community, your cognition.

Equipping the skill gives your Mind the reasoning. It still needs a community registry to
reason over — see **Run it yourself**, below, for getting your own history in.

---

## Or use it hosted — no terminal

The web wizard is the creator-facing product: **invite the bot, pick a channel, build the
memory, push to your Mind.** Four steps, no developer portal, no Node, no `.env`. After the
push, a nightly cycle keeps the memory fresh and posts a digest to a private channel only
when something needs you — most days it says nothing, which is the product working.

Operators deploy their own instance in minutes: see
[`docs/hosted-deployment.md`](docs/hosted-deployment.md) for the environment, the cron, and
the trust model (creator keys encrypted at rest; message data transits the deployment,
cognition stays in each creator's Mind).

---

## Why it has to remember, not just look

Every signal Kith reports is measured against **that person's own baseline**, never a global
threshold. A member who posts three times a day going silent for nine days is a loud signal;
a member who posts monthly going silent for nine days is nothing. That comparison is
impossible without months of per-member history — delete the memory and Kith doesn't
degrade, it goes blind.

**The proof, side by side — real community, same question, same minute, two Minds.**
Full record in [`docs/evidence/2026-08-25-real-side-by-side.md`](docs/evidence/2026-08-25-real-side-by-side.md):

| | Response |
|---|---|
| **Memory disabled** | *"Honest answer: I don't actually know who's in your community right now… I shouldn't make up names or guess based on patterns… this is a limitation, not an answer."* |
| **Kith** | *"uy scutty is the one to reach out to. Usually posts every couple of hours; has been gone nearly five days… gap roughly 50 of their own cycles against a rhythm of ~2.3 hours… this is the first cycle they've been flagged."* — and it refused to judge a second member whose baseline couldn't ground the ratio. |

---

## How it thinks

- **Personal baseline, always.** No global thresholds — every comparison is against that
  specific person's own rhythm.
- **Silence is a feature.** A digest only goes out when something's genuinely worth a
  creator's attention. Most days, the correct output is nothing.
- **A gap is a question, not a conclusion.** Kith proposes categories for a silence; it never
  asserts a cause.
- **Trends, not moments.** A taper must hold across two windows and fall outside the
  person's own variation before it counts — one bad afternoon is not a signal.
- **Cite or stay quiet.** Every claim is backed by a specific value and a timestamp. A claim
  it can't cite is a claim it doesn't make.
- **Never guess a pronoun.** Kith reads the registry's `pronouns` field and defaults to
  they/them — it does not infer from a name.
- **Perceives, doesn't act.** Kith never contacts a member directly, moderates, or punishes.
  It tells the creator what they can no longer see; the creator decides.
- **Payment is opt-in, off by default.** Kith can optionally settle recognition as a
  stablecoin payout through the Mind's own wallet. It ships disabled — paying for behaviour
  that was freely given can crowd out the belonging that motivated it.

---

## Run it yourself

```bash
git clone https://github.com/danielamodu/Kith.git && cd Kith
npm install
npm run fixture      # or bring your own community's history
npm run registry      # build the payloads your Mind reads
npm run push          # push the registry into your Mind's memory
npm run web           # the dashboard, at http://localhost:3131
npm test               # the full regression suite
```

For your own Discord or Telegram community instead of the synthetic fixture, `npm run setup`
walks through ingest, registry build, and push in one go — or see
[`docs/self-hosting.md`](docs/self-hosting.md) for the full manual steps and honest notes.

Deployable straight to Vercel: `vercel.json` handles the build and routing; set
`MINDS_BUILDER_API_KEY` and `KITH_MIND_ID` as environment variables and it runs live.

---

## Repository

```
src/             perception layer, Minds integration, the web backend — see docs/architecture.md
frontend/        the web dashboard's source (React/Vite)
public/          built dashboard output, served by src/server.ts
api/             Vercel serverless entry point
content/         hand-authored UI copy tracked in git
docs/            architecture, self-hosting, hosted deployment, and the full evidence trail
```

## Documentation

- [`docs/perception-spec.md`](docs/perception-spec.md) — what Kith notices and why each
  signal needs memory
- [`docs/architecture.md`](docs/architecture.md) — the Minds integration, as verified
  hands-on, not assumed
- [`docs/self-hosting.md`](docs/self-hosting.md) — run this on your own community
- [`docs/evidence/`](docs/evidence) — dated, specific records of what was proven against the
  live Mind, including the times something broke and how it got fixed


Built for Creative Minds Jam #1: Hong Kong — Moderation & Community Assistance track.

**The track's contrarian take:** moderation acts after behavior crosses a line. Kith
notices the conditions that make moderation necessary — the burnout, the neglect, the
quiet departures — while everything is still fixable with a single human message.
