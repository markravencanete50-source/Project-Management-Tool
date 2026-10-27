"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { LostReasonDialog } from "@/components/prospects/lost-reason-dialog";
import { isFollowUpDue, LOST_REASON_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/components/prospects/labels";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PROSPECT_STAGES, type LostReason, type Prospect, type ProspectStage } from "@/lib/types";
import { cn } from "cn";

function CardBody({ p, today }: { p: Prospect; today: string }) {
  const due = isFollowUpDue(p, today);
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/prospects/${p.id}`}
          className="min-w-0 truncate text-sm font-medium hover:underline"
        >
          {p.name}
        </Link>
        {p.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
      </div>
      {p.company || p.service ? (
        <div className="truncate text-xs text-muted-foreground">{[p.company, p.service].filter(Boolean).join(" - ")}</div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium tabular-nums">
          {p.estimatedValue ? formatMoney(p.estimatedValue, p.currency) : "No value"}
        </span>
        <span className="text-muted-foreground">{SOURCE_LABELS[p.source]}</span>
      </div>
      {p.nextFollowUp ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Follow up {formatIsoDate(p.nextFollowUp)}</span>
          {due ? <Badge variant="destructive">Follow-up due</Badge> : null}
        </div>
      ) : null}
      {p.stage === "lost" && p.lostReason ? (
        <div className="mt-1 text-xs text-muted-foreground">Lost: {LOST_REASON_LABELS[p.lostReason]}</div>
      ) : null}
    </>
  );
}

function DraggableCard({ p, today }: { p: Prospect; today: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  const due = isFollowUpDue(p, today);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab rounded-lg border bg-card p-3 text-card-foreground shadow-xs select-none active:cursor-grabbing",
        due && "border-destructive/40 bg-destructive/5",
        isDragging && "opacity-40",
      )}
    >
      <CardBody p={p} today={today} />
    </div>
  );
}

function Column({ stage, prospects, today }: { stage: ProspectStage; prospects: Prospect[]; today: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      aria-label={STAGE_LABELS[stage]}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        isOver && "border-primary bg-primary/5",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-medium">{STAGE_LABELS[stage]}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{prospects.length}</span>
      </header>
      <div ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2 pt-0">
        {prospects.map((p) => (
          <DraggableCard key={p.id} p={p} today={today} />
        ))}
      </div>
    </section>
  );
}

export function ProspectsBoard({
  prospects,
  stageFilter,
  today,
  onMove,
}: {
  prospects: Prospect[];
  stageFilter: string;
  today: string;
  onMove: (id: string, stage: ProspectStage, lostReason: LostReason | null) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<Prospect | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const stages = stageFilter === "all" ? PROSPECT_STAGES : PROSPECT_STAGES.filter((s) => s === stageFilter);
  const active = prospects.find((p) => p.id === activeId) ?? null;

  function handleStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleEnd(e: DragEndEvent) {
    setActiveId(null);
    if (!e.over) return;
    const prospect = prospects.find((p) => p.id === e.active.id);
    const target = e.over.id as ProspectStage;
    if (!prospect || prospect.stage === target || !PROSPECT_STAGES.includes(target)) return;
    if (target === "lost") {
      setPendingLost(prospect);
      return;
    }
    onMove(prospect.id, target, null);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleStart}
        onDragEnd={handleEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="min-w-0 max-w-full overflow-x-auto pb-2">
          <div className="flex w-max gap-3">
            {stages.map((stage) => (
              <Column key={stage} stage={stage} prospects={prospects.filter((p) => p.stage === stage)} today={today} />
            ))}
          </div>
        </div>
        <DragOverlay>
          {active ? (
            <div className="w-72 rounded-lg border bg-card p-3 shadow-lg">
              <CardBody p={active} today={today} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <LostReasonDialog
        open={pendingLost !== null}
        name={pendingLost?.name ?? ""}
        onCancel={() => setPendingLost(null)}
        onConfirm={(reason) => {
          if (pendingLost) onMove(pendingLost.id, "lost", reason);
          setPendingLost(null);
        }}
      />
    </>
  );
}
