/**
 * Beat B needs one fixed conversation alias, reused across the whole demo
 * session, so a restart can be proven against it. It must never be typed
 * into the UI by hand — that's exactly how an old, contaminated test alias
 * (memtest-a, memtest-b — see docs/architecture.md) could get reopened on
 * camera. This file is the single place that alias lives.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export type DemoSession = {
  alias: string;
  /** set by "mark restart" in the Live Feed view — Beat B's proof anchor */
  restartAt: string | null;
};

const DEFAULT_ALIAS = "kith-web-daily-watch";

export async function readSession(path: string): Promise<DemoSession> {
  if (!existsSync(path)) {
    return { alias: DEFAULT_ALIAS, restartAt: null };
  }
  return JSON.parse(await readFile(path, "utf8")) as DemoSession;
}

export async function writeSession(
  path: string,
  session: DemoSession,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), "utf8");
}

export async function markRestart(path: string): Promise<DemoSession> {
  const current = await readSession(path);
  const next: DemoSession = { ...current, restartAt: new Date().toISOString() };
  await writeSession(path, next);
  return next;
}
