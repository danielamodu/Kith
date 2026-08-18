/**
 * Minds Builder API client — direct HTTP, not a shell-out to the `minds` CLI.
 *
 * Every prior live interaction with Kith in this project went through the CLI
 * (`minds send`, `minds history`, ...). For a server route that has to run
 * reliably on Windows without depending on a global npm binary being on PATH,
 * direct fetch() is the safer transport — mirrors the pattern already used in
 * discord.ts. Confirmed working by hand on 17 Aug against the real API before
 * this file was written: base URL, auth header, and every shape below were
 * read from a live response, not guessed from documentation.
 *
 * Cost model, confirmed empirically (balance unchanged to 8 decimal places
 * across all of these): listing conversations, reading history, and creating
 * a conversation are all FREE. Only sending a message — which triggers a real
 * inference cycle — costs cognition. That is the one call this file gates.
 */

const API = "https://api.build.hellominds.ai";

async function call<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": apiKey,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Minds ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  // Some endpoints (e.g. conversation create) return a small body; all are JSON.
  return (await res.json()) as T;
}

// ── shapes, read from live responses on 17 Aug ────────────────────────────────

export type Conversation = {
  alias: string;
  conversationId: string;
  subject?: string;
  createdAt?: string;
  lastMessageAt?: string | null;
  participants?: Array<{
    partyId: string;
    partyType: number;
    name: string;
    email: string;
  }>;
};

export type HistoryMessage = {
  id: string;
  fingerprint: string;
  conversationId: string;
  messageId: string;
  senderId: string;
  /** 0 = the Mind, 1 = the human steward, by observation */
  senderType: number;
  senderEmail: string;
  recipientId: string;
  recipientEmail: string;
  /** HTML — the Mind's replies come back as <p>/<b>/<code>/<ul> markup, not plain text */
  messageText: string;
  attachments: unknown[];
  status: string;
  createdAt: string;
};

// ── free operations ─────────────────────────────────────────────────────────

export function listConversations(apiKey: string): Promise<Conversation[]> {
  return call<Conversation[]>(apiKey, "/v1/messaging/conversations");
}

export function getHistory(
  apiKey: string,
  alias: string,
): Promise<HistoryMessage[]> {
  return call<HistoryMessage[]>(
    apiKey,
    `/v1/messaging/histories/${encodeURIComponent(alias)}`,
  );
}

export function ensureConversation(
  apiKey: string,
  mindId: string,
  alias: string,
): Promise<{ conversationId: string; alias: string }> {
  return call(apiKey, "/v1/messaging/conversation", {
    method: "POST",
    body: JSON.stringify({ mindId, alias }),
  });
}

/**
 * Confirmed empirically on 17 Aug — this does NOT match the CLI's own
 * `{ ok, balance: { mindId, cognition } }` display shape at all. The raw
 * endpoint returns a flat object, and the balance field is called `swarm`,
 * not `cognition` — the CLI evidently relabels it for humans. The initial
 * guess (mirroring the CLI's display shape) crashed on `.balance` being
 * undefined, and because that crash happened *after* a real paid send had
 * already gone through, it cost real cognition for a discarded answer. Every
 * caller of this function now treats a failure here as non-fatal to the
 * overall flow for exactly that reason.
 */
export function getCognitionBalance(
  apiKey: string,
  mindId: string,
): Promise<{ mindId: string; cognition: number }> {
  return call<{ mindId: string; swarm: number }>(
    apiKey,
    `/v1/minds/${mindId}/credits`,
  ).then((r) => ({ mindId: r.mindId, cognition: r.swarm }));
}

