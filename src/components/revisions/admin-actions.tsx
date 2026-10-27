"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/common/use-action";
import { setQuote, setRevisionStatus } from "@/server/actions/revisions";
import type { RevisionStatus } from "@/lib/types";

/** Admin controls for one revision. Which buttons show depends on its status. */
export function AdminRevisionActions({
  projectId,
  revisionId,
  status,
  currency,
}: {
  projectId: string;
  revisionId: string;
  status: RevisionStatus;
  currency: string;
}) {
  const { pending, execute } = useAction();
  const [price, setPrice] = useState("");

  function move(next: "in_progress" | "delivered" | "cancelled", success: string) {
    execute(() => setRevisionStatus(projectId, revisionId, next), { success });
  }

  return (
    <>
      {status === "awaiting_quote" ? (
        <form
          className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            execute(() => setQuote(projectId, revisionId, price), { success: "Quote sent to the client", onSuccess: () => setPrice("") });
          }}
        >
          <Input
            inputMode="decimal"
            placeholder={`Price in ${currency}, like 250.00`}
            aria-label={`Quote price in ${currency}`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="sm:w-48"
          />
          <Button type="submit" size="sm" disabled={pending || price.trim() === ""}>
            Send quote
          </Button>
        </form>
      ) : null}
      {status === "requested" ? (
        <Button size="sm" disabled={pending} onClick={() => move("in_progress", "Marked in progress")}>
          Start work
        </Button>
      ) : null}
      {status === "in_progress" ? (
        <Button size="sm" disabled={pending} onClick={() => move("delivered", "Marked delivered")}>
          Mark delivered
        </Button>
      ) : null}
      {status !== "approved" && status !== "cancelled" ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Cancel this revision? It will no longer count toward the allowance.")) move("cancelled", "Revision cancelled");
          }}
        >
          Cancel revision
        </Button>
      ) : null}
    </>
  );
}
