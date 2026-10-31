import type { ReactNode } from "react";

/**
 * Page title block. Compatible with the original props; `eyebrow` adds a small
 * label above the title (for example a parent page link).
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</div> : null}
        <h1 className="text-2xl leading-tight font-semibold tracking-tight text-balance break-words sm:text-[1.75rem]">{title}</h1>
        {description ? <div className="mt-1.5 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
