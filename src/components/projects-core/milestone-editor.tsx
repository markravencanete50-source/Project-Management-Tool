"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ListPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/common/use-action";
import { saveMilestones } from "@/server/actions/milestones";
import { weightsValid } from "@/lib/projects";

type Row = { key: string; id?: string; title: string; weight: string };

export type EditableMilestone = { id: string; title: string; weight: number };

function toRows(milestones: EditableMilestone[]): Row[] {
  return milestones.map((m) => ({ key: m.id, id: m.id, title: m.title, weight: String(m.weight) }));
}

/** Edits every milestone in one form. Saving is blocked until the weights add up to 100. */
export function MilestoneEditor({ projectId, milestones }: { projectId: string; milestones: EditableMilestone[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => toRows(milestones));
  const { pending, execute } = useAction();

  const weights = rows.map((r) => (/^\d+$/.test(r.weight.trim()) ? Number(r.weight.trim()) : Number.NaN));
  const total = weights.reduce((sum, w) => sum + (Number.isNaN(w) ? 0 : w), 0);
  const titlesOk = rows.every((r) => r.title.trim().length > 0);
  const valid = titlesOk && weights.every((w) => !Number.isNaN(w)) && weightsValid(weights);

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function move(index: number, delta: -1 | 1) {
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function save() {
    const payload = rows.map((r, i) => ({ id: r.id, title: r.title, weight: weights[i] }));
    execute(() => saveMilestones(projectId, payload), { success: "Milestones saved", onSuccess: () => setOpen(false) });
  }

  let hint = `Total ${total} of 100`;
  if (rows.length > 0 && total !== 100) {
    hint += total < 100 ? `, ${100 - total} left to assign` : `, ${total - 100} over`;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRows(toRows(milestones));
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" />
        Edit milestones
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Milestones</DialogTitle>
          <DialogDescription>Weights are percentages of the project and must add up to exactly 100.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No milestones yet. Add the first one below.</p> : null}
          {rows.map((row, index) => (
            <div key={row.key} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex gap-2">
                <Input
                  value={row.title}
                  onChange={(e) => update(index, { title: e.target.value })}
                  placeholder="Milestone title"
                  aria-label={`Milestone ${index + 1} title`}
                  aria-invalid={row.title.trim().length === 0}
                  maxLength={160}
                />
                <div className="flex w-24 shrink-0 items-center gap-1">
                  <Input
                    value={row.weight}
                    onChange={(e) => update(index, { weight: e.target.value })}
                    inputMode="numeric"
                    aria-label={`Milestone ${index + 1} weight`}
                    aria-invalid={Number.isNaN(weights[index]) || weights[index] <= 0}
                    className="text-right"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Move down"
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete milestone"
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setRows((prev) => [...prev, { key: crypto.randomUUID(), title: "", weight: "" }])}
          >
            <ListPlus data-icon="inline-start" />
            Add milestone
          </Button>
          <p
            className={rows.length === 0 || total === 100 ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"}
            aria-live="polite"
          >
            {hint}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!valid || pending}>
            {pending ? "Saving" : "Save milestones"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
