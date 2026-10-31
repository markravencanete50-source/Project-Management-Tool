"use client";

import { useOptimistic, useRef, useTransition, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LayoutGroup, motion } from "motion/react";
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
import { KIND_SHORT } from "@/components/common/kind-badge";
import { PROJECT_KINDS } from "@/lib/types";
import { moveStage } from "@/server/actions/prospects";
import { cn } from "@/lib/utils";
import type { LostReason, Prospect, ProspectStage } from "@/lib/types";

const STAGE_FILTER_ITEMS = [{ value: "all", label: "All stages" }, ...toItems(STAGE_LABELS)];
const KIND_FILTER_ITEMS = [{ value: "all", label: "All kinds" }, ...PROJECT_KINDS.map((k) => ({ value: k, label: KIND_SHORT[k] }))];
const SOURCE_FILTER_ITEMS = [{ value: "all", label: "All sources" }, ...toItems(SOURCE_LABELS)];

type Move = { id: string; stage: ProspectStage; lostReason: LostReason | null };
type View = "table" | "kanban";

const VIEWS: { value: View; label: string; icon: typeof Table2 }[] = [
  { value: "table", label: "Table", icon: Table2 },
  { value: "kanban", label: "Board", icon: Kanban },
];

/** Accessible segmented control (radio group) with a pill that slides between options. */
function ViewSwitch({ value, onChange }: { value: View; onChange: (next: View) => void }) {
  const refs = useRef<Record<View, HTMLButtonElement | null>>({ table: null, kanban: null });

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const next: View = value === "table" ? "kanban" : "table";
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <LayoutGroup id="prospects-view-switch">
      <div
        role="radiogroup"
        aria-label="View"
        onKeyDown={onKeyDown}
        className="relative inline-flex h-10 items-center rounded-lg bg-muted p-[3px] sm:h-9"
      >
        {VIEWS.map(({ value: v, label, icon: Icon }) => {
          const selected = v === value;
          return (
            <button
              key={v}
              ref={(el) => {
                refs.current[v] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(v)}
              className={cn(
                "relative z-10 inline-flex h-full min-w-20 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected ? (
                <motion.span
                  layoutId="view-pill"
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-md bg-card shadow-sm ring-1 ring-border"
                  transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
                />
              ) : null}
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export function ProspectsView({
  prospects,
  view,
  stage,
  source,
  kind,
  showArchived,
  today,
  hasAny,
}: {
  prospects: Prospect[];
  view: "table" | "kanban";
  stage: string;
  source: string;
  kind: string;
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
  // The pill moves immediately; the URL (and the server render) catch up right after.
  const [viewNow, setViewNow] = useOptimistic<View, View>(view, (_, next) => next);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "all") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function changeView(next: View) {
    if (next === viewNow) return;
    startTransition(() => {
      setViewNow(next);
      setParam("view", next === "kanban" ? "kanban" : null);
    });
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
  const filtered = stage !== "all" || source !== "all" || kind !== "all";

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <ViewSwitch value={viewNow} onChange={changeView} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <LabeledSelect
            aria-label="Filter by stage"
            className="w-full sm:w-40"
            value={stage}
            items={STAGE_FILTER_ITEMS}
            onValueChange={(v) => setParam("stage", v)}
          />
          <LabeledSelect
            aria-label="Filter by source"
            className="w-full sm:w-40"
            value={source}
            items={SOURCE_FILTER_ITEMS}
            onValueChange={(v) => setParam("source", v)}
          />
          <div className="col-span-2 sm:col-span-1">
            <LabeledSelect
              aria-label="Filter by kind"
              className="w-full sm:w-36"
              value={kind}
              items={KIND_FILTER_ITEMS}
              onValueChange={(v) => setParam("kind", v)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 sm:ml-auto">
          <div className="flex items-center gap-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={(checked) => setParam("archived", checked ? "1" : null)}
            />
            <Label htmlFor="show-archived">Show archived</Label>
          </div>
          <p aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
            {sorted.length} {sorted.length === 1 ? "prospect" : "prospects"}
          </p>
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
                ? "Try a different stage, kind or source, or show archived prospects."
                : "Add the first person you are talking to about work and track them through to a project."}
            </EmptyDescription>
          </EmptyHeader>
          {hasAny ? (
            filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  const next = new URLSearchParams(params.toString());
                  next.delete("stage");
                  next.delete("source");
                  next.delete("kind");
                  const qs = next.toString();
                  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                }}
              >
                Clear filters
              </Button>
            ) : null
          ) : (
            <NewProspectDialog />
          )}
        </Empty>
      ) : viewNow === "kanban" ? (
        <ProspectsBoard prospects={sorted} stageFilter={stage} today={today} onMove={onMove} />
      ) : (
        <ProspectsTable prospects={sorted} today={today} />
      )}
    </div>
  );
}
