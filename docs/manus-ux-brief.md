# Kith — UX rebuild brief

For whoever builds the frontend next. The backend already exists, is tested against the
live Mind, and paid real money in cognition to get two non-obvious bugs fixed — reuse it
rather than rebuild it. This doc is the full sitemap, what's real vs illustrative on each
page, and the API contract to build against.

---

## The one-line product

**Kith remembers every member of a community and tells the creator what they can no longer
see** — who's quietly burning out, who arrived and got no reply. It's a Mind, built on
Minds by Animoca Brands, for Creative Minds Jam #1: Hong Kong.

## Business model — read this before designing anything

**Kith is not a hosted multi-tenant SaaS. It's a capability a creator adds to their own
Mind.** This isn't a branding choice, it's a real platform constraint: Minds can only be
created through the Minds console, there is no API to provision one programmatically. We
cannot spin up a new Mind per signup, which rules out "sign up → connect your Discord → get
your dashboard" as something buildable in this timeframe, or possibly at all without the
platform adding that API.

So the product story is: **install Kith on your own Mind** (the real mechanism for this —
publishing as an equippable Bazaar Skill — isn't built yet, and doesn't need to be for the
hackathon; the landing page tells this as the vision, not as a live flow). What we actually
demo is **one real, live Kith Mind**, showing exactly what it does.

**Consequence for pages: no real login, no signup, no multi-tenant account system.** A
"Get Kith" CTA on the landing page can capture an email for a waitlist (cheap, optional,
static form is fine) but must not imply an account gets created or a Mind gets provisioned —
that would be a promise the product can't keep yet.

## What "meh" meant, and what to keep

The current UI (still in the repo — `public/`, `src/server.ts`) is functionally correct and
already handles the hard parts (live Mind calls, cost gating, a pronoun-safety guard that
already caught a real bug on its first live test) but looks like an unstyled prototype, not
a product. **The design direction underneath it was intentional and should carry forward,
just executed properly:**

- Warm parchment background, ink (not pure black) text, one confident warm accent —
  amber/terracotta. Not blue, not purple, not cyan, not dark-mode-SaaS-default. Content
  creators — the actual audience — see through generic AI-tool aesthetics instantly.
- A humanist/serif touch on names and headlines, clean sans for data and timestamps.
- A small "presence" pulse — the product notices people warmly, it doesn't surveil them.
- Motion stays fast (under ~250ms). Nothing may cost filming time — this still needs to be
  screen-recordable for a 1:50 demo video.
- Product-voiced copy, not generic SaaS copy. An empty watchlist says *"All quiet — nobody
  needs you right now,"* not *"No data available."*

Full detail: `public/styles.css`'s header comment and `docs/` evidence files if useful
context on *why* specific decisions were made.

---

## Sitemap

```
/                    Landing — the pitch, the vision, CTA into the live demo
/demo                The live product — dashboard + Compare (Beat A)
/demo/feed           Live Feed — autonomy proof (Beat B)
/how-it-works         (optional, high value for judges) — the mechanism, in plain language
```

No auth anywhere. `/demo` and `/demo/feed` are public — that's deliberate, it's the whole
demo.

---

## Page 1 — Landing (`/`)

**Purpose:** the pitch, in under a minute of reading. This is what a judge or a curious
creator sees first, and it has to make the "why does this need memory" argument before they
ever touch the live demo.

**Sections, in order:**

1. **Hero.** Headline + one-line subhead. Something in the register already established:
   *"A Mind that remembers every member of your community, and tells you what you can't see
   anymore."* One clean visual — a single member card with the presence pulse works better
   than a generic hero illustration.

2. **The problem.** The existing narrative, condensed: past a few hundred people you lose
   the ability to read everything. Nobody notices a regular drifting, or a newcomer who
   never got a reply. Real content exists in `README.md`'s "The problem" section — reuse the
   actual copy, don't rewrite it from scratch.

3. **The proof — a static, illustrative version of Beat A.** Side by side: a generic
   memoryless answer vs. a real Kith answer naming someone with reasoning. This can be a
   frozen, hand-picked example on the landing page (illustrative, labelled as such) — the
   *live*, real version lives on `/demo`. Don't fake the labelling; say "example output"
   plainly.

4. **How it works — three properties.** Memory / Continuity / Autonomous follow-up — these
   map directly to the jam's own requirements, which is not a coincidence, and stating them
   this plainly is itself part of the pitch.

5. **Live demo CTA.** Primary button → `/demo`. This is the important CTA — a working
   product, not a screenshot.

6. **"Add Kith to your Mind" — the vision, told honestly as not-yet-live.** A short section:
   Kith today is one live Mind; the path to scale is publishing it as an equippable Skill on
   the Minds Bazaar, so any creator's own Mind can become a Kith. Optional email capture
   ("hear when this ships") — static form, no real backend needed, or a `mailto:` link is
   genuinely fine for a hackathon.

7. **Footer.** Built on Minds by Animoca Brands · link to the GitHub repo (judges will want
   this) · track/jam attribution.

**Nothing on this page makes a live API call.** It's pure static content plus the one CTA
button.

---

## Page 2 — Demo dashboard (`/demo`) — Beat A

**Purpose:** the actual product, live. This is the page the demo video's Beat A gets
recorded against.

**Layout — two zones:**

**A. Who Kith is holding in mind** (the watchlist)
- List of currently-flagged members, each with the presence-pulse dot and their signal
  tags (e.g. "contribution, gap-drift, tone-shift").
- Empty state: *"All quiet — nobody needs you right now."*
- Data: `GET /api/watchlist` (free, local, no live cost).

