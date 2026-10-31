import { PageHeaderSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton action />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-10 w-44 rounded-lg sm:h-9" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Skeleton className="h-10 w-full sm:h-9 sm:w-40" />
          <Skeleton className="h-10 w-full sm:h-9 sm:w-40" />
        </div>
        <Skeleton className="h-5 w-40 sm:ml-auto" />
      </div>
      <ListSkeleton rows={6} toolbar={false} />
    </div>
  );
}
