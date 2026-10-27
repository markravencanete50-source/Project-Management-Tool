"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProjectStatusBadge, STATUS_LABELS } from "@/components/projects-core/project-status-badge";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { formatIsoDate } from "@/lib/dates";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/types";

export type ProjectRow = {
  id: string;
  title: string;
  clientName: string;
  status: ProjectStatus;
  progress: number;
  deadline: string | null;
  archived: boolean;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export function ProjectsList({ projects }: { projects: ProjectRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (p.archived && !showArchived) return false;
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q);
    });
  }, [projects, query, status, showArchived]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or clients"
            aria-label="Search projects"
            className="pl-8"
          />
        </div>
        <SimpleSelect
          value={status}
          onValueChange={setStatus}
          options={STATUS_OPTIONS}
          ariaLabel="Filter by status"
          className="w-full sm:w-44"
        />
        <div className="flex items-center gap-2 sm:ml-auto">
          <Switch id="projects-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="projects-archived">Show archived</Label>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderKanban />
            </EmptyMedia>
            <EmptyTitle>{projects.length === 0 ? "No projects yet" : "No projects match"}</EmptyTitle>
            <EmptyDescription>
              {projects.length === 0 ? "Create a project to start tracking progress." : "Try different filters or show archived projects."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 font-medium break-words">{p.title}</span>
                    <ProjectStatusBadge status={p.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">{p.clientName}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.deadline ? `Due ${formatIsoDate(p.deadline)}` : "No deadline"}</span>
                    {p.archived ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/projects/${p.id}`} className="hover:underline">
                        {p.title}
                      </Link>
                      {p.archived ? (
                        <Badge variant="outline" className="ml-2">
                          Archived
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.clientName}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.progress}%</TableCell>
                    <TableCell className="text-muted-foreground">{p.deadline ? formatIsoDate(p.deadline) : "None"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
