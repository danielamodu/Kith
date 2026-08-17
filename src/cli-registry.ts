/**
 * Build the three payloads that go to the Mind, and report their cost.
 *
 * Run: node src/cli-registry.ts [export-path]
 *      node src/cli-registry.ts --store       (real backfill + live traffic, merged)
 * Writes: data/registry.json, data/briefing.json, data/watchlist.json
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadExport } from "./ingest.ts";
import { buildMemberStates } from "./members.ts";
import { runAll, communityReplyNorm } from "./detectors.ts";
import { MessageStore } from "./store.ts";
import {
  buildRegistry,
  buildBriefing,
  buildWatchlist,
  estimateTokens,
} from "./registry.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// --store reads the accumulated store (backfill + live merged) — the real
// path for self-hosting; otherwise a single export file, the fast path for
// iterating on the fixture. Mirrors cli-detect.ts's flag exactly.
const useStore = process.argv.includes("--store");
const path =
  process.argv.find((a) => !a.startsWith("--") && a.endsWith(".json")) ??
  root("data/dev-export.json");

const community = useStore
  ? await new MessageStore(root("data/store.jsonl"), root("data/store-state.json")).toCommunity(
      (await new MessageStore(root("data/store.jsonl"), root("data/store-state.json")).readState())
        .chatTitle ?? "community",
    )
  : await loadExport(path);
const states = buildMemberStates(community);
const asOf = community.to;
const { observations, composites } = runAll(community, states, asOf);

const registry = buildRegistry(
  community,
  states,
  communityReplyNorm(community),
  observations,
  asOf,
);
const briefing = buildBriefing(community, composites, asOf);
const watchlist = buildWatchlist(community, states, observations, asOf);

const out = (name: string) => root(`data/${name}`);

await writeFile(out("registry.json"), JSON.stringify(registry, null, 2), "utf8");
await writeFile(out("briefing.json"), JSON.stringify(briefing, null, 2), "utf8");
await writeFile(out("watchlist.json"), JSON.stringify(watchlist, null, 2), "utf8");

const rTok = estimateTokens(registry);
const bTok = estimateTokens(briefing);
const wTok = estimateTokens(watchlist);
const perMember = Math.round(JSON.stringify(registry.members).length / registry.memberCount);

console.log(`
registry.json    ${registry.memberCount} members · ~${rTok} tokens · ~${perMember} chars/member
                 the durable store, read on demand — grows with the community
watchlist.json   ${watchlist.watching.length} watched of ${watchlist.memberCount} · ~${wTok} tokens
                 what the cadence cycle reads — stays small at any scale
briefing.json    ${briefing.cases.length} case(s) · ~${bTok} tokens

Raw export is ${community.messages.length} messages; the cycle reads ~${wTok} tokens.
Projected at 500 members: registry ~${Math.round((rTok / registry.memberCount) * 500)} tokens,
watchlist still ~${wTok} — because the watchlist scales with signals, not members.
`);

if (briefing.cases.length === 0) {
  console.log("Nothing composed — we would send nothing at all today.\n");
} else {
  for (const c of briefing.cases) console.log(`  ▸ ${c.headline}`);
  console.log();
}
