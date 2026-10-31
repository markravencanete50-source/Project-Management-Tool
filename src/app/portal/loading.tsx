import { CardSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true">
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2">
        <CardSkeleton lines={2} />
        <CardSkeleton lines={2} />
      </div>
    </div>
  );
}
