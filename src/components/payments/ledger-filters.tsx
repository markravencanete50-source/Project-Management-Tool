"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/payments/native-select";
import { Button } from "@/components/ui/button";
import { formatMonthKey } from "@/lib/dates";
import type { LedgerFilters } from "@/lib/standalone-payments";

/** Month, currency, client and source filters. They live in the URL, so a filtered view can be shared or reloaded. */
export function LedgerFilterBar({
  filters,
  months,
  clients,
}: {
  filters: LedgerFilters;
  months: string[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const active = filters.month !== "all" || filters.currency !== "all" || filters.clientId !== "all" || filters.source !== "all";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <NativeSelect aria-label="Filter by month" value={filters.month} onChange={(e) => set("month", e.target.value)} className="sm:w-44">
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
      <NativeSelect aria-label="Filter by client" value={filters.clientId} onChange={(e) => set("client", e.target.value)} className="sm:w-48">
        <option value="all">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Filter by source" value={filters.source} onChange={(e) => set("source", e.target.value)} className="sm:w-44">
        <option value="all">All sources</option>
        <option value="project">Project payments</option>
        <option value="standalone">Payment only</option>
      </NativeSelect>
      {active ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => router.replace(pathname, { scroll: false })}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
