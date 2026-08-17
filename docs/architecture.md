# Kith — architecture

Settled 16 Aug 2026 from hands-on testing, not assumption. See
`docs/evidence/2026-08-16-baseline-reasoning-test.md` and `docs/platform-findings.md`.

---

## The governing division

> **We compute the facts. The Mind holds them and judges.**

Proven empirically: given structured facts ("~3 messages/day baseline, 9-day gap, 31 newcomer
answers"), the Mind produced correct baseline-relative judgement and correctly declined to
flag a member whose identical silence was normal *for her*. But it cannot count 31 answers
across ten thousand messages. That derivation is ours.

This division also satisfies the competition's integration rule: the brief permits any tools
or services provided the Mind is "integral to the operation." Memory and judgement stay in the
Mind; extraction and plumbing are ours.

---

## The Mind's memory layers

Kith described its own storage, and the distinction is load-bearing:

| Layer | Behaviour | We use it for |
|---|---|---|
| **Long-term tenets** | Durable. Survive cognition cycles, never summarised. Queryable on demand, **not** auto-loaded into context. | Kith's **operating principles** — the baseline-relative rule, when to speak, restraint. Small and stable. |
| **Artifacts** | Persistent, stable IDs, create/update/archive/read. Reads cost context tokens. Updates are overwrites. | The **member registry**. This is the durable per-person store. |
| **Stream entities** | The working layer for "facts about a person." **Explicitly transient.** | The current cycle's working set only. **Never rely on this.** |
| Conversation history | Recent visible; older archived (`History_Rotation_7D`). | Nothing durable. |

### The trap we avoided

Per-member facts land in **stream entities by default** — the transient layer. Kith confirmed
Maya/Dev/Priya were sitting there, unpromoted, and said plainly: *"whether the stream layer is
truly permanent… I genuinely don't know."*

A build that just tells the Mind about members and assumes it remembers would appear to work
for days and then quietly lose months of history. **That is the failure mode this architecture
exists to prevent**, and it would have been invisible until the demo.

### Why not tenets for members

Tenets are durable but have no query layer — finding "member X" among 500 means supplying the
key or scanning all of them. They are also the wrong semantic home: tenets are the Mind's
principles, and stuffing 500 people into them crowds out what that layer is for.

### Why not Circle

Settled definitively. `CIRCLE_Update` is for humans and Minds *formally in the circle* —
permission-holders added by email. Anonymous Telegram members do not fit that layer. Circle is
who Kith **talks to** (the creator, maybe mods); the registry is who Kith **knows about**.

---

## Storage design

**Tier 1 — index artifact** (read often, cheap)
Compact entry per member, ~200–400 chars: id, display name, joined, posting rhythm baseline,
contribution count, last seen, active flags.

**Tier 2 — detail artifacts** (read rarely)
Deep profile for members currently under active observation.

Start with Tier 1 only. Tier when reads get expensive.

**Known limits to design around:** artifact content has a finite cap (exact number unknown);
large reads consume context; no query layer — we parse JSON, not SQL; updates are atomic
overwrites, so any history requires separate snapshot artifacts.

---

## Components

### Ours

| Component | Job |
|---|---|
| **Ingest** | Telegram Desktop JSON export (backfill) + Bot API (live). Parse to a normalised message stream. |
| **Detectors D1–D4** | Per `docs/perception-spec.md`. Turn raw history into baseline-relative facts: contribution weighting, gap vs personal rhythm, length deviation, community response window. **All constants calibrated against real backfill, never chosen in advance.** |
| **Registry writer** | Compose detector output into the index artifact. Atomic overwrite. |
| **Baseline harness** | Memory-disabled comparison for the demo. |
| **Scheduler** | Only if cadence cycles prove insufficient. Plumbing, not judgement. |

### The Mind's

| Component | Job |
|---|---|
| **Judgement** | Compose signals into a claim worth a creator's attention — or stay silent. |
| **Registry memory** | Hold the artifact durably across months. |
| **Tenets** | Operating principles, including restraint. |
| **Cadence cycles** | Autonomous follow-up; digest delivery. |
| **Telegram** | `HTTP_Execute` + Bot API. `telegramBotId` currently `null` — needs setup. |

---

## Flow

```
Telegram export/live
        │
        ▼
   Ingest + normalise            ← ours
        │
        ▼
   Detectors D1–D4               ← ours (baseline-relative facts)
        │
        ▼
   Registry artifact  ──────────► held durably by the Mind
        │
        ▼
   Cadence cycle: Mind reads registry, composes, decides
        │
        ├── nothing worth saying → silence (the common, correct case)
        └── something composed   → message the creator, with evidence + timestamps
```

**Cost discipline:** never pipe raw Telegram traffic into the Mind. Measured burn is ~2–4
cognition per exchange; at ~180 remaining that is roughly 45 substantive exchanges for the rest
of the project. Distil locally, write observations only.

---

## Verified behaviours (16 Aug, hands-on)

- **Stream entities are keyed** as `community.member.<slug>` — e.g.
  `community.member.maya-okonkwo`. Useful convention to mirror in the registry.
- **Purge works and is verifiable.** Asking the Mind to discard members removed all three
  stream entities; a query from a *fresh conversation* confirmed "no records of any community
  members by name." Mind 1 is clean and usable as the demo Mind.
- **Tenets are readable** — the Mind listed `DURABILITY-PROBE-A` and its passphrase on request.
  An earlier reply showing an empty tenet bucket was a stale cycle snapshot, not a failed write.
- **Conversation history is immutable.** The Mind cannot redact sent messages. Fabricated names
  persist in old message records forever.
  → **Use fresh conversation aliases for the demo.** Never re-open `memtest-a` / `memtest-b`
  on camera.
- **The Mind builds a profile of its Steward.** It had already inferred "Community management;
  tracking member contributions to newcomers" from our conversation. Harmless, and arguably
  useful — but it means the creator's own context accumulates too.
- **Artifacts are not auto-created.** They must be explicitly made.

## Autonomy — live as of 16 Aug 14:16 UTC

`Passive_Autonomous_V2_Updated` equipped; passive autonomous mode activated in the
`daily-watch` thread with a standing instruction: read the registry each cadence cycle,
message the steward only if something composes, otherwise **say nothing**.

- **Cycle cost ≈ 2 cognition** (skill load + artifact read + config write + schedule).
- The Mind confirmed *"recurring tick scheduled"* and ran the check on activation,
  correctly surfacing Maya and dismissing every control case.
- **Cadence frequency is unknown.** At ~2 credits/cycle this is the difference between
  ~60 days of runway (daily) and ~2.5 days (hourly). **Measure by watching the balance
  fall while idle** — see open items.

### Registry v2 — driven by the Mind's own critique

On its first autonomous cycle the Mind flagged a real gap: *"the 'newcomers nobody replied
to' angle isn't directly readable from this registry."* It was right — D4 only reached the
briefing, never the artifact, so half the perception layer was invisible on exactly the
cycle where it mattered. Changes:

| Added | Why |
|---|---|
| `signals.unansweredNewcomers` | community-level signals have no home in a per-member table |
| `quietForH`, `quietRatio` | precomputed, so the Mind never does the arithmetic |
| `baselineReliable` | makes "cannot tell" explicit rather than inviting a guess |
| `generatedAt` as the reference instant | **all hour-counts measure to this, never to "today"** — a stale registry reasoned against the current date silently gets every gap wrong |

The discriminating case is now legible without inference: Maya `quietRatio 27.8,
baselineReliable true`; Priya `quietRatio 0.6, baselineReliable false`.

Cost of the richer schema: ~294 chars/member, up from ~200. At 500 members that is roughly
**45k tokens for a full read** — which the cadence cycle would pay on every tick.

### The watchlist — split by purpose, not by size

Tiering into index/detail was the obvious fix and it is the wrong one. The Mind does not
need 500 members every cycle to find the two that matter — **we already know which two,
because we computed them.**

| Artifact | Read when | Scales with |
|---|---|---|
| `kith-registry` | on demand, when someone asks about a specific person | members |
| `kith-watchlist` | **every cadence cycle** | **signals** |

The watchlist carries only members with a live signal, plus community-level signals, plus a
`quiet` flag for cycles where nothing composed. Members with no signal are deliberately
absent — **their absence is the message.**

Measured on the fixture: **308 tokens for the cycle read, against 45,818 projected for a
500-member registry.** A ~150× reduction on the read that repeats forever.

Two tests lock it: the watchlist must exclude every unsignalled member, and it must stay far
smaller than the registry. If that stops holding, the cost model is broken.

## Open items

1. **Durability over months — unproven.** `DURABILITY-PROBE-A` planted 16 Aug, passphrase
   `amber lighthouse seventeen`, committed to the tenet layer. **Re-query on days 3, 5 and 7.**
   Also plant a stream-entity-only probe to compare layer survival directly.
2. **Artifact size cap** unknown — measure before committing to a single-artifact design.
   Measured on the fixture: **~200 chars / ~54 tokens per member**, matching the design
   target. Extrapolating, 500 members ≈ 100 KB ≈ **27k tokens for a full read**, which is
   too expensive to read every cadence cycle. **Tiering (index + detail) becomes necessary
   somewhere in the low hundreds of members** — build the index/detail split before the
   real community lands, not after.
3. **Cadence cycle cost — measured, and worse than expected.** "Deactivating" autonomy
   stopped PAM specifically but not cadence cycles themselves, nor other equipped skills
   acting during them — including a system-default `Steward Conversion` skill that sent an
   unprompted payment solicitation once runway ran low. ~35.5 cognition spent on cycles and
   that message alone, over ~2 hours believed to be silent. Fixed via three committed
   covenants (ignore the low-runway beacon, no cadence-driven outbound without invitation,
   cadence pushed to the 7-day platform maximum). Full account:
   `docs/evidence/2026-08-16-cognition-leak.md`. **Both covenants must be explicitly lifted
   before filming Beat B**, which depends on genuine unprompted output — added to the
   pre-filming checklist.
4. **Test-data contamination.** This Mind now holds fabricated members (Maya Okonkwo, Dev
   Raman, Priya Anand). They must be purged before the demo, or the demo runs on a second
   Mind — otherwise Kith may cite a fictional member on camera. **Decide by day 3.**
5. **Telegram not configured** — `telegramBotId: null`.
