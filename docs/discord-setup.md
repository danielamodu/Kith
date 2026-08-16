# Discord setup

**Discord can read history. Telegram cannot.** That single difference makes Discord the
faster path to a real community: the bot joins and pages backwards through months of
messages via the API. No export, no Telegram Desktop, no waiting on a rate-limited
download.

Kith supports both. Use whichever community you can actually get access to.

---

## 1. Create the bot

<https://discord.com/developers/applications> → **New Application** → **Bot**

Reset the token, copy it into `.env`:

```
DISCORD_BOT_TOKEN=...
```

## 2. Enable the Message Content intent — the step that silently breaks everything

On the **Bot** page, enable **MESSAGE CONTENT INTENT**.

Without it, requests still succeed, message counts still look right, and **every
`content` field is an empty string**. Kith would perceive a community of blank messages.
It is the most confusing possible failure mode because nothing errors.

It is a free toggle for bots in fewer than 100 servers. Above that it needs Discord's
review.

`npm run discord -- --check <channelId>` samples 100 real messages and refuses to store
anything if they all come back empty.

## 3. Invite the bot

**OAuth2 → URL Generator**

- scope: `bot`
- permissions: **View Channels**, **Read Message History**

Open the generated URL and add it to the server. It does not need admin.

## 4. Find the channel

Turn on **Settings → Advanced → Developer Mode**, then right-click a server or channel
to copy its id.

```bash
npm run discord -- --channels <guildId>
```

## 5. Backfill

```bash
npm run discord -- <channelId>
```

Walks the entire channel, oldest page last, persisting as it goes — a months-long
backfill is thousands of requests and should not be lost to a failure on the final page.
Rate limits are respected automatically.

Limit the window if you only need recent history:

```bash
npm run discord -- <channelId> --since 90
```

Then:

```bash
npm run detect -- --store
```

---

## Discord vs Telegram

| | Discord | Telegram |
|---|---|---|
| Read history via API | **yes** | no |
| Backfill method | the bot itself | Desktop JSON export |
| The gate | Message Content intent | privacy mode, **plus re-adding the bot** |
| Join events | free (system messages) | free (service messages) |
| Native Minds integration | none found in the Bazaar | yes, 30+ skills |

Both normalise to the same `StoredMessage`, so the store can hold a Telegram backfill and
a Discord channel at once — every row records its `source`. Everything downstream, from
the detectors to the Minds registry, is platform-agnostic and does not know or care where
a message came from.

## Consent

Same as Telegram, and it is not a formality. Get the server owner's explicit permission
before backfilling a community you do not own, and consent from anyone named in the demo.
Record the provenance in the submission docs. `data/` is gitignored — keep it that way.
