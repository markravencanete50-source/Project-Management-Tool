import {
  Bell,
  CircleDollarSign,
  FileSignature,
  FolderKanban,
  History,
  ListChecks,
  MessageSquareMore,
  RefreshCw,
  Settings,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { formatInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Activity } from "@/lib/types";

const ACTOR_LABELS = { admin: "You", client: "Client", system: "System" } as const;

/** Icon per activity type family, so the timeline can be scanned at a glance. */
function iconFor(type: string): LucideIcon {
  if (type.startsWith("payment") || type.startsWith("schedule")) return CircleDollarSign;
  if (type.startsWith("agreement")) return FileSignature;
  if (type.startsWith("revision")) return RefreshCw;
  if (type.startsWith("milestones")) return ListChecks;
  if (type.startsWith("project")) return FolderKanban;
  if (type.startsWith("client") || type === "authenticated") return UserRound;
  if (type.startsWith("settings")) return Settings;
  if (type.startsWith("prospect")) return MessageSquareMore;
  return Bell;
}

const ACTOR_TONES: Record<Activity["actor"], string> = {
  admin: "bg-primary/10 text-primary ring-primary/20",
  client: "bg-info/12 text-info ring-info/25",
  system: "bg-muted text-muted-foreground ring-border",
};

/** Short relative phrase for recent entries, falling back to the absolute date. */
function relativeLabel(date: Date): string | null {
  const diff = Date.now() - date.getTime();
  if (diff < 0) return null;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return null;
}

/**
 * Activity entries as a vertical timeline, newest first (callers pass them sorted).
 * showVisibility marks entries as Internal or Client visible; leave it off in the portal.
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
    <ol className="stagger flex flex-col [--stagger:35ms]">
      {items.map((a, index) => {
        const Icon = iconFor(a.type);
        const relative = relativeLabel(a.createdAt);
        const last = index === items.length - 1;
        return (
          <li key={a.id} className="relative flex gap-3 pb-6 last:pb-0">
            {last ? null : <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" />}
            <span
              aria-hidden="true"
              className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-1", ACTOR_TONES[a.actor])}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              <p className="text-sm break-words">{a.message}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{actorLabels[a.actor]}</span>
                <span aria-hidden="true">/</span>
                <time dateTime={a.createdAt.toISOString()} title={formatInstant(a.createdAt)}>
                  {relative ?? formatInstant(a.createdAt)}
                </time>
                {relative ? <span className="hidden sm:inline">{formatInstant(a.createdAt)}</span> : null}
                {showVisibility ? (
                  a.visibility === "internal" ? (
                    <Badge variant="outline">Internal</Badge>
                  ) : (
                    <Badge variant="info">Client visible</Badge>
                  )
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
