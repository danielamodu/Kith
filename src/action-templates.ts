/**
 * Action templates — pre-written DM drafts and assignment messages.
 *
 * Each template is a function that takes context and returns the message text.
 * Templates are kept separate so they're easy to tweak without touching logic.
 */
import type { Composite } from "./types.ts";

export type ActionContext = {
  targetName: string;
  targetId: string;
  guildName: string;
  composite: Composite;
  // Optional extra context
  daysSilent?: number;
  quietRatio?: number;
};

/**
 * Draft a check-in DM the creator can send to a fading member.
 * Tone: warm, low-pressure, no guilt.
 */
export function draftCheckInDM(ctx: ActionContext): string {
  const { targetName, daysSilent, quietRatio, guildName } = ctx;
  const days = daysSilent ? Math.round(daysSilent) : "a while";
  const ratio = quietRatio ? `(${Math.round(quietRatio)}× their own rhythm)` : "";

  return `Hey ${targetName}! Just wanted to check in — you've been quiet for ${days} days ${ratio}, and I wanted to make sure you're doing okay. No pressure at all, no guilt trip — just wanted you to know you're noticed. Here if you need anything, or if you've just been busy. 🤝`;
}

/**
 * Draft a welcome-back DM for a returning member.
 */
export function draftWelcomeBackDM(ctx: ActionContext): string {
  const { targetName, guildName } = ctx;
  return `Hey ${targetName}! Good to see you back in ${guildName}. 🎉 Missed you around here — let me know if there's anything you need to jump back in.`;
}

/**
 * Draft a welcome DM for a newcomer who got no reply.
 */
export function draftNewcomerDM(ctx: ActionContext): string {
  const { targetName, guildName } = ctx;
  return `Hey ${targetName}! Welcome to ${guildName} — sorry your first message didn't get a reply. We're glad you're here. 👋 If you have questions or want an intro, just say the word.`;
}

/**
 * Assignment message sent to a moderator when a case is assigned.
 */
export function assignmentMessage(
  modUsername: string,
  targetName: string,
  targetId: string,
  guildName: string,
  reason: string,
): string {
  return `🔔 **Kith Assignment for @${modUsername}**

**Target:** ${targetName} (<@${targetId.replace("user", "")}>)
**Community:** ${guildName}
**Reason:** ${reason}

Please check in on them when you can. The digest has the full context.

[View in Dashboard](https://kithxbt.vercel.app/guild/{{guildId}})`;
}

/**
 * Resolution confirmation message.
 */
export function resolutionMessage(targetName: string, resolvedBy: string): string {
  return `✅ **Case Resolved**

**${targetName}** marked as resolved by **${resolvedBy}**.

The next cycle will clear this from the watchlist. If they drift again, Kith will flag it fresh.`;
}

/**
 * Schedule follow-up confirmation.
 */
export function followUpScheduledMessage(targetName: string, days: number): string {
  return `⏰ **Follow-up Scheduled**

I'll re-check **${targetName}** in **${days} days**. If they're still quiet, I'll flag it again.

You'll get a notification when it's time.`;
}

/**
 * Draft a proactive check-in for a high-contribution member fading.
 * More personal, acknowledges their contribution.
 */
export function draftContributorCheckIn(ctx: ActionContext): string {
  const { targetName, daysSilent, quietRatio, composite } = ctx;
  const contributed = composite?.parts?.some((p) => p.kind === "contribution");
  const contribLine = contributed
    ? "You've been one of the people holding this place together — "
    : "";

  return `Hey ${targetName}! ${contributedLine}I noticed you've been quieter lately (${ctx.daysSilent} days, ~${Math.round(ctx.quietRatio || 0)}× your usual rhythm). No pressure, just wanted you to know your presence is noticed. If something's up — burnout, life, boredom — no judgment. Just wanted you to know you matter here.`;
}