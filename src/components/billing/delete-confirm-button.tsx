"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import type { ActionResult } from "@/lib/types";

/** Delete with a confirmation dialog. The action is passed in so one component serves time entries and tasks. */
export function DeleteConfirmButton({
  title,
  description,
  confirmLabel,
  success,
  action,
  iconOnly = false,
  triggerLabel = "Delete",
}: {
  title: string;
  description: string;
  confirmLabel: string;
  success: string;
  action: () => Promise<ActionResult<unknown>>;
  iconOnly?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size={iconOnly ? "icon-sm" : "sm"}
            aria-label={iconOnly ? triggerLabel : undefined}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          />
        }
      >
        <Trash2 data-icon={iconOnly ? undefined : "inline-start"} />
        {iconOnly ? null : triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => execute(action, { success, onSuccess: () => setOpen(false) })}>
            {pending ? "Deleting..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
