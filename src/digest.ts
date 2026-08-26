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

const LIMIT = 1900; // Discord's hard cap is 2000 — leave room for the header

export function renderDigest(community: Community, composites: Composite[]): string {
  const date = community.to.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lines: string[] = [`**Kith · ${community.name} · ${date}**`];

  if (composites.length === 0) {
    lines.push("", "**Quiet day.** Nobody needs you — that's the product working.");
    return lines.join("\n");
  }

  // Headlines only. compose() already wrote the one-line version of each
  // claim; repeating the per-part details here just buries the point. The
  // dashboard carries the receipts.
  for (const c of composites) {
    lines.push("", "▸ " + c.headline.replace(/\s+/g, " ").trim());
  }

  const text = lines.join("\n");
  return text.length <= LIMIT ? text : text.slice(0, LIMIT - 1) + "…";
}

export async function postDigest(
  token: string,
  channelId: string,
  text: string,
): Promise<{ id: string }> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord digest post failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const sent = (await res.json()) as { id: string };
  return { id: sent.id };
}
