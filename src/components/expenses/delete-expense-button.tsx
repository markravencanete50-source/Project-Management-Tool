"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAction } from "@/components/common/use-action";
import { deleteExpense } from "@/server/actions/expenses";

export function DeleteExpenseButton({ id, label, repeating = false }: { id: string; label: string; repeating?: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" />}>
        <Trash2 data-icon="inline-start" />
        {repeating ? "Delete repeat" : "Delete"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{repeating ? "Delete this repeating expense?" : "Delete this expense?"}</DialogTitle>
          <DialogDescription>
            {repeating
              ? `${label} repeats automatically. Deleting it removes the expense and every repeat of it, past and future, and your available money goes back up. To stop it from today instead, edit it and set a stop date.`
              : `The expense of ${label} will be removed and your available money recalculated. Earnings are not affected.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => execute(() => deleteExpense({ id }), { success: "Expense deleted", onSuccess: () => setOpen(false) })}
          >
            {pending ? "Deleting..." : "Delete expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
