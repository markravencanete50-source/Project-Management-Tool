import "server-only";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { col } from "@/server/data/refs";
import type { Activity } from "@/lib/types";

type Writer = { set(ref: DocumentReference, data: Record<string, unknown>): unknown };

export type ActivityInput = Omit<Activity, "id" | "createdAt" | "projectId" | "clientId" | "prospectId"> & {
  projectId?: string | null;
  clientId?: string | null;
  prospectId?: string | null;
};

/**
 * Queue one activity entry on a transaction or batch, so it commits atomically
 * with the state change it describes. Use visibility "client" only for entries
 * the client should see in the portal.
 */
export function logActivity(writer: Writer, entry: ActivityInput): void {
  writer.set(col.activity().doc(), {
    type: entry.type,
    message: entry.message,
    actor: entry.actor,
    visibility: entry.visibility,
    projectId: entry.projectId ?? null,
    clientId: entry.clientId ?? null,
    prospectId: entry.prospectId ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}
