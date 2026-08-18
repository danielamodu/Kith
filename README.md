# Kith

**A Mind that remembers every member of your community, and tells you what you can't see
anymore.**

Built on [Minds by Animoca Brands](https://hellominds.ai).

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
> mods. She hasn't posted in 9 days, and her last three messages were much shorter than her
> baseline. I think she's burning out. I'd reach out personally rather than in channel."*

The creator acts. Kith perceives.

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

## Why it has to remember, not just look

Every signal Kith reports is measured against **that person's own baseline**, never a global
threshold. A member who posts three times a day going silent for nine days is a loud signal;
a member who posts monthly going silent for nine days is nothing. That comparison is
impossible without months of per-member history — delete the memory and Kith doesn't
degrade, it goes blind.

**The proof, side by side, same question, same model:**

| | Response |
|---|---|
| **Memory disabled** | Generic. Suggests checking engagement metrics or asking the community. |
| **Kith** | Names the member, gives the reasoning, and cites the history it drew on with real timestamps. |

---

## How it thinks

- **Personal baseline, always.** No global thresholds — every comparison is against that
  specific person's own rhythm.
- **Silence is a feature.** A digest only goes out when something's genuinely worth a
  creator's attention. Most days, the correct output is nothing.
- **A gap is a question, not a conclusion.** Kith proposes categories for a silence; it never
  asserts a cause.
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
npm test               # 29 tests
```

For your own Discord or Telegram community instead of the synthetic fixture, see
[`docs/self-hosting.md`](docs/self-hosting.md) — full setup, end to end.

Deployable straight to Vercel: `vercel.json` handles the build and routing; set
`MINDS_BUILDER_API_KEY` and `KITH_MIND_ID` as environment variables and it runs live.

---

## Repository

```
src/            perception layer, Minds integration, the web backend — see docs/architecture.md
frontend/        the web dashboard's source (React/Vite)
public/          built dashboard output, served by src/server.ts
api/             Vercel serverless entry point
content/         hand-authored UI copy tracked in git
docs/            architecture, self-hosting, and the full evidence trail
```

## Documentation

- [`docs/perception-spec.md`](docs/perception-spec.md) — what Kith notices and why each
  signal needs memory
- [`docs/architecture.md`](docs/architecture.md) — the Minds integration, as verified
  hands-on, not assumed
- [`docs/self-hosting.md`](docs/self-hosting.md) — run this on your own community
- [`docs/evidence/`](docs/evidence) — dated, specific records of what was proven against the
  live Mind, including the times something broke and how it got fixed

## Data

The public demo runs on a disclosed synthetic community while real access stays pending
owner consent — labelled as such wherever it's shown, never presented as real. Details in
`docs/evidence/`.

---

Built for Creative Minds Jam #1: Hong Kong — Moderation & Community Assistance track.
