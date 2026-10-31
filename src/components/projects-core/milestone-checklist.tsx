"use client";

import { ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAction } from "@/components/common/use-action";
import { toggleMilestone } from "@/server/actions/milestones";
import { formatInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ChecklistMilestone = { id: string; title: string; weight: number; done: boolean; doneAt: Date | null };

/** Admin checklist: ticking a milestone marks it done and tells the client. */
export function MilestoneChecklist({ projectId, milestones }: { projectId: string; milestones: ChecklistMilestone[] }) {
  const { pending, execute } = useAction();

  if (milestones.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
        <ListChecks className="size-4 shrink-0" aria-hidden="true" />
        No milestones yet. Add some to track progress.
      </div>
    );
  }

  const doneCount = milestones.filter((m) => m.done).length;
  const doneWeight = milestones.filter((m) => m.done).reduce((sum, m) => sum + m.weight, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        <span className="font-medium text-foreground">
          {doneCount} of {milestones.length} done
        </span>
        <span aria-hidden="true"> / </span>
        <span className="sr-only">, </span>
        {doneWeight}% of the project weight complete
      </p>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {milestones.map((m) => (
          <li
            key={m.id}
            className={cn("flex items-center gap-3 px-4 py-3 transition-colors duration-200", m.done ? "bg-success/5" : "hover:bg-muted/40")}
          >
            <Checkbox
              id={`ms-${m.id}`}
              checked={m.done}
              disabled={pending}
              aria-label={`Mark "${m.title}" as ${m.done ? "not done" : "done"}`}
              onCheckedChange={(checked) =>
                execute(() => toggleMilestone(projectId, m.id, checked), {
                  success: checked ? "Milestone completed" : "Milestone reopened",
                })
              }
            />
            <label htmlFor={`ms-${m.id}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
              <span
                className={cn(
                  "text-sm break-words line-through decoration-1 transition-[color,text-decoration-color] duration-300",
                  m.done ? "text-muted-foreground decoration-muted-foreground" : "text-foreground decoration-transparent",
                )}
              >
                {m.title}
              </span>
              {m.done && m.doneAt ? (
                <span className="text-xs text-muted-foreground">Done {formatInstant(m.doneAt, "d MMM yyyy")}</span>
              ) : null}
            </label>
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums transition-colors duration-200",
                m.done ? "bg-success/12 text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {m.weight}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
