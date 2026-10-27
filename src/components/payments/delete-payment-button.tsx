"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { deletePayment } from "@/server/actions/payments";

export function DeletePaymentButton({ projectId, paymentId, label }: { projectId: string; paymentId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 data-icon="inline-start" />
        Delete
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this payment?</DialogTitle>
          <DialogDescription>
            The payment of {label} will be removed and balances recalculated. The project stays accepted if it already was.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              execute(() => deletePayment({ projectId, paymentId }), {
                success: "Payment deleted",
                onSuccess: () => setOpen(false),
              })
            }
          >
            {pending ? "Deleting..." : "Delete payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
