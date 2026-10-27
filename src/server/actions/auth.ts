"use server";

// Placeholder. Owned by the auth and agreements work package.
import type { ActionResult } from "@/lib/types";

/** Admin: create or reuse the client's Auth user and email them a sign-in link. */
export async function inviteClientToPortal(clientId: string): Promise<ActionResult> {
  void clientId;
  return { ok: false, error: "Not implemented yet" };
}
