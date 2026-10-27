import { History } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { formatInstant } from "@/lib/dates";
import type { Activity } from "@/lib/types";

const ACTOR_LABELS = { admin: "You", client: "Client", system: "System" } as const;

/**
 * Activity entries as a simple timeline, newest first (callers pass them sorted).
 * showVisibility marks internal entries; leave it off in the portal.
 */
export function ActivityList({
  items,
  showVisibility = false,
  actorLabels = ACTOR_LABELS,
}: {
  items: Activity[];
  showVisibility?: boolean;
  actorLabels?: Record<Activity["actor"], string>;
}) {
  if (items.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>No activity yet</EmptyTitle>
          <EmptyDescription>Updates will appear here as the project moves along.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ol className="flex flex-col divide-y rounded-xl bg-card ring-1 ring-foreground/10">
      {items.map((a) => (
        <li key={a.id} className="flex flex-col gap-1 px-4 py-3">
          <p className="text-sm break-words">{a.message}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <time dateTime={a.createdAt.toISOString()}>{formatInstant(a.createdAt)}</time>
            <span aria-hidden="true">/</span>
            <span>{actorLabels[a.actor]}</span>
            {showVisibility && a.visibility === "internal" ? <Badge variant="outline">Internal</Badge> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
