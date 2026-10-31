"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SearchX, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InitialsAvatar } from "@/components/common/initials-avatar";

export type ClientRow = {
  id: string;
  name: string;
  company: string;
  email: string;
  defaultCurrency: string;
  projectCount: number;
  archived: boolean;
};

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (c.archived && !showArchived) return false;
      if (!q) return true;
      return [c.name, c.company, c.email].some((v) => v.toLowerCase().includes(q));
    });
  }, [clients, query, showArchived]);

  const filtering = query.trim() !== "" || showArchived;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
            className="pl-9"
          />
        </div>
        <div className="flex items-center justify-between gap-4 sm:ml-auto sm:justify-end">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {visible.length} {visible.length === 1 ? "client" : "clients"}
          </p>
          <div className="flex items-center gap-2">
            <Switch id="clients-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="clients-archived">Show archived</Label>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">{clients.length === 0 ? <Users /> : <SearchX />}</EmptyMedia>
            <EmptyTitle>{clients.length === 0 ? "No clients yet" : "No clients match"}</EmptyTitle>
            <EmptyDescription>
              {clients.length === 0
                ? "Add your first client to start creating projects. Use the New client button above."
                : "Try a different search term, or show archived clients."}
            </EmptyDescription>
          </EmptyHeader>
          {clients.length > 0 && filtering ? (
            <EmptyContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setShowArchived(false);
                }}
              >
                Clear filters
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <>
          <ul className="stagger flex flex-col gap-2 md:hidden">
            {visible.map((c) => (
              <li
                key={c.id}
                className="card-interactive relative flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs"
              >
                <InitialsAvatar name={c.company || c.name} className="size-10" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="min-w-0 truncate font-medium outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring/40"
                    >
                      {c.name}
                    </Link>
                    {c.archived ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                  {c.company ? <span className="truncate text-sm text-muted-foreground">{c.company}</span> : null}
                  <span className="truncate text-sm text-muted-foreground">{c.email}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant="secondary">{c.defaultCurrency}</Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {c.projectCount} {c.projectCount === 1 ? "project" : "projects"}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={c.id} className="relative">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <InitialsAvatar name={c.company || c.name} />
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring/40 focus-visible:after:ring-inset"
                        >
                          {c.name}
                        </Link>
                        {c.archived ? <Badge variant="outline">Archived</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.company || "None"}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{c.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.defaultCurrency}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.projectCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
