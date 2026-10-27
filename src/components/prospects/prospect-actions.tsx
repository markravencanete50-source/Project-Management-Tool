"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArchiveRestore, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { convertProspect, setProspectArchived } from "@/server/actions/prospects";

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
export function ConvertButton({ id, name }: { id: string; name: string }) {
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
      toast.success("Converted to client and draft project");
      setOpen(false);
      router.push(`/admin/projects/${res.data.projectId}`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserCheck data-icon="inline-start" />
        Convert to client
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert {name}</DialogTitle>
            <DialogDescription>
              This links to an existing client with the same email, or creates a new one. It also creates a draft
              project and marks the prospect as won.
            </DialogDescription>
          </DialogHeader>
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
