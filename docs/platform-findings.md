# Minds platform findings

Gathered 16 Aug 2026 from the public docs and the Bazaar catalog (`minds bazaar` needs no API
key). **Not yet confirmed hands-on** — the empirical tests still need a Builder API key.

---

## Stack

- **Node 22+** (we have 24.12), TypeScript
- `@animocabrands/minds-cli` v0.1.3 — installed globally
- `@animocabrands/minds-client-lib` — auth via `MINDS_BUILDER_API_KEY`, header `X-Api-Key`
- Builder API base: `/v1/...`

## The Builder API is not the whole platform

The Builder REST surface is narrow — Minds, Skills/Apps equip, Circles, Cognition, Messaging,
Events. **No memory, trigger, or integration endpoints.** Reading only that would suggest the
platform can't do what Kith needs.

It can. The capability lives **inside the Mind**, exposed as internal tools that Skills invoke.
The Bazaar reveals the real primitive names:

| Primitive | What it appears to do |
|---|---|
| `CIRCLE_Update` | Write facts to a **per-person profile** in the Mind's circle |
| `TENET_Update` | Write/revise the Mind's operating principles |
| `CONTEXT_Read`, `STATE_Read`, `DNA_Read` | Read internal state |
| `HTTP_Execute` | Arbitrary outbound HTTP — how Skills reach external APIs |
| `CONVERSATION_SendMessage` | Send into a conversation |
| `REGISTRY_Query` | Look up other Minds |
| LTM / WORK / Artifacts | Long-term memory, work log, stored files |

**Skills are the extension mechanism** — natural-language procedures that call these tools.
285 apps and thousands of skills exist in the Bazaar.

---

## Validation results

### 1. Per-member addressable memory — **PARTIAL / needs rework**

> **Correction (16 Aug, after CLI inspection).** I initially read Circle as "the people a Mind
> remembers." The CLI says otherwise:
>
> > `minds circle` — "Mind circle — list and manage human **collaborators** (not other Minds)"
> > `minds circle add` — "Add collaborators to a Mind circle (**human emails** are the
> > documented workflow)"
>
> Circle looks like an **access/collaboration list keyed by email**, not an open registry of
> remembered people. We cannot put 500 Telegram members in it — we don't have their emails, and
> they should not have access to the Mind.
>
> **The likely correct mapping — and it's cleaner:**
> - **Circle = who the Mind talks to** → the creator, plus any mods. A handful of people.
> - **Community members = what the Mind knows about** → stored in **LTM / Artifacts**, not Circle.
>
> Those are different things and I conflated them. The Bazaar references to "circle profiles"
> are then profiles of that small collaborator set, which is consistent with the personal-
> assistant framing of the whole platform.
>
> **Fallback if confirmed:** per-member facts live in long-term memory or an Artifact-based
> registry the Mind reads and writes. Bazaar evidence both exist — *Self-Improving Agent*
> promotes learnings "into Tenets, **LTM**, or draft Skill artifacts"; *Telegram Voice Skill*
> "stores it as an internal **Artifact**."
>
> **Unresolved until a Mind exists.** This is the top open risk and it is the thing that could
> force a day-2 redesign. Everything below was written before this correction.

**Circle as originally read.** Evidence from the Bazaar:

> *Circle_Profile_Updater* — "Updates Circle member profiles whenever new facts,
> relationships, or preferences are learned. Use when learning a new fact about someone."

> *Moca_Memory_Manager* (146 equips) — "Automatically updates `CIRCLE_Update` and
> `TENET_Update` based on the user's conversational inputs without announcing the updates."

A Mind maintains a **circle of humans, each with an accumulating profile of facts**. That is
Kith's per-member memory, native, no custom store required.

There is also a real memory lifecycle:

> *Minds REM and Memory Gardening Consolidation Skill* — "review recent activity, classify
> durable signal vs transient noise, reinforce or promote important memories, merge
> duplicates, demote or archive low-value memory, surface uncertainty and drift."

### 2. Autonomous action — **PASS, natively**

The platform runs Minds on **cadence cycles** without human prompting.

> *Passive_Autonomous_V2_Updated* — "lets your Mind run independently on a regular cadence in
> the current thread **while staying quiet unless you explicitly address it**."

That second clause is our "silence is a feature" design principle, already a platform mode.

Also: `Credit_Saver_Mode` "adjusts cycle cadence"; `Assistant_Downtime_Maintenance` "use
cadence cycles productively"; recurring schedules are "created by the higher-level automation
system that calls this skill on the desired cadence."

### 3. Telegram — **PASS**

> *Telegram_Managed_Bots_Setup* — "Configure a Telegram managed bot directly via the official
> Telegram Bot API using `HTTP_Execute`, allowing a Mind to validate a bot token, choose
> **webhook or polling** delivery, and initialize the bot safely without exposing secrets to
> long-term storage."

Bot API access means group messages are reachable (subject to Telegram's bot privacy mode,
which the bot owner can disable). 35 Telegram skills exist; the integration tutorial has 234
equips, so this is a well-trodden path.

**Still to confirm hands-on:** group privacy mode behaviour, and whether history from *before*
the bot joined is retrievable (Telegram's Bot API generally does not allow this — backfill may
have to come from a Desktop JSON export, as planned).

### 4. Wallet — **available**, still optional for us

Not in the Builder API, but present as skills: `Wallet_Manager`, `Gas_Replenishment`, and
`Sovereign_Starter_Pack_v1` which "creates/anchors a native Web3 wallet." Payment apps exist
(Clink Payments, VISA Clink, AgentCard virtual Visa). Remains off by default per the design.

