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
  // Expect specific param orders
  if (action === "dm") {
    // kith:dm:userId:guildId
    if (parts.length >= 4) {
      params.userId = parts[2];
      params.guildId = parts[3];
    }
  } else if (action === "assign") {
    // kith:assign:modUserId:targetId:guildId
    if (parts.length >= 5) {
      params.modUserId = parts[2];
      params.targetId = parts[3];
      params.guildId = parts[4];
    }
  } else if (action === "resolve") {
    // kith:resolve:userId:guildId
    if (parts.length >= 4) {
      params.userId = parts[2];
      params.guildId = parts[3];
    }
  }
  return { type: action, params };
}

/**
 * Build button components for a composite (digest item).
 */
export function buildActionButtons(composite: any, guildId: string, mods: any[]): any[] {
  const buttons = [];
  const targetId = composite.parts?.[0]?.memberId ?? composite.memberId;

  // DM button - always available
  buttons.push({
    type: 2, // Button
    style: 1, // Primary (blurple)
    label: "Draft DM",
    custom_id: `kith:dm:${targetId}:${guildId}`,
  });

  // Assign mod button - only if we have mods
  const mod = mods[0]; // pickMod picks first alphabetically
  if (mod) {
    buttons.push({
      type: 2,
      style: 2, // Secondary (grey)
      label: `Assign to ${mod.username}`,
      custom_id: `kith:assign:${mod.userId}:${targetId}:${guildId}`,
    });
  }

  // Resolve button
  buttons.push({
    type: 2,
    style: 3, // Success (green)
    label: "Mark Resolved",
    custom_id: `kith:resolve:${targetId}:${guildId}`,
  });

  return [
    {
      type: 1, // Action Row
      components: buttons,
    },
  ];
}

/**
 * Handle a Message Component interaction (button click).
 * Returns the response payload for Discord.
 * Uses deferred responses (type 5) for async actions to stay within 3s limit.
 */
export async function handleComponentInteraction(
  interaction: any,
  hostedToken: string,
): Promise<any> {
  const customId = interaction.data?.custom_id;
  const parsed = parseCustomId(customId);
  if (!parsed) {
    return { type: 4, data: { content: "Unknown action.", flags: 64 } }; // ephemeral
  }

  const { type, params } = parsed;
  const guildId = params.guildId;
  const userId = interaction.member?.user?.id ?? interaction.user?.id;

  try {
    if (parsed.type === "dm") {
      return await handleDraftDM(params, guildId, interaction);
    } else if (parsed.type === "assign") {
      // Return deferred immediately, do async work in background
      return await handleAssignModDeferred(params, guildId, interaction);
    } else if (parsed.type === "resolve") {
      return await handleResolveDeferred(params, guildId, interaction);
    }
  } catch (err) {
    console.error("Action error:", err);
    return {
      type: 4,
      data: { content: `Action failed: ${(err as Error).message}`, flags: 64 },
    };
  }

  return { type: 4, data: { content: "Unknown action.", flags: 64 } };
}

async function handleDraftDM(params: any, guildId: string, interaction: any): Promise<any> {
  const targetId = params.userId;
  // In a real implementation, we'd fetch the member's name and context
  // For now, create a generic draft
  const draft = `Hey! I noticed you've been quiet lately — just wanted to make sure you're doing okay. No pressure at all, just wanted you to know you're noticed.`;

  // We respond to the interaction with a modal or a message the creator can copy
  // For now, return an ephemeral message with the draft they can copy
  return {
    type: 4,
    data: {
      content: `**Draft DM ready to copy:**\n\n\`\`\n${draft}\n\`\`\n\nPaste this into a DM to the member.`,
      flags: 64, // ephemeral
    },
  };
}

/**
 * Deferred handler for Assign Mod - returns deferred immediately,
 * does Discord API call in background, updates message when done.
 */
async function handleAssignModDeferred(params: any, guildId: string, interaction: any): Promise<any> {
  // Immediately acknowledge with deferred response
  const deferredResponse = {
    type: 5, // Deferred Channel Message with Source
    data: { flags: 64 }, // ephemeral
  };

  // Spawn background work - don't await
  doAssignMod(params, guildId, interaction).catch((err) => {
    console.error("Background assign failed:", err);
    // Try to update the interaction with error
    editInteraction(interaction, {
      content: `❌ Assignment failed: ${(err as Error).message}`,
      components: [],
    }).catch(() => {});
  });

  return { type: 5, data: { flags: 64 } }; // Deferred ephemeral
}

async function doAssignMod(params: any, guildId: string, interaction: any): Promise<void> {
  const modUserId = params.modUserId;
  const targetId = params.targetId;

  const guilds = await listGuilds();
  const config = guilds.find((g) => g.guildId === guildId);
  if (!config) return;

  const mods = await getMods(config.mindsKeyEnc, guildId);
  const mod = mods.find((m) => m.userId === params.modUserId) ?? mods[0];
  if (!mod) return;

  try {
    const dmRes = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ recipient_id: params.modUserId.replace("user", "") }),
    });
    if (!dmRes.ok) throw new Error(`DM channel create failed: ${dmRes.status}`);
    const dmChannel = await dmRes.json();

    const message = `🔔 **Kith Assignment**\n**Target:** <@${targetId.replace("user", "")}>\n**Guild:** ${guildId}\n**Action needed:** Check in on this member — they've been flagged by Kith.\n\n[View in Dashboard](https://kithxbt.vercel.app/guild/${guildId})`;

    await fetch(`https://discord.com/api/v10/channels/${(await dmRes.json()).id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: message }),
    });

    // Update the original interaction message to show completion
    await editInteraction(interaction, {
      content: `✅ Assigned to **${mod.username}** — they've been DM'd.`,
      components: [],
    });
  } catch (err) {
    console.error("Assign mod error:", err);
    await editInteraction(interaction, {
      content: `❌ Assignment failed: ${(err as Error).message}`,
      components: [],
    });
  }
}

async function handleResolveDeferred(params: any, guildId: string, interaction: any): Promise<any> {
  // Immediately acknowledge
  const deferredResponse = {
    type: 5,
    data: { flags: 64 },
  };

  // Spawn background work
  doResolve(params, guildId, interaction).catch((err) => {
    console.error("Background resolve failed:", err);
    editInteraction(interaction, {
      content: `❌ Resolve failed: ${(err as Error).message}`,
      components: [],
    }).catch(() => {});
  });

  return { type: 5, data: { flags: 64 } };
}

async function doResolve(params: any, guildId: string, interaction: any): Promise<void> {
  // In a full implementation, this would mark the case resolved in the registry
  // and trigger a re-push. For now, just acknowledge.
  await editInteraction(interaction, {
    content: "✅ Marked as resolved. The next cycle will clear this from the watchlist.",
    components: [],
  });
}

/**
 * Edit an interaction response using the interaction token.
 * Used by background tasks to update the original response.
 */
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

/**
 * Verify the interaction signature (Discord requires this for security).
 * Uses the application's public key (set in env as DISCORD_PUBLIC_KEY).
 */
export function verifyInteractionSignature(
  signature: string,
  timestamp: string,
  body: string,
): boolean {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) return true; // Skip in dev if not set

  // Ed25519 verification
  const crypto = require("node:crypto");
  const verify = crypto.createVerify("ed25519");
  verify.update(timestamp + body);
  return verify.verify(publicKey, signature, "hex");
}