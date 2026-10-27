import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tabular-nums break-words">{children}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
