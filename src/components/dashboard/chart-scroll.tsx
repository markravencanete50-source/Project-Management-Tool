"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Horizontal scroll box for a chart that is wider than its card. It starts
 * scrolled to the right so the current month, the one that matters, is visible.
 */
export function ChartScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
    </div>
  );
}
