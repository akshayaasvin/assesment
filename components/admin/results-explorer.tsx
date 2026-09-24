"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { AttemptStatusBadge } from "@/components/shared/status-badge";
import { BarChart3 } from "lucide-react";
import { downloadResultsCsv, downloadResultsXlsx, type ResultExportRow } from "@/lib/export/results";
import type { AttemptStatus } from "@/types/database";

export interface ResultRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  college: string;
  district: string;
  department: string;
  role: string;
  assessment: string;
  startedAt: string | null;
  submittedAt: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  status: AttemptStatus;
  violations: number;
}

function toExportRow(r: ResultRow): ResultExportRow {
  return {
    Name: r.name,
    Email: r.email,
    Phone: r.phone,
    College: r.college,
    District: r.district,
    Department: r.department,
    Role: r.role,
    Assessment: r.assessment,
    "Started At": r.startedAt ?? "",
    "Submitted At": r.submittedAt ?? "",
    Score: r.score,
    "Total Marks": r.totalMarks,
    Percentage: r.percentage,
    Status: r.status,
    Violations: r.violations,
  };
}

export function ResultsExplorer({ rows }: { rows: ResultRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [assessment, setAssessment] = useState<string>("all");

  const assessments = useMemo(() => [...new Set(rows.map((r) => r.assessment))], [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (assessment !== "all" && r.assessment !== assessment) return false;
      if (term) {
        const haystack = `${r.name} ${r.email} ${r.college} ${r.district}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, search, status, assessment]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, email, college..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={assessment} onValueChange={setAssessment}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All assessments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assessments</SelectItem>
            {assessments.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="disqualified">Disqualified</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadResultsCsv(filtered.map(toExportRow))}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadResultsXlsx(filtered.map(toExportRow))}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={BarChart3} title="No results match your filters" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Violations</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.email}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.assessment}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.role}</TableCell>
                  <TableCell className="text-sm">
                    {r.status === "completed" || r.status === "disqualified" ? `${r.score}/${r.totalMarks} (${r.percentage}%)` : "—"}
                  </TableCell>
                  <TableCell>
                    <AttemptStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.violations}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
