import type { Milestone, Revision, RevisionStatus } from "@/lib/types";

/** Progress percentage from done milestone weights. */
export function progress(milestones: Pick<Milestone, "weight" | "done">[]): number {
  const total = milestones.reduce((sum, m) => sum + m.weight, 0);
  if (total <= 0) return 0;
  const done = milestones.filter((m) => m.done).reduce((sum, m) => sum + m.weight, 0);
  return Math.round((done / total) * 100);
}

/** Weights must be positive integers summing to exactly 100 (or there are no milestones). */
export function weightsValid(weights: number[]): boolean {
  if (weights.length === 0) return true;
  return weights.every((w) => Number.isInteger(w) && w > 0) && weights.reduce((a, b) => a + b, 0) === 100;
}

/** Revisions that count toward the allowance: everything except cancelled. */
export function countedRevisions(revisions: Pick<Revision, "status">[]): number {
  return revisions.filter((r) => r.status !== "cancelled").length;
}

export function nextRevisionRound(revisions: Pick<Revision, "status">[]): number {
  return countedRevisions(revisions) + 1;
}

export function isBillableRound(round: number, allowance: number): boolean {
  return round > allowance;
}

/** Revisions waiting on the admin. */
export const REVISION_WAITING_ON_ADMIN: RevisionStatus[] = ["awaiting_quote", "requested"];
/** Revisions that are open (for the "in revision" badge). */
export const REVISION_OPEN: RevisionStatus[] = ["awaiting_quote", "awaiting_approval", "requested", "in_progress", "delivered"];
/** Max open requests a client can have waiting on the admin at once. */
export const MAX_CLIENT_PENDING_REVISIONS = 3;
