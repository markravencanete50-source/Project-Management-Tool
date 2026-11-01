"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { deleteStandalonePayment } from "@/server/actions/standalone-payments";

export function DeleteStandaloneButton({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" />}>
        <Trash2 data-icon="inline-start" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this payment?</DialogTitle>
          <DialogDescription>The payment of {label} will be removed and your earnings recalculated. It is not attached to a project, so no balances change.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => execute(() => deleteStandalonePayment({ id }), { success: "Payment deleted", onSuccess: () => setOpen(false) })}
          >
            {pending ? "Deleting..." : "Delete payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
