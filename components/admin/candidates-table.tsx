"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttemptStatusBadge } from "@/components/shared/status-badge";
import { DeleteCandidatesDialog } from "@/components/admin/delete-candidates-dialog";
import type { AttemptStatus } from "@/types/database";

export interface CandidateTableRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  college: string | null;
  district: string | null;
  attempts: { status: AttemptStatus; percentage: number; title: string }[];
}

export function CandidatesTable({ rows }: { rows: CandidateTableRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-accent/40 px-4 py-2.5">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <DeleteCandidatesDialog
            candidateIds={[...selected]}
            label={`${selected.size} candidate${selected.size === 1 ? "" : "s"}`}
            onDeleted={() => setSelected(new Set())}
            trigger={
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" /> Delete selected
              </Button>
            }
          />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                aria-label="Select all candidates"
                checked={allSelected}
                onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>College / District</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox aria-label={`Select ${c.name}`} checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
              </TableCell>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <div>{c.email}</div>
                <div>{c.phone}</div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <div>{c.college}</div>
                <div>{c.district}</div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1.5">
                  {c.attempts.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{a.title}</span>
                      <AttemptStatusBadge status={a.status} />
                      {a.status === "completed" && <span className="text-muted-foreground">{a.percentage}%</span>}
                    </div>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <DeleteCandidatesDialog
                  candidateIds={[c.id]}
                  label={c.name}
                  onDeleted={() => setSelected((prev) => new Set([...prev].filter((id) => id !== c.id)))}
                  trigger={
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete ${c.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
