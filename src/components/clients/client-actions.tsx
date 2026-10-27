"use client";

import { Archive, ArchiveRestore, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/common/use-action";
import { archiveClient, unarchiveClient } from "@/server/actions/clients";
import { inviteClientToPortal } from "@/server/actions/auth";

export function ClientActions({ clientId, archived }: { clientId: string; archived: boolean }) {
  const { pending, execute } = useAction();

  return (
    <>
      {!archived ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => execute(() => inviteClientToPortal(clientId), { success: "Invitation sent" })}
        >
          <Send data-icon="inline-start" />
          Invite to portal
        </Button>
      ) : null}
      {archived ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => execute(() => unarchiveClient(clientId), { success: "Client restored" })}
        >
          <ArchiveRestore data-icon="inline-start" />
          Restore
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => execute(() => archiveClient(clientId), { success: "Client archived" })}
        >
          <Archive data-icon="inline-start" />
          Archive
        </Button>
      )}
    </>
  );
}
