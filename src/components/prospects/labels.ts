import type { LostReason, ProspectSource, ProspectStage } from "@/lib/types";

export const STAGE_LABELS: Record<ProspectStage, string> = {
  new: "New",
  contacted: "Contacted",
  proposal_sent: "Proposal sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export const SOURCE_LABELS: Record<ProspectSource, string> = {
  referral: "Referral",
  upwork: "Upwork",
  linkedin: "LinkedIn",
  cold_outreach: "Cold outreach",
  website: "Website",
  other: "Other",
};

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing",
  no_response: "No response",
  went_elsewhere: "Went elsewhere",
  other: "Other",
};

export function toItems<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}

/** A follow-up is due when it is today or earlier and the prospect is still open. */
export function isFollowUpDue(p: { nextFollowUp: string | null; stage: ProspectStage }, today: string): boolean {
  return !!p.nextFollowUp && p.nextFollowUp <= today && p.stage !== "won" && p.stage !== "lost";
}

/** Due follow-ups first (oldest date first), then newest created first. */
export function sortProspects<T extends { nextFollowUp: string | null; stage: ProspectStage; createdAt: Date }>(
  list: T[],
  today: string,
): T[] {
  return [...list].sort((a, b) => {
    const ad = isFollowUpDue(a, today);
    const bd = isFollowUpDue(b, today);
    if (ad !== bd) return ad ? -1 : 1;
    if (ad && bd) return (a.nextFollowUp ?? "").localeCompare(b.nextFollowUp ?? "");
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}
