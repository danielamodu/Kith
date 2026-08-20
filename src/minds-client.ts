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
  MindsApiError,
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
  /** 0 or 2 = the Mind, 1 = the human steward — the library normalises both Mind encodings itself */
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

/**
 * The library's own MessageRecord marks id/senderType/createdAt/messageText
 * as optional/nullable — HistoryMessage above declares them required because
 * every consumer in this codebase (presentation.ts included) reasonably
 * expects that. Normalise once, here, rather than making every consumer
 * guard the same fields individually.
 */
function normaliseHistoryRow(row: MessageRecord): HistoryMessage {
  return {
    id: String(row.id ?? row.messageId ?? row.fingerprint),
    fingerprint: row.fingerprint,
    conversationId: String(row.conversationId ?? ""),
    messageId: String(row.messageId ?? row.fingerprint),
    senderId: String(row.senderId ?? ""),
    // Unknown sender type defaults to "human" (1), not "Kith" (0/2) — the
    // safer failure mode for anything gating on "is this an autonomous
    // Kith message" (see presentation.ts's transformFeedMessages).
    senderType: typeof row.senderType === "number" ? row.senderType : 1,
    senderEmail: String(row.senderEmail ?? ""),
    recipientId: String(row.recipientId ?? ""),
    recipientEmail: String(row.recipientEmail ?? ""),
    messageText: row.messageText ?? "",
    attachments: row.attachments ?? [],
    status: String(row.status ?? ""),
    createdAt: row.createdAt ?? "",
  };
}

