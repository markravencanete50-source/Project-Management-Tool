import { cn } from "cn"

/** Shimmering placeholder. The sweep is transform-only and stops under reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-lg bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
