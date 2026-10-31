import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label and value pair for use inside a <dl>. */
export function DetailItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** Responsive grid of DetailItem. */
export function DetailGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-8 gap-y-5 sm:grid-cols-2", className)}>{children}</dl>;
}
