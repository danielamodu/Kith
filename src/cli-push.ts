/**
 * Push the local registry (npm run registry's output) into your Mind's
 * durable memory as an Artifact.
 *
 * This was, until now, a manual step — a `minds send` command typed by hand
 * to push data/registry.json's content and ask the Mind to store it. That's
 * fine for a solo project with one Mind; it's not fine for "point this at
 * your own community," which needs a repeatable command. This is that
 * command.
 *
 * COSTS COGNITION — this sends a real message that triggers real inference
 * (the Mind has to read and act on the instruction). Confirm before running
 * on a Mind you're tracking spend on.
 *
 * Run: node src/cli-push.ts [--yes]
 *   --yes   skip the confirmation prompt (for scripting/cron)
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { freshAlias, sendAndVerify, getCognitionBalance, pushInstruction } from "./minds-client.ts";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

async function loadEnv(): Promise<Record<string, string>> {
  const path = root(".env");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

const env = { ...(await loadEnv()), ...process.env };
const API_KEY = env.MINDS_BUILDER_API_KEY;
const MIND_ID = env.KITH_MIND_ID;

if (!API_KEY || !MIND_ID) {
  console.error(`
Missing config. Need both in .env:
  MINDS_BUILDER_API_KEY   from the Minds Builder console
  KITH_MIND_ID            find yours with: minds list --pretty
`);
  process.exit(1);
}

const registryPath = root("data/registry.json");
const watchlistPath = root("data/watchlist.json");
if (!existsSync(registryPath) || !existsSync(watchlistPath)) {
  console.error("Missing data/registry.json or data/watchlist.json — run `npm run registry` first.");
  process.exit(1);
}

const registry = await readFile(registryPath, "utf8");
const watchlist = await readFile(watchlistPath, "utf8");
const parsed = JSON.parse(registry);
const parsedWatchlist = JSON.parse(watchlist);

console.log(`
About to push to your Mind (both artifacts, one send):
  community        ${parsed.community}
  members          ${parsed.memberCount}
  watched          ${parsedWatchlist.watching?.length ?? 0}
  generatedAt      ${parsed.generatedAt}
  payload size     ~${Math.ceil((registry.length + watchlist.length) / 4)} tokens

This sends a real message and costs real cognition (a few, based on prior
measurement — payload size drives cost, so a large registry costs more).
`);

if (!process.argv.includes("--yes")) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Proceed? (y/N) ");
  rl.close();
  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled.");
    process.exit(0);
  }
}

const before = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);

// Shared with onboarding.ts's web push route — see pushInstruction's own
// comment in minds-client.ts for why this wording is kept in one place.
const instruction = pushInstruction(registry, watchlist);

const alias = freshAlias("kith-push");
console.log(`\nSending (conversation: ${alias})...`);

try {
  const reply = await sendAndVerify(API_KEY, MIND_ID, alias, instruction);
  console.log(`\n${reply.text}\n`);

  const after = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);
  if (before && after) {
    console.log(`cognition spent: ~${(before.cognition - after.cognition).toFixed(2)} (balance now ${after.cognition.toFixed(2)})`);
  }
} catch (err) {
  console.error(`\nPush failed: ${(err as Error).message}`);
  console.error(`Check \`minds history ${alias}\` by hand before retrying.`);
  process.exit(1);
}
