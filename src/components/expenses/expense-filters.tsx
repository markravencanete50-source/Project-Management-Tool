"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/payments/native-select";
import { CATEGORY_LABELS } from "@/components/expenses/labels";
import { formatMonthKey } from "@/lib/dates";
import type { ExpenseFilters } from "@/lib/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/types";

/** Month, currency, category, client and search filters. They live in the URL, so a filtered view can be shared or reloaded. */
export function ExpenseFilterBar({
  filters,
  months,
  clients,
}: {
  filters: ExpenseFilters;
  months: string[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(filters.q);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // The search box waits for a short pause in typing before it touches the URL.
  useEffect(() => {
    if (text.trim() === filters.q) return;
    const id = setTimeout(() => set("q", text.trim()), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const active = filters.month !== "all" || filters.currency !== "all" || filters.category !== "all" || filters.clientId !== "all" || filters.q !== "";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-52">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search expenses"
          placeholder="Search expenses"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="pl-8"
        />
      </div>
      <NativeSelect aria-label="Filter by month" value={filters.month} onChange={(e) => set("month", e.target.value)} className="sm:w-40">
        <option value="all">All months</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonthKey(m, "MMMM yyyy")}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filter by currency" value={filters.currency} onChange={(e) => set("currency", e.target.value)} className="sm:w-36">
        <option value="all">All currencies</option>
        <option value="GBP">GBP</option>
        <option value="USD">USD</option>
        <option value="PHP">PHP</option>
      </NativeSelect>
      <NativeSelect aria-label="Filter by category" value={filters.category} onChange={(e) => set("category", e.target.value)} className="sm:w-40">
        <option value="all">All categories</option>
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filter by client" value={filters.clientId} onChange={(e) => set("client", e.target.value)} className="sm:w-44">
        <option value="all">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      {active ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => {
            setText("");
            router.replace(pathname, { scroll: false });
          }}
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
