/**
 * Multi-tenant state for the hosted product: one deployed instance serves
 * many creators, each with their own guild, their own Mind, and their own
 * secrets. Everything here is keyed by guild id and stored through
 * kv-store.ts's SmallStore — Vercel KV when configured, files when not —
 * so local dev and serverless deployments run the same code.
 *
 * The one security-critical property: a creator's Minds Builder API key is
 * the key to their Mind's wallet and cognition. It is never stored
 * plaintext. encryptSecret/decryptSecret use AES-256-GCM keyed from the
 * deployment's SERVER_SECRET env (scrypt-derived, random salt per
 * ciphertext, auth-tag included). A leak of the KV store alone must not
 * leak anyone's key — that is the threat model this defends against, and
 * it is also the honest limit of it: whoever holds SERVER_SECRET holds
 * every creator key, which is why SERVER_SECRET lives only in the
 * deployment's environment, never in the repo or the KV store itself.
 */
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { createStore, type SmallStore } from "./kv-store.ts";
import type { StoredEvent, StoredMessage } from "./telegram.ts";
import type { Community, MembershipEvent, Message } from "./types.ts";

export type GuildConfig = {
  guildId: string;
  /** display name captured at connect time, for the dashboard and digests */
  guildName?: string;
  /** channels Kith reads */
  channelIds: string[];
  /** private channel the digest is posted to */
  digestChannelId?: string;
  /** the creator's Mind — encrypted at rest, never returned by getConfig */
  mindsKeyEnc: string;
  mindId: string;
  connectedAt: string;
  lastPollAt?: string;
  lastDigestAt?: string;
  /** fingerprint of the last re-pushed watchlist — quiet cycles skip the paid push */
  lastWatchlistJson?: string;
  /** composite memberIds of the last posted digest — unchanged composites don't re-post */
  lastDigestFingerprint?: string;
};

const configStore: SmallStore = createStore((rawKey) => {
  // Keys carry colons ("guild:<id>:messages") — legal in KV, illegal in
  // Windows filenames, and a FileStore write that fails does so SILENTLY
  // (warn and move on), which made the local fallback lose writes while
  // looking identical to a working KV path. Sanitize the key only — the
  // directory separators in the path template must survive.
  const key = rawKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `data/tenants/${key}.json`;
});

const indexKey = "guild-index";

// ── secrets ──────────────────────────────────────────────────────────────────

function deriveKey(salt: Buffer): Buffer {
  const secret = process.env.SERVER_SECRET;
  if (!secret) {
    throw new Error(
      "SERVER_SECRET is not set — cannot encrypt creator keys. " +
        "Set it once in the deployment environment (any long random string).",
    );
  }
  // N = 2^15 with maxmem raised to match — Node's 32MB default cap is one
  // byte short of what 128·N·r needs, and the failure is an obscure
  // "memory limit exceeded" at first encrypt. One derive per
  // encrypt/decrypt is negligible next to the Discord and Minds calls
  // that surround it.
  return scryptSync(secret, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** v1 format: base64(salt[16] || iv[12] || ciphertext||authtag) */
export function encryptSecret(plaintext: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(salt), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([salt, iv, enc, cipher.getAuthTag()]).toString("base64")}`;
}

export function decryptSecret(token: string): string {
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

// ── guild config ─────────────────────────────────────────────────────────────

export async function saveGuildConfig(config: GuildConfig): Promise<void> {
  await configStore.write(`guild:${config.guildId}`, config);
  const index = await configStore.read<string[]>(indexKey, []);
  if (!index.includes(config.guildId)) {
    await configStore.write(indexKey, [...index, config.guildId]);
  }
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  return configStore.read<GuildConfig | null>(`guild:${guildId}`, null);
}

/** The Minds API key, decrypted — only at the moment a Mind call is made. */
export function getGuildMindsKey(config: GuildConfig): string {
  return decryptSecret(config.mindsKeyEnc);
}

export async function listGuilds(): Promise<GuildConfig[]> {
  const index = await configStore.read<string[]>(indexKey, []);
  const out: GuildConfig[] = [];
  for (const id of index) {
    const config = await getGuildConfig(id);
    if (config) out.push(config);
  }
  return out;
}

export async function removeGuild(guildId: string): Promise<void> {
  await configStore.write(`guild:${guildId}`, null as unknown as object);
  const index = await configStore.read<string[]>(indexKey, []);
  await configStore.write(indexKey, index.filter((id) => id !== guildId));
}

// ── per-guild message store ──────────────────────────────────────────────────

export type GuildMessages = { messages: StoredMessage[]; events: StoredEvent[] };

const MAX_WINDOW_DAYS = 90;

/**
 * Append with dedupe by message id — Discord's `after` pagination and a
 * concurrent backfill can both surface the same message, and double-counted
 * messages would silently distort every baseline.
 */
export async function appendGuildMessages(
  guildId: string,
  messages: StoredMessage[],
  events: StoredEvent[],
): Promise<{ total: number; added: number }> {
  const existing = await configStore.read<GuildMessages>(`guild:${guildId}:messages`, {
    messages: [],
    events: [],
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

  // Keep the analysis window bounded: baselines come from the trailing 90
  // days, and an unbounded store would eventually blow past KV value limits.
  const cutoff = new Date(Date.now() - MAX_WINDOW_DAYS * 86_400_000).toISOString();
  existing.messages = existing.messages
    .filter((m) => m.ts >= cutoff)
    .sort((a, b) => a.ts.localeCompare(b.ts));
  existing.events = existing.events.filter((e) => e.ts >= cutoff);

  await configStore.write(`guild:${guildId}:messages`, existing);
  return { total: existing.messages.length, added };
}

export async function getGuildMessages(guildId: string): Promise<GuildMessages> {
  return configStore.read<GuildMessages>(`guild:${guildId}:messages`, {
    messages: [],
    events: [],
  });
}

/** Mirrors onboarding.ts's storedToCommunity — same shape, no disk. */
export function guildMessagesToCommunity(
  name: string,
  stored: GuildMessages,
): Community {
  const mapped: Message[] = stored.messages
    .map((m) => ({
      id: m.id,
      ts: new Date(m.ts),
      authorId: m.authorId,
      authorName: m.authorName,
      text: m.text,
      length: m.text.length,
      replyToId: m.replyToId,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const mappedEvents: MembershipEvent[] = stored.events
    .map((e) => ({
      ts: new Date(e.ts),
      actorId: e.actorId,
      actorName: e.actorName,
      action: e.action,
      kind: e.kind,
    }))
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());
  if (mapped.length === 0) {
    throw new Error(`Guild ${name} has no stored messages yet`);
  }
  return {
    name,
    messages: mapped,
    events: mappedEvents,
    from: mapped[0]!.ts,
    to: mapped[mapped.length - 1]!.ts,
  };
}

// ── poll cursor ──────────────────────────────────────────────────────────────

export type PollCursor = { lastMessageId: string; lastTs: string };

export async function getCursor(guildId: string): Promise<PollCursor | null> {
  return configStore.read<PollCursor | null>(`guild:${guildId}:cursor`, null);
}

export async function setCursor(guildId: string, cursor: PollCursor): Promise<void> {
  await configStore.write(`guild:${guildId}:cursor`, cursor);
}
