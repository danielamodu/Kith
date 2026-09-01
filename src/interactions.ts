/**
 * Discord Message Component interaction handler.
 *
 * Handles button clicks from the digest messages:
 * - kith:dm:userId:guildId          -> open DM to creator with pre-filled draft
 * - kith:assign:modUserId:targetId:guildId -> DM mod with assignment
 * - kith:resolve:userId:guildId     -> mark case resolved, re-push registry
 *
 * Each button's custom_id encodes the action + params. Stateless, verifiable.
 *
 * Responses: we use Discord's interaction response types:
 * - Type 4 (Channel Message with Source) for ephemeral replies to the click
 * - Type 7 (Update Message) to disable the button and show confirmation
 */
import { createStore } from "./kv-store.ts";
import { getMods, pickMod } from "./mod-cache.ts";
import { sendOnly, findReply, pushInstruction } from "./minds-client.ts";
import { listGuilds, getGuildConfig, saveGuildConfig } from "./tenant-store.ts";
import { renderDigest } from "./digest.ts";
import { runCycle } from "./cron-poll.ts";
import { assignCase, resolveCase } from "./team-inbox.ts";
import nacl from "tweetnacl";
import type { GuildConfig } from "./tenant-store.ts";

const interactionStore = createStore((key) => `data/interactions/${key}.json`);

// Action types encoded in custom_id: "kith:<action>:<params...>"
type ActionType = "dm" | "assign" | "resolve";

interface ParsedAction {
  type: ActionType;
  params: Record<string, string>;
}

function parseCustomId(customId: string): ParsedAction | null {
  if (!customId.startsWith("kith:")) return null;
  const parts = customId.split(":");
  if (parts.length < 2) return null;
  const action = parts[1] as ActionType;
  if (!["dm", "assign", "resolve"].includes(action)) return null;

  const params: Record<string, string> = {};
  if (action === "dm") {
    if (parts.length >= 4) {
      params.userId = parts[2];
      params.guildId = parts[3];
    }
  } else if (action === "assign") {
    if (parts.length >= 5) {
      params.modUserId = parts[2];
      params.targetId = parts[3];
      params.guildId = parts[4];
    }
  } else if (action === "resolve") {
    if (parts.length >= 4) {
      params.userId = parts[2];
      params.guildId = parts[3];
    }
  }
  return { type: action, params };
}

export function buildActionButtons(composite: any, guildId: string, mods: any[]): any[] {
  const buttons = [];
  const targetId = composite.parts?.[0]?.memberId ?? composite.memberId;
  buttons.push({
    type: 2,
    style: 1,
    label: "Draft DM",
    custom_id: `kith:dm:${targetId}:${guildId}`,
  });
  const mod = mods[0];
  if (mod) {
    buttons.push({
      type: 2,
      style: 2,
      label: `Assign to ${mod.username}`,
      custom_id: `kith:assign:${mod.userId}:${targetId}:${guildId}`,
    });
  }
  buttons.push({
    type: 2,
    style: 3,
    label: "Mark Resolved",
    custom_id: `kith:resolve:${targetId}:${guildId}`,
  });
  return [{ type: 1, components: buttons }];
}

export async function handleComponentInteraction(interaction: any, hostedToken: string): Promise<any> {
  const customId = interaction.data?.custom_id;
  const parsed = parseCustomId(customId);
  if (!parsed) {
    return { type: 4, data: { content: "Unknown action.", flags: 64 } };
  }
  try {
    if (parsed.type === "dm") return await handleDraftDM(parsed.params, parsed.params.guildId, interaction);
    if (parsed.type === "assign") return await handleAssignModDeferred(parsed.params, parsed.params.guildId, interaction);
    if (parsed.type === "resolve") return await handleResolveDeferred(parsed.params, parsed.params.guildId, interaction);
  } catch (err) {
    console.error("Action error:", err);
    return { type: 4, data: { content: `Action failed: ${(err as Error).message}`, flags: 64 } };
  }
  return { type: 4, data: { content: "Unknown action.", flags: 64 } };
}

async function handleDraftDM(params: any, guildId: string, interaction: any): Promise<any> {
  const draft = `Hey! I noticed you've been quiet lately — just wanted to make sure you're doing okay. No pressure at all, just wanted you to know you're noticed.`;
  return {
    type: 4,
    data: { content: `**Draft DM ready to copy:**\n\n\`\`\n${draft}\n\`\`\n\nPaste this into a DM to the member.`, flags: 64 },
  };
}

async function handleAssignModDeferred(params: any, guildId: string, interaction: any): Promise<any> {
  try {
    const guilds = await listGuilds();
    const config = guilds.find((g) => g.guildId === guildId);
    if (!config) return { type: 4, data: { content: "Guild not configured.", flags: 64 } };
    const mods = await getMods(config.mindsKeyEnc, guildId);
    const mod = mods.find((m) => m.userId === params.modUserId) ?? mods[0];
    if (!mod) return { type: 4, data: { content: "No moderators available.", flags: 64 } };
    const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: params.modUserId.replace("user", "") }),
    });
    if (!dmRes.ok) throw new Error(`DM channel create failed: ${dmRes.status}`);
    const dmChannel = (await dmRes.json()) as any;
    const targetId = params.targetId;
    const message = `🔔 **Kith Assignment**\n**Target:** <@${targetId.replace("user", "")}>\n**Guild:** ${guildId}\n**Action needed:** Check in on this member — they've been flagged by Kith.\n\n[View in Dashboard](https://kithxbt.vercel.app/team/${guildId})`;
    await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
    await assignCase(guildId, targetId, targetId, mod.userId, mod.username, interaction.member?.user?.id ?? mod.userId);
    return { type: 4, data: { content: `✅ Assigned to **${mod.username}** — they've been DM'd. [View team inbox](https://kithxbt.vercel.app/team/${guildId})`, flags: 64 } };
  } catch (err) {
    return { type: 4, data: { content: `❌ Assignment failed: ${(err as Error).message}`, flags: 64 } };
  }
}

async function doAssignMod(_params: any, _guildId: string, _interaction: any): Promise<void> {}

async function handleResolveDeferred(params: any, guildId: string, interaction: any): Promise<any> {
  try {
    await resolveCase(guildId, params.userId);
  } catch (err) {
    return { type: 4, data: { content: `❌ Resolve failed: ${(err as Error).message}`, flags: 64 } };
  }
  return { type: 4, data: { content: "✅ Marked as resolved. The next cycle will clear this from the watchlist.", flags: 64 } };
}

async function doResolve(_params: any, _guildId: string, _interaction: any): Promise<void> {}

async function editInteraction(interaction: any, data: { content: string; components?: any[] }): Promise<void> {
  const token = interaction.token;
  const appId = interaction.application_id;
  if (!token || !appId) return;
  try {
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("Failed to edit interaction:", err);
  }
}

export function verifyInteractionSignature(signature: string, timestamp: string, body: string): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return true;
  try {
    return nacl.sign.detached.verify(Buffer.from(timestamp + body), Buffer.from(signature, "hex"), Buffer.from(publicKey, "hex"));
  } catch {
    return false;
  }
}
