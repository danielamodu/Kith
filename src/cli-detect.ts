/**
 * Run the detectors over an export and show what Kith would actually say.
 *
 * Run: node src/cli-detect.ts [path]
 */
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";
import { runAll } from "./detectors.ts";
import { MessageStore } from "./store.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// --store reads the accumulated store (backfill + live merged); otherwise a
// single export file, which is the fast path while iterating on a fixture.
const useStore = process.argv.includes("--store");
const path =
  process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) ??
  root("data/dev-export.json");

const community = useStore
  ? await new MessageStore(
      root("data/store.jsonl"),
      root("data/store-state.json"),
    ).toCommunity(
      (await new MessageStore(root("data/store.jsonl"), root("data/store-state.json")).readState())
        .chatTitle ?? "community",
    )
  : await loadExport(path);
const states = buildMemberStates(community);
const { observations, composites } = runAll(community, states);

console.log(`\n${community.name} — as of ${community.to.toISOString().slice(0, 10)}\n`);

console.log(`raw observations (${observations.length}):`);
for (const o of observations) {
  console.log(`  [${o.kind}] ${o.memberName}  conf=${o.confidence.toFixed(2)}`);
  console.log(`      ${o.claim}`);
}

console.log(`\n${"═".repeat(78)}`);
console.log(`WHAT KITH WOULD TELL THE CREATOR (${composites.length}):`);
console.log("═".repeat(78));

if (composites.length === 0) {
  console.log("\n  (nothing worth saying today — this is the common, correct case)\n");
}

for (const c of composites) {
  console.log(`\n▸ ${c.headline}\n`);
  console.log(`  weight ${c.weight.toFixed(2)} · composed from ${c.parts.length} signals`);
  for (const p of c.parts) {
    console.log(`\n  · ${p.claim}`);
    console.log(`    baseline: ${p.baseline}`);
    for (const e of p.evidence) {
      console.log(`    ${e.at.toISOString().slice(0, 16).replace("T", " ")}  ${e.fact}`);
    }
  }
  console.log();
}
