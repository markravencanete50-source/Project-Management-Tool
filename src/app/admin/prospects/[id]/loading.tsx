import { CardSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="mb-3 h-8 w-32" />
      <div className="mb-6 flex items-center gap-4 md:mb-8">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="grid gap-2.5">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-5.5 w-28 rounded-full" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="grid gap-4 lg:col-span-2">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={8} />
          <CardSkeleton lines={3} />
        </div>
        <div className="grid gap-4">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </div>
  );
}
