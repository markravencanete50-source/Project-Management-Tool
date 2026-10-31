import { Download, FileJson } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatInstant } from "@/lib/dates";
import { fileUrl } from "@/lib/files";

/** Backups, newest first, each linked through the access-checked file route. */
export function BackupsList({
  backups,
  failed,
}: {
  backups: { storedId: string; name: string; createdAt: string }[];
  failed: boolean;
}) {
  if (failed) {
    return (
      <p className="rounded-lg border border-warning/25 bg-warning/8 px-3 py-2.5 text-sm text-foreground">
        Backups could not be loaded right now. Try again in a moment.
      </p>
    );
  }
  if (backups.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileJson />
          </EmptyMedia>
          <EmptyTitle>No backups yet</EmptyTitle>
          <EmptyDescription>The first backup is written by the daily job.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {backups.map((backup, i) => (
        <li key={backup.storedId}>
          <a
            href={fileUrl(backup.storedId)}
            className="group/backup flex items-center gap-3 px-4 py-3 text-sm outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-inset"
          >
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              <FileJson className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-medium">{backup.name}</span>
                {i === 0 ? <Badge variant="success">Latest</Badge> : null}
              </span>
              <span className="block text-xs text-muted-foreground tabular-nums">{formatInstant(new Date(backup.createdAt))}</span>
            </span>
            <Download
              className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/backup:text-foreground"
              aria-hidden="true"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
