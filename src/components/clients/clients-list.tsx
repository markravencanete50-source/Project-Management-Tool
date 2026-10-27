"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="clients-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="clients-archived">Show archived</Label>
        </div>
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{clients.length === 0 ? "No clients yet" : "No clients match"}</EmptyTitle>
            <EmptyDescription>
              {clients.length === 0 ? "Add your first client to start creating projects." : "Try a different search or show archived clients."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/clients/${c.id}`}
                  className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{c.name}</span>
                    {c.archived ? <Badge variant="outline">Archived</Badge> : null}
                  </div>
                  {c.company ? <span className="truncate text-sm text-muted-foreground">{c.company}</span> : null}
                  <span className="truncate text-sm text-muted-foreground">{c.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.projectCount} {c.projectCount === 1 ? "project" : "projects"} / {c.defaultCurrency}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
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
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/clients/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                      {c.archived ? (
                        <Badge variant="outline" className="ml-2">
                          Archived
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.company || "None"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell>{c.defaultCurrency}</TableCell>
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
