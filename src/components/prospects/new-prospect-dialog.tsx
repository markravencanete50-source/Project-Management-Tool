"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ProspectForm } from "@/components/prospects/prospect-form";

export function NewProspectDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        New prospect
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New prospect</DialogTitle>
          <DialogDescription>Add someone you are talking to about work.</DialogDescription>
        </DialogHeader>
        <ProspectForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
