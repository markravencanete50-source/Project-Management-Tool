"use client";

import { Button } from "@/components/ui/button";
import { useAction } from "@/components/common/use-action";
import { decideChangeOrder, setRevisionStatus } from "@/server/actions/revisions";
import type { RevisionStatus } from "@/lib/types";

/** Client controls for one revision: decide a change order, or approve delivered work. */
export function ClientRevisionActions({
  projectId,
  revisionId,
  status,
  priceLabel,
}: {
  projectId: string;
  revisionId: string;
  status: RevisionStatus;
  /** Formatted quote, for the button text. */
  priceLabel: string | null;
}) {
  const { pending, execute } = useAction();

  if (status === "awaiting_approval") {
    return (
      <>
        <p className="w-full text-sm text-muted-foreground">
          This extra round is quoted at {priceLabel ?? "an amount to be confirmed"}. Approving adds it to your payment schedule, due today.
        </p>
        <Button
          size="sm"
          disabled={pending}
          onClick={() => execute(() => decideChangeOrder(projectId, revisionId, true), { success: "Change order approved" })}
        >
          Approve {priceLabel ?? "quote"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Decline this quote? The revision will be cancelled.")) {
              execute(() => decideChangeOrder(projectId, revisionId, false), { success: "Change order declined" });
            }
          }}
        >
          Decline
        </Button>
      </>
    );
  }

  if (status === "delivered") {
    return (
      <Button
        size="sm"
        disabled={pending}
        onClick={() => execute(() => setRevisionStatus(projectId, revisionId, "approved"), { success: "Revision approved" })}
      >
        Approve delivered work
      </Button>
    );
  }
  return null;
}
