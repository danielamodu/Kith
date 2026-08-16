/**
 * Generates a synthetic Telegram export with the shape of a real creator community.
 *
 * This is NOT for the demo — the demo needs real history with real people. It exists
 * so the detectors can be built and verified before real data arrives, and so we have
 * a regression fixture afterwards.
 *
 * The important property: it contains the *discriminating case*. Two members go quiet
 * for exactly the same number of days, and only one of them is a signal. If a detector
 * fires on both, it is using a global threshold and is wrong.
 *
 * Run: node src/fixture.ts
 */
import { writeFile, mkdir } from "node:fs/promises";
import type { RawMessage } from "./types.ts";

const DAY = 1000 * 60 * 60 * 24;
const HOUR = 1000 * 60 * 60;

/** Deterministic PRNG so the fixture is reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const rnd = makeRng(20260816);

const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const jitter = (base: number, spread: number) => base + (rnd() - 0.5) * 2 * spread;

type Persona = {
  name: string;
  /** average hours between posts */
  rhythmHours: number;
  /** how irregular they are, as a fraction of rhythm */
  irregularity: number;
  joinsDaysAgo: number;
  /** stops posting this many days before "now" */
  goesQuietDaysAgo?: number;
  /** answers other people's questions this often (0..1 of their messages) */
  helpfulness: number;
  /** typical message length */
  lengthChars: number;
  /** if set, last messages shrink toward this fraction of normal length */
  taperTo?: number;
};

const NOW = new Date("2026-08-16T12:00:00Z").getTime();
const WINDOW_DAYS = 90;

const personas: Persona[] = [
  // ── the signal: high contributor, steady rhythm, recently quiet, tapering ──
  {
    name: "Maya Okonkwo",
    rhythmHours: 8,
    irregularity: 0.3,
    joinsDaysAgo: 88,
    goesQuietDaysAgo: 9,
    helpfulness: 0.55,
    lengthChars: 180,
    taperTo: 0.25,
  },
  // ── the control: same 9-day silence, but that IS her rhythm. Must NOT fire ──
  {
    name: "Priya Anand",
    rhythmHours: 24 * 30,
    irregularity: 0.4,
    joinsDaysAgo: 85,
    goesQuietDaysAgo: 9,
    helpfulness: 0.15,
    lengthChars: 140,
  },
  // ── high volume, zero contribution. Active, but not a check-in situation ──
  {
    name: "Dev Raman",
    rhythmHours: 0.6,
    irregularity: 0.8,
    joinsDaysAgo: 89,
    helpfulness: 0.0,
    lengthChars: 12,
  },
  // ── a second genuine contributor, still active — Maya should rank above him ──
  {
    name: "Tomas Lindqvist",
    rhythmHours: 14,
    irregularity: 0.5,
    joinsDaysAgo: 80,
    helpfulness: 0.4,
    lengthChars: 150,
  },
  // ── someone who left properly. Farewell must suppress the drift signal ──
  {
    name: "Rin Watanabe",
    rhythmHours: 20,
    irregularity: 0.4,
    joinsDaysAgo: 75,
    goesQuietDaysAgo: 21,
    helpfulness: 0.2,
    lengthChars: 120,
  },
  // ── background regulars ──
  { name: "Sam Ojo", rhythmHours: 30, irregularity: 0.6, joinsDaysAgo: 70, helpfulness: 0.2, lengthChars: 90 },
  { name: "Lena Fischer", rhythmHours: 40, irregularity: 0.7, joinsDaysAgo: 60, helpfulness: 0.25, lengthChars: 110 },
  { name: "Arun Pillai", rhythmHours: 55, irregularity: 0.5, joinsDaysAgo: 52, helpfulness: 0.1, lengthChars: 75 },
  // ── newcomers: some get answered, some are ignored (D4) ──
  { name: "Chloe Baptiste", rhythmHours: 36, irregularity: 0.5, joinsDaysAgo: 11, helpfulness: 0.05, lengthChars: 95 },
  { name: "Yusuf Demir", rhythmHours: 48, irregularity: 0.5, joinsDaysAgo: 6, helpfulness: 0.0, lengthChars: 85 },
  { name: "Nora Haddad", rhythmHours: 60, irregularity: 0.5, joinsDaysAgo: 4, helpfulness: 0.0, lengthChars: 70 },
];

const QUESTIONS = [
  "has anyone got the link to last week's session?",
  "how do you all handle scheduling across timezones?",
  "what tool is everyone using for thumbnails these days?",
  "is there a channel for feedback on drafts?",
  "quick q - does the sponsor deck template still exist somewhere?",
  "anyone else getting weird analytics numbers this week?",
];
const ANSWERS = [
  "yep, it's pinned in the resources section - let me know if it doesn't load for you",
  "I use a shared calendar with everyone's zone set, happy to walk you through it",
  "been using the same one for months, honestly the free tier is fine until you scale",
  "there is, though it's quiet - post in the main one and people will pick it up",
  "yes but it moved. I'll dig out the new link and send it over",
];
const CHATTER = [
  "morning all",
  "this is great",
  "🔥",
  "agreed",
  "same here honestly",
  "posting the recap later today",
  "nice one",
  "that tracks",
];