export async function getHistory(
  apiKey: string,
  alias: string,
  opts: { limit?: number } = {},
): Promise<HistoryMessage[]> {
  const rows = await client(apiKey).getHistory(alias, opts);
  return (rows as MessageRecord[]).map(normaliseHistoryRow);
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
 * Shared prelude for both sendOnly and sendAndVerify: ensure the
 * conversation exists, capture a fingerprint high-water-mark, send.
 * Extracted so the two callers can't drift — they used to duplicate this
 * near-verbatim.
 *
 * Two deliberate error-tolerance choices, both restoring behaviour the
 * pre-rewrite CLI-based version had and this rewrite initially dropped:
 *
 *   - getLatestHistoryFingerprint's failure is swallowed regardless of
 *     cause. That's fine, not just convenient: findReply below applies an
 *     independent `sentAfter` timestamp floor, so a missing fingerprint
 *     degrades to timestamp-only ordering rather than no ordering at all —
 *     it doesn't silently disable the safety net the way it did before.
 *   - sendMessage's failure is only swallowed when it's genuinely AMBIGUOUS
 *     — a network-level failure (MindsApiError with status 0), where the
 *     request may have been delivered and only the response was lost.
 *     Throwing on that would report "failed" on a send that actually
 *     succeeded, and a caller that then retries gets a second real
 *     conversation and a second real charge with no way to notice.
 *     Verification (waitForReply / findReply's poll) is the real check for
 *     that case. A DEFINITE rejection — a real HTTP status back from the
 *     API (401 bad key, 402 insufficient cognition, etc.) — is not
 *     ambiguous at all and is rethrown immediately: swallowing that too
 *     (an earlier version of this function did) meant a caller could poll
 *     for the full ~2 minutes and then be told "the send succeeded" when
 *     it demonstrably never reached the Mind.
 */
async function prepareSend(
  c: ReturnType<typeof client>,
  mindId: string,
  alias: string,
  text: string,
): Promise<{ sentAt: string; afterFingerprint?: string }> {
  await c.ensureConversation(alias, mindId);

  let afterFingerprint: string | undefined;
  try {
    afterFingerprint = await c.getLatestHistoryFingerprint(alias);
  } catch {
    // See function comment — real failures here are covered by findReply's
    // own sentAfter floor, not just the "no history yet" case.
  }

  const sentAt = new Date().toISOString();
  try {
    await c.sendMessage({ alias, messageText: text });
  } catch (err) {
    if (err instanceof MindsApiError && err.status !== 0) {
      // A real HTTP response came back and it was a rejection — not an
      // ambiguous "did it land" case. The Mind demonstrably never got this.
      throw err;
    }
    console.error(`sendMessage may still have gone through for ${alias}: ${(err as Error).message}`);
  }

  return { sentAt, ...(afterFingerprint !== undefined ? { afterFingerprint } : {}) };
}

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
export function sendOnly(
  apiKey: string,
  mindId: string,
  alias: string,
  text: string,
): Promise<{ sentAt: string; afterFingerprint?: string }> {
  return prepareSend(client(apiKey), mindId, alias, text);
}

/**
 * Free — one history read, checked with the library's own reply-detection
 * (`isReplyHistoryRow`: correct sender-type handling, alias match,
 * fingerprint ordering, dedup against the sent text) plus an independent
 * `sentAfter` timestamp floor (see prepareSend's comment for why that
 * floor exists rather than relying on the fingerprint alone). Callers poll
 * this on an interval instead of blocking one request on `sendAndVerify`.
 *
 * Deliberately calls the library's raw `getHistory` here, NOT this file's
 * own `getHistory` wrapper — that wrapper normalises `senderType` to `1`
 * for anything ambiguous (the right default for presentation.ts, which
 * only needs a binary Kith/human split), but `isReplyHistoryRow` has its
 * OWN fallback detection for exactly that ambiguous case (a populated
 * `mindId` field on a row with no reliable `senderType`), and forcing
 * `senderType` to `1` beforehand short-circuits that fallback and hides a
 * real reply. Normalising also drops the row's `alias` field, silently
 * disabling `isReplyHistoryRow`'s cross-conversation guard. Passing it raw
 * `MessageRecord`s keeps both checks live and correct.
 */
export async function findReply(
  apiKey: string,
  alias: string,
  ctx: { sentMessageText?: string; afterFingerprint?: string; sentAfter?: string },
): Promise<{ text: string; html: string; createdAt: string } | null> {
  const history = await client(apiKey).getHistory(alias, {
    limit: 50,
    ...(ctx.afterFingerprint ? { after: ctx.afterFingerprint } : {}),
  });

  const floorTime = ctx.sentAfter ? new Date(ctx.sentAfter).getTime() : undefined;

  const candidates = history.filter((row) => {
    if (
      !isReplyHistoryRow(row, {
        alias,
        sentMessageText: ctx.sentMessageText,
        afterFingerprint: ctx.afterFingerprint,
      })
    ) {
      return false;
    }
    if (floorTime !== undefined) {
      // Parsed as Date, not compared as raw strings — ISO timestamps at
      // different precisions (with/without milliseconds) don't sort
      // correctly lexicographically. A row with no parseable createdAt is
      // EXCLUDED (fail closed) rather than passed through, matching the
      // safe-default pattern used everywhere else in this file.
      const rowTime = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (!Number.isFinite(rowTime) || rowTime <= floorTime) return false;
    }
    return true;
  });

  // Latest first — not the first match after an ascending sort, which
  // picked the OLDEST qualifying row and could return a stale prior reply
  // on a conversation with more than one exchange in its window.
  const reply = candidates.sort(
    (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0];
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
 * and hand-rolled history poll.
 *
 * The only remaining caller of this synchronous, blocking form is
 * cli-push.ts — a local script with no serverless time limit, so its
 * default timeout is generous (3 minutes, comfortably past the 76-111s
 * measured live). Anything running inside a Vercel function (the web
 * setup wizard's push, and /api/live-answer/refresh) uses sendOnly +
 * findReply instead, precisely because no fixed timeout here is safe
 * under a 60s function ceiling.
 */
export async function sendAndVerify(
  apiKey: string,
  mindId: string,
  alias: string,
  text: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ text: string; html: string; createdAt: string }> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const c = client(apiKey);

  const { sentAt, afterFingerprint } = await prepareSend(c, mindId, alias, text);

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

  // Independent of the library's own afterFingerprint check (which is a
  // no-op when getLatestHistoryFingerprint failed in prepareSend) — a hard
  // timestamp floor, same as findReply's, so this path isn't left with no
  // ordering safety net at all when the fingerprint capture didn't work.
  const sentTime = new Date(sentAt).getTime();
  const replyTime = reply.createdAt ? new Date(reply.createdAt).getTime() : NaN;
  if (!Number.isFinite(replyTime) || replyTime <= sentTime) {
    throw new SendVerifyError(
      `Only a stale reply (or none) was found in ${alias} — treating as unverified. Check ` +
        `\`minds history ${alias}\` by hand before retrying.`,
    );
  }

  return {
    text: plainText(reply.messageText ?? ""),
    html: reply.messageText ?? "",
    createdAt: reply.createdAt ?? new Date().toISOString(),
  };
}
