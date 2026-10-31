import { ListSkeleton, PageHeaderSkeleton } from "@/components/common/skeletons";

export default function Loading() {
  return (
    <div aria-busy="true">
      <PageHeaderSkeleton action />
      <ListSkeleton rows={6} />
    </div>
  );
}