function textFor(persona: Persona, kind: "q" | "a" | "c", targetLen: number): string {
  const base = kind === "q" ? pick(QUESTIONS) : kind === "a" ? pick(ANSWERS) : pick(CHATTER);
  if (base.length >= targetLen) return base.slice(0, Math.max(4, targetLen));
  // pad naturally toward the persona's typical length
  const filler = " " + pick([
    "worth noting for anyone else hitting this.",
    "happy to go into more detail if useful.",
    "we ran into the same thing a while back.",
    "let me know how you get on.",
  ]);
  let out = base;
  while (out.length < targetLen) out += filler;
  return out.slice(0, targetLen);
}

type Planned = { ts: number; persona: Persona; kind: "q" | "a" | "c"; len: number };

const planned: Planned[] = [];

for (const p of personas) {
  const start = NOW - p.joinsDaysAgo * DAY;
  const end = NOW - (p.goesQuietDaysAgo ?? 0) * DAY;
  let t = start + rnd() * p.rhythmHours * HOUR;
  const stamps: number[] = [];
  while (t < end) {
    stamps.push(t);
    const step = Math.max(0.2, jitter(p.rhythmHours, p.rhythmHours * p.irregularity));
    t += step * HOUR;
  }
  stamps.forEach((ts, i) => {
    // taper the final messages if this persona is winding down
    let len = Math.max(3, Math.round(jitter(p.lengthChars, p.lengthChars * 0.25)));
    if (p.taperTo) {
      const fromEnd = stamps.length - 1 - i;
      if (fromEnd < 3) len = Math.round(p.lengthChars * p.taperTo * (1 + fromEnd * 0.15));
    }
    const kind: "q" | "a" | "c" = rnd() < p.helpfulness ? "a" : rnd() < 0.18 ? "q" : "c";
    planned.push({ ts, persona: p, kind, len });
  });
}

planned.sort((a, b) => a.ts - b.ts);

// ---- emit as a Telegram export ----

const messages: RawMessage[] = [];
let nextId = 1000;

// join events first
const joins = personas
  .map((p) => ({ p, ts: NOW - p.joinsDaysAgo * DAY }))
  .sort((a, b) => a.ts - b.ts);
for (const j of joins) {
  messages.push({
    id: nextId++,
    type: "service",
    date: new Date(j.ts).toISOString().slice(0, 19),
    date_unixtime: String(Math.floor(j.ts / 1000)),
    actor: j.p.name,
    actor_id: `user${1000 + personas.indexOf(j.p)}`,
    action: "join_group_by_link",
  });
}

/** open questions available to be answered, as (id, askerName, ts) */
const openQuestions: Array<{ id: number; asker: string; ts: number }> = [];

for (const item of planned) {
  const id = nextId++;
  const authorId = `user${1000 + personas.indexOf(item.persona)}`;
  const iso = new Date(item.ts).toISOString().slice(0, 19);

  let replyTo: number | undefined;
  let kind = item.kind;

  if (kind === "a") {
    // answer the most recent open question that isn't your own and is < 48h old
    const idx = [...openQuestions]
      .reverse()
      .find((q) => q.asker !== item.persona.name && item.ts - q.ts < 2 * DAY);
    if (idx) {
      replyTo = idx.id;
      const at = openQuestions.findIndex((q) => q.id === idx.id);
      if (at >= 0) openQuestions.splice(at, 1);
    } else {
      kind = "c"; // nothing to answer, so it's just chatter
    }
  }

  const text = textFor(item.persona, kind, item.len);
  messages.push({
    id,
    type: "message",
    date: iso,
    date_unixtime: String(Math.floor(item.ts / 1000)),
    from: item.persona.name,
    from_id: authorId,
    text,
    ...(replyTo ? { reply_to_message_id: replyTo } : {}),
  });

  if (kind === "q") openQuestions.push({ id, asker: item.persona.name, ts: item.ts });
}

// Rin leaves properly — farewell must suppress her drift signal
const rin = personas.find((p) => p.name === "Rin Watanabe")!;
messages.push({
  id: nextId++,
  type: "message",
  date: new Date(NOW - 21 * DAY).toISOString().slice(0, 19),
  date_unixtime: String(Math.floor((NOW - 21 * DAY) / 1000)),
  from: rin.name,
  from_id: `user${1000 + personas.indexOf(rin)}`,
  text: "been great everyone but I'm leaving the group - moving on to other things. goodbye!",
});

messages.sort(
  (a, b) => Number(a.date_unixtime ?? 0) - Number(b.date_unixtime ?? 0),
);

const out = {
  name: "Creator Circle (synthetic)",
  type: "private_supergroup",
  id: 1234567890,
  messages,
};

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const path = new URL("../data/dev-export.json", import.meta.url);
await writeFile(path, JSON.stringify(out, null, 2), "utf8");

console.log(
  `wrote ${messages.length} messages across ${personas.length} members ` +
    `over ${WINDOW_DAYS} days -> data/dev-export.json`,
);
