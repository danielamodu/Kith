// src/server.ts
import express from "express";
import { z } from "zod";

// src/security.ts
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
var helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // Vite dev needs inline; prod build hashes
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://discord.com", "https://api.hellominds.ai"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hidePoweredBy: true,
  hsts: { maxAge: 63072e3, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true
});
var corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = [
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/kithxbt\.vercel\.app$/,
      /^http:\/\/localhost:\d+$/
    ];
    if (allowed.some((re) => re.test(origin))) return callback(null, true);
    callback(new Error("CORS: Origin not allowed"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
});
var apiRateLimiter = rateLimit({
  windowMs: 6e4,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down." },
  skip: (req) => req.path === "/api/cron/poll" || req.path === "/api/invite-url"
});
var strictRateLimiter = rateLimit({
  windowMs: 6e4,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many cognition requests. Slow down." }
});
function authMiddleware(req, res, next) {
  const path = req.path;
  if (path.startsWith("/api/cron")) return next();
  if (path === "/api/invite-url" || path === "/api/setup/verify-discord" || path === "/api/setup/list-channels" || path === "/api/setup/check-channel" || path === "/api/setup/build") {
    return next();
  }
  if (path.startsWith("/api/setup/connect") || path.startsWith("/api/setup/push")) {
    const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? req.body?.apiKey;
    if (!apiKey) {
      res.status(401).json({ error: "Missing API key. Provide via Authorization: Bearer <key> or apiKey body param." });
      return;
    }
    req.apiKey = apiKey;
    return next();
  }
  if (path.startsWith("/api/")) {
    const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!apiKey) {
      res.status(401).json({ error: "Authentication required. Provide Authorization: Bearer <key>." });
      return;
    }
    req.apiKey = apiKey;
    return next();
  }
  next();
}
var validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Invalid request body", details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
};
var sanitizeBody = (req, _res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === "string") return obj.replace(/[<>]/g, "").trim();
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === "object") {
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = sanitize(v);
      return out;
    }
    return obj;
  };
  req.body = sanitize(req.body);
  next();
};

// src/server.ts
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "node:fs/promises";
import { existsSync as existsSync2 } from "node:fs";
import { fileURLToPath } from "node:url";

// src/minds-client.ts
import {
  createMindsClient,
  isReplyHistoryRow,
  MindsApiError
} from "@animocabrands/minds-client-lib";
function client(apiKey) {
  return createMindsClient({ builderApiKey: apiKey });
}
function normaliseHistoryRow(row) {
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
    createdAt: row.createdAt ?? ""
  };
}
async function getHistory(apiKey, alias, opts = {}) {
  const rows = await client(apiKey).getHistory(alias, opts);
  return rows.map(normaliseHistoryRow);
}
function getCognitionBalance(apiKey, mindId) {
  return client(apiKey).getCognitionBalance(mindId);
}
function plainText(html) {
  return html.replace(/<\/(p|li|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
}
function freshAlias(prefix) {
  return `${prefix}-${Date.now()}`;
}
function pushInstruction(registryJson, watchlistJson) {
  return `This is the Kith memory for the community you steward \u2014 two artifacts, not one. Please store BOTH as durable Artifacts, overwriting any previous version of each, and tell me both artifact IDs:
1. The full member registry, named 'kith-registry'.
2. The watchlist (only members currently carrying a signal), named 'kith-watchlist'.

Do not derive the watchlist yourself from the registry, now or on a future cycle \u2014 it is provided separately, already built, specifically so you never have to reconstruct it. Read kith-watchlist for routine "who needs attention" questions and cadence cycles; only read the full kith-registry when you need a specific person's detail the watchlist doesn't carry, or need to see someone who has no live signal at all.

Field meanings: rhythmH = median hours between that person's posts, their own personal baseline. spreadH = variability of that rhythm. quietForH = hours silent as of generatedAt (not "today" \u2014 always reason against generatedAt, never the wall clock). quietRatio = quietForH divided by rhythmH, i.e. how many of their own cycles they've missed. baselineReliable = false means too few messages for the rhythm to mean anything \u2014 treat those as "cannot tell," never guess. lenC = median message length. ans/ansNew/helped = contribution. pronouns is authoritative data \u2014 read it, never infer from a name. signals.unansweredNewcomers = newcomers whose first message sat unanswered. On watchlist entries only: continuity, when present, is ground truth about your own past attention to this exact person \u2014 cyclesFlagged is how many consecutive cycles including this one they've carried a signal, firstFlaggedAt is when that streak started. Use it directly ("this is the third cycle running I've noticed this") rather than guessing at history from your own memory; its absence means this is the first cycle they've been flagged.

How you answer the creator (standing instruction, applies to every future answer):
- Lead with the one member most worth reaching out to, in plain sentences a busy creator reads in under a minute. Details are available on request \u2014 do not front-load them.
- Field names are internal vocabulary. Never print rhythmH, quietForH, quietRatio, lenC, ansNew and friends. Translate: "missed roughly 900 of their own typical gaps", "usually posts every couple of hours", "answered 16 newcomers".
- Groups get one summary line each, not a per-member list. Name at most three members per section; say "and N others in the same shape".
- Every claim still needs its evidence behind it \u2014 but the numbers live in a short "details" line under the member, not in the prose.
- End with nothing ceremonial. No sign-offs, no restating your rules.

Do not analyse either one now \u2014 just store both, and let your next cadence cycle (or a direct question) do the work.

Registry:
${registryJson}

Watchlist:
${watchlistJson}`;
}
async function prepareSend(c, mindId, alias, text) {
  await c.ensureConversation(alias, mindId);
  let afterFingerprint;
  try {
    afterFingerprint = await c.getLatestHistoryFingerprint(alias);
  } catch {
  }
  const sentAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await c.sendMessage({ alias, messageText: text });
  } catch (err) {
    if (err instanceof MindsApiError && err.status !== 0) {
      throw err;
    }
    console.error(`sendMessage may still have gone through for ${alias}: ${err.message}`);
  }
  return { sentAt, ...afterFingerprint !== void 0 ? { afterFingerprint } : {} };
}
function sendOnly(apiKey, mindId, alias, text) {
  return prepareSend(client(apiKey), mindId, alias, text);
}
var CLOCK_SKEW_GRACE_MS = 12e4;
async function findReply(apiKey, alias, ctx) {
  const history = await client(apiKey).getHistory(alias, {
    limit: 50,
    ...ctx.afterFingerprint ? { after: ctx.afterFingerprint } : {}
  });
  const floorTime = !ctx.afterFingerprint && ctx.sentAfter ? new Date(ctx.sentAfter).getTime() - CLOCK_SKEW_GRACE_MS : void 0;
  const candidates = history.filter((row) => {
    if (!isReplyHistoryRow(row, {
      alias,
      sentMessageText: ctx.sentMessageText,
      afterFingerprint: ctx.afterFingerprint
    })) {
      return false;
    }
    if (floorTime !== void 0) {
      const rowTime = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (!Number.isFinite(rowTime) || rowTime <= floorTime) return false;
    }
    return true;
  });
  const reply = candidates.sort(
    (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  )[0];
  if (!reply) return null;
  return {
    text: plainText(reply.messageText ?? ""),
    html: reply.messageText ?? "",
    createdAt: reply.createdAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/kv-store.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
var FileStore = class {
  // Explicit field rather than a constructor parameter property: Node runs
  // these files with type-stripping only, which requires fully erasable
  // syntax — see src/store.ts's own comment for where this project first
  // hit the same thing.
  pathFor;
  constructor(pathFor) {
    this.pathFor = pathFor;
  }
  async read(key, fallback) {
    const path = this.pathFor(key);
    if (!existsSync(path)) return fallback;
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      return fallback;
    }
  }
  async write(key, value) {
    const path = this.pathFor(key);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value, null, 2), "utf8");
    } catch (err) {
      console.warn(`FileStore write skipped for key '${key}': ${err.message}`);
    }
  }
};
var VercelKvStore = class {
  url;
  token;
  constructor(url, token) {
    this.url = url.replace(/\/+$/, "");
    this.token = token;
  }
  async call(path, init) {
    const res = await fetch(`${this.url}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init?.headers }
    });
    if (!res.ok) throw new Error(`Vercel KV ${path} failed (${res.status})`);
    return res.json();
  }
  async read(key, fallback) {
    try {
      const result = await this.call(`/get/${encodeURIComponent(key)}`);
      return result.result ? JSON.parse(result.result) : fallback;
    } catch {
      return fallback;
    }
  }
  async write(key, value) {
    await this.call(`/set/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify(value)
    });
  }
};
function createStore(pathFor) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return new VercelKvStore(url, token);
  return new FileStore(pathFor);
}

// src/demo-session.ts
var DEFAULT_ALIAS = "kith-web-daily-watch";
var SESSION_KEY = "demo-session";
async function readSession(path) {
  const store = createStore(() => path);
  return store.read(SESSION_KEY, { alias: DEFAULT_ALIAS, restartAt: null });
}
async function writeSession(path, session) {
  const store = createStore(() => path);
  await store.write(SESSION_KEY, session);
}
async function markRestart(path) {
  const current = await readSession(path);
  const next = { ...current, restartAt: (/* @__PURE__ */ new Date()).toISOString() };
  await writeSession(path, next);
  return next;
}

