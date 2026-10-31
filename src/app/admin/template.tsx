import type { ReactNode } from "react";

/**
 * A template remounts on every navigation, so this wrapper replays a short
 * CSS fade and rise for each page change. It is a server component and the
 * animation is pure CSS, so there is no hydration flash and no JS cost.
 */
export default function AdminTemplate({ children }: { children: ReactNode }) {
  return <div className="enter">{children}</div>;
}
