/**
 * Mod cache — caches moderators/admins per guild so actions can assign
 * the right person without the creator guessing.
 *
 * A "mod" is anyone with:
 * - Administrator permission
 * - Manage Messages
 * - Moderate Members
 * - A role named "mod" / "moderator" / "admin" (case-insensitive)
 *
 * Cache lives in the tenant store, refreshed on connect and on
 * GUILD_ROLE_UPDATE / GUILD_MEMBER_UPDATE events.
 */
import { createStore } from "./kv-store.ts";
import type { DiscordRole, DiscordGuildMember } from "./discord.ts";

const modStore = createStore((key) => `data/mod-cache/${key}.json`);

export type ModEntry = {
  userId: string;
  username: string;
  // Which permission qualified them
  source: "administrator" | "manage_messages" | "moderate_members" | "role_name";
  roleId?: string;
  roleName?: string;
  cachedAt: string;
};

export type GuildModCache = {
  guildId: string;
  mods: ModEntry[];
  fetchedAt: string;
};

// Permission bitmasks (Discord)
const PERM_ADMINISTRATOR = 0x8n;
const PERM_MANAGE_MESSAGES = 0x2000n;
const PERM_MODERATE_MEMBERS = 0x40000000n;

const MOD_ROLE_NAMES = ["mod", "moderator", "admin", "administrator"];

function hasModPermissions(member: DiscordGuildMember, roles: DiscordRole[]): ModEntry | null {
  // Check explicit permissions on member's roles
  const memberRoles = roles.filter((r) => member.roles?.includes(r.id));
  let source: ModEntry["source"] | null = null;
  let roleId: string | undefined;
  let roleName: string | undefined;

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
    // Check role name
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
    cachedAt: new Date().toISOString(),
  };
}

/**
 * Fetch and cache mods for a guild. Uses the hosted bot token.
 */
export async function fetchAndCacheMods(
  token: string,
  guildId: string,
): Promise<ModEntry[]> {
  // Fetch all members (paginated)
  const members: any[] = [];
  let after: string | undefined;
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
    if (page.length < 1000) break;
  }

  // Fetch roles
  const rolesRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!rolesRes.ok) throw new Error(`Discord roles fetch failed: ${rolesRes.status}`);
  const roles: DiscordRole[] = await rolesRes.json();

  // Evaluate each member
  const mods: ModEntry[] = [];
  for (const member of members) {
    // Skip bots
    if (member.user?.bot) continue;
    const entry = hasModPermissions(member, roles);
    if (entry) mods.push(entry);
  }

  // Cache
  const cache: GuildModCache = {
    guildId,
    mods,
    fetchedAt: new Date().toISOString(),
  };
  await modStore.write(`guild:${guildId}:mods`, cache);

  return mods;
}

/**
 * Get cached mods, fetching if stale (>24h) or missing.
 */
export async function getMods(
  token: string,
  guildId: string,
  maxAgeHours = 24,
): Promise<ModEntry[]> {
  const cached = await modStore.read<GuildModCache | null>(`guild:${guildId}:mods`, null);
  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetchedAt).getTime()) / 3_600_000;
    if (ageHours < maxAgeHours && cached.mods.length > 0) {
      return cached.mods;
    }
  }
  // Stale or missing — refetch
  return fetchAndCacheMods(token, guildId);
}

/**
 * Invalidate a guild's mod cache (called on role/member updates).
 */
export async function invalidateModCache(guildId: string): Promise<void> {
  await modStore.write(`guild:${guildId}:mods`, null as unknown as GuildModCache);
}

/**
 * Pick a mod for assignment — simple round-robin by username for now.
 * Could be smarter (timezone, workload), but this works for v1.
 */
export function pickMod(mods: ModEntry[]): ModEntry | null {
  if (!mods.length) return null;
  // Deterministic: sort by username, pick first
  const sorted = [...mods].sort((a, b) => a.username.localeCompare(b.username));
  return sorted[0];
}