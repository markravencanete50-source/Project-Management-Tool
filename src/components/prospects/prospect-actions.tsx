"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { convertProspect, setProspectArchived } from "@/server/actions/prospects";
import type { ProjectKind } from "@/lib/types";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const { pending, execute } = useAction();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        execute(() => setProspectArchived(id, !archived), { success: archived ? "Prospect restored" : "Prospect archived" })
      }
    >
      {archived ? <ArchiveRestore data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}

/** Opens a confirmation, converts, then goes to the new draft project. */
export function ConvertButton({ id, name, kind = "fixed" }: { id: string; name: string; kind?: ProjectKind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await convertProspect(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(kind === "fixed" ? "Converted to client and draft project" : "Converted to client and active project");
      setOpen(false);
      router.push(`/admin/projects/${res.data.projectId}`);
    });
  }

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)}>
        <UserCheck data-icon="inline-start" />
        Convert to client
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert {name}</DialogTitle>
            <DialogDescription>
              This links to an existing client with the same email, or creates a new one. It also creates{" "}
              {kind === "fixed" ? "a draft project" : kind === "retainer" ? "an active retainer" : "an active task project"} and
              marks the prospect as won.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Client record from their details
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {kind === "fixed"
                ? "Draft project ready for a payment schedule and agreement"
                : kind === "retainer"
                  ? "Active retainer with the rate, ready to log time against"
                  : "Active task project with an empty task list"}
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Prospect marked as won
            </li>
          </ul>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={confirm}>
              {pending ? "Converting..." : "Convert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
