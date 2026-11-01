"use client";

import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openExpenseDialog, type EditableExpense } from "@/components/expenses/expense-dialog";

export function EditExpenseButton({ expense, repeating = false }: { expense: EditableExpense; repeating?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => openExpenseDialog(expense)}>
      <Pencil data-icon="inline-start" />
      {repeating ? "Edit repeat" : "Edit"}
    </Button>
  );
}
