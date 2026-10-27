import { FileJson } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
    return <p className="text-sm text-muted-foreground">Backups could not be loaded right now. Try again in a moment.</p>;
  }
  if (backups.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No backups yet</EmptyTitle>
          <EmptyDescription>The first backup is written by the daily job.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <ul className="divide-y rounded-lg border">
      {backups.map((backup) => (
        <li key={backup.storedId}>
          <a href={fileUrl(backup.storedId)} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
            <FileJson className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-medium">{backup.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatInstant(new Date(backup.createdAt))}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
