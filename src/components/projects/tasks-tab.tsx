import { notFound } from "next/navigation";
import { TasksPanel } from "@/components/billing/tasks-panel";
import { requireAdmin } from "@/lib/auth/session";
import { formatInstant } from "@/lib/dates";
import { getAdminProjectPayments } from "@/server/data/payments";

/** Admin: the priced task list with totals. Task projects only. */
export async function TasksTab({ projectId }: { projectId: string }) {
  await requireAdmin();
  const { project, tasks, finance } = await getAdminProjectPayments(projectId);
  if (project.kind !== "tasks") notFound();
  return (
    <TasksPanel
      projectId={project.id}
      currency={project.currency}
      paid={finance.paid}
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        price: t.price,
        status: t.status,
        doneOn: t.doneAt ? formatInstant(t.doneAt, "d MMM yyyy") : null,
      }))}
    />
  );
}
