"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { motion } from "motion/react";
import { cn } from "cn";
import { EASE_OUT } from "@/components/dashboard/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** A disabled option can carry a hint that explains why, shown as a tooltip. */
type Option<T extends string> = { value: T; label: string; disabled?: boolean; hint?: string };

/**
 * A segmented control built as a radio group: one tab stop, arrow keys move and
 * select, and the active pill slides between options (a transform animation that
 * motion turns off for people who prefer reduced motion).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = options.findIndex((o) => o.value === value);
    const enabled = (i: number) => !options[i].disabled;
    // Arrow keys step to the next option that is not disabled.
    const step = (from: number, dir: 1 | -1) => {
      for (let n = 1; n <= options.length; n++) {
        const i = (from + dir * n + options.length * n) % options.length;
        if (enabled(i)) return i;
      }
      return from;
    };
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = step(current, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = step(current, -1);
    else if (event.key === "Home") next = options.findIndex((_, i) => enabled(i));
    else if (event.key === "End") next = options.length - 1 - [...options].reverse().findIndex((_, i) => enabled(options.length - 1 - i));
    else return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative inline-flex items-center rounded-lg bg-muted p-0.5 text-sm", className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        const button = (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            aria-disabled={option.disabled || undefined}
            onClick={() => {
              if (!option.disabled) onChange(option.value);
            }}
            className={cn(
              "relative z-10 h-7 rounded-md px-3 text-[0.8125rem] font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              option.disabled && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`${id}-pill`}
                className="absolute inset-0 -z-10 rounded-md bg-card shadow-sm ring-1 ring-foreground/5 dark:bg-secondary dark:ring-foreground/10"
                transition={{ duration: 0.28, ease: EASE_OUT }}
              />
            ) : null}
            {option.label}
          </button>
        );
        // A disabled option stays focusable (aria-disabled, not disabled) so its reason can be read and shown.
        return option.disabled && option.hint ? (
          <Tooltip key={option.value}>
            <TooltipTrigger render={button} />
            <TooltipContent className="max-w-64">{option.hint}</TooltipContent>
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
