"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { STATUS_LABELS } from "@/components/projects-core/project-status-badge";
import { useAction } from "@/components/common/use-action";
import { archiveProject, changeProjectStatus, unarchiveProject } from "@/server/actions/projects";
import { MANUAL_PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";

const OPTIONS = MANUAL_PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** Manual status control. draft and agreement_sent are set by other flows, so they show as the placeholder. */
export function ProjectStatusControl({ projectId, status }: { projectId: string; status: ProjectStatus }) {
  const { pending, execute } = useAction();
  const manual = (MANUAL_PROJECT_STATUSES as readonly string[]).includes(status);
  return (
    <SimpleSelect
      value={manual ? status : null}
      placeholder={`Status: ${STATUS_LABELS[status]}`}
      options={OPTIONS}
      disabled={pending}
      ariaLabel="Change project status"
      className="w-full sm:w-44"
      onValueChange={(next) => execute(() => changeProjectStatus(projectId, next), { success: "Status updated" })}
    />
  );
}

export function ProjectArchiveButton({ projectId, archived }: { projectId: string; archived: boolean }) {
  const { pending, execute } = useAction();
  return archived ? (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => execute(() => unarchiveProject(projectId), { success: "Project restored" })}
    >
      <ArchiveRestore data-icon="inline-start" />
      Restore
    </Button>
  ) : (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => execute(() => archiveProject(projectId), { success: "Project archived" })}
    >
      <Archive data-icon="inline-start" />
      Archive
    </Button>
  );
}
