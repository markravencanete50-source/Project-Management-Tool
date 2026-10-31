import { cn } from "@/lib/utils";

const TONES = [
  "bg-chart-1/15 text-chart-1",
  "bg-chart-2/20 text-[color-mix(in_oklch,var(--chart-2),var(--foreground)_35%)]",
  "bg-chart-3/25 text-[color-mix(in_oklch,var(--chart-3),var(--foreground)_45%)]",
  "bg-chart-4/15 text-chart-4",
  "bg-chart-5/20 text-[color-mix(in_oklch,var(--chart-5),var(--foreground)_35%)]",
] as const;

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic coloured initials for a person or company. Server safe. */
export function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold select-none",
        TONES[hash(name) % TONES.length],
        className,
      )}
    >
      {initials}
    </span>
  );
}
