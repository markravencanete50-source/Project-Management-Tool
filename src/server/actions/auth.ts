"use server";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { inviteSchema, requestLinkSchema } from "@/lib/validation/agreements";
import { LOGIN_LINK_COOLDOWN_MS, issueClientLink } from "@/server/auth-helpers";
import { logActivity } from "@/server/activity";
import { run, UserError } from "@/server/action";
import { fromDoc, fromDocs } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import type { ActionResult, Client } from "@/lib/types";

/**
 * Public. Email a sign-in link when the address belongs to a client. The result
 * is the same whether or not the address exists, so this cannot be used to
 * discover who the clients are. Only a malformed address is reported.
 */
export async function requestClientLink(email: string): Promise<ActionResult> {
  return run<undefined>(async () => {
    const parsed = requestLinkSchema.parse({ email });
    try {
      const snap = await col.clients().where("email", "==", parsed.email).get();
      const client = fromDocs<Client>(snap).find((c) => !c.archivedAt);
      if (client) {
        // Rate limit: ignore the request when a link was issued for this client in the last minute.
        const recent = await col.loginTokens().where("clientId", "==", client.id).get();
        const cutoff = Date.now() - LOGIN_LINK_COOLDOWN_MS;
        const tooSoon = recent.docs.some((d) => {
          const createdAt = d.get("createdAt") as { toMillis(): number } | undefined;
          return createdAt ? createdAt.toMillis() > cutoff : false;
        });
        if (!tooSoon) await issueClientLink(client, "login", "/portal");
      }
    } catch (err) {
      // Never let a failure reveal whether the address belongs to a client.
      console.error("requestClientLink failed", err);
    }
    return undefined;
  });
}

/** Admin: email the client a link that signs them into the portal. */
export async function inviteClientToPortal(clientId: string): Promise<ActionResult> {
  return run<undefined>(async () => {
    await requireAdmin();
    const parsed = inviteSchema.parse({ clientId });
    const snap = await col.clients().doc(parsed.clientId).get();
    if (!snap.exists) throw new UserError("Client not found");
    const client = fromDoc<Client>(snap);
    if (client.archivedAt) throw new UserError("This client is archived. Restore the client before inviting them.");
    if (!client.email) throw new UserError("This client has no email address.");

    await issueClientLink(client, "invite", "/portal");

    const batch = db().batch();
    logActivity(batch, {
      type: "client.invited",
      message: `Portal invitation sent to ${client.name}`,
      actor: "admin",
      visibility: "internal",
      clientId: client.id,
    });
    await batch.commit();
    return undefined;
  });
}
