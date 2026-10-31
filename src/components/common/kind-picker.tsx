"use client";

import { useRef, type KeyboardEvent } from "react";
import { KIND_ICONS, KIND_SHORT } from "@/components/common/kind-badge";
import { PROJECT_KINDS, type ProjectKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const DESCRIPTIONS: Record<ProjectKind, string> = {
  fixed: "One contract value, a payment schedule, milestones and an agreement.",
  retainer: "Ongoing work billed by the hour or day, monthly in arrears.",
  tasks: "A list of priced tasks. Each one is billed when it is done.",
};

/**
 * Engagement kind chooser: a radio group of cards (arrow keys move between
 * them). `compact` drops the descriptions for use inside dialogs.
 */
export function KindPicker({
  value,
  onChange,
  compact = false,
  idPrefix = "kind",
  label = "Kind of work",
}: {
  value: ProjectKind;
  onChange: (kind: ProjectKind) => void;
  compact?: boolean;
  idPrefix?: string;
  label?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    const index = PROJECT_KINDS.indexOf(value);
    const next = PROJECT_KINDS[(index + (forward ? 1 : PROJECT_KINDS.length - 1)) % PROJECT_KINDS.length];
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("grid gap-2.5", compact ? "grid-cols-3" : "sm:grid-cols-3")}
    >
      {PROJECT_KINDS.map((kind) => {
        const Icon = KIND_ICONS[kind];
        const selected = kind === value;
        return (
          <button
            key={kind}
            ref={(el) => {
              refs.current[kind] = el;
            }}
            id={`${idPrefix}-${kind}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(kind)}
            className={cn(
              "group/kind relative flex rounded-xl border bg-card text-left shadow-xs transition-[border-color,background-color,box-shadow,transform] duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.99] motion-reduce:transition-none",
              compact ? "flex-col items-start gap-2 p-3" : "items-start gap-3 p-4 sm:flex-col",
              selected
                ? "border-primary bg-primary/6 shadow-sm ring-1 ring-primary/40"
                : "hover:border-primary/35 hover:bg-muted/40",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-200",
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover/kind:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{KIND_SHORT[kind]}</span>
              {compact ? null : <span className="mt-0.5 block text-xs/relaxed text-muted-foreground">{DESCRIPTIONS[kind]}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
