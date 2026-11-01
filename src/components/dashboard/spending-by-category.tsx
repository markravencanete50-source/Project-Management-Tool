"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CategoryBars } from "@/components/expenses/category-bars";
import { SegmentedControl } from "@/components/dashboard/segmented-control";
import type { CategoryBreakdown } from "@/lib/expenses";
import { cn } from "@/lib/utils";

type Span = "month" | "year";

/** Where this month's and this year's spending went, with a month / year switch. The values are printed as text too. */
export function SpendingByCategory({
  month,
  year,
  monthLabel,
  yearLabel,
  converted = false,
}: {
  month: CategoryBreakdown[];
  year: CategoryBreakdown[];
  monthLabel: string;
  yearLabel: string;
  /** The groups are one PHP total converted at the current rate. */
  converted?: boolean;
}) {
  const [span, setSpan] = useState<Span>("month");
  const groups = span === "month" ? month : year;
  const label = span === "month" ? monthLabel : yearLabel;

  return (
    <section aria-labelledby="category-heading" className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="category-heading" className="text-base font-semibold tracking-tight">
            Spending by category
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Where the money went in {label}, biggest first. Repeating expenses are included.
            {converted ? " Shown in PHP at today's exchange rates." : ""}
          </p>
        </div>
        <SegmentedControl
          label="Spending period"
          value={span}
          onChange={setSpan}
          options={[
            { value: "month", label: "This month" },
            { value: "year", label: "This year" },
          ]}
        />
      </div>
      <Card>
        <CardContent>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <Receipt className="size-5" aria-hidden />
              </span>
              <div className="max-w-xs">
                <p className="text-sm font-medium">No spending {span === "month" ? "this month" : "this year"}</p>
                <p className="mt-1 text-sm text-muted-foreground">Add an expense and its category will show up here.</p>
              </div>
              <Link href="/admin/expenses" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Go to expenses
              </Link>
            </div>
          ) : (
            <CategoryBars key={span} groups={groups} label={`Spending by category, ${label}`} className="md:max-w-3xl" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
