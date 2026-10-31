import { CardSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <PageHeaderSkeleton />
      <Skeleton className="h-[50vh] w-full rounded-xl" />
      <CardSkeleton lines={4} />
    </div>
  );
}
