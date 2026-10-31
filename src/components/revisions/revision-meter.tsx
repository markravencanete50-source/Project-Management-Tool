import { AnimatedBar } from "@/components/motion/animated-bar";
import { cn } from "@/lib/utils";

const MAX_SEGMENTS = 12;

/**
 * "Revisions used x of y" meter. One segment per included revision (filled when
 * used), plus warning segments for extra rounds billed as change orders. Large
 * allowances fall back to a single bar.
 */
export function RevisionMeter({ counted, allowance }: { counted: number; allowance: number }) {
  const used = Math.min(counted, allowance);
  const extra = Math.max(0, counted - allowance);
  const label = `${used} of ${allowance} included revisions used${extra > 0 ? `, ${extra} extra` : ""}`;

  if (allowance <= 0) return null;

  if (allowance > MAX_SEGMENTS) {
    return <AnimatedBar value={(used / allowance) * 100} label={label} barClassName={extra > 0 ? "bg-warning" : undefined} />;
  }

  const segments: ("used" | "free" | "extra")[] = [
    ...Array.from({ length: allowance }, (_, i): "used" | "free" => (i < used ? "used" : "free")),
    ...Array.from({ length: Math.min(extra, MAX_SEGMENTS) }, (): "extra" => "extra"),
  ];

  return (
    <div role="img" aria-label={label} className="stagger flex gap-1.5 [--stagger:50ms]">
      {segments.map((kind, i) => (
        <span
          key={i}
          className={cn(
            "h-2 min-w-0 flex-1 rounded-full",
            kind === "used" && "bg-primary",
            kind === "free" && "bg-muted",
            kind === "extra" && "bg-warning",
          )}
        />
      ))}
    </div>
  );
}
