# Hosted deployment — running Kith as a product

This is the operator's guide: you run one deployment, and non-technical
creators connect their own communities to it in four clicks. For running
Kith on your own machine against your own community, see
[`self-hosting.md`](self-hosting.md) instead — same pipeline, zero trust
in anyone's servers, more steps.

---

## What a creator experiences

1. **Invite** — one click on Discord's own permission screen. No developer
   portal, no bot creation, no intents page.
2. **Pick a channel** — detected automatically from the servers the bot is in.
3. **Build the memory** — the wizard reads recent history and builds
   per-member baselines. Free, local to the deployment.
4. **Push to their Mind** — the one cognition-spending step, on *their*
   Mind, confirmed explicitly.

After step 4 the wizard registers the guild and **the product takes over**:
an hourly cycle reads what's new, rebuilds the registry and watchlist
locally, re-pushes artifacts into the creator's Mind when they changed, and
posts a digest to a private channel only when there is something worth
saying. Most days that digest says "nothing needs you today" — or nothing
at all, which is the point.

## What the operator deploys

One Vercel project. Environment variables:

| Variable | Purpose | Where it comes from |
|---|---|---|
| `DISCORD_BOT_TOKEN` | the hosted bot's token — one bot, many guilds | your Discord application (create once) |
| `DISCORD_CLIENT_ID` | the same application's id — builds creator invite links | same application, General Information |
| `SERVER_SECRET` | key material for encrypting creators' Minds API keys at rest | any long random string — **never** commit or rotate casually; rotation invalidates every stored key |
| `CRON_SECRET` | auth for the cron endpoint | any long random string |
| `MINDS_BUILDER_API_KEY`, `KITH_MIND_ID` | only for this deployment's own demo dashboard | your own Mind, as before |

Plus, from Vercel's Storage tab: **KV (REST)** — `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are set automatically once the database exists. Without
KV the code falls back to files, which works locally and silently loses
writes on serverless — do not run the hosted product without KV.

Enable Message Content Intent on the hosted bot's application page. Below
100 servers this is a free toggle; above that, Discord review — a good
problem, and the point at which Kith the product is working.

`vercel.json` already carries the cron entry (`/api/cron/poll`, hourly).
Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

## The trust model, stated plainly

Message data transits and rests on the deployment; cognition lives in each
creator's own Mind. The deployment can see *what Kith perceives*; it cannot
and does not think. Creators who want zero of their data on someone else's
server take the self-host path, which remains first-class and documented.

Creator API keys are encrypted at rest (AES-256-GCM, key derived from
`SERVER_SECRET` via scrypt, random salt per ciphertext) and decrypted only
at the moment a cycle talks to that creator's Mind. A dump of the KV store
alone yields no usable keys. Whoever holds `SERVER_SECRET` holds everything
— treat it like the production database password it effectively is.

## Cost model per guild per cycle

- Discord reads: free
- Registry/watchlist rebuild: free, local
- Mind push: a few cognitions, **only when the watchlist actually changed**
- Digest post: free, and only when the composite set differs from last time

A quiet community costs two Discord reads and nothing else.
