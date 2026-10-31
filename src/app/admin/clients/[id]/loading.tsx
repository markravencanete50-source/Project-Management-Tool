import { CardSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between md:mb-8">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <div className="grid gap-2">
            <Skeleton className="h-8 w-48 max-w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-8">
        <CardSkeleton lines={4} />
        <div className="grid gap-4">
          <Skeleton className="h-5 w-24" />
          <div className="grid gap-3 sm:grid-cols-2">
            <CardSkeleton lines={2} />
            <CardSkeleton lines={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
