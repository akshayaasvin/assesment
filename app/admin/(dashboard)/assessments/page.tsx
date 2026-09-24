import Link from "next/link";
import { Plus, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentStatusBadge } from "@/components/shared/status-badge";
import { AssessmentActionsMenu } from "@/components/admin/assessment-actions-menu";
import { effectiveStatus } from "@/lib/assessment/scheduling";
import type { AssessmentStatus } from "@/types/database";

interface AssessmentListRow {
  id: string;
  title: string;
  status: AssessmentStatus;
  start_at: string | null;
  end_at: string | null;
  roles: { label: string } | null;
  assessment_sections: { duration_minutes: number; question_count: number }[];
}

export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: assessments } = (await supabase
    .from("assessments")
    .select("id, title, status, start_at, end_at, roles(label), assessment_sections(duration_minutes, question_count)")
    .order("created_at", { ascending: false })) as { data: AssessmentListRow[] | null };

  return (
    <div>
      <PageHeader
        title="Assessments"
        description="Create, schedule and control every assessment from one place."
        actions={
          <Button asChild>
            <Link href="/admin/assessments/new">
              <Plus className="h-4 w-4" /> New assessment
            </Link>
          </Button>
        }
      />

      <Card className="border-border/70">
        <CardContent className="p-0">
          {!assessments?.length ? (
            <div className="p-6">
              <EmptyState
                icon={ClipboardList}
                title="No assessments yet"
                description="Create an assessment, add sections, and publish or schedule it for candidates."
                action={
                  <Button asChild size="sm">
                    <Link href="/admin/assessments/new">Create assessment</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Questions / Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((a) => {
                  const sections = a.assessment_sections ?? [];
                  const totalQuestions = sections.reduce((sum, s) => sum + s.question_count, 0);
                  const totalMinutes = sections.reduce((sum, s) => sum + s.duration_minutes, 0);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        <Link href={`/admin/assessments/${a.id}`} className="hover:underline">
                          {a.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.roles?.label ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {totalQuestions} Q &middot; {totalMinutes} min
                      </TableCell>
                      <TableCell>
                        <AssessmentStatusBadge status={effectiveStatus(a)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <AssessmentActionsMenu id={a.id} status={a.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
