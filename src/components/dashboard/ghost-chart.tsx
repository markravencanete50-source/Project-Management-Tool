import type { ReactNode } from "react";

const HEIGHTS = [34, 52, 28, 64, 46, 72, 40, 58, 80, 50, 66, 88];

/**
 * Empty state for a chart: faint placeholder bars with a message on top, so the
 * card keeps the size of the real chart and nothing shifts when data arrives.
 */
export function GhostChart({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg sm:h-64">
      <div className="absolute inset-0 flex items-end gap-2 px-2 pb-1 sm:gap-3" aria-hidden>
        {HEIGHTS.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-md bg-muted" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-card/10 via-card/70 to-card" aria-hidden />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="max-w-xs">
          <p className="text-sm font-medium">{title}</p>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}
