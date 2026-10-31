"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AnimatedBar } from "@/components/motion/animated-bar";
import { ProjectStatusBadge, STATUS_LABELS } from "@/components/projects-core/project-status-badge";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { cn } from "@/lib/utils";
import { formatIsoDate } from "@/lib/dates";
import { KindBadge, KIND_SHORT } from "@/components/common/kind-badge";
import { formatMoney, type Currency } from "@/lib/money";
import { UNIT_LABELS } from "@/lib/billing";
import { PROJECT_KINDS, PROJECT_STATUSES, type ProjectKind, type ProjectStatus, type RateUnit } from "@/lib/types";

export type ProjectRow = {
  id: string;
  title: string;
  clientName: string;
  status: ProjectStatus;
  kind: ProjectKind;
  /** Fixed: milestone progress. Tasks: percentage of tasks done. Retainers: not shown. */
  progress: number;
  /** Task projects only. */
  tasksDone: number;
  tasksTotal: number;
  /** Retainers only. */
  rate: number;
  rateUnit: RateUnit | null;
  currency: Currency;
  deadline: string | null;
  archived: boolean;
  /** Deadline is in the past and the project is still open. Computed on the server. */
  overdue?: boolean;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

const KIND_OPTIONS = [
  { value: "all", label: "All kinds" },
  ...PROJECT_KINDS.map((k) => ({ value: k, label: KIND_SHORT[k] })),
];

/** The kind specific middle part of a row: a progress bar, a task count, or the retainer rate. */
function Progress({ row, className }: { row: ProjectRow; className?: string }) {
  if (row.kind === "retainer") {
    return (
      <span className="text-sm text-muted-foreground tabular-nums">
        {formatMoney(row.rate, row.currency)} <span className="text-xs">/ {row.rateUnit ? UNIT_LABELS[row.rateUnit].singular : "hour"}</span>
      </span>
    );
  }
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <AnimatedBar value={row.progress} label="Project progress" className="h-1.5 flex-1" />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {row.kind === "tasks" ? `${row.tasksDone} of ${row.tasksTotal}` : `${row.progress}%`}
      </span>
    </div>
  );
}

function Deadline({ row }: { row: ProjectRow }) {
  if (!row.deadline) return <span className="text-muted-foreground">No deadline</span>;
  return (
    <span className={cn(row.overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
      {formatIsoDate(row.deadline)}
      {row.overdue ? " (overdue)" : ""}
    </span>
  );
}

export function ProjectsList({ projects }: { projects: ProjectRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (p.archived && !showArchived) return false;
      if (status !== "all" && p.status !== status) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q);
    });
  }, [projects, query, status, kind, showArchived]);

  const filtering = query.trim() !== "" || status !== "all" || kind !== "all" || showArchived;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects or clients"
            aria-label="Search projects"
            className="pl-9"
          />
        </div>
        <SimpleSelect
          value={status}
          onValueChange={setStatus}
          options={STATUS_OPTIONS}
          ariaLabel="Filter by status"
          className="w-full sm:w-44"
        />
        <SimpleSelect
          value={kind}
          onValueChange={setKind}
          options={KIND_OPTIONS}
          ariaLabel="Filter by kind"
          className="w-full sm:w-36"
        />
        <div className="flex items-center justify-between gap-4 sm:ml-auto sm:justify-end">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {visible.length} {visible.length === 1 ? "project" : "projects"}
          </p>
          <div className="flex items-center gap-2">
            <Switch id="projects-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="projects-archived">Show archived</Label>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{projects.length === 0 ? <FolderKanban /> : <SearchX />}</EmptyMedia>
            <EmptyTitle>{projects.length === 0 ? "No projects yet" : "No projects match"}</EmptyTitle>
            <EmptyDescription>
              {projects.length === 0
                ? "Create a project to start tracking progress. Use the New project button above."
                : "Try a different search, status or kind, or show archived projects."}
            </EmptyDescription>
          </EmptyHeader>
          {projects.length > 0 && filtering ? (
            <EmptyContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setKind("all");
                  setShowArchived(false);
                }}
              >
                Clear filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <ul className="stagger flex flex-col gap-2 md:hidden">
            {visible.map((p) => (
              <li key={p.id} className="card-interactive relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/projects/${p.id}`}
                    className="min-w-0 font-medium break-words outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/40"
                  >
                    {p.title}
                  </Link>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <div className="flex items-center gap-2">
                  <KindBadge kind={p.kind} />
                  <span className="min-w-0 truncate text-sm text-muted-foreground">{p.clientName}</span>
                </div>
                <Progress row={p} />
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Deadline row={p} />
                  {p.archived ? <Badge variant="outline">Archived</Badge> : null}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48">Progress</TableHead>
                  <TableHead>Deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id} className="relative">
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/projects/${p.id}`}
                        className="outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/40 focus-visible:after:ring-inset"
                      >
                        {p.title}
                      </Link>
                      {p.archived ? (
                        <Badge variant="outline" className="ml-2">
                          Archived
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={p.kind} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.clientName}</TableCell>
                    <TableCell>
                      <ProjectStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>
                      <Progress row={p} className="w-40" />
                    </TableCell>
                    <TableCell>
                      <Deadline row={p} />
                    </TableCell>
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
