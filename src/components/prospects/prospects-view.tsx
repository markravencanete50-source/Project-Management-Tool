"use client";

import { useOptimistic, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Kanban, Table2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { LabeledSelect } from "@/components/prospects/labeled-select";
import { ProspectsBoard } from "@/components/prospects/prospects-board";
import { ProspectsTable } from "@/components/prospects/prospects-table";
import { NewProspectDialog } from "@/components/prospects/new-prospect-dialog";
import { SOURCE_LABELS, STAGE_LABELS, sortProspects, toItems } from "@/components/prospects/labels";
import { moveStage } from "@/server/actions/prospects";
import type { LostReason, Prospect, ProspectStage } from "@/lib/types";

const STAGE_FILTER_ITEMS = [{ value: "all", label: "All stages" }, ...toItems(STAGE_LABELS)];
const SOURCE_FILTER_ITEMS = [{ value: "all", label: "All sources" }, ...toItems(SOURCE_LABELS)];

type Move = { id: string; stage: ProspectStage; lostReason: LostReason | null };

export function ProspectsView({
  prospects,
  view,
  stage,
  source,
  showArchived,
  today,
  hasAny,
}: {
  prospects: Prospect[];
  view: "table" | "kanban";
  stage: string;
  source: string;
  showArchived: boolean;
  today: string;
  hasAny: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const [optimistic, applyMove] = useOptimistic(prospects, (state, move: Move) =>
    state.map((p) => (p.id === move.id ? { ...p, stage: move.stage, lostReason: move.lostReason } : p)),
  );

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "all") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  /** Optimistic move: the UI updates now and snaps back if the server rejects it. */
  function onMove(id: string, nextStage: ProspectStage, lostReason: LostReason | null) {
    startTransition(async () => {
      applyMove({ id, stage: nextStage, lostReason });
      const res = await moveStage(id, nextStage, lostReason);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  const sorted = sortProspects(optimistic, today);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border p-0.5" role="group" aria-label="View">
            <Button
              size="sm"
              variant={view === "table" ? "secondary" : "ghost"}
              aria-pressed={view === "table"}
              onClick={() => setParam("view", null)}
            >
              <Table2 data-icon="inline-start" />
              Table
            </Button>
            <Button
              size="sm"
              variant={view === "kanban" ? "secondary" : "ghost"}
              aria-pressed={view === "kanban"}
              onClick={() => setParam("view", "kanban")}
            >
              <Kanban data-icon="inline-start" />
              Board
            </Button>
          </div>
          <LabeledSelect
            aria-label="Filter by stage"
            className="w-36"
            value={stage}
            items={STAGE_FILTER_ITEMS}
            onValueChange={(v) => setParam("stage", v)}
          />
          <LabeledSelect
            aria-label="Filter by source"
            className="w-36"
            value={source}
            items={SOURCE_FILTER_ITEMS}
            onValueChange={(v) => setParam("source", v)}
          />
          <div className="flex items-center gap-2 px-1">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={(checked) => setParam("archived", checked ? "1" : null)}
            />
            <Label htmlFor="show-archived">Show archived</Label>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{hasAny ? "No prospects match these filters" : "No prospects yet"}</EmptyTitle>
            <EmptyDescription>
              {hasAny
                ? "Try a different stage or source, or show archived prospects."
                : "Add the first person you are talking to about work and track them through to a project."}
            </EmptyDescription>
          </EmptyHeader>
          {hasAny ? null : <NewProspectDialog />}
        </Empty>
      ) : view === "kanban" ? (
        <ProspectsBoard prospects={sorted} stageFilter={stage} today={today} onMove={onMove} />
      ) : (
        <ProspectsTable prospects={sorted} today={today} />
      )}
    </div>
  );
}