// src/presentation.ts
function headlineFor(m) {
  if (m.signals.includes("gap-drift")) {
    const days = Math.round(m.quietForH / 24);
    return days >= 1 ? `Quiet for ${days} day${days === 1 ? "" : "s"} \u2014 about ${m.quietRatio.toFixed(1)}\xD7 their usual rhythm.` : `Quiet for ${Math.round(m.quietForH)}h \u2014 about ${m.quietRatio.toFixed(1)}\xD7 their usual rhythm.`;
  }
  if (m.signals.includes("tone-shift")) {
    return "Recent messages have gotten noticeably shorter than usual.";
  }
  if (m.signals.includes("contribution")) {
    return `One of the most active people here \u2014 ${m.ans} question${m.ans === 1 ? "" : "s"} answered.`;
  }
  return "A signal worth a second look.";
}
function lastSeenFor(quietForH) {
  if (quietForH < 1) return "active moments ago";
  if (quietForH < 24) return `active ${Math.round(quietForH)}h ago`;
  const days = Math.round(quietForH / 24);
  return `active ${days} day${days === 1 ? "" : "s"} ago`;
}
function transformFeedMessages(messages, restartAt) {
  const sorted = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const restart = restartAt ? new Date(restartAt) : null;
  let sawHumanSinceRestart = false;
  return sorted.map((m) => {
    const isKith = m.senderType === 0 || m.senderType === 2;
    const ts = new Date(m.createdAt);
    const afterRestart = restart !== null && ts > restart;
    if (!isKith && afterRestart) sawHumanSinceRestart = true;
    const unprompted = isKith && afterRestart && !sawHumanSinceRestart;
    return {
      id: m.id,
      author: isKith ? "Kith" : "Steward",
      isKith,
      text: plainText(m.messageText),
      createdAt: m.createdAt,
      unprompted
    };
  });
}
function findPronounIssues(answer, members) {
  const GENDERED = /\b(he|him|his|she|her|hers)\b/gi;
  const issues = [];
  for (const m of members) {
    if (!/\(not stated\)/i.test(m.pronouns)) continue;
    const firstName = m.name.split(" ")[0];
    for (const needle of [m.name, firstName]) {
      let from = 0;
      while (true) {
        const idx = answer.indexOf(needle, from);
        if (idx === -1) break;
        from = idx + needle.length;
        const windowEnd = Math.min(answer.length, idx + needle.length + 200);
        let window = answer.slice(idx + needle.length, windowEnd);
        const sentenceEnd = window.search(/[.!?]\s|\n/);
        if (sentenceEnd !== -1) window = window.slice(0, sentenceEnd);
        GENDERED.lastIndex = 0;
        const match = GENDERED.exec(window);
        if (match) {
          issues.push({
            member: m.name,
            pronounUsed: match[0],
            context: `\u2026${needle}${window.slice(0, match.index + match[0].length + 20)}\u2026`
          });
        }
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return issues.filter((i) => seen.has(i.member) ? false : (seen.add(i.member), true));
}

// src/discord.ts
var API = "https://discord.com/api/v10";
var MSG_DEFAULT = 0;
var MSG_REPLY = 19;
var MSG_MEMBER_JOIN = 7;
var CHANNEL_TEXT = 0;
var DeadlineExceededError = class extends Error {
};
async function call(token, path, attempt = 0, deadline) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bot ${token}` }
  });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const waitMs = Math.ceil((body.retry_after ?? 1) * 1e3) + 100;
    if (attempt > 8) throw new Error(`Rate limited repeatedly on ${path}`);
    if (deadline !== void 0 && Date.now() + waitMs > deadline) {
      throw new DeadlineExceededError(
        `Rate limited on ${path}; waiting ${waitMs}ms would exceed the deadline`
      );
    }
    await new Promise((r) => setTimeout(r, waitMs));
    return call(token, path, attempt + 1, deadline);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return await res.json();
}
function getMe(token) {
  return call(token, "/users/@me");
}
async function listTextChannels(token, guildId) {
  const all = await call(token, `/guilds/${guildId}/channels`);
  return all.filter((c) => c.type === CHANNEL_TEXT);
}
function fetchPage(token, channelId, opts = {}) {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 100) });
  if (opts.before) q.set("before", opts.before);
  if (opts.after) q.set("after", opts.after);
  return call(token, `/channels/${channelId}/messages?${q}`, 0, opts.deadline);
}
async function checkContentAccess(token, channelId) {
  const page = await fetchPage(token, channelId, { limit: 100 });
  const human = page.filter(
    (m) => !m.author.bot && (m.type === MSG_DEFAULT || m.type === MSG_REPLY)
  );
  const withContent = human.filter((m) => m.content.trim().length > 0).length;
  return {
    // an empty channel is inconclusive rather than a failure
    ok: human.length === 0 || withContent > 0,
    sampled: human.length,
    withContent
  };
}
function displayName(u) {
  return u.global_name?.trim() || u.username;
}
function normalise(m) {
  const ts = new Date(m.timestamp).toISOString();
  if (m.type === MSG_MEMBER_JOIN) {
    return {
      event: {
        ts,
        actorId: `user${m.author.id}`,
        actorName: displayName(m.author),
        action: "join_guild",
        kind: "join",
        chatId: m.channel_id,
        source: "discord"
      }
    };
  }
  if (m.type !== MSG_DEFAULT && m.type !== MSG_REPLY) return {};
  if (m.author.bot) return {};
  return {
    message: {
      id: m.id,
      ts,
      authorId: `user${m.author.id}`,
      authorName: displayName(m.author),
      text: m.content,
      replyToId: m.referenced_message?.id,
      chatId: m.channel_id,
      source: "discord"
    }
  };
}
async function walkHistory(token, channelId, onPage, opts = {}) {
  let before;
  let pages = 0;
  let oldest;
  const maxPages = opts.maxPages ?? 1e4;
  const deadline = opts.deadlineMs !== void 0 ? Date.now() + opts.deadlineMs : void 0;
  let deadlineHit = false;
  while (pages < maxPages) {
    if (deadline !== void 0 && Date.now() >= deadline) {
      deadlineHit = true;
      break;
    }
    let page;
    try {
      page = await fetchPage(token, channelId, { before, limit: 100, deadline });
    } catch (err) {
      if (err instanceof DeadlineExceededError) {
        deadlineHit = true;
        break;
      }
      throw err;
    }
    if (page.length === 0) break;
    const messages = [];
    const events = [];
    for (const m of page) {
      const n = normalise(m);
      if (n.message) messages.push(n.message);
      if (n.event) events.push(n.event);
    }
    await onPage(messages, events);
    pages++;
    before = page[page.length - 1].id;
    oldest = new Date(page[page.length - 1].timestamp);
    if (opts.stopBefore && oldest < opts.stopBefore) break;
    if (page.length < 100) break;
  }
  return { pages, oldest, deadlineHit };
}
async function walkForward(token, channelId, afterId, onPage, opts = {}) {
  let after = afterId;
  let pages = 0;
  let newest;
  const maxPages = opts.maxPages ?? 50;
  const deadline = opts.deadlineMs !== void 0 ? Date.now() + opts.deadlineMs : void 0;
  let deadlineHit = false;
  while (pages < maxPages) {
    if (deadline !== void 0 && Date.now() >= deadline) {
      deadlineHit = true;
      break;
    }
    let page;
    try {
      page = await fetchPage(token, channelId, { after, limit: 100, deadline });
    } catch (err) {
      if (err instanceof DeadlineExceededError) {
        deadlineHit = true;
        break;
      }
      throw err;
    }
    if (page.length === 0) break;
    const messages = [];
    const events = [];
    for (const m of page) {
      const n = normalise(m);
      if (n.message) messages.push(n.message);
      if (n.event) events.push(n.event);
    }
    await onPage(messages, events);
    pages++;
    after = page[page.length - 1].id;
    newest = after;
    if (page.length < 100) break;
  }
  return { pages, newest, deadlineHit };
}

// src/ingest.ts
var FAREWELL = /\b(goodbye|farewell|i'?m out|leaving (the|this) (group|community)|signing off|last message here)\b/i;
function isFarewell(text) {
  return FAREWELL.test(text);
}

// src/members.ts
var HOUR = 1e3 * 60 * 60;
function median(xs) {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
function mad(xs) {
  if (xs.length === 0) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}
var QUESTION = /\?|^(how|what|where|why|when|who|can|could|does|do|is|are|any(one|body)|has anyone|help)\b/i;
function looksLikeQuestion(text) {
  return QUESTION.test(text.trim());
}
var RECENT_SAMPLE = 5;
function buildMemberStates(community, asOf = community.to) {
  const byId = /* @__PURE__ */ new Map();
  for (const m of community.messages) byId.set(m.id, m);
  const grouped = /* @__PURE__ */ new Map();
  for (const m of community.messages) {
    let list = grouped.get(m.authorId);
    if (!list) {
      list = [];
      grouped.set(m.authorId, list);
    }
    list.push(m);
  }
  const joinedAt = /* @__PURE__ */ new Map();
  for (const e of community.events) {
    if (e.kind !== "join") continue;
    const existing = joinedAt.get(e.actorId);
    if (!existing || e.ts < existing) joinedAt.set(e.actorId, e.ts);
  }
  const firstSeen = /* @__PURE__ */ new Map();
  for (const [id, msgs] of grouped) {
    const join = joinedAt.get(id);
    const firstMsg = msgs[0].ts;
    firstSeen.set(id, join && join < firstMsg ? join : firstMsg);
  }
  for (const [id, ts] of joinedAt) {
    if (!firstSeen.has(id)) firstSeen.set(id, ts);
  }
  const answers = /* @__PURE__ */ new Map();
  const answersToNewcomers = /* @__PURE__ */ new Map();
  const repliedTo = /* @__PURE__ */ new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const m of community.messages) {
    if (m.replyToId === void 0) continue;
    const target = byId.get(m.replyToId);
    if (!target) continue;
    if (target.authorId === m.authorId) continue;
    let set = repliedTo.get(m.authorId);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      repliedTo.set(m.authorId, set);
    }
    set.add(target.authorId);
    if (!looksLikeQuestion(target.text)) continue;
    bump(answers, m.authorId);
    const responderSince = firstSeen.get(m.authorId);
    const askerSince = firstSeen.get(target.authorId);
    if (responderSince && askerSince && askerSince > responderSince) {
      bump(answersToNewcomers, m.authorId);
    }
  }
  const states = /* @__PURE__ */ new Map();
  for (const [id, msgs] of grouped) {
    const first = firstSeen.get(id) ?? msgs[0].ts;
    const last = msgs[msgs.length - 1].ts;
    const gaps = [];
    for (let i = 1; i < msgs.length; i++) {
      gaps.push((msgs[i].ts.getTime() - msgs[i - 1].ts.getTime()) / HOUR);
    }
    const withText = msgs.filter((m) => m.length > 0);
    const lengths = withText.map((m) => m.length);
    const recentLengths = withText.slice(-RECENT_SAMPLE).map((m) => m.length);
    const priorRecentLengths = withText.slice(-RECENT_SAMPLE * 2, -RECENT_SAMPLE).map((m) => m.length);
    states.set(id, {
      id,
      name: msgs[msgs.length - 1].authorName,
      firstSeen: first,
      lastSeen: last,
      // Tenure is how long they have been here, measured to *now* — not the span
      // between their first and last message. Someone who posted twice in March
      // has been a member for months, not for two days.
      tenureDays: (asOf.getTime() - first.getTime()) / (HOUR * 24),
      activeSpanDays: (last.getTime() - first.getTime()) / (HOUR * 24),
      messageCount: msgs.length,
      medianGapHours: median(gaps),
      gapMadHours: mad(gaps),
      currentGapHours: (asOf.getTime() - last.getTime()) / HOUR,
      medianLength: median(lengths),
      lengthMad: mad(lengths),
      recentMedianLength: median(recentLengths),
      // median() of an empty window is 0, which the detector reads as
      // "persistence cannot be established" — lengths are always positive.
      priorRecentMedianLength: median(priorRecentLengths),
      answersGiven: answers.get(id) ?? 0,
      distinctRepliedTo: repliedTo.get(id)?.size ?? 0,
      answersToNewcomers: answersToNewcomers.get(id) ?? 0,
      saidFarewell: msgs.slice(-3).some((m) => isFarewell(m.text))
    });
  }
  return states;
}

// src/detectors.ts
var HOUR2 = 1e3 * 60 * 60;
var fmtDuration = (h) => h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;
var fmtDays = fmtDuration;
var DEFAULT_THRESHOLDS = {
  minObservations: 8,
  gapRatio: 3,
  gapMads: 3,
  minRhythmHours: 0.5,
  toneShrink: 0.6,
  tonePriorShrink: 0.8,
  toneMads: 2,
  newcomerPatience: 3,
  newcomerPatienceFloorH: 48,
  minActiveSpanDays: 7,
  contributionFloor: 0.4
};
function d1Contribution(states, t = DEFAULT_THRESHOLDS) {
  const scored = [...states.values()].map((s) => ({
    s,
    score: s.answersGiven + s.answersToNewcomers * 2 + s.distinctRepliedTo * 0.5
  }));
  const scores = scored.map((x) => x.score).sort((a, b) => b - a);
  const top = scores[0] ?? 0;
  if (top <= 0) return [];
  const out = [];
  for (const { s, score } of scored) {
    if (score <= 0) continue;
    const rank = scores.indexOf(score) + 1;
    if (score < top * t.contributionFloor) continue;
    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "contribution",
      confidence: Math.min(1, score / top),
      claim: `${s.name} has answered ${s.answersGiven} questions` + (s.answersToNewcomers > 0 ? `, ${s.answersToNewcomers} of them from people newer than they are` : "") + ` \u2014 ranked ${rank} of ${scored.length} in this community.`,
      evidence: [
        { at: s.firstSeen, fact: `joined; ${Math.round(s.tenureDays)} days of history` },
        { at: s.lastSeen, fact: `${s.messageCount} messages, ${s.answersGiven} answers, ${s.distinctRepliedTo} distinct people helped` }
      ],
      baseline: `top contributor score in this community is ${top.toFixed(1)}`
    });
  }
  return out;
}
function d2GapDrift(states, t = DEFAULT_THRESHOLDS) {
  const out = [];
  for (const s of states.values()) {
    if (s.messageCount < t.minObservations) continue;
    if (s.saidFarewell) continue;
    if (s.medianGapHours < t.minRhythmHours) continue;
    if (s.activeSpanDays < t.minActiveSpanDays) continue;
    const ratio = s.currentGapHours / s.medianGapHours;
    const madGuard = s.medianGapHours + t.gapMads * s.gapMadHours;
    if (ratio < t.gapRatio) continue;
    if (s.currentGapHours < madGuard) continue;
    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "gap-drift",
      confidence: Math.min(1, ratio / (t.gapRatio * 4)),
      claim: `${s.name} hasn't posted in ${fmtDays(s.currentGapHours)} \u2014 about ${ratio.toFixed(0)}\xD7 their usual gap.`,
      evidence: [
        { at: s.lastSeen, fact: `last message` },
        {
          at: s.firstSeen,
          fact: `normal rhythm is roughly one message every ${fmtDays(s.medianGapHours)}, measured over ${s.messageCount} messages`
        }
      ],
      baseline: `median gap ${fmtDays(s.medianGapHours)} (\xB1 ${fmtDays(s.gapMadHours)})`
    });
  }
  return out;
}
function d3ToneShift(states, t = DEFAULT_THRESHOLDS) {
  const out = [];
  for (const s of states.values()) {
    if (s.messageCount < t.minObservations) continue;
    if (s.medianLength <= 0) continue;
    const shrink = s.recentMedianLength / s.medianLength;
    if (shrink > t.toneShrink) continue;
    if (!(s.priorRecentMedianLength > 0)) continue;
    const priorShrink = s.priorRecentMedianLength / s.medianLength;
    if (priorShrink > t.tonePriorShrink) continue;
    if (s.medianLength - s.recentMedianLength < t.toneMads * s.lengthMad) continue;
    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "tone-shift",
      confidence: Math.min(1, (t.toneShrink - shrink) / t.toneShrink),
      claim: `${s.name}'s last ten or so messages have been much shorter than usual \u2014 about ${Math.round(s.recentMedianLength)} characters against their norm of ${Math.round(s.medianLength)}, and the window before that was already shortened (${Math.round(s.priorRecentMedianLength)} chars).`,
      evidence: [
        { at: s.lastSeen, fact: `recent messages median ${Math.round(s.recentMedianLength)} chars` },
        {
          at: s.lastSeen,
          fact: `the five before those median ${Math.round(s.priorRecentMedianLength)} chars \u2014 the taper is sustained`
        },
        { at: s.firstSeen, fact: `personal norm ${Math.round(s.medianLength)} chars over ${s.messageCount} messages` }
      ],
      baseline: `${Math.round(s.medianLength)} chars \xB1 ${Math.round(s.lengthMad)} is normal for this person`
    });
  }
  return out;
}
function communityReplyNorm(community) {
  const byId = /* @__PURE__ */ new Map();
  for (const m of community.messages) byId.set(m.id, m);
  const latencies = [];
  for (const m of community.messages) {
    if (m.replyToId === void 0) continue;
    const target = byId.get(m.replyToId);
    if (!target || target.authorId === m.authorId) continue;
    latencies.push((m.ts.getTime() - target.ts.getTime()) / HOUR2);
  }
  latencies.sort((a, b) => a - b);
  return latencies.length ? latencies[Math.floor(latencies.length / 2)] : 24;
}
function d4UnansweredNewcomers(community, states, asOf, t = DEFAULT_THRESHOLDS) {
  const byId = /* @__PURE__ */ new Map();
  for (const m of community.messages) byId.set(m.id, m);
  const normHours = communityReplyNorm(community);
  const gotReply = /* @__PURE__ */ new Set();
  for (const m of community.messages) {
    if (m.replyToId === void 0) continue;
    const target = byId.get(m.replyToId);
    if (target && target.authorId !== m.authorId) gotReply.add(m.replyToId);
  }
  const out = [];
  const patience = Math.max(normHours * t.newcomerPatience, t.newcomerPatienceFloorH);
  for (const s of states.values()) {
    const communitySpanDays = (community.to.getTime() - community.from.getTime()) / (HOUR2 * 24);
    const isNewcomer = s.tenureDays < Math.max(14, communitySpanDays * 0.2);
    if (!isNewcomer) continue;
    const theirs = community.messages.filter(
      (m) => m.authorId === s.id && m.length > 0
    );
    const first = theirs[0];
    if (!first) continue;
    const ageHours = (asOf.getTime() - first.ts.getTime()) / HOUR2;
    if (ageHours < patience) continue;
    if (gotReply.has(first.id)) continue;
    out.push({
      memberId: s.id,
      memberName: s.name,
      kind: "unanswered-newcomer",
      confidence: Math.min(1, ageHours / (patience * 2)),
      claim: `${s.name} joined ${Math.round(s.tenureDays)} days ago and their first message never got a reply.`,
      evidence: [
        { at: first.ts, fact: `first message: "${first.text.slice(0, 80)}"` },
        {
          at: asOf,
          fact: `still unanswered after ${fmtDays(ageHours)}; this community normally replies within ${fmtDays(normHours)}`
        }
      ],
      baseline: `community median time-to-first-reply is ${fmtDays(normHours)}`
    });
  }
  return out;
}
function compose(all) {
  const out = [];
  const newcomers = all.filter((o) => o.kind === "unanswered-newcomer");
  if (newcomers.length > 0) {
    const MAX_NAMES = 6;
    const byWait = [...newcomers].sort(
      (a, b) => a.evidence[0].at.getTime() - b.evidence[0].at.getTime()
    );
    const names = byWait.map((n) => n.memberName);
    const shown = names.slice(0, MAX_NAMES);
    const others = names.length - shown.length;
    const list = others > 0 ? `${shown.join(", ")}, and ${others} others` : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    out.push({
      memberId: newcomers.map((n) => n.memberId).join(","),
      memberName: list,
      headline: newcomers.length === 1 ? `${list} arrived recently and nobody has replied to them yet.` : `${newcomers.length} people arrived recently and none of them got a reply \u2014 ${list}.`,
      parts: newcomers,
      // batched, so weight is the strongest case rather than the sum: a pile of
      // newcomers should not outrank a person quietly burning out
      weight: Math.max(...newcomers.map((n) => n.confidence))
    });
  }
  const byMember = /* @__PURE__ */ new Map();
  for (const o of all) {
    if (o.kind === "unanswered-newcomer") continue;
    let list = byMember.get(o.memberId);
    if (!list) {
      list = [];
      byMember.set(o.memberId, list);
    }
    list.push(o);
  }
  for (const [memberId, parts] of byMember) {
    const kinds = new Set(parts.map((p) => p.kind));
    if (kinds.size === 1 && kinds.has("tone-shift")) continue;
    if (!(kinds.has("contribution") && kinds.has("gap-drift"))) continue;
    const name = parts[0].memberName;
    const tapering = kinds.has("tone-shift");
    out.push({
      memberId,
      memberName: name,
      headline: `${name} has been one of the people holding this community together, and has now gone quiet well beyond their own normal rhythm` + (tapering ? `, with their last messages tapering off first.` : `.`) + ` Worth reaching out personally.`,
      parts,
      weight: parts.reduce((sum, p) => sum + p.confidence, 0)
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
function runAll(community, states, asOf = community.to, t = DEFAULT_THRESHOLDS) {
  const observations = [
    ...d1Contribution(states, t),
    ...d2GapDrift(states, t),
    ...d3ToneShift(states, t),
    ...d4UnansweredNewcomers(community, states, asOf, t)
  ];
  return { observations, composites: compose(observations) };
}

// src/registry.ts
var isoDay = (d) => d.toISOString().slice(0, 10);
var round1 = (n) => Math.round(n * 10) / 10;
var roundReplyNorm = (n) => Math.max(0.01, Math.round(n * 100) / 100);
function slugify(name, id) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (base) return base;
  if (id) return `id-${id.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 12).toLowerCase()}`;
  return "unnamed";
}
var RELIABLE_AT = 8;
function buildRegistry(community, states, replyNormHours, newcomerObservations = [], generatedAt = /* @__PURE__ */ new Date()) {
  const members = [...states.values()].sort((a, b) => b.messageCount - a.messageCount).map((s) => {
    const rhythm = round1(s.medianGapHours);
    const quiet = round1(s.currentGapHours);
    return {
      key: `community.member.${slugify(s.name, s.id)}`,
      name: s.name,
      joined: isoDay(s.firstSeen),
      lastSeen: isoDay(s.lastSeen),
      n: s.messageCount,
      rhythmH: rhythm,
      spreadH: round1(s.gapMadHours),
      quietForH: quiet,
      quietRatio: rhythm > 0 ? round1(quiet / rhythm) : 0,
      baselineReliable: s.messageCount >= RELIABLE_AT,
      lenC: Math.round(s.medianLength),
      ans: s.answersGiven,
      ansNew: s.answersToNewcomers,
      helped: s.distinctRepliedTo,
      farewell: s.saidFarewell,
      pronouns: "they/them (not stated)"
    };
  });
  const unansweredNewcomers = newcomerObservations.filter((o) => o.kind === "unanswered-newcomer").map((o) => {
    const s = states.get(o.memberId);
    const first = o.evidence[0];
    const waited = o.evidence[1];
    return {
      name: o.memberName,
      key: `community.member.${slugify(o.memberName, o.memberId)}`,
      joined: s ? isoDay(s.firstSeen) : "",
      waitingH: waited ? round1(
        (new Date(waited.at).getTime() - new Date(first.at).getTime()) / (1e3 * 60 * 60)
      ) : 0,
      firstMessage: first ? first.fact.replace(/^first message: /, "") : ""
    };
  });
  return {
    community: community.name,
    generatedAt: generatedAt.toISOString(),
    window: { from: isoDay(community.from), to: isoDay(community.to) },
    memberCount: members.length,
    replyNormH: roundReplyNorm(replyNormHours),
    signals: { unansweredNewcomers },
    members
  };
}
function buildBriefing(community, composites, asOf) {
  return {
    community: community.name,
    asOf: asOf.toISOString(),
    cases: composites.map((c) => ({
      headline: c.headline,
      member: c.memberName,
      signals: c.parts.map((p) => ({
        kind: p.kind,
        claim: p.claim,
        baseline: p.baseline
      })),
      evidence: c.parts.flatMap(
        (p) => p.evidence.map((e) => ({
          at: e.at.toISOString().slice(0, 16).replace("T", " "),
          fact: e.fact
        }))
      )
    }))
  };
}
function estimateTokens(payload) {
  return Math.ceil(JSON.stringify(payload).length / 4);
}
function buildWatchlist(community, states, observations, generatedAt) {
  const signalsByMember = /* @__PURE__ */ new Map();
  for (const o of observations) {
    if (o.kind === "unanswered-newcomer") continue;
    let list = signalsByMember.get(o.memberId);
    if (!list) {
      list = [];
      signalsByMember.set(o.memberId, list);
    }
    list.push(o.kind);
  }
  const watching = [...signalsByMember.entries()].map(([id, kinds]) => {
    const s = states.get(id);
    const rhythm = round1(s.medianGapHours);
    const quiet = round1(s.currentGapHours);
    return {
      key: `community.member.${slugify(s.name, s.id)}`,
      name: s.name,
      pronouns: "they/them (not stated)",
      signals: kinds,
      quietForH: quiet,
      quietRatio: rhythm > 0 ? round1(quiet / rhythm) : 0,
      rhythmH: rhythm,
      baselineReliable: s.messageCount >= RELIABLE_AT,
      ans: s.answersGiven,
      ansNew: s.answersToNewcomers,
      n: s.messageCount
    };
  }).sort((a, b) => b.quietRatio - a.quietRatio);
  const unanswered = observations.filter((o) => o.kind === "unanswered-newcomer").map((o) => {
    const s = states.get(o.memberId);
    const first = o.evidence[0];
    const waited = o.evidence[1];
    return {
      name: o.memberName,
      key: `community.member.${slugify(o.memberName, o.memberId)}`,
      joined: s ? isoDay(s.firstSeen) : "",
      waitingH: waited ? round1(
        (new Date(waited.at).getTime() - new Date(first.at).getTime()) / (1e3 * 60 * 60)
      ) : 0,
      firstMessage: first ? first.fact.replace(/^first message: /, "") : ""
    };
  });
  return {
    community: community.name,
    generatedAt: generatedAt.toISOString(),
    memberCount: states.size,
    watching,
    signals: { unansweredNewcomers: unanswered },
    quiet: watching.length === 0 && unanswered.length === 0
  };
}

// src/onboarding.ts
var OnboardingError = class extends Error {
};
async function verifyDiscordToken(token) {
  try {
    const me = await getMe(token);
    return { username: me.username, id: me.id };
  } catch (err) {
    throw new OnboardingError(
      `Couldn't authenticate with that bot token: ${err.message}`
    );
  }
}
async function listChannels(token, guildId) {
  try {
    return await listTextChannels(token, guildId);
  } catch (err) {
    throw new OnboardingError(
      `Couldn't list channels for that server id: ${err.message}`
    );
  }
}
async function checkChannel(token, channelId) {
  try {
    return await checkContentAccess(token, channelId);
  } catch (err) {
    throw new OnboardingError(
      `Couldn't read that channel: ${err.message}`
    );
  }
}
function storedToCommunity(name, messages, events) {
  const mapped = messages.map((m) => ({
    id: m.id,
    ts: new Date(m.ts),
    authorId: m.authorId,
    authorName: m.authorName,
    text: m.text,
    length: m.text.length,
    replyToId: m.replyToId
  })).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const mappedEvents = events.map((e) => ({
    ts: new Date(e.ts),
    actorId: e.actorId,
    actorName: e.actorName,
    action: e.action,
    kind: e.kind
  })).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  if (mapped.length === 0) {
    throw new OnboardingError(
      "That channel has no human messages in the window checked \u2014 nothing to build a memory from yet."
    );
  }
  return {
    name,
    messages: mapped,
    events: mappedEvents,
    from: mapped[0].ts,
    to: mapped[mapped.length - 1].ts
  };
}
async function backfillCommunity(token, channelId, communityName, opts = {}) {
  const sinceDays = opts.sinceDays ?? 14;
  const maxPages = opts.maxPages ?? 30;
  const deadlineMs = opts.deadlineMs ?? 4e4;
  const stopBefore = new Date(Date.now() - sinceDays * 864e5);
  const messages = [];
  const events = [];
  const { pages, oldest, deadlineHit } = await walkHistory(
    token,
    channelId,
    async (m, e) => {
      messages.push(...m);
      events.push(...e);
    },
    { stopBefore, maxPages, deadlineMs }
  );
  const community = storedToCommunity(communityName, messages, events);
  return {
    community,
    stats: {
      pages,
      messagesSeen: messages.length,
      oldest: oldest?.toISOString().slice(0, 10),
      windowDays: sinceDays,
      // Either bound tripping means the backfill is a partial window, not
      // the full range requested — worth telling the caller either way.
      capped: pages >= maxPages || Boolean(deadlineHit)
    }
  };
}
function buildPayloads(community) {
  const states = buildMemberStates(community);
  const asOf = community.to;
  const { observations, composites } = runAll(community, states, asOf);
  const registry = buildRegistry(
    community,
    states,
    communityReplyNorm(community),
    observations,
    asOf
  );
  const briefing = buildBriefing(community, composites, asOf);
  const watchlist = buildWatchlist(community, states, observations, asOf);
  return {
    registry,
    briefing,
    watchlist,
    tokens: {
      registry: estimateTokens(registry),
      briefing: estimateTokens(briefing),
      watchlist: estimateTokens(watchlist)
    }
  };
}
async function startPush(apiKey, mindId, registry, watchlist) {
  const registryJson = JSON.stringify(registry);
  const watchlistJson = JSON.stringify(watchlist);
  const alias = freshAlias("kith-onboard");
  const text = pushInstruction(registryJson, watchlistJson);
  const before = await getCognitionBalance(apiKey, mindId).then((b) => b.cognition).catch(() => null);
  try {
    const { sentAt, afterFingerprint } = await sendOnly(apiKey, mindId, alias, text);
    return {
      alias,
      sentAt,
      ...afterFingerprint !== void 0 ? { afterFingerprint } : {},
      sentMessageText: text,
      before
    };
  } catch (err) {
    throw new OnboardingError(err.message);
  }
}
async function checkPush(apiKey, alias, ctx) {
  try {
    const reply = await findReply(apiKey, alias, ctx);
    return reply ? { text: reply.text, createdAt: reply.createdAt } : null;
  } catch (err) {
    throw new OnboardingError(err.message);
  }
}

// src/tenant-store.ts
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
var configStore = createStore((rawKey) => {
  const key = rawKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `data/tenants/${key}.json`;
});
var indexKey = "guild-index";
function deriveKey(salt) {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    throw new Error(
      "SERVER_SECRET is not set \u2014 cannot encrypt creator keys. Set it once in the deployment environment (any long random string)."
    );
  }
  return scryptSync(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
function encryptSecret(plaintext) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(salt), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([salt, iv, enc, cipher.getAuthTag()]).toString("base64")}`;
}
function decryptSecret(token) {
  if (!token.startsWith("v1:")) throw new Error("Unknown secret format");
  const raw = Buffer.from(token.slice(3), "base64");
  const salt = raw.subarray(0, 16);
  const iv = raw.subarray(16, 28);
  const ciphertext = raw.subarray(28, raw.length - 16);
  const tag = raw.subarray(raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
async function saveGuildConfig(config) {
  await configStore.write(`guild:${config.guildId}`, config);
  const index = await configStore.read(indexKey, []);
  if (!index.includes(config.guildId)) {
    await configStore.write(indexKey, [...index, config.guildId]);
  }
}
async function getGuildConfig(guildId) {
  return configStore.read(`guild:${guildId}`, null);
}
function getGuildMindsKey(config) {
  return decryptSecret(config.mindsKeyEnc);
}
async function listGuilds() {
  const index = await configStore.read(indexKey, []);
  const out = [];
  for (const id of index) {
    const config = await getGuildConfig(id);
    if (config) out.push(config);
  }
  return out;
}
var MAX_WINDOW_DAYS = 90;
async function appendGuildMessages(guildId, messages, events) {
  const existing = await configStore.read(`guild:${guildId}:messages`, {
    messages: [],
    events: []
  });
  const seen = new Set(existing.messages.map((m) => m.id));
  let added = 0;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    existing.messages.push(m);
    added++;
  }
  const seenEvents = new Set(existing.events.map((e) => `${e.actorId}:${e.ts}`));
  for (const e of events) {
    const k = `${e.actorId}:${e.ts}`;
    if (seenEvents.has(k)) continue;
    seenEvents.add(k);
    existing.events.push(e);
  }
  const cutoff = new Date(Date.now() - MAX_WINDOW_DAYS * 864e5).toISOString();
  existing.messages = existing.messages.filter((m) => m.ts >= cutoff).sort((a, b) => a.ts.localeCompare(b.ts));
  existing.events = existing.events.filter((e) => e.ts >= cutoff);
  await configStore.write(`guild:${guildId}:messages`, existing);
  return { total: existing.messages.length, added };
}
async function getGuildMessages(guildId) {
  return configStore.read(`guild:${guildId}:messages`, {
    messages: [],
    events: []
  });
}
function guildMessagesToCommunity(name, stored) {
  const mapped = stored.messages.map((m) => ({
    id: m.id,
    ts: new Date(m.ts),
    authorId: m.authorId,
    authorName: m.authorName,
    text: m.text,
    length: m.text.length,
    replyToId: m.replyToId
  })).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const mappedEvents = stored.events.map((e) => ({
    ts: new Date(e.ts),
    actorId: e.actorId,
    actorName: e.actorName,
    action: e.action,
    kind: e.kind
  })).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  if (mapped.length === 0) {
    throw new Error(`Guild ${name} has no stored messages yet`);
  }
  return {
    name,
    messages: mapped,
    events: mappedEvents,
    from: mapped[0].ts,
    to: mapped[mapped.length - 1].ts
  };
}
async function getCursor(guildId) {
  return configStore.read(`guild:${guildId}:cursor`, null);
}
async function setCursor(guildId, cursor) {
  await configStore.write(`guild:${guildId}:cursor`, cursor);
}

// src/mod-cache.ts
var modStore = createStore((key) => `data/mod-cache/${key}.json`);
var PERM_ADMINISTRATOR = 0x8n;
var PERM_MANAGE_MESSAGES = 0x2000n;
var PERM_MODERATE_MEMBERS = 0x40000000n;
var MOD_ROLE_NAMES = ["mod", "moderator", "admin", "administrator"];
function hasModPermissions(member, roles) {
  const memberRoles = roles.filter((r) => member.roles?.includes(r.id));
  let source = null;
  let roleId;
  let roleName;
  for (const role of memberRoles) {
    const perms = BigInt(role.permissions ?? "0");
    if ((perms & PERM_ADMINISTRATOR) !== 0n) {
      source = "administrator";
      roleId = role.id;
      roleName = role.name;
      break;
    }
    if ((perms & PERM_MANAGE_MESSAGES) !== 0n) {
      source = "manage_messages";
      roleId = role.id;
      roleName = role.name;
      break;
    }
    if ((perms & PERM_MODERATE_MEMBERS) !== 0n) {
      source = "moderate_members";
      roleId = role.id;
      roleName = role.name;
      break;
    }
    const lower = role.name.toLowerCase();
    if (MOD_ROLE_NAMES.some((n) => lower === n || lower.startsWith(n + " ") || lower.endsWith(" " + n))) {
      source = "role_name";
      roleId = role.id;
      roleName = role.name;
      break;
    }
  }
  if (!source) return null;
  return {
    userId: `user${member.user?.id ?? member.id}`,
    username: member.user?.username ?? member.nick ?? "Unknown",
    source,
    roleId,
    roleName,
    cachedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function fetchAndCacheMods(token, guildId) {
  const members = [];
  let after;
  while (true) {
    const q = new URLSearchParams({ limit: "1000" });
    if (after) q.set("after", after);
    const url = `https://discord.com/api/v10/guilds/${guildId}/members?${q}`;
    const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
    if (!res.ok) throw new Error(`Discord members fetch failed: ${res.status}`);
    const page = await res.json();
    if (!page.length) break;
    members.push(...page);
    after = page[page.length - 1].user.id;
    if (page.length < 1e3) break;
  }
  const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` }
  });
  if (!rolesRes.ok) throw new Error(`Discord roles fetch failed: ${rolesRes.status}`);
  const roles = await rolesRes.json();
  const mods = [];
  for (const member of members) {
    if (member.user?.bot) continue;
    const entry = hasModPermissions(member, roles);
    if (entry) mods.push(entry);
  }
  const cache = {
    guildId,
    mods,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await modStore.write(`guild:${guildId}:mods`, cache);
  return mods;
}
async function getMods(token, guildId, maxAgeHours = 24) {
  const cached = await modStore.read(`guild:${guildId}:mods`, null);
  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetchedAt).getTime()) / 36e5;
    if (ageHours < maxAgeHours && cached.mods.length > 0) {
      return cached.mods;
    }
  }
  return fetchAndCacheMods(token, guildId);
}

// src/interactions.ts
var interactionStore = createStore((key) => `data/interactions/${key}.json`);
function buildActionButtons(composite, guildId, mods) {
  const buttons = [];
  const targetId = composite.parts?.[0]?.memberId ?? composite.memberId;
  buttons.push({
    type: 2,
    // Button
    style: 1,
    // Primary (blurple)
    label: "Draft DM",
    custom_id: `kith:dm:${targetId}:${guildId}`
  });
  const mod = mods[0];
  if (mod) {
    buttons.push({
      type: 2,
      style: 2,
      // Secondary (grey)
      label: `Assign to ${mod.username}`,
      custom_id: `kith:assign:${mod.userId}:${targetId}:${guildId}`
    });
  }
  buttons.push({
    type: 2,
    style: 3,
    // Success (green)
    label: "Mark Resolved",
    custom_id: `kith:resolve:${targetId}:${guildId}`
  });
  return [
    {
      type: 1,
      // Action Row
      components: buttons
    }
  ];
}

// src/digest.ts
var LIMIT = 1900;
function renderDigest(community, composites, guildId, mods) {
  const date = community.to.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (composites.length === 0) {
    return {
      content: `**Kith \xB7 ${community.name} \xB7 ${date}**

**Quiet day.** Nobody needs you \u2014 that's the product working.`,
      components: []
    };
  }
  const lines = [`**Kith \xB7 ${community.name} \xB7 ${date}**`];
  const allComponents = [];
  for (const c of composites) {
    const headline = c.headline.replace(/\s+/g, " ").trim();
    lines.push("", `\u25B8 ${headline}`);
    const buttons = buildActionButtons(c, "placeholder", []);
    if (buttons.length > 0) {
      allComponents.push(...buttons);
    }
  }
  const text = lines.join("\n");
  return {
    content: text.length <= LIMIT ? text : text.slice(0, LIMIT - 1) + "\u2026",
    components: allComponents
  };
}
async function postDigest(token, channelId, content, components = []) {
  const body = { content, components };
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const body2 = await res.text().catch(() => "");
    throw new Error(`Discord digest post failed (${res.status}): ${body2.slice(0, 200)}`);
  }
  const sent = await res.json();
  return { id: sent.id };
}

