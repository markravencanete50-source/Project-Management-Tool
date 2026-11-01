import { notFound } from "next/navigation";
import { TasksPanel } from "@/components/billing/tasks-panel";
import { requireAdmin } from "@/lib/auth/session";
import { ProjectEditDialog } from "@/components/projects-core/project-edit-dialog";
import { formatInstant } from "@/lib/dates";
import { fromMinor } from "@/lib/money";
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
      defaultPrice={project.rate}
      defaultPriceAction={
        <ProjectEditDialog
          projectId={project.id}
          kind={project.kind}
          currency={project.currency}
          triggerLabel={project.rate > 0 ? "Change" : "Set"}
          compact
          initial={{
            title: project.title,
            description: project.description,
            revisionAllowance: String(project.revisionAllowance),
            rateUnit: "hour",
            rate: project.rate ? fromMinor(project.rate) : "",
            startDate: project.startDate ?? "",
            deadline: project.deadline ?? "",
            endDate: "",
            hoursPerDay: "8",
            daysPerMonth: "22",
          }}
        />
      }
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
