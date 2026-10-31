import { AnimatedBar } from "@/components/motion/animated-bar";

/** Progress bar with a label and percentage. Value is a 0 to 100 percentage computed with progress(). */
export function ProgressBar({ value, label = "Progress" }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <AnimatedBar value={pct} label={label} className="h-2.5" />
    </div>
  );
}
