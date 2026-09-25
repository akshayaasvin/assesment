import Link from "next/link";
import { format } from "date-fns";
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
import { Badge } from "@/components/ui/badge";
import type { AssessmentKind, AssessmentStatus } from "@/types/database";

interface AssessmentListRow {
  id: string;
  title: string;
  description: string | null;
  kind: AssessmentKind;
  status: AssessmentStatus;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  roles: { label: string } | null;
  assessment_sections: { duration_minutes: number; question_count: number }[];
}

export default async function AssessmentsPage() {
  const supabase = await createClient();
  const { data: assessments, error } = (await supabase
    .from("assessments")
    .select(
      "id, title, description, kind, status, start_at, end_at, created_at, updated_at, roles(label), assessment_sections(duration_minutes, question_count)"
    )
    .order("created_at", { ascending: false })) as { data: AssessmentListRow[] | null; error: { message: string } | null };
  if (error) console.error("[admin] Could not load assessments:", error);

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
          {error ? (
            <p className="p-6 text-sm text-destructive">Unable to load assessments. Please refresh the page.</p>
          ) : !assessments?.length ? (
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
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
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
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/assessments/${a.id}`} className="hover:underline">
                            {a.title}
                          </Link>
                          {a.kind === "aptitude" && <Badge variant="secondary">Aptitude</Badge>}
                        </div>
                        {a.description && (
                          <p className="line-clamp-1 max-w-sm text-xs font-normal text-muted-foreground">{a.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.kind === "aptitude" ? "All candidates" : (a.roles?.label ?? "—")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {totalQuestions} Q &middot; {totalMinutes} min
                      </TableCell>
                      <TableCell>
                        <AssessmentStatusBadge status={effectiveStatus(a)} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {format(new Date(a.created_at), "d MMM yyyy")}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {format(new Date(a.updated_at), "d MMM yyyy, HH:mm")}
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