/** Strip the Mind's reply HTML down to readable text for the UI. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── the one gated, cost-incurring operation ─────────────────────────────────

/** community.member.<slug> etc. — a fresh alias per query, never a reused test thread. */
export function freshAlias(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export class SendVerifyError extends Error {}

/**
 * Send a message and confirm delivery from a second, independent read —
 * never trust the send call's own response alone.
 *
 * The SEND step shells out to the `minds` CLI rather than posting directly
 * to /v1/messaging/message. That wasn't the original design — every other
 * function in this file talks to the API directly, and that's still right
 * for them (all proven free and reliable by hand on 17 Aug: list, history,
 * conversation-create, balance). But a real side-by-side test found the
 * direct POST leaves a message stranded — Kith visibly registered it (a
 * later CLI query referenced "a different thread" it had been asked the
 * same question in seconds earlier) yet no reply ever appeared in that
 * thread's history, even after several minutes and a real cognition charge.
 * The identical question sent via `minds send --wait` through the CLI, on
 * the same Mind, moments later, worked immediately and correctly. Whatever
 * the CLI does beyond a bare POST — a different endpoint, an explicit
 * generation trigger — it's the proven path, and re-deriving it by trial and
 * error would cost real cognition for no product benefit. Falls back to the
 * CLI for this one step; verification below still uses this file's own
 * tested-reliable direct-fetch history read, never the CLI's own `--wait`
 * payload — that has its own documented staleness gotcha (see
 * docs/evidence/2026-08-16-vertical-slice.md in earlier project history).
 *
 * Two failure modes this exists to catch:
 *   1. A send's immediate response can be STALE — it has returned the
 *      previous message in the thread rather than the new one.
 *   2. A send can SILENTLY FAIL — the call succeeds, nothing was delivered.
 *
 * Both look identical from the caller's side unless you go back and read the
 * conversation fresh. This function does that: send, then poll history a
 * bounded number of times (not an open loop) until a message newer than the
 * send timestamp appears, or give up and report failure explicitly rather
 * than let a stale/missing reply be shown as if it were real.
 */
export async function sendAndVerify(
  apiKey: string,
  mindId: string,
  alias: string,
  text: string,
  opts: { maxAttempts?: number; delayMs?: number } = {},
): Promise<{ text: string; html: string; createdAt: string }> {
  const maxAttempts = opts.maxAttempts ?? 12;
  const delayMs = opts.delayMs ?? 5000;

  await ensureConversation(apiKey, mindId, alias);
  const sentAt = new Date();

  // shell execution is required on Windows — `.cmd` files (npm's
  // global-install shim format) aren't directly spawnable, only
  // interpretable by cmd.exe. Rather than execFile(file, argsArray,
  // {shell:true}) — which Node explicitly warns is unsafe (DEP0190): it
  // can't properly escape an array of args once shell:true is set — build
  // one fully-quoted command string ourselves and run it via exec(), the
  // pattern actually designed for "one shell command, I control the
  // quoting." cmd.exe quoting: wrap each arg in double quotes, double any
  // internal quotes to escape them.
  const cmdQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const command = ["minds.cmd", "send", alias, text, "--wait", "--timeout", "90000"]
    .map(cmdQuote)
    .join(" ");

  const { exec } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    exec(
      command,
      {
        env: { ...process.env, MINDS_BUILDER_API_KEY: apiKey },
        timeout: 100_000,
        windowsHide: true,
      },
      (err) => {
        // A non-zero exit here just means the CLI's own --wait step timed out
        // or errored — not necessarily that the send itself failed. The
        // history poll below is the real check either way, so don't reject
        // on this alone; only truly fatal spawn errors (CLI not found) should
        // stop the flow before verification gets a chance to look for real.
        // ExecException.code is typed as `number` (process exit code), but a
        // spawn failure like "binary not found" actually carries a *string*
        // code ("ENOENT") at runtime — a real gap between Node's types and
        // its own behavior, not a mistake. `unknown` first, as TS's own
        // TS2352 suggests, rather than pretending the types overlap.
        if (err && (err as unknown as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error("`minds` CLI not found — is it installed globally?"));
        } else {
          resolve();
        }
      },
    );
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delayMs));
    const history = await getHistory(apiKey, alias);
    // Kith's own replies: senderType 0, strictly after our send.
    const reply = history
      .filter((m) => m.senderType === 0 && new Date(m.createdAt) > sentAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (reply) {
      return {
        text: plainText(reply.messageText),
        html: reply.messageText,
        createdAt: reply.createdAt,
      };
    }
  }

  throw new SendVerifyError(
    `No verified reply in ${alias} after ${maxAttempts} checks — this is exactly ` +
      `the "silent failure" case, not "Kith had nothing to say." Check ` +
      `\`minds history ${alias}\` by hand before retrying.`,
  );
}