// src/cron-poll.ts
var DEADLINE_MS = 45e3;
var MAX_PAGES_PER_CHANNEL = 10;
async function pollGuild(hostedToken, config, opts = { deadlineAt: Date.now() + DEADLINE_MS }) {
  const result = {
    guildId: config.guildId,
    added: 0,
    artifactsPushed: false,
    digestPosted: false
  };
  try {
    const cursor = await getCursor(config.guildId);
    let newest = cursor?.lastMessageId;
    for (const channelId of config.channelIds) {
      if (Date.now() >= opts.deadlineAt) break;
      const after = newest ?? snowflakeAt(config.connectedAt);
      const walk = await walkForward(hostedToken, channelId, after, async (messages, events) => {
        const r = await appendGuildMessages(config.guildId, messages, events);
        result.added += r.added;
      }, { maxPages: MAX_PAGES_PER_CHANNEL, deadlineMs: Math.max(5e3, opts.deadlineAt - Date.now()) });
      if (walk.newest) newest = walk.newest;
    }
    if (newest && newest !== cursor?.lastMessageId) {
      await setCursor(config.guildId, { lastMessageId: newest, lastTs: (/* @__PURE__ */ new Date()).toISOString() });
    }
    const stored = await getGuildMessages(config.guildId);
    if (stored.messages.length === 0) {
      result.skipped = "no messages stored yet";
      return result;
    }
    const community = guildMessagesToCommunity(config.guildName ?? config.guildId, stored);
    const payloads = buildPayloads(community);
    const watchlistJson = JSON.stringify(payloads.watchlist);
    if (opts.forcePush || watchlistJson !== config.lastWatchlistJson) {
      const apiKey = getGuildMindsKey(config);
      const alias = freshAlias("kith-cycle");
      await sendOnly(
        apiKey,
        config.mindId,
        alias,
        pushInstruction(JSON.stringify(payloads.registry), watchlistJson)
      );
      result.artifactsPushed = true;
      config.lastWatchlistJson = watchlistJson;
    }
    if (config.digestChannelId) {
      const states = buildMemberStates(community);
      const { composites } = runAll(community, states);
      const fingerprint = composites.map((c) => c.memberId).sort().join("|");
      if (composites.length > 0 && fingerprint !== config.lastDigestFingerprint) {
        const mods = await getMods(hostedToken, config.guildId);
        const digest = renderDigest(community, composites, config.guildId, mods);
        await postDigest(hostedToken, config.digestChannelId, digest.content, digest.components);
        result.digestPosted = true;
        config.lastDigestFingerprint = fingerprint;
      }
    }
    await saveGuildConfig({ ...config, lastPollAt: (/* @__PURE__ */ new Date()).toISOString() });
    return result;
  } catch (err) {
    result.error = err.message;
    return result;
  }
}
function snowflakeAt(iso) {
  const ms = new Date(iso).getTime() - 14200704e5;
  return (BigInt(Math.max(0, ms)) << 22n).toString();
}
async function runCycle(hostedToken) {
  const guilds = await listGuilds();
  const out = [];
  const deadlineAt = Date.now() + DEADLINE_MS;
  for (const config of guilds) {
    if (Date.now() >= deadlineAt) {
      out.push({ guildId: config.guildId, added: 0, artifactsPushed: false, digestPosted: false, skipped: "invocation out of time \u2014 next tick" });
      continue;
    }
    out.push(await pollGuild(hostedToken, config, { deadlineAt }));
  }
  return out;
}

