"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { useAction } from "@/components/common/use-action";
import { toggleMilestone } from "@/server/actions/milestones";
import { formatInstant } from "@/lib/dates";

export type ChecklistMilestone = { id: string; title: string; weight: number; done: boolean; doneAt: Date | null };

/** Admin checklist: ticking a milestone marks it done and tells the client. */
export function MilestoneChecklist({ projectId, milestones }: { projectId: string; milestones: ChecklistMilestone[] }) {
  const { pending, execute } = useAction();

  if (milestones.length === 0) {
    return <p className="text-sm text-muted-foreground">No milestones yet. Add some to track progress.</p>;
  }

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {milestones.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
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
          <label htmlFor={`ms-${m.id}`} className="flex min-w-0 flex-1 flex-col">
            <span className={m.done ? "text-sm text-muted-foreground line-through" : "text-sm"}>{m.title}</span>
            {m.done && m.doneAt ? <span className="text-xs text-muted-foreground">Done {formatInstant(m.doneAt, "d MMM yyyy")}</span> : null}
          </label>
          <span className="text-sm tabular-nums text-muted-foreground">{m.weight}%</span>
        </li>
      ))}
    </ul>
  );
}
