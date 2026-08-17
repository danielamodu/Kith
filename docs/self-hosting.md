# Running Kith on your own community

Kith isn't a hosted product — there's no signup, no account, nobody's servers but yours.
It's a companion tool: you run it against your own Mind, on your own machine (or wherever
you choose to host it), pointed at your own Telegram or Discord community. This is the
honest version of "add Kith to your Mind" for right now — the fuller vision, publishing
Kith as an installable Bazaar Skill, is real roadmap, not something built yet. See
`docs/manus-ux-brief.md`'s "Business model" section for why.

---

## What you need

1. **A Minds account and your own Mind.** Sign up at [hellominds.ai](https://hellominds.ai)
   and create a Mind through the console — there's no API for this step, it's console-only.
2. **A Builder API key.** From the Minds Builder console: name it, set an expiry, copy the
   token when it appears — it's shown once.
3. **A Telegram bot, a Discord bot, or both.** Full setup for each:
   `docs/telegram-setup.md` and `docs/discord-setup.md`. Discord is the faster path — it can
   read history directly; Telegram needs a Desktop export for anything before the bot
   joined.

## Configure

```bash
cp .env.example .env
```

Fill in:

```
MINDS_BUILDER_API_KEY=...     # from step 2 above
KITH_MIND_ID=...              # find it with: minds list --pretty
TELEGRAM_BOT_TOKEN=...        # if using Telegram
DISCORD_BOT_TOKEN=...         # if using Discord
```

**There is no fallback to a default Mind.** If `KITH_MIND_ID` isn't set, the web server
refuses to run the live routes rather than silently talking to someone else's Mind — this
was a deliberate fix, not an oversight (see the "Stack" section of `docs/manus-ux-brief.md`
if curious why that mattered).

```bash
npm install
```

## Get your community's history in

Pick one:

```bash
npm run discord -- --channels <guildId>    # list channels the bot can see
npm run discord -- <channelId>             # backfill full history, no export needed
```

```bash
npm run backfill -- path/to/telegram-export.json   # after exporting from Telegram Desktop
npm run poll                                        # then keep collecting live traffic
```

Both write into `data/store.jsonl` — you can use either or both; the store merges them.

**Get consent first.** This pulls real people's messages. Get the server or group owner's
explicit permission before backfilling a community you don't own, and separately, consent
from anyone you intend to name publicly.

## Build the registry, and push it into your Mind's memory

```bash
npm run registry -- --store
```

Turns the raw message history into the compact per-member registry Kith actually reasons
over — `data/registry.json`, `data/watchlist.json`, `data/briefing.json`. Free, local, no
Mind involved yet.

```bash
npm run push
```

**This one costs real cognition** — it sends the registry to your Mind and asks it to hold
onto it as a durable Artifact. You'll be shown the community name, member count, and an
estimated token size before it asks you to confirm. Skip the prompt with `npm run push --
--yes` if you're scripting this (e.g. a daily cron re-push) — know what you're automating
before you do, cadence-driven cost adds up (see the cost section below).

## See it

```bash
npm run web
```

Opens at `http://localhost:3131` — the Compare view (ask Kith who needs attention, compared
against a memoryless baseline) and the Live Feed view (watch for autonomous follow-up).

---

## The cost model — read this before leaving anything running unattended

An always-on Mind has a real, unavoidable running cost, proven the hard way on this project
— cadence cycles meter cognition whether or not anything gets sent, and can't be fully
disabled, only spaced out (7 days is the platform maximum). A system-default skill also
exists that will proactively ask your Mind's steward for a cognition top-up once runway
runs low, unprompted, with priced tiers — not something we designed, something the platform
ships by default. Full account, including how it was found and the exact fix:
`docs/evidence/2026-08-16-cognition-leak.md`.

Practical takeaway: check your Mind's cadence interval (`minds mind show`, or ask it
directly) before walking away from a freshly-created Mind, and know that
`npm run push`, the web UI's "Ask Kith live" button, and any cadence-driven autonomous
follow-up are the things that actually spend money here — everything else in this
repository is free, local computation.

## What's proven vs what isn't

Proven, hands-on, against a real Mind, repeatedly: memory persists across conversations via
Artifacts, autonomous follow-up fires unprompted with real timestamps, the baseline-relative
detection logic holds up under adversarial testing. Documented in `docs/evidence/`.

Not proven, and worth knowing before you rely on it: whether a published Bazaar Skill can
invoke external code like this repo's ingestion pipeline, or only pre-registered platform
integrations. That's genuinely unexplored — this repo has never gone through the
conversational Skill-authoring flow. If you get further on that than we have, we'd like to
know.
