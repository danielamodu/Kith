/**
 * The digest — Kith's outbound voice. Rendered entirely from the local
 * perception layer (compose()'s output), so it costs zero inference and
 * zero cognition, and arrives even when the Mind is slow or unreachable.
 * This is the creator-facing product surface for the hosted deployment:
 * they never run a command, they read one message a day — or nothing,
 * which is the point. Silence is a feature; most days the digest is short
 * because most days nothing needs them.
 */
import type { Community, Composite } from "./types.ts";
import { buildActionButtons } from "./interactions.ts";

const LIMIT = 1900; // Discord's hard cap is 2000 — leave room for the header

export function renderDigest(
  community: Community,
  composites: Composite[],
  guildId: string,
  mods: any[],
): { content: string; components: any[] } {
  const date = community.to.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (composites.length === 0) {
    return {
      content: `**Kith · ${community.name} · ${date}**\n\n**Quiet day.** Nobody needs you — that's the product working.`,
      components: [],
    };
  }

  const lines: string[] = [`**Kith · ${community.name} · ${date}**`];
  const allComponents: any[] = [];

  for (const c of composites) {
    const headline = c.headline.replace(/\s+/g, " ").trim();
    lines.push("", `▸ ${headline}`);

    // Build action buttons for this composite
    const buttons = buildActionButtons(c, "placeholder", []);
    if (buttons.length > 0) {
      allComponents.push(...buttons);
    }
  }

  const text = lines.join("\n");
  return {
    content: text.length <= LIMIT ? text : text.slice(0, LIMIT - 1) + "…",
    components: allComponents,
  };
}

/**
 * Post a digest message to a Discord channel with optional components (buttons).
 */
export async function postDigest(
  token: string,
  channelId: string,
  content: string,
  components: any[] = [],
): Promise<{ id: string }> {
  const body = { content, components };
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord digest post failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const sent = (await res.json()) as { id: string };
  return { id: sent.id };
}