// src/server.ts
var root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
async function loadEnv() {
  const path = root(".env");
  if (!existsSync2(path)) return {};
  const out = {};
  for (const line of (await readFile2(path, "utf8")).split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}
var env = { ...await loadEnv(), ...process.env };
var getApiKey = () => process.env.MINDS_BUILDER_API_KEY || env.MINDS_BUILDER_API_KEY;
var getMindId = () => process.env.KITH_MIND_ID || env.KITH_MIND_ID;
if (!getApiKey()) {
  console.error("MINDS_BUILDER_API_KEY is not set in .env \u2014 the live-answer route will fail.");
}
if (!getMindId()) {
  console.error(
    "KITH_MIND_ID is not set in .env \u2014 the live-answer route will fail.\n  Find your Mind's id with: minds list --pretty"
  );
}
var DATA = root("data");
var CONTENT = root("content");
var SESSION_PATH = `${DATA}/demo-session.json`;
var COGNITION_LOG_PATH = `${DATA}/cognition-log.json`;
var LIVE_ANSWER_PATH = `${DATA}/last-live-answer.json`;
var app = express();
app.disable("x-powered-by");
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json());
app.use(sanitizeBody);
app.use(apiRateLimiter);
app.use(authMiddleware);
app.use(express.static(root("public")));
var connectSchema = z.object({
  guildId: z.string().min(1),
  guildName: z.string().optional(),
  channelIds: z.array(z.string()).min(1),
  digestChannelId: z.string().optional(),
  apiKey: z.string().min(1),
  mindId: z.string().min(1)
});
var pushSchema = z.object({
  apiKey: z.string().min(1),
  mindId: z.string().min(1),
  registry: z.record(z.unknown()),
  watchlist: z.record(z.unknown()),
  confirm: z.literal(true)
});
var buildSchema = z.object({
  channelId: z.string().min(1),
  communityName: z.string().optional(),
  sinceDays: z.number().int().min(1).max(60).optional(),
  guildId: z.string().optional()
});
async function readJson(path, fallback) {
  if (!existsSync2(path)) return fallback;
  try {
    return JSON.parse(await readFile2(path, "utf8"));
  } catch {
    return fallback;
  }
}
var liveAnswerStore = createStore(() => LIVE_ANSWER_PATH);
var cognitionLogStore = createStore(() => COGNITION_LOG_PATH);
app.get("/api/registry", async (_req, res) => {
  const data = await readJson(`${DATA}/registry.json`, null);
  if (!data) {
    res.status(404).json({ error: "No registry.json yet \u2014 run `npm run registry` first." });
    return;
  }
  res.json(data);
});
app.get("/api/watchlist", async (_req, res) => {
  const data = await readJson(
    `${DATA}/watchlist.json`,
    null
  );
  if (!data) {
    res.status(404).json({ error: "No watchlist.json yet \u2014 run `npm run registry` first." });
    return;
  }
  res.json({
    ...data,
    watching: data.watching.map((m) => ({
      ...m,
      headline: headlineFor(m),
      lastSeen: lastSeenFor(m.quietForH)
    }))
  });
});
app.get("/api/briefing", async (_req, res) => {
  const data = await readJson(`${DATA}/briefing.json`, null);
  if (!data) {
    res.status(404).json({ error: "No briefing.json yet \u2014 run `npm run registry` first." });
    return;
  }
  res.json(data);
});
app.get("/api/baseline", async (_req, res) => {
  const data = await readJson(`${CONTENT}/baseline-answer.json`, null);
  res.json(
    data ?? {
      question: "Is anyone in the community struggling right now?",
      answer: "I don't have information about specific members.",
      source: "hand-authored"
    }
  );
});
app.get("/api/live-answer", async (_req, res) => {
  const cached = await liveAnswerStore.read("live-answer", null);
  if (!cached) {
    res.json({
      question: null,
      answer: null,
      capturedAt: null,
      note: "No live answer captured yet. Use the refresh button to ask Kith once."
    });
    return;
  }
  const registry = await readJson(
    `${DATA}/registry.json`,
    { members: [] }
  );
  const pronounIssues = cached.answer ? findPronounIssues(cached.answer, registry.members ?? []) : [];
  res.json({ ...cached, pronounIssues });
});
var LIVE_QUESTION = "Is anyone in the community struggling right now?";
var LIVE_PROMPT = `Check your kith-watchlist artifact (not the full kith-registry) to answer this: ${LIVE_QUESTION} The watchlist already contains everyone currently carrying a signal \u2014 you should not need the full registry to answer this question. When you refer to any member by name, including anyone mentioned only briefly or in passing, use their stated pronouns from the watchlist \u2014 they/them unless a pronoun is explicitly recorded for that specific person. This applies to every person named in your answer, not only whoever the answer is mainly about.`;
app.post("/api/live-answer/refresh", async (req, res) => {
  const apiKey = getApiKey();
  const mindId = getMindId();
  if (!apiKey || !mindId) {
    res.status(500).json({
      error: !apiKey ? "MINDS_BUILDER_API_KEY not configured on the server." : "KITH_MIND_ID not configured on the server \u2014 find yours with `minds list --pretty`."
    });
    return;
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition. Resend with { confirm: true } to proceed."
    });
    return;
  }
  const before = await getCognitionBalance(apiKey, mindId).then((b) => b.cognition).catch(() => null);
  const alias = freshAlias("kith-web-beata");
  try {
    const { sentAt, afterFingerprint } = await sendOnly(apiKey, mindId, alias, LIVE_PROMPT);
    res.json({ alias, sentAt, afterFingerprint, sentMessageText: LIVE_PROMPT, before });
  } catch (err) {
    res.status(502).json({ error: `Live query failed: ${err.message}` });
  }
});
app.post("/api/live-answer/status", async (req, res) => {
  const apiKey = getApiKey();
  const mindId = getMindId();
  if (!apiKey) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  const { alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing alias." });
    return;
  }
  let reply;
  try {
    reply = await findReply(apiKey, alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : void 0,
      afterFingerprint: typeof afterFingerprint === "string" ? afterFingerprint : void 0,
      sentAfter: typeof sentAfter === "string" ? sentAfter : void 0
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
    return;
  }
  if (!reply) {
    res.json({ done: false });
    return;
  }
  const registry = await readJson(
    `${DATA}/registry.json`,
    { members: [] }
  );
  const pronounIssues = findPronounIssues(reply.text, registry.members ?? []);
  const record = {
    question: LIVE_QUESTION,
    answer: reply.text,
    html: reply.html,
    capturedAt: reply.createdAt,
    alias,
    pronounIssues
  };
  try {
    await liveAnswerStore.write("live-answer", record);
  } catch (err) {
    console.error("Failed to persist live-answer (answer still returned):", err);
  }
  if (mindId && typeof before === "number") {
    try {
      const after = await getCognitionBalance(apiKey, mindId).catch(() => null);
      if (after) {
        const log = await cognitionLogStore.read("cognition-log", []);
        log.push({
          at: (/* @__PURE__ */ new Date()).toISOString(),
          question: LIVE_QUESTION,
          before,
          after: after.cognition,
          spent: Math.max(0, before - after.cognition)
        });
        await cognitionLogStore.write("cognition-log", log);
      }
    } catch (err) {
      console.error("Failed to update cognition log (answer still returned):", err);
    }
  }
  res.json({ done: true, ...record });
});
app.post("/api/draft/refresh", async (req, res) => {
  if (!API_KEY || !MIND_ID) {
    res.status(500).json({
      error: !API_KEY ? "MINDS_BUILDER_API_KEY not configured on the server." : "KITH_MIND_ID not configured on the server \u2014 find yours with `minds list --pretty`."
    });
    return;
  }
  if (req.body?.confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition. Resend with { confirm: true } to proceed."
    });
    return;
  }
  const memberKey = req.body?.memberKey;
  if (typeof memberKey !== "string" || !memberKey.trim()) {
    res.status(400).json({ error: "Missing memberKey." });
    return;
  }
  const watchlist = await readJson(`${DATA}/watchlist.json`, null);
  const member = watchlist?.watching.find((m) => m.key === memberKey);
  if (!member) {
    res.status(404).json({
      error: "That member isn't on the current watchlist \u2014 run `npm run registry` again if this seems stale."
    });
    return;
  }
  const headline = headlineFor(member);
  const prompt = `Draft a short, warm check-in message the creator could send to ${member.name}, a real member of this community you've been watching. Here's why they're flagged: ${headline} Use their stated pronouns from kith-watchlist if recorded, they/them otherwise. Keep it brief (2-4 sentences), personal, not corporate, and not presuming to know exactly what's wrong \u2014 an invitation to talk, not a diagnosis. Reply with ONLY the message text, nothing else \u2014 no preamble, no explanation, ready to copy and send as-is.`;
  const before = await getCognitionBalance(API_KEY, MIND_ID).then((b) => b.cognition).catch(() => null);
  const alias = freshAlias("kith-web-draft");
  try {
    const { sentAt, afterFingerprint } = await sendOnly(API_KEY, MIND_ID, alias, prompt);
    res.json({ alias, sentAt, afterFingerprint, sentMessageText: prompt, before, memberName: member.name });
  } catch (err) {
    res.status(502).json({ error: `Draft request failed: ${err.message}` });
  }
});
app.post("/api/draft/status", async (req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  const { alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing alias." });
    return;
  }
  let reply;
  try {
    reply = await findReply(API_KEY, alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : void 0,
      afterFingerprint: typeof afterFingerprint === "string" ? afterFingerprint : void 0,
      sentAfter: typeof sentAfter === "string" ? sentAfter : void 0
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
    return;
  }
  if (!reply) {
    res.json({ done: false });
    return;
  }
  if (MIND_ID && typeof before === "number") {
    try {
      const after = await getCognitionBalance(API_KEY, MIND_ID).catch(() => null);
      if (after) {
        const log = await cognitionLogStore.read("cognition-log", []);
        log.push({
          at: (/* @__PURE__ */ new Date()).toISOString(),
          question: "draft check-in message",
          before,
          after: after.cognition,
          spent: Math.max(0, before - after.cognition)
        });
        await cognitionLogStore.write("cognition-log", log);
      }
    } catch (err) {
      console.error("Failed to update cognition log (draft still returned):", err);
    }
  }
  res.json({ done: true, draft: reply.text, capturedAt: reply.createdAt });
});
app.get("/api/session", async (_req, res) => {
  res.json(await readSession(SESSION_PATH));
});
app.post("/api/session/mark-restart", async (_req, res) => {
  res.json(await markRestart(SESSION_PATH));
});
app.get("/api/live-feed", async (_req, res) => {
  if (!API_KEY) {
    res.status(500).json({ error: "MINDS_BUILDER_API_KEY not configured on the server." });
    return;
  }
  const session = await readSession(SESSION_PATH);
  try {
    const history = await getHistory(API_KEY, session.alias);
    res.json({
      alias: session.alias,
      restartAt: session.restartAt,
      messages: transformFeedMessages(history, session.restartAt)
    });
  } catch (err) {
    const message = err.message;
    const notFound = /404|NOT_FOUND|Conversation not found/i.test(message);
    res.status(notFound ? 200 : 502).json(
      notFound ? {
        alias: session.alias,
        restartAt: session.restartAt,
        messages: [],
        note: `"${session.alias}" hasn't been created yet \u2014 it comes into being the first time a message is sent to it. Before filming Beat B, send it one message (e.g. via \`minds chat create\`) to initialise it, then mark a restart.`
      } : { error: message }
    );
  }
});
function onboardingError(res, err) {
  if (err instanceof OnboardingError) {
    res.status(400).json({ error: err.message });
  } else {
    res.status(502).json({ error: err.message });
  }
}
function resolveToken(pasted) {
  if (typeof pasted === "string" && pasted.trim()) return pasted.trim();
  const hosted = process.env.DISCORD_BOT_TOKEN;
  return hosted && hosted.trim() ? hosted.trim() : null;
}
app.get("/api/invite-url", (_req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_CLIENT_ID)." });
    return;
  }
  const permissions = "66560";
  res.json({
    url: `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot&permissions=${permissions}`
  });
});
app.get("/api/setup/guilds", async (_req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    const res2 = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bot ${token}` }
    });
    if (!res2.ok) {
      res.status(502).json({ error: `Discord guild list failed (${res2.status}).` });
      return;
    }
    const guilds = await res2.json();
    res.json({ guilds: guilds.map((g) => ({ id: g.id, name: g.name })) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
app.post("/api/setup/connect", strictRateLimiter, validateBody(connectSchema), async (req, res) => {
  const { guildId, guildName, channelIds, digestChannelId, apiKey, mindId } = req.body ?? {};
  if (typeof guildId !== "string" || !guildId.trim()) {
    res.status(400).json({ error: "Missing server (guild) id." });
    return;
  }
  if (!Array.isArray(channelIds) || channelIds.length === 0 || !channelIds.every((c) => typeof c === "string")) {
    res.status(400).json({ error: "Missing channels to watch." });
    return;
  }
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof mindId !== "string" || !mindId.trim()) {
    res.status(400).json({ error: "Missing Minds Builder API key or Mind id." });
    return;
  }
  try {
    const balance = await getCognitionBalance(apiKey.trim(), mindId.trim());
    const existing = await getGuildConfig(guildId.trim());
    const config = {
      guildId: guildId.trim(),
      ...typeof guildName === "string" && guildName.trim() ? { guildName: guildName.trim() } : {},
      channelIds,
      ...typeof digestChannelId === "string" && digestChannelId.trim() ? { digestChannelId: digestChannelId.trim() } : {},
      mindsKeyEnc: encryptSecret(apiKey.trim()),
      mindId: mindId.trim(),
      connectedAt: existing?.connectedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      ...existing?.lastPollAt ? { lastPollAt: existing.lastPollAt } : {},
      ...existing?.lastWatchlistJson ? { lastWatchlistJson: existing.lastWatchlistJson } : {},
      ...existing?.lastDigestFingerprint ? { lastDigestFingerprint: existing.lastDigestFingerprint } : {}
    };
    await saveGuildConfig(config);
    res.json({ ok: true, cognition: balance.cognition, guilds: (await listGuilds()).length });
  } catch (err) {
    onboardingError(res, err);
  }
});
function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return !process.env.VERCEL;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${secret}`;
}
app.get("/api/cron/poll", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    res.json({ results: await runCycle(token) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
app.post("/api/cron/poll", async (req, res) => {
  if (!cronAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    res.status(501).json({ error: "Hosted bot not configured (missing DISCORD_BOT_TOKEN)." });
    return;
  }
  try {
    res.json({ results: await runCycle(token) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
var verifyDiscordSchema = z.object({ token: z.string().min(1) });
app.post("/api/setup/verify-discord", validateBody(verifyDiscordSchema), async (req, res) => {
  const token = resolveToken(req.body?.token);
  if (!token) {
    res.status(400).json({ error: "Missing Discord bot token (and no hosted bot configured)." });
    return;
  }
  try {
    res.json(await verifyDiscordToken(token));
  } catch (err) {
    onboardingError(res, err);
  }
});
var listChannelsSchema = z.object({ guildId: z.string().min(1) });
app.post("/api/setup/list-channels", validateBody(listChannelsSchema), async (req, res) => {
  const { guildId } = req.body ?? {};
  const token = resolveToken(req.body?.token);
  if (typeof guildId !== "string" || !guildId.trim()) {
    res.status(400).json({ error: "Missing server (guild) id." });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  try {
    const channels = await listChannels(token, guildId.trim());
    res.json({ channels });
  } catch (err) {
    onboardingError(res, err);
  }
});
var checkChannelSchema = z.object({ channelId: z.string().min(1) });
app.post("/api/setup/check-channel", validateBody(checkChannelSchema), async (req, res) => {
  const { channelId } = req.body ?? {};
  const token = resolveToken(req.body?.token);
  if (typeof channelId !== "string" || !channelId.trim()) {
    res.status(400).json({ error: "Missing channel id." });
    return;
  }
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  try {
    res.json(await checkChannel(token, channelId.trim()));
  } catch (err) {
    onboardingError(res, err);
  }
});
app.post("/api/setup/build", validateBody(buildSchema), async (req, res) => {
  const { channelId, communityName, sinceDays, guildId } = req.body;
  const token = resolveToken(req.body?.token);
  if (!token) {
    res.status(400).json({ error: "Missing token (and no hosted bot configured)." });
    return;
  }
  const days = Math.min(60, Math.max(1, Number(sinceDays) || 14));
  try {
    const { community, stats } = await backfillCommunity(
      token,
      channelId.trim(),
      typeof communityName === "string" && communityName.trim() ? communityName.trim() : "your community",
      { sinceDays: days }
    );
    if (typeof guildId === "string" && guildId.trim()) {
      const stored = community.messages.map((m) => ({
        id: m.id,
        ts: m.ts.toISOString(),
        authorId: m.authorId,
        authorName: m.authorName,
        text: m.text,
        replyToId: m.replyToId,
        chatId: channelId.trim(),
        source: "discord"
      }));
      const events = community.events.map((e) => ({
        ts: e.ts.toISOString(),
        actorId: e.actorId,
        actorName: e.actorName,
        action: e.action,
        kind: e.kind,
        chatId: channelId.trim(),
        source: "discord"
      }));
      await appendGuildMessages(guildId.trim(), stored, events);
    }
    const payloads = buildPayloads(community);
    res.json({ ...payloads, stats });
  } catch (err) {
    onboardingError(res, err);
  }
});
app.post("/api/setup/push", strictRateLimiter, validateBody(pushSchema), async (req, res) => {
  const { apiKey, mindId, registry, watchlist, confirm } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof mindId !== "string" || !mindId.trim()) {
    res.status(400).json({ error: "Missing Minds Builder API key or Mind id." });
    return;
  }
  if (!registry || typeof registry !== "object") {
    res.status(400).json({ error: "Missing registry \u2014 build it first." });
    return;
  }
  if (!watchlist || typeof watchlist !== "object") {
    res.status(400).json({ error: "Missing watchlist \u2014 build it first." });
    return;
  }
  if (confirm !== true) {
    res.status(400).json({
      error: "This spends real cognition on your Mind. Resend with { confirm: true } to proceed."
    });
    return;
  }
  try {
    res.json(await startPush(apiKey.trim(), mindId.trim(), registry, watchlist));
  } catch (err) {
    onboardingError(res, err);
  }
});
app.post("/api/setup/push/status", async (req, res) => {
  const { apiKey, mindId, alias, sentMessageText, afterFingerprint, sentAfter, before } = req.body ?? {};
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof alias !== "string" || !alias.trim()) {
    res.status(400).json({ error: "Missing apiKey or alias." });
    return;
  }
  try {
    const reply = await checkPush(apiKey.trim(), alias.trim(), {
      sentMessageText: typeof sentMessageText === "string" ? sentMessageText : "",
      ...typeof afterFingerprint === "string" ? { afterFingerprint } : {},
      ...typeof sentAfter === "string" ? { sentAfter } : {}
    });
    if (!reply) {
      res.json({ done: false });
      return;
    }
    let spent = null;
    if (typeof mindId === "string" && mindId.trim() && typeof before === "number") {
      const after = await getCognitionBalance(apiKey.trim(), mindId.trim()).catch(() => null);
      if (after) spent = Math.max(0, before - after.cognition);
    }
    res.json({ done: true, ...reply, spent });
  } catch (err) {
    onboardingError(res, err);
  }
});
app.get("/api/budget", async (_req, res) => {
  const log = await cognitionLogStore.read("cognition-log", []);
  const totalSpent = log.reduce((sum, e) => sum + e.spent, 0);
  res.json({ liveCallCount: log.length, totalSpent, entries: log });
});
app.get(/^(?!\/api\/).*/, (_req, res) => {
  const indexPath = root("public/index.html");
  if (existsSync2(indexPath)) {
    res.sendFile(indexPath, (err) => {
      if (err && !res.headersSent) {
        res.status(404).send("Frontend page not found.");
      }
    });
  } else {
    res.status(404).send("Frontend build not found \u2014 run `npm run web:build` first.");
  }
});
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});
if (!process.env.VERCEL) {
  const PORT = Number(env.PORT ?? 3131);
  app.listen(PORT, () => {
    console.log(`Kith web UI: http://localhost:${PORT}`);
  });
}
var server_default = app;
export {
  server_default as default
};
