/**
 * Minds Builder API client — built on @animocabrands/minds-client-lib, the
 * platform team's own published client, not a hand-rolled fetch layer.
 *
 * History: this file used to hand-roll fetch() for reads (list/history/
 * balance/ensureConversation — all confirmed free and reliable by hand on
 * 17 Aug) but shelled out to the `minds` CLI via exec() for the one send
 * step, because a direct POST to /v1/messaging/message had, in one earlier
 * test, left a message stranded — Kith registered it but no reply ever
 * appeared in history. That CLI dependency broke on Vercel (no global
 * `minds` binary in a serverless function — it's not a bundled dependency,
 * so exec() failed with ENOENT) and only became load-bearing once the web
 * setup wizard needed to push onto a THIRD PARTY's Mind from that same
 * serverless route, not just our own dev machine.
 *
 * The fix: `minds` the CLI turns out to be a thin wrapper around this exact
 * library (read its own dist/cli.js — `getClientOrThrow()` returns a
 * `createMindsClient()` instance from `@animocabrands/minds-client-lib`).
 * That library's `sendMessage` calls the identical `/v1/messaging/message`
 * endpoint our old direct POST used — so the endpoint was never the
 * problem. The real gap was verification: this library's `waitForReply`
 * first tries an SSE stream (`GET /v1/messaging/events`) with a real
 * reply-detection heuristic (`isReplyEvent`: correct sender-type check for
 * both Mind-sender encodings, alias match, fingerprint ordering, dedup
 * against the sent text) and falls back to polling history with the same
 * check if the stream errors or times out. Our old polling loop only
 * checked `senderType === 0`, which is a narrower and less careful check
 * than what the platform's own client does. Using the library directly
 * gets the correct verification logic AND drops exec()/cmd.exe/ENOENT
 * entirely — pure fetch(), portable to Vercel or anywhere else Node runs.
 */
import {
  createMindsClient,
  isReplyHistoryRow,
  type MessageRecord,
} from "@animocabrands/minds-client-lib";

function client(apiKey: string) {
  return createMindsClient({ builderApiKey: apiKey });
}

// ── shapes ───────────────────────────────────────────────────────────────────

export type Conversation = {
  alias?: string | null;
  conversationId: string;
  [key: string]: unknown;
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
  return client(apiKey).listConversations();
}

export function getHistory(apiKey: string, alias: string): Promise<HistoryMessage[]> {
  return client(apiKey).getHistory(alias) as Promise<HistoryMessage[]>;
}

export async function ensureConversation(
  apiKey: string,
  mindId: string,
  alias: string,
): Promise<{ conversationId: string; alias: string }> {
  const c = await client(apiKey).ensureConversation(alias, mindId);
  return { conversationId: c.conversationId, alias: c.alias ?? alias };
}