**B. The comparison** (the split panel — this is Beat A itself)
- Left panel, labelled **"Same model. Memory disabled."** — a hand-authored, honestly
  labelled baseline answer. Data: `GET /api/baseline` (free).
- Right panel, labelled **"Kith — reading the community it remembers."** — the cached live
  answer. Data: `GET /api/live-answer` (free — reads a cache, does not itself call the
  Mind).
- A **"Receipts"** expandable section under the right panel: the timestamped evidence the
  answer draws on. Data: `GET /api/briefing`, use `cases[0].evidence` (free).
- A gated **"Ask Kith live"** button: confirms with the user first ("this spends real
  cognition"), then calls `POST /api/live-answer/refresh` with `{ confirm: true }`. This is
  the **one call in the entire product that costs money** — do not call it automatically,
  do not call it on page load, do not poll it. One click, one spend, confirmed.
- **Pronoun safety guard — keep this, it already caught a real bug.** Before displaying the
  cached answer, check it against `/\b(he|him|his|she|her|hers)\b/i`. If it matches, show a
  visible warning instead of the answer — a gendered pronoun means the cached answer is
  stale/bad and must not be used on camera. See
  `docs/evidence/2026-08-17-pronoun-guard-caught-a-real-case.md` for why this exists and
  proof it's not theoretical.

**Persistent header/budget strip** (visible on both `/demo` pages): `GET /api/budget` — how
many live calls have been made this session and the running cognition spend. Keep this
visible always; it's honest about cost, which is part of the pitch (see `/how-it-works`).

---

## Page 3 — Live Feed (`/demo/feed`) — Beat B

**Purpose:** proves autonomy — Kith says something with no human prompting it in that
moment.

- Shows the fixed conversation the demo watches (`GET /api/session` → `{ alias,
  restartAt }`). This alias must never be user-editable in the UI — it's fixed on purpose,
  see `src/demo-session.ts`'s comment for why (an editable alias field is exactly how an old,
  contaminated test conversation could get reopened on camera).
- **"Mark restart now"** button → `POST /api/session/mark-restart`. Used once, right before
  the actual filmed restart of the Kith process — it's the timestamp everything after it
  gets checked against.
- **"Check for new messages"** button → `GET /api/live-feed` (free — a read, not a send).
  Manual only. **No auto-refresh, no polling interval, anywhere on this page.**
- Message list: human messages on one visual track, Kith's on another. Any Kith message
  timestamped after `restartAt` **with no human message between the restart and it** gets a
  visible **"unprompted"** badge — that badge, on a real message with a real timestamp, is
  the entire proof this page exists to show.

---

## Page 4 — How It Works (`/how-it-works`) — optional, but cheap and valuable

A judge-facing, plain-language version of the mechanism and its honesty commitments.
Source material already exists — this page is presentation, not new writing:

- Why memory has to be personal, not a global threshold (the Maya/Priya contrast:
  same-length silence, opposite conclusions, because the baseline is individual).
- The four things it watches for (contribution, going quiet relative to their own rhythm,
  tone shortening, newcomers nobody answered) — from `docs/perception-spec.md`.
- **The cost is real and shown, not hidden** — link/reference the cognition-leak finding
  (`docs/evidence/2026-08-16-cognition-leak.md`): an always-on Mind has a genuine running
  cost, we found a real leak, fixed it, and that's part of the viability story, not a
  footnote.
- **Current data disclosure** — plainly state whether the live demo is running on the
  synthetic fixture or real (consented) community history at time of viewing. Read this
  from `README.md`'s "Data and consent" section, which is the single source of truth and
  changes if/when real data lands — don't hardcode a claim here that could go stale.

---

## API contract (already built, in `src/server.ts` — reuse, don't reimplement)

All free unless marked otherwise.

| Route | Method | Returns |
|---|---|---|
| `/api/registry` | GET | full member registry (`Registry` type, `src/registry.ts`) |
| `/api/watchlist` | GET | `{ watching: [...], signals, quiet }` — who's currently flagged |
| `/api/briefing` | GET | `{ cases: [{ headline, member, signals, evidence }] }` |
| `/api/baseline` | GET | `{ question, answer, source, note }` — the static left panel |
| `/api/live-answer` | GET | cached right-panel answer, or a "not captured yet" placeholder |
| `/api/live-answer/refresh` | **POST**, **spends cognition** | body `{ confirm: true }` required; returns the fresh answer, also writes the cache |
| `/api/session` | GET | `{ alias, restartAt }` |
| `/api/session/mark-restart` | POST | sets `restartAt` to now |
| `/api/live-feed` | GET | `{ alias, restartAt, messages: [...] }` for the fixed session alias |
| `/api/budget` | GET | `{ liveCallCount, totalSpent, entries }` |

Run it with `npm run web` (`http://localhost:3131` by default). If the new frontend is built
separately (e.g. a proper framework/build step), point it at this server rather than
re-implementing the Minds integration — `src/minds-client.ts` is where the two real,
paid-for bugs got fixed (a Windows-safe CLI fallback for sending, and the credits endpoint's
actual field name), and re-deriving those would cost real cognition again for no benefit.

---

## Explicit non-goals — do not build these

- **Real user accounts, login, or signup.** No Mind-provisioning API exists to back this.
- **Multi-tenant "connect your community" onboarding.** Same reason.
- **Billing/payment UI.** Kith's optional payout layer is a creator-facing feature of the
  *product*, off by default, unrelated to *us* charging *anyone* — don't conflate the two.
- **A real waitlist backend.** A static form or `mailto:` is sufficient.
- **Auto-refreshing or polling any live-Mind route**, anywhere, ever. Every live call is a
  deliberate, confirmed, user-initiated spend.
