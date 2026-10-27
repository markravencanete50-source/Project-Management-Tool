"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { LabeledSelect } from "@/components/prospects/labeled-select";
import { LOST_REASON_LABELS, toItems } from "@/components/prospects/labels";
import type { LostReason } from "@/lib/types";

const ITEMS = toItems(LOST_REASON_LABELS);

/** Asks why a prospect was lost. Cancel (or closing) changes nothing. */
export function LostReasonDialog({
  open,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  name: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason: LostReason) => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason(null);
          onCancel();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as lost</DialogTitle>
          <DialogDescription>Why did {name || "this prospect"} not go ahead?</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="lost-reason">Reason</FieldLabel>
          <LabeledSelect
            id="lost-reason"
            className="w-full"
            value={reason}
            placeholder="Choose a reason"
            onValueChange={(v) => setReason(v as LostReason)}
            items={ITEMS}
          />
        </Field>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setReason(null);
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={!reason || pending}
            onClick={() => {
              if (!reason) return;
              const chosen = reason;
              setReason(null);
              onConfirm(chosen);
            }}
          >
            Mark as lost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
