"use client";

import { useState } from "react";
import { FilePlus2, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/common/use-action";
import { createAgreement, sendAgreement } from "@/server/actions/agreements";

type Props = {
  projectId: string;
  /** The version that can be sent now (a draft, or one already sent), if any. */
  sendable: { id: string; version: number; status: "draft" | "sent" | "viewed" } | null;
  hasSigned: boolean;
  hasAny: boolean;
};

export function AgreementActions({ projectId, sendable, hasSigned, hasAny }: Props) {
  const { pending, execute } = useAction();
  const [confirming, setConfirming] = useState(false);

  function create(confirmScopeChange: boolean) {
    execute(() => createAgreement(projectId, { confirmScopeChange }), {
      success: "Agreement created. Review the PDF, then send it.",
      onSuccess: () => setConfirming(false),
    });
  }

  const createLabel = hasAny ? "Regenerate (new version)" : "Create agreement";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {sendable ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => execute(() => sendAgreement(projectId, sendable.id), { success: sendable.status === "draft" ? "Agreement sent to the client." : "Email sent again." })}
          >
            <Send data-icon="inline-start" />
            {sendable.status === "draft" ? "Send to client" : "Send again"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={sendable ? "outline" : "default"}
          disabled={pending || confirming}
          onClick={() => (hasSigned ? setConfirming(true) : create(false))}
        >
          <FilePlus2 data-icon="inline-start" />
          {createLabel}
        </Button>
      </div>

      {confirming ? (
        <Alert>
          <AlertTitle>This is a scope change</AlertTitle>
          <AlertDescription>
            <p>
              A signed agreement already exists. It stays signed and unchanged. The new version has to be sent to the client and signed on its own.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => create(true)}>
                Create new version
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
