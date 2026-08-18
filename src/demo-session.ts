/**
 * Beat B needs one fixed conversation alias, reused across the whole demo
 * session, so a restart can be proven against it. It must never be typed
 * into the UI by hand — that's exactly how an old, contaminated test alias
 * (memtest-a, memtest-b — see docs/architecture.md) could get reopened on
 * camera. This file is the single place that alias lives.
 *
 * Storage goes through kv-store.ts's SmallStore, not raw file I/O directly —
 * this is the one piece of state where that matters most: "mark restart"
 * and "check for new messages, later" are necessarily two separate
 * requests, and on Vercel's serverless model a file write in one isn't
 * guaranteed visible to the other. See kv-store.ts's own comment for the
 * full reasoning.
 */
import { createStore } from "./kv-store.ts";

export type DemoSession = {
  alias: string;
  /** set by "mark restart" in the Live Feed view — Beat B's proof anchor */
  restartAt: string | null;
};

const DEFAULT_ALIAS = "kith-web-daily-watch";
const SESSION_KEY = "demo-session";

export async function readSession(path: string): Promise<DemoSession> {
  const store = createStore(() => path);
  return store.read(SESSION_KEY, { alias: DEFAULT_ALIAS, restartAt: null });
}

export async function writeSession(
  path: string,
  session: DemoSession,
): Promise<void> {
  const store = createStore(() => path);
  await store.write(SESSION_KEY, session);
}

export async function markRestart(path: string): Promise<DemoSession> {
  const current = await readSession(path);
  const next: DemoSession = { ...current, restartAt: new Date().toISOString() };
  await writeSession(path, next);
  return next;
}
