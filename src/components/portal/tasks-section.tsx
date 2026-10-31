import { Check, Circle, ListChecks } from "lucide-react";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { taskTotals } from "@/lib/billing";
import { formatInstant } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getPortalProjectPayments } from "@/server/data/payments";

/** Read-only task list for the portal: title, price and status. No internal notes exist on tasks. */
export async function PortalTasksSection({ projectId }: { projectId: string }) {
  const { project, tasks } = await getPortalProjectPayments(projectId);
  if (project.kind !== "tasks") return null;
  const { currency } = project;
  const totals = taskTotals(tasks);
  const percent = totals.total === 0 ? 0 : Math.round((totals.doneCount / totals.total) * 100);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="portal-tasks">
      <h2 id="portal-tasks" className="text-xl font-semibold tracking-tight">
        Tasks
      </h2>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <div>
          <p className="text-4xl leading-none font-semibold tracking-tight tabular-nums">{percent}%</p>
          <p className="mt-2 text-base text-muted-foreground">
            {totals.total === 0
              ? "Tasks will be listed here once they are set up."
              : percent === 100
                ? "All done. Thank you for working with us."
                : `${totals.doneCount} of ${totals.total} ${totals.total === 1 ? "task" : "tasks"} done`}
          </p>
        </div>
        <AnimatedBar value={percent} label="Tasks done" className="h-3" />
      </div>

      {tasks.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks />
            </EmptyMedia>
            <EmptyTitle>No tasks yet</EmptyTitle>
            <EmptyDescription>Tasks and their prices will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="stagger flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card shadow-xs [--stagger:30ms]">
          {tasks.map((t) => {
            const done = t.status === "done";
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                {done ? (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success/12 text-success">
                    <Check className="size-3.5" aria-label="Done" />
                  </span>
                ) : (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Circle className="size-3" aria-label="To do" />
                  </span>
                )}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-base break-words", done && "font-medium")}>{t.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {done && t.doneAt ? `Completed ${formatInstant(t.doneAt, "d MMM yyyy")}` : "To do"}
                  </span>
                </div>
                <span className={cn("shrink-0 text-base tabular-nums", done ? "font-semibold" : "text-muted-foreground")}>
                  {formatMoney(t.price, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
