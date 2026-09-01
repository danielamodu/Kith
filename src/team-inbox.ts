/**
 * Team inbox — the queue where mods clear cases together.
 *
 * A guild's watchlist composites become assignments. An assignment is the
 * composite's memberId plus who owns it, when, and what happened. The
 * digest's buttons write here; the /team page reads here.
 *
 * Lifecycle: open → assigned → resolved → pruned (7 days after resolve).
 * The cron cycle never auto-resolves — a human does, so the product's
 * audit trail is the team's own decisions.
 */
import { createStore, type SmallStore } from "./kv-store.ts";

export type AssignmentStatus = "open" | "assigned" | "resolved";

export type Assignment = {
  memberId: string;
  memberName: string;
  guildId: string;
  status: AssignmentStatus;
  assigneeId?: string;
  assigneeName?: string;
  assignedBy?: string;
  assignedAt?: string;
  resolvedAt?: string;
  // how the case first appeared — frozen at assignment time for the queue
  headline?: string;
};

const teamStore: SmallStore = createStore((rawKey) => {
  const key = rawKey.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `data/tenants/${key}.json`;
});

const keyFor = (guildId: string) => `guild:${guildId}:assignments`;
const PRUNE_AFTER_DAYS = 7;

async function readRaw(guildId: string): Promise<Assignment[]> {
  return teamStore.read<Assignment[]>(keyFor(guildId), []);
}

async function writeRaw(guildId: string, list: Assignment[]): Promise<void> {
  await teamStore.write(keyFor(guildId), list);
}

/** Assign or reassign. Creates if new, overwrites assignee if existing. */
export async function assignCase(
  guildId: string,
  memberId: string,
  memberName: string,
  assigneeId: string,
  assigneeName: string,
  assignedBy: string,
  headline?: string,
): Promise<Assignment> {
  const list = await readRaw(guildId);
  const now = new Date().toISOString();
  const pruned = prune(list);
  const existing = pruned.find((a) => a.memberId === memberId);
  if (existing) {
    existing.status = "assigned";
    existing.assigneeId = assigneeId;
    existing.assigneeName = assigneeName;
    existing.assignedBy = assignedBy;
    existing.assignedAt = now;
    existing.headline = headline ?? existing.headline;
    existing.resolvedAt = undefined;
    await writeRaw(guildId, pruned);
    return existing;
  }
  const next: Assignment = {
    memberId,
    memberName,
    guildId,
    status: "assigned",
    assigneeId,
    assigneeName,
    assignedBy,
    assignedAt: now,
    headline,
  };
  pruned.push(next);
  await writeRaw(guildId, pruned);
  return next;
}

/** Resolve — stays visible for 7 days as proof the team acted. */
export async function resolveCase(guildId: string, memberId: string): Promise<Assignment | null> {
  const list = await readRaw(guildId);
  const found = list.find((a) => a.memberId === memberId);
  if (!found) return null;
  found.status = "resolved";
  found.resolvedAt = new Date().toISOString();
  await writeRaw(guildId, list);
  return found;
}

export async function listAssignments(guildId: string): Promise<Assignment[]> {
  return prune(await readRaw(guildId));
}

export async function seedOpenCases(
  guildId: string,
  composites: Array<{ memberId: string; memberName: string; headline?: string }>,
): Promise<number> {
  let list = prune(await readRaw(guildId));
  // One-time migration: the batched newcomers composite was previously
  // seeded as a single assignment with a comma-joined memberId — expand
  // never happened, and the inbox showed nothing useful. Prune it.
  const before = list.length;
  list = list.filter((a) => !a.memberId.includes(","));
  let added = 0;
  for (const c of composites) {
    if (list.some((a) => a.memberId === c.memberId)) continue;
    list.push({
      memberId: c.memberId,
      memberName: c.memberName,
      guildId,
      status: "open",
      headline: c.headline,
    });
    added++;
  }
  if (added > 0 || list.length !== before) await writeRaw(guildId, list);
  return added;
}

function prune(list: Assignment[]): Assignment[] {
  const cutoff = Date.now() - PRUNE_AFTER_DAYS * 86_400_000;
  return list.filter((a) => a.status !== "resolved" || new Date(a.resolvedAt!).getTime() > cutoff);
}
