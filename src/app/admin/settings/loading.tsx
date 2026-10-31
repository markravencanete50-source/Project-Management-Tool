import { CardSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeaderSkeleton />
      <div className="grid gap-6">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={9} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={3} />
      </div>
    </div>
  );
}