export function getCognitionBalance(
  apiKey: string,
  mindId: string,
): Promise<{ mindId: string; cognition: number }> {
  return client(apiKey).getCognitionBalance(mindId);
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

/**
 * The exact instruction shape proven to work across every registry push in
 * this project (see docs/evidence/2026-08-16-vertical-slice.md and the
 * architecture doc's "verified behaviours" section). Shared by cli-push.ts
 * (our own Mind) and onboarding.ts (a creator's own Mind, from the web setup
 * wizard) so both send the identical, tested wording rather than two copies
 * drifting apart.
 */
export function pushInstruction(registryJson: string): string {
  return `This is the Kith member registry for the community you steward. Please store it as a durable Artifact named 'kith-registry' so it survives across cognition cycles, overwriting any previous version, and tell me the artifact ID.

Field meanings: rhythmH = median hours between that person's posts, their own personal baseline. spreadH = variability of that rhythm. quietForH = hours silent as of generatedAt (not "today" — always reason against generatedAt, never the wall clock). quietRatio = quietForH divided by rhythmH, i.e. how many of their own cycles they've missed. baselineReliable = false means too few messages for the rhythm to mean anything — treat those as "cannot tell," never guess. lenC = median message length. ans/ansNew/helped = contribution. pronouns is authoritative data — read it, never infer from a name. signals.unansweredNewcomers = newcomers whose first message sat unanswered.

Do not analyse it now — just store it, and let your next cadence cycle (or a direct question) do the work.

Registry:
${registryJson}`;
}

export class SendVerifyError extends Error {}

/**
 * Send-only, no waiting — for callers that poll for the reply separately
 * instead of holding one request open. Exists because measured reply
 * latency for a substantive instruction (e.g. "store this whole registry")
 * has run 76–111s live against the real Mind — past what a single Vercel
 * function invocation can wait for (maxDuration is capped at 60s in
 * vercel.json). The send itself is fast; it's the Mind's own reasoning
 * that's slow and genuinely unbounded, so the fix is a fast kick-off here
 * plus a separate, free, poll-able read (see findReply below) rather than
 * a longer synchronous timeout that will still eventually be too short.
 */
export async function sendOnly(
  apiKey: string,
  mindId: string,
  alias: string,
  text: string,
): Promise<{ sentAt: string; afterFingerprint?: string }> {
  const c = client(apiKey);
  await c.ensureConversation(alias, mindId);
  let afterFingerprint: string | undefined;
  try {
    afterFingerprint = await c.getLatestHistoryFingerprint(alias);
  } catch {
    // No prior history is fine.
  }
  await c.sendMessage({ alias, messageText: text });
  return { sentAt: new Date().toISOString(), ...(afterFingerprint !== undefined ? { afterFingerprint } : {}) };
}

/**
 * Free — one history read, checked with the library's own reply-detection
 * (`isReplyHistoryRow`: correct sender-type handling, alias match,
 * fingerprint ordering, dedup against the sent text), the same logic
 * `waitForReply` uses internally. Callers poll this on an interval instead
 * of blocking one request on `sendAndVerify`.
 */
export async function findReply(
  apiKey: string,
  alias: string,
  ctx: { sentMessageText?: string; afterFingerprint?: string },
): Promise<{ text: string; html: string; createdAt: string } | null> {
  const history = await client(apiKey).getHistory(alias, { limit: 50 });
  const reply = (history as MessageRecord[])
    .filter((row) => isReplyHistoryRow(row, { alias, ...ctx }))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))[0];
  if (!reply) return null;
  return {
    text: plainText(reply.messageText ?? ""),
    html: reply.messageText ?? "",
    createdAt: reply.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Send a message and confirm delivery via the library's own waitForReply —
 * see this file's top comment for why that replaces the old CLI shell-out
 * and hand-rolled history poll. `getLatestHistoryFingerprint` first mirrors
 * exactly what the CLI's own `send` command does (see its dist/cli.js
 * registerSend): capture the high-water mark before sending, so
 * waitForReply only matches messages strictly after it, never an old reply
 * already sitting in the thread.
 */
export async function sendAndVerify(
  apiKey: string,
  mindId: string,
  alias: string,
  text: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ text: string; html: string; createdAt: string }> {
  // Measured live on 18 Aug: a real reply took 111s. 50s leaves headroom
  // under Vercel's 60s function ceiling (vercel.json's maxDuration) while
  // staying as generous as that ceiling allows — a reply slower than this
  // is a real, occasional case, not this function's bug; the caller's error
  // message says to check `minds history` by hand for exactly that reason.
  const timeoutMs = opts.timeoutMs ?? 50_000;
  const c = client(apiKey);

  await c.ensureConversation(alias, mindId);

  let afterFingerprint: string | undefined;
  try {
    afterFingerprint = await c.getLatestHistoryFingerprint(alias);
  } catch {
    // No prior history is fine — afterFingerprint just stays undefined.
  }

  await c.sendMessage({ alias, messageText: text });

  const outcome = await c.waitForReply({
    alias,
    timeoutMs,
    sentMessageText: text,
    ...(afterFingerprint !== undefined ? { afterFingerprint } : {}),
  });

  if (outcome.timedOut) {
    throw new SendVerifyError(
      `No verified reply in ${alias} within ${Math.round(timeoutMs / 1000)}s — this is ` +
        `exactly the "silent failure" case, not "Kith had nothing to say." Check ` +
        `\`minds history ${alias}\` by hand before retrying.`,
    );
  }

  const reply = outcome.reply as MessageRecord;
  return {
    text: plainText(reply.messageText ?? ""),
    html: reply.messageText ?? "",
    createdAt: reply.createdAt ?? new Date().toISOString(),
  };
}
