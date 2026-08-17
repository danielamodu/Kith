# Evidence — the UI's pronoun guard caught a real regression, on real output

**Date:** 17 Aug 2026 · **Context:** first live-answer capture through the new web UI

---

## What happened

The Compare view's right panel renders a client-side last-line-of-defense: if the cached
live answer text matches a gendered-pronoun regex, show a visible warning banner instead of
silently displaying it (`public/app.js`, `GENDERED` regex). This was built as a defensive
measure on top of the structural fix already proven in `docs/architecture.md` — carrying
`pronouns: "they/them (not stated)"` as data on every registry entry, because a tenet alone
didn't reliably hold.

The very first real answer loaded into the cache **tripped the guard for real:**

> *"Lena Fischer (23.3h gap fits **her** 42.1h rhythm)"*

Everything else in the same multi-paragraph answer — the primary subject, Maya Okonkwo —
correctly used "they/them" throughout. The slip was specifically on an **incidental,
secondary mention** of a different member, deeper in the answer.

## What this means

**The structural fix protects the primary subject of an answer more reliably than people
mentioned in passing.** The registry's `pronouns` field is present for every member, Lena
included — so the data was correct and available. The Mind still used "her" when casually
referencing her in the middle of reasoning about someone else. This suggests the model's
attention to the structural field weakens for people who aren't the answer's main focus,
which is a real, specific finding, not a contradiction of the earlier fix (that fix still
holds for the case it was proven against — the primary subject).

## Why this is good news, not just a bug

The whole point of building the guard into the UI rather than trusting the fix to be
complete was exactly this: **assume a regression will eventually slip through, and catch it
mechanically rather than rely on remembering to check by hand before every take.** It worked
on the very first real answer. The demo script's own production rule — *"if a take comes
back with 'she' or 'he,' it is not usable footage"* — is now enforced by software, not just
by a checklist item a tired person might skip at hour 30.

## Consequence

- This cached answer is marked unusable for filming (see the `note` field in
  `data/last-live-answer.json`) — for that reason and separately because it also carries a
  duplicate-question preamble from same-day debugging.
- Before filming, a fresh capture must pass the guard cleanly with no banner. If a fresh
  capture *also* trips it, that's a stronger signal the underlying model behaviour — not
  this one instance — needs another look, possibly extending the structural fix to
  explicitly restate every mentioned member's pronoun inline in the prompt data, not just
  the primary subject's.
