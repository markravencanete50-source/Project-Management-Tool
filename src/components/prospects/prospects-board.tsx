"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import { CalendarClock } from "lucide-react";
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
  type DropAnimation,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { LostReasonDialog } from "@/components/prospects/lost-reason-dialog";
import {
  companyLine,
  isFollowUpDue,
  LOST_REASON_LABELS,
  SOURCE_LABELS,
  STAGE_DOT,
  STAGE_LABELS,
} from "@/components/prospects/labels";
import { formatIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { KindBadge } from "@/components/common/kind-badge";
import { formatEstimate } from "@/components/prospects/labels";
import { PROSPECT_STAGES, type LostReason, type Prospect, type ProspectStage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The dragged copy lives in a DragOverlay, so the source node never receives a
 * dnd-kit transform. That leaves its transform free for motion layout animation.
 * The overlay settles to where the card ended up and fades out in the last part.
 */
const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  keyframes: ({ transform }) => [
    { transform: CSS.Transform.toString(transform.initial), opacity: 1 },
    { transform: CSS.Transform.toString(transform.final), opacity: 1, offset: 0.7 },
    { transform: CSS.Transform.toString(transform.final), opacity: 0 },
  ],
  sideEffects: null,
};

function CardBody({ p, today, interactive }: { p: Prospect; today: string; interactive: boolean }) {
  const due = isFollowUpDue(p, today);
  const line = companyLine(p);
  const nameClass = "min-w-0 truncate text-sm font-medium";
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {interactive ? (
          <Link href={`/admin/prospects/${p.id}`} className={cn(nameClass, "rounded-sm hover:underline")}>
            {p.name}
          </Link>
        ) : (
          <span className={nameClass}>{p.name}</span>
        )}
        {p.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
      </div>
      {line ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{line}</div> : null}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={cn("text-sm font-semibold tabular-nums", !p.estimatedValue && "font-normal text-muted-foreground")}>
          {p.estimatedValue ? formatEstimate(p) : "No value"}
        </span>
        <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{SOURCE_LABELS[p.source]}</span>
      </div>
      <div className="mt-2">
        <KindBadge kind={p.engagementKind} />
      </div>
      {p.nextFollowUp ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            Follow up {formatIsoDate(p.nextFollowUp)}
          </span>
          {due ? (
            <Badge variant="destructive" dot>
              Follow-up due
            </Badge>
          ) : null}
        </div>
      ) : null}
      {p.stage === "lost" && p.lostReason ? (
        <div className="mt-2 text-xs text-muted-foreground">Lost: {LOST_REASON_LABELS[p.lostReason]}</div>
      ) : null}
    </>
  );
}

function DraggableCard({ p, today }: { p: Prospect; today: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  const due = isFollowUpDue(p, today);
  return (
    <motion.div
      ref={setNodeRef}
      layout="position"
      layoutId={`prospect-card-${p.id}`}
      transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.8 }}
      {...attributes}
      // The link inside is the keyboard path, so the wrapper is not a second tab stop.
      role="group"
      tabIndex={-1}
      className={cn(
        "cursor-grab rounded-lg border bg-card p-3 text-card-foreground shadow-xs transition-[border-color,background-color,box-shadow] duration-200 select-none hover:border-primary/30 hover:shadow-sm",
        due && "border-destructive/30 bg-destructive/5 hover:border-destructive/50",
        isDragging && "border-dashed border-border bg-transparent shadow-none hover:border-border hover:shadow-none",
      )}
      {...listeners}
    >
      <div className={cn("transition-opacity duration-150", isDragging && "opacity-0")} aria-hidden={isDragging || undefined}>
        <CardBody p={p} today={today} interactive />
      </div>
    </motion.div>
  );
}

function stageTotal(prospects: Prospect[]): string | null {
  const valued = prospects.filter((p) => p.estimatedValue > 0);
  if (valued.length === 0) return null;
  const currency = valued[0].currency;
  if (valued.some((p) => p.currency !== currency)) return null;
  const total = formatMoney(
    valued.reduce((sum, p) => sum + p.estimatedValue, 0),
    currency,
  );
  // A monthly retainer value is not a project value: say so when they are mixed in.
  return valued.some((p) => p.engagementKind === "retainer") ? `${total} incl. /mo` : total;
}

function Column({
  stage,
  prospects,
  today,
  dragging,
  intro,
}: {
  stage: ProspectStage;
  prospects: Prospect[];
  today: string;
  dragging: boolean;
  intro: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = useMemo(() => stageTotal(prospects), [prospects]);
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABELS[stage]}
      className={cn(
        "flex w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-xl border bg-muted/40 transition-[border-color,background-color,box-shadow] duration-200 sm:w-72",
        dragging && "border-border/80",
        isOver && "border-primary/60 bg-primary/8 shadow-sm ring-2 ring-primary/20",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", STAGE_DOT[stage])} />
        <h2 className="min-w-0 truncate text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
        <span className="rounded-full bg-background px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums ring-1 ring-border">
          {prospects.length}
        </span>
        {total ? <span className="ml-auto truncate text-xs font-medium text-muted-foreground tabular-nums">{total}</span> : null}
      </header>
      <div className={cn("flex min-h-28 flex-1 flex-col gap-2 p-2 pt-1", intro && "stagger [--stagger:40ms]")}>
        {prospects.map((p) => (
          <DraggableCard key={p.id} p={p} today={today} />
        ))}
        {prospects.length === 0 ? (
          <div
            className={cn(
              "grid flex-1 place-items-center rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground transition-colors duration-200",
              isOver && "border-primary/50 text-primary",
            )}
          >
            {isOver ? "Release to move here" : dragging ? "Drop here" : "No prospects in this stage"}
          </div>
        ) : null}
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
  // The CSS stagger only runs for the first paint. Newly arrived cards must not
  // replay it, because its transform animation would override the layout glide.
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 1000);
    return () => window.clearTimeout(t);
  }, []);

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
        <LayoutGroup id="prospects-board">
          <div
            className={cn(
              "-mx-4 min-w-0 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0",
              "snap-x snap-proximity scroll-px-4 md:snap-none",
              activeId && "snap-none",
            )}
          >
            <div className="flex w-max gap-3">
              {stages.map((stage) => (
                <Column
                  key={stage}
                  stage={stage}
                  prospects={prospects.filter((p) => p.stage === stage)}
                  today={today}
                  dragging={activeId !== null}
                  intro={intro}
                />
              ))}
            </div>
          </div>
        </LayoutGroup>
        <DragOverlay dropAnimation={DROP_ANIMATION}>
          {active ? (
            <motion.div
              initial={{ scale: 1, rotate: 0 }}
              animate={{ scale: 1.03, rotate: 1.5 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="cursor-grabbing rounded-lg border border-primary/30 bg-card p-3 text-card-foreground shadow-lg"
            >
              <CardBody p={active} today={today} interactive={false} />
            </motion.div>
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
