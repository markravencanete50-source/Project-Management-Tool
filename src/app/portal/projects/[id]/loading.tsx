import { CardSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true">
      <PageHeaderSkeleton />
      <CardSkeleton lines={2} />
      <ListSkeleton rows={3} toolbar={false} />
      <CardSkeleton lines={4} />
    </div>
  );
}
