/**
 * One command instead of four. Previously: run cli-discord.ts (or backfill +
 * poll for Telegram), then cli-registry.ts --store, then cli-push.ts, in the
 * right order, remembering the flags each one needs. This walks through it.
 *
 * Doesn't reimplement any of those scripts — each one is already tested and
 * working — just invokes them as child processes with stdio inherited, so
 * their own prompts (cli-push.ts's confirm, in particular) still work
 * correctly and nothing about their own logic changes.
 *
 * One real wrinkle, found by actually running this rather than assuming it
 * would work: a readline interface held open in this process while a child
 * process also has stdio:"inherit" access to the same stdin caused a libuv
 * assertion failure on Windows. Fixed by never holding both open at once —
 * readline opens fresh for each prompt in this script and closes immediately
 * after, so a spawned child always gets stdin to itself.
 *
 * Run: node src/cli-setup.ts
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";

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

function run(script: string, args: string[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [root(`src/${script}`), ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

console.log("\nKith setup — ingest, build the registry, and push it into your Mind.\n");

// ── required config ─────────────────────────────────────────────────────────

const missing: string[] = [];
if (!env.MINDS_BUILDER_API_KEY) missing.push("MINDS_BUILDER_API_KEY");
if (!env.KITH_MIND_ID) missing.push("KITH_MIND_ID");
if (missing.length) {
  console.error(
    `Missing from .env: ${missing.join(", ")}\n` +
      `Copy .env.example to .env and fill these in first — see the top of\n` +
      `that file for where to get each one. Find your Mind's id with:\n` +
      `  minds list --pretty\n`,
  );
  process.exit(1);
}

const hasDiscord = Boolean(env.DISCORD_BOT_TOKEN);
const hasTelegram = Boolean(env.TELEGRAM_BOT_TOKEN);

if (!hasDiscord && !hasTelegram) {
  console.error(
    "Neither DISCORD_BOT_TOKEN nor TELEGRAM_BOT_TOKEN is set in .env.\n" +
      "Set up one platform first:\n" +
      "  Discord — faster path, reads history directly. docs/discord-setup.md\n" +
      "  Telegram — needs a Desktop export for anything before the bot joined. docs/telegram-setup.md\n",
  );
  process.exit(1);
}

// ── ingest ───────────────────────────────────────────────────────────────────

if (hasDiscord) {
  console.log("Discord token found.\n");

  let channelId = await ask("Discord channel id to backfill (blank to list channels first): ");
  if (!channelId) {
    const guildId = await ask("Server (guild) id: ");
    await run("cli-discord.ts", ["--channels", guildId]);
    channelId = await ask("\nChannel id to backfill: ");
  }
  if (!channelId) {
    console.error("No channel id given — stopping.");
    process.exit(1);
  }

  console.log(`\nChecking setup against ${channelId}...\n`);
  const checkCode = await run("cli-discord.ts", [channelId, "--check"]);
  if (checkCode !== 0) {
    console.error("\nDiscord check failed — fix the issue above, then run this again.");
    process.exit(1);
  }

  console.log(`\nBackfilling ${channelId}...\n`);
  const backfillCode = await run("cli-discord.ts", [channelId]);
  if (backfillCode !== 0) {
    console.error("\nBackfill failed — see the error above.");
    process.exit(1);
  }
} else {
  console.log(
    "Telegram is set up, but backfill needs a manual step first: the Bot API\n" +
      "can't read history from before the bot joined, so export your group's\n" +
      "history from Telegram Desktop (chat -> ... -> Export chat history -> JSON),\n" +
      "then run:\n" +
      "  npm run backfill -- path/to/export.json\n" +
      "  npm run poll             (keeps collecting live traffic afterward)\n" +
      "Come back and run this setup script again once that's done — it'll\n" +
      "pick up from the registry-build step.\n",
  );
  process.exit(0);
}

// ── build + push ─────────────────────────────────────────────────────────────

console.log("\nBuilding the registry from what's in the store...\n");
const registryCode = await run("cli-registry.ts", ["--store"]);
if (registryCode !== 0) {
  console.error("\nRegistry build failed — see the error above.");
  process.exit(1);
}

console.log("\nOne step left: pushing the registry into your Mind's memory. This spends real cognition.");
const confirmed = await ask("Proceed? (y/N) ");
if (confirmed.toLowerCase() !== "y") {
  console.log("\nStopped before spending anything. Run `npm run push` yourself whenever you're ready.");
  process.exit(0);
}

// Confirmed once, here — cli-push.ts runs with --yes so it doesn't ask
// again. Also sidesteps a real, confirmed issue: a readline prompt in this
// process followed by a child process that also needs interactive stdin
// races on non-TTY input (piped/scripted stdin gets consumed ahead of time
// by whichever reader goes first) — a single confirmation avoids it outright
// rather than relying on interactive-terminal timing to save it.
const pushCode = await run("cli-push.ts", ["--yes"]);

if (pushCode !== 0) {
  console.error("\nPush didn't complete — see the error above. Re-run `npm run push` once it's fixed.");
  process.exit(1);
}

console.log("\nDone. Run `npm run web` to see it.\n");
