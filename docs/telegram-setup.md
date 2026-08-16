# Telegram setup

Kith reads a community two ways, and it needs both.

| Source | Reaches | Why |
|---|---|---|
| **Desktop export** (backfill) | everything, including before the bot existed | the Bot API cannot see history at all |
| **Bot API** (live) | only messages sent after the bot joins | keeps the picture current |

Backfill is not optional. Personal baselines need months of history, and a bot added
today knows nothing about who someone used to be.

---

## 1. Create the bot

Message **@BotFather** on Telegram:

```
/newbot
```

Follow the prompts. Copy the token into `.env`:

```
TELEGRAM_BOT_TOKEN=123456789:AA...
```

## 2. Turn privacy mode OFF — the step everyone misses

By default a bot in a group sees **only messages that mention it or are commands**.
Kith would be blind to the community it exists to perceive.

```
/setprivacy
```

Pick your bot, choose **Disable**.

> **The setting only applies on join.** If the bot is already in the group, you must
> **remove and re-add it** afterwards. Nothing warns you about this — the bot simply
> keeps seeing nothing.

`npm run poll -- --check` verifies this properly, via `getMe().can_read_all_group_messages`,
and refuses to collect a misleading partial view of the community if it is still on.

## 3. Add the bot to the group

Add it as a normal member. It does not need admin rights to read messages once privacy
is disabled.

## 4. Backfill the history

From Telegram **Desktop** (not mobile, not web, not the macOS App Store app — none of
those have export):

- open the group → **⋮** → **Export chat history**
- untick photos, videos and files — we only need text, and media makes it enormous
- set **Format** to **Machine-readable JSON**, not HTML

Telegram sometimes rate-limits the first export and asks you to wait a few hours.

```bash
npm run backfill -- path/to/result.json
```

## 5. Collect live traffic

```bash
npm run poll
```

Long-polls until interrupted. `--once` does a single batch, for cron.

---

## Consent

The store contains real people's messages. Before backfilling a community you do not
own, get the owner's explicit permission, and get consent from anyone you intend to
name in the demo video. Record where the data came from in the submission docs — judges
will think about this even if they do not ask.

`data/` is gitignored for this reason. Keep it that way.

---

## Troubleshooting

**`can_read_all_group_messages: false`** — privacy mode is still on, or the bot was not
re-added after you changed it. Both are fixed the same way: `/setprivacy` → Disable,
then remove and re-add.

**Poll returns nothing** — the bot may have joined after the messages were sent. Bots
cannot see history; that is what backfill is for. Also note updates expire after ~24h
if never collected.

**Duplicate messages after a crash** — expected and handled. Telegram resends anything
the offset has not acknowledged, and the store dedupes by message id. We deliberately
store before advancing the offset, so a crash costs a duplicate delivery rather than a
lost message.
