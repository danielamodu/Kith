/**
 * Inspect a Telegram export: what did we parse, and what does each member's
 * own baseline look like?
 *
 * Run: node src/cli-ingest.ts [path]
 */
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";

// fileURLToPath, not URL.pathname — the latter yields "/C:/..." on Windows.
const path =
  process.argv[2] ??
  fileURLToPath(new URL("../data/dev-export.json", import.meta.url));

const community = await loadExport(path);
const states = buildMemberStates(community);

const fmt = (n: number, d = 1) => n.toFixed(d);
const days = (h: number) => `${(h / 24).toFixed(1)}d`;

console.log(`\n${community.name}`);
console.log(
  `${community.messages.length} messages · ${states.size} members · ` +
    `${community.from.toISOString().slice(0, 10)} → ${community.to.toISOString().slice(0, 10)}\n`,
);

const rows = [...states.values()].sort((a, b) => b.messageCount - a.messageCount);

const head = [
  "member".padEnd(18),
  "msgs".padStart(5),
  "rhythm".padStart(8),
  "spread".padStart(8),
  "quiet for".padStart(10),
  "×rhythm".padStart(8),
  "len".padStart(5),
  "recent".padStart(7),
  "answ".padStart(5),
  "→new".padStart(5),
  "bye".padStart(4),
].join(" ");
console.log(head);
console.log("-".repeat(head.length));

for (const s of rows) {
  // how many times their own normal gap is the current silence?
  const ratio = s.medianGapHours > 0 ? s.currentGapHours / s.medianGapHours : 0;
  console.log(
    [
      s.name.padEnd(18),
      String(s.messageCount).padStart(5),
      days(s.medianGapHours).padStart(8),
      days(s.gapMadHours).padStart(8),
      days(s.currentGapHours).padStart(10),
      fmt(ratio, 1).padStart(8),
      String(Math.round(s.medianLength)).padStart(5),
      String(Math.round(s.recentMedianLength)).padStart(7),
      String(s.answersGiven).padStart(5),
      String(s.answersToNewcomers).padStart(5),
      (s.saidFarewell ? "yes" : "").padStart(4),
    ].join(" "),
  );
}
console.log();
