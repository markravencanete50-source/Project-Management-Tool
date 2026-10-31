"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ListChecks } from "lucide-react";
import { AnimatedNumber } from "@/components/dashboard/animated-number";
import { DeleteConfirmButton } from "@/components/billing/delete-confirm-button";
import { TaskDialog } from "@/components/billing/task-dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SectionHeader } from "@/components/common/section-header";
import { taskTotals } from "@/lib/billing";
import { formatMoney, type Currency } from "@/lib/money";
import type { TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskDone } from "@/server/actions/tasks";

export type PanelTask = { id: string; title: string; price: number; status: TaskStatus; doneOn: string | null };

function Total({ label, hint, children, tone }: { label: string; hint?: string; children: React.ReactNode; tone?: "success" | "warning" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-xs">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-lg font-semibold tracking-tight tabular-nums sm:text-xl",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
        )}
      >
        {children}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/**
 * Task list with totals. Ticking a task flips it at once (optimistic) and the
 * totals glide to their new values; a failed save snaps it back with a toast.
 * Done tasks are owed, so owed and pending follow the ticks.
 */
export function TasksPanel({
  projectId,
  currency,
  tasks,
  paid,
}: {
  projectId: string;
  currency: Currency;
  tasks: PanelTask[];
  /** Total payments received, from the server. */
  paid: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [justDone, setJustDone] = useState<string | null>(null);
  const [optimistic, applyToggle] = useOptimistic(tasks, (state, change: { id: string; done: boolean }) =>
    state.map((t) => (t.id === change.id ? { ...t, status: (change.done ? "done" : "todo") as TaskStatus } : t)),
  );

  const totals = taskTotals(optimistic);
  const pending = totals.doneValue - paid;

  function toggle(task: PanelTask, done: boolean) {
    startTransition(async () => {
      applyToggle({ id: task.id, done });
      if (done) {
        setJustDone(task.id);
        window.setTimeout(() => setJustDone((cur) => (cur === task.id ? null : cur)), 900);
      }
      const res = await setTaskDone({ projectId, taskId: task.id, done });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" role="group" aria-label="Task totals" aria-live="polite">
        <Total label="Done value" hint={`${totals.doneCount} of ${totals.total} tasks done`}>
          <AnimatedNumber kind="money" currency={currency} value={totals.doneValue} />
        </Total>
        <Total label="Still to do" hint={`${totals.todoCount} ${totals.todoCount === 1 ? "task" : "tasks"}, not billed yet`}>
          <AnimatedNumber kind="money" currency={currency} value={totals.todoValue} />
        </Total>
        <Total label="Owed" hint="Billed when marked done" tone="warning">
          <AnimatedNumber kind="money" currency={currency} value={totals.doneValue} />
        </Total>
        <Total label="Paid" tone="success">
          <AnimatedNumber kind="money" currency={currency} value={paid} />
        </Total>
        <Total label={pending < 0 ? "Balance" : "Pending"} hint={pending < 0 ? "Overpaid" : "Owed minus paid"}>
          {pending < 0 ? `Overpaid by ${formatMoney(-pending, currency)}` : <AnimatedNumber kind="money" currency={currency} value={pending} />}
        </Total>
      </div>

      <section className="grid grid-cols-1 gap-3">
        <SectionHeader
          title="Tasks"
          description="Tick a task when it is finished. The client is billed for it from that moment."
          actions={<TaskDialog projectId={projectId} currency={currency} />}
        />
        {optimistic.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListChecks />
              </EmptyMedia>
              <EmptyTitle>No tasks yet</EmptyTitle>
              <EmptyDescription>Add the first priced task. It becomes owed when you mark it done.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border/70 overflow-hidden rounded-xl border bg-card shadow-xs">
            {optimistic.map((t) => {
              const done = t.status === "done";
              return (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 transition-colors duration-300 sm:px-4",
                    done ? "bg-success/5" : "hover:bg-muted/40",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`Mark "${t.title}" as ${done ? "not done" : "done"}`}
                    onClick={() => toggle(t, !done)}
                    className={cn(
                      "relative grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40 max-sm:size-10",
                      "after:absolute after:-inset-1 after:content-['']",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-6 place-items-center rounded-full border-2 transition-[background-color,border-color,transform] duration-300 ease-out motion-reduce:transition-none",
                        done ? "scale-100 border-success bg-success text-white" : "border-input bg-card hover:border-success/60",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3.5 stroke-[3] transition-[opacity,transform] duration-200 motion-reduce:transition-none",
                          done ? "scale-100 opacity-100" : "scale-50 opacity-0",
                        )}
                      />
                    </span>
                    {justDone === t.id ? (
                      <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-full border-2 border-success motion-safe:animate-[pulse-ring_0.8s_var(--ease-out)_1_both]" />
                    ) : null}
                  </button>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "text-sm break-words transition-[color,text-decoration-color] duration-300 line-through decoration-1",
                        done ? "text-muted-foreground decoration-muted-foreground" : "text-foreground decoration-transparent",
                      )}
                    >
                      {t.title}
                    </span>
                    {done && t.doneOn ? <span className="text-xs text-muted-foreground">Done {t.doneOn}, owed from then</span> : null}
                  </div>

                  <span
                    key={`${t.id}-${done}`}
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-sm font-medium tabular-nums transition-colors duration-300",
                      done ? "enter-pop bg-success/12 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {formatMoney(t.price, currency)}
                  </span>

                  <div className="flex shrink-0 gap-1.5">
                    <TaskDialog projectId={projectId} currency={currency} task={{ id: t.id, title: t.title, price: t.price }} iconOnly />
                    <DeleteConfirmButton
                      iconOnly
                      triggerLabel={`Delete task ${t.title}`}
                      title="Delete this task?"
                      description={
                        done
                          ? `"${t.title}" is done, so it is currently owed. Deleting it removes ${formatMoney(t.price, currency)} from what is owed.`
                          : `"${t.title}" will be removed from the list.`
                      }
                      confirmLabel="Delete task"
                      success="Task deleted"
                      action={() => deleteTask({ projectId, taskId: t.id })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