---

## Consequences for Kith

**Far more of the product can live inside the Mind than assumed.** The original plan had us
building ingestion, per-member state, and scheduling ourselves. The platform provides:

| Kith component | Now provided by |
|---|---|
| Per-member memory | **Circle profiles** (`CIRCLE_Update`) |
| Learned community norms | **Tenets** (`TENET_Update`) |
| Autonomous follow-up | **Cadence cycles** / Passive Autonomous mode |
| Telegram ingestion | **`HTTP_Execute`** + Telegram Bot API |
| Memory hygiene over months | **REM / memory gardening** |

This is very strong for Minds Integration Depth — the heaviest judging criterion. Kith
becomes a purpose-built configuration of native primitives rather than a system that merely
talks to one.

### The new risk, and it is real

If the platform does this much, **is Kith "just a set of skill prompts"?** That could hurt
Execution & Completeness, and it lowers the barrier for competitors using the same primitives.

Where genuine engineering remains, and where our differentiation now lives:

1. **The detectors (D1–D4).** Baseline-relative statistics over message history — contribution
   weighting, gap-vs-personal-rhythm, length deviation, community response windows. The
   platform gives memory, not judgement about behaviour over time. This is ours.
2. **Backfill.** Loading months of Telegram export into Circle profiles without burning
   cognition credits. Distillation is a real engineering problem (see below).
3. **The baseline harness.** Memory-disabled comparison for the demo.
4. **Composition.** Deciding when signals amount to something worth telling a creator, and
   when to stay silent.

### Cognition credits are a hard constraint

Credits are metered (`minds cognition balance`, `usage by-tool`), the jam awards "cognition
boosts," and `Credit_Saver_Mode` exists for when credits run low. **We cannot pipe raw
Telegram traffic into the Mind.** Distil locally with cheap deterministic code, then write
observations via `CIRCLE_Update`. Cost and architecture point the same way.

---

## Naming — resolved

**"Steward" is reserved platform vocabulary.** The Circles guide states the Mind's
**Steward** (creator/owner) is "always present, non-removable," and `Credit_Saver_Mode` refers
to "when cognition credits are low and the steward is unresponsive."

Naming our product Steward would have made every judge read it as the platform's own word for
the user. **Renamed to Kith** (16 Aug) — Old English for the familiar people around you, which
is precisely what the product tracks. No collision with Minds vocabulary (Mind, Circle, Tenet,
Steward, Skill, App, Artifact, Bazaar, Pulse, Cadence, Registry).

*Note for the submission copy:* the creator who owns the Kith Mind **is** its Steward in
platform terms. Use that word deliberately and correctly rather than avoiding it.

---

## Hands-on results — 16 Aug 2026

Mind created: `f3494b3e-f36b-1410-8466-00039ce7df11`, name **Kith**, species `moca`,
model `minimax/minimax-m3`.

| Property | Value |
|---|---|
| Email | `kith@hellominds.ai` — the Mind is reachable by email out of the box |
| Wallet | `0xfA4FDd254Ab00c76B0222Fbc5FCd15A5C412AaBD` on **Base** |
| Telegram | `telegramBotId: null` — **not yet configured**, must be set up |
| Circle | Steward only (the creator), `isSteward: true` |
| Auto-equipped skills | `Mastermind_Companion`, `Mastermind_Dormancy_Resync` (archetype defaults) |

### Memory is Mind-global — **PASS, proven**

Planted in conversation `memtest-a`:
> "a member named Maya Okonkwo answered exactly 31 newcomer questions during June 2026. Her
> normal posting rhythm is about 3 messages per day."

Asked from `memtest-b`, a separate conversation created afterward:
> **"31 newcomer questions in June 2026, and her normal rhythm is about 3 messages a day."**

**Memory crosses conversation boundaries.** We do not need to build per-member storage —
facts written to the Mind are recallable from anywhere. This resolves the top open risk and
confirms the architecture.

**Caveat not yet tested:** the reply said *"that's what you shared a moment ago,"* which proves
cross-conversation recall but **not months-scale durability**. Given `History_Rotation_7D`
archives messages older than 7 days, whether a fact from eight weeks ago is still recallable
is a separate question — and it is precisely what Kith depends on. **Test this next.**

### Cognition is the binding constraint

| | |
|---|---|
| Starting balance | 200.15 |
| After 2 message exchanges | 195.26 |
| **Burn** | **~2.4 cognition per exchange** |
| **Remaining runway** | **~80 exchanges** |

This is tight, and cadence cycles will burn credits too — an autonomous Mind costs money while
idle. Consequences:

1. **Apply for the jam's cognition boost immediately.** The brief offers one, "one agent per
   team/applicant." This is now urgent rather than optional.
2. **Never pipe raw Telegram traffic into the Mind.** Distil locally, write only observations.
3. **Budget test cycles.** At ~80 exchanges, careless iteration burns the project.
4. Watch cadence cycle cost once autonomy is enabled — measure before leaving it running.

---

## Still to confirm hands-on

- Is Circle memory queryable *across* members? ("who is struggling?" needs cross-member
  reasoning, not just per-profile recall)
- Can Circle hold hundreds of members, or is it designed for a handful of close contacts?
  **This is the biggest open risk** — a circle sized for personal contacts may not scale to a
  community.
- Cadence cycle frequency, and whether it is configurable
- Credit cost per cycle and per `CIRCLE_Update`
- Whether `minds circle` (Builder API) exposes the same circle the skills write to
