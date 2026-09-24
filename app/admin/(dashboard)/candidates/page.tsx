import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AttemptStatusBadge } from "@/components/shared/status-badge";
import type { AttemptStatus } from "@/types/database";

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  college: string | null;
  district: string | null;
  department: string | null;
  attempts: { status: AttemptStatus; percentage: number; assessments: { title: string } | null }[];
}

export default async function CandidatesPage() {
  const supabase = await createClient();
  const { data: candidates } = (await supabase
    .from("candidates")
    .select("id, name, email, phone, college, district, department, attempts(status, percentage, assessments(title))")
    .order("created_at", { ascending: false })) as { data: CandidateRow[] | null };

  return (
    <div>
      <PageHeader title="Candidates" description="Everyone who has registered for an assessment." />

      <Card className="border-border/70">
        <CardContent className="p-0">
          {!candidates?.length ? (
            <div className="p-6">
              <EmptyState icon={UserRound} title="No candidates yet" description="Candidates appear here as soon as they register for an assessment." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>College / District</TableHead>
                  <TableHead>Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
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
                        {(c.attempts ?? []).map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{a.assessments?.title ?? "—"}</span>
                            <AttemptStatusBadge status={a.status} />
                            {a.status === "completed" && <span className="text-muted-foreground">{a.percentage}%</span>}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
