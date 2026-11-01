"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openRecordPayment, type EditableStandalone } from "@/components/payments/record-payment";

export function EditStandaloneButton({ payment }: { payment: EditableStandalone }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => openRecordPayment(payment)}>
      <Pencil data-icon="inline-start" />
      Edit
    </Button>
  );
}
