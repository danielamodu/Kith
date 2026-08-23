/**
 * Small-state storage: the live-answer cache, the cognition spend log, and
 * the Beat B session/restart marker — a handful of small JSON blobs that
 * need to survive between requests.
 *
 * Locally, and in any persistent-process deployment, files on disk are
 * genuinely fine: one process, one disk, no ambiguity. On Vercel's
 * serverless model there is no such guarantee — a write in one invocation
 * isn't guaranteed visible to the next, since there's no single persistent
 * process holding the disk open. That matters most for Beat B specifically:
 * "mark restart" and "check for new messages, later" are two separate
 * requests, and if they land on different containers, the restart marker
 * a serverless deployment wrote is invisible to the read that needs it.
 *
 * Falls back to files automatically when Vercel KV isn't configured, so
 * local dev and any non-serverless deployment are completely unaffected —
 * this only changes behavior when KV_REST_API_URL/KV_REST_API_TOKEN are
 * present, which Vercel sets automatically once its KV integration is added
 * through the dashboard (Storage tab -> Create Database -> KV). No code
 * change needed to activate it, just that one-time setup on Vercel's side.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

export interface SmallStore {
  read<T>(key: string, fallback: T): Promise<T>;
  write(key: string, value: unknown): Promise<void>;
}

class FileStore implements SmallStore {
  // Explicit field rather than a constructor parameter property: Node runs
  // these files with type-stripping only, which requires fully erasable
  // syntax — see src/store.ts's own comment for where this project first
  // hit the same thing.
  readonly pathFor: (key: string) => string;

  constructor(pathFor: (key: string) => string) {
    this.pathFor = pathFor;
  }

  async read<T>(key: string, fallback: T): Promise<T> {
    const path = this.pathFor(key);
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    const path = this.pathFor(key);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value, null, 2), "utf8");
    } catch (err) {
      console.warn(`FileStore write skipped for key '${key}': ${(err as Error).message}`);
    }
  }
}

class VercelKvStore implements SmallStore {
  private url: string;
  private token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
  }

  private async call(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init?.headers },
    });
    if (!res.ok) throw new Error(`Vercel KV ${path} failed (${res.status})`);
    return res.json();
  }

  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const result = (await this.call(`/get/${encodeURIComponent(key)}`)) as { result: string | null };
      return result.result ? (JSON.parse(result.result) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    await this.call(`/set/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify(value),
    });
  }
}

/**
 * Not called at module load — evaluating env vars lazily means this reads
 * whatever's actually configured at request time, not whatever happened to
 * be set when the module first loaded (matters more in a serverless
 * cold-start context than it would in a long-running local process).
 */
export function createStore(pathFor: (key: string) => string): SmallStore {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return new VercelKvStore(url, token);
  return new FileStore(pathFor);
}
