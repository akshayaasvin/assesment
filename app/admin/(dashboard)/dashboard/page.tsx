import Link from "next/link";
import { ClipboardList, RadioTower, Users2, CheckCircle2, Clock, TrendingUp, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { AssessmentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { effectiveStatus } from "@/lib/assessment/scheduling";
import type { AssessmentStatus } from "@/types/database";

interface DashboardAssessmentRow {
  id: string;
  title: string;
  status: AssessmentStatus;
  start_at: string | null;
  end_at: string | null;
  assessment_sections: { duration_minutes: number; question_count: number }[];
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [{ data: assessments }, { count: candidateCount }, { data: attempts }] = await Promise.all([
    supabase
      .from("assessments")
      .select("id, title, status, start_at, end_at, created_at, assessment_sections(duration_minutes, question_count)")
      .order("created_at", { ascending: false }) as unknown as Promise<{ data: DashboardAssessmentRow[] | null }>,
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("attempts").select("status, percentage"),
  ]);

  const list = assessments ?? [];
  const liveCount = list.filter((a) => effectiveStatus(a) === "live").length;
  const completed = (attempts ?? []).filter((a) => a.status === "completed");
  const pending = (attempts ?? []).filter((a) => a.status === "in_progress").length;
  const avgScore = completed.length
    ? Math.round(completed.reduce((sum, a) => sum + a.percentage, 0) / completed.length)
    : 0;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A snapshot of every assessment, candidate and score across the platform."
        actions={
          <Button asChild>
            <Link href="/admin/assessments/new">
              <Plus className="h-4 w-4" /> New assessment
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Assessments" value={list.length} icon={ClipboardList} />
        <StatCard label="Live Assessments" value={liveCount} icon={RadioTower} tone="success" />
        <StatCard label="Total Candidates" value={candidateCount ?? 0} icon={Users2} />
        <StatCard label="Completed Tests" value={completed.length} icon={CheckCircle2} tone="success" />
        <StatCard label="Pending Tests" value={pending} icon={Clock} tone="warning" />
        <StatCard label="Average Score" value={`${avgScore}%`} icon={TrendingUp} />
      </div>

      <Card className="mt-6 border-border/70">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-5">
            <h2 className="font-semibold">Recent assessments</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/assessments">View all</Link>
            </Button>
          </div>
          {list.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ClipboardList}
                title="No assessments yet"
                description="Create your first assessment to start collecting candidate attempts."
                action={
                  <Button asChild size="sm">
                    <Link href="/admin/assessments/new">Create assessment</Link>
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.slice(0, 6).map((a) => {
                const sections = a.assessment_sections ?? [];
                const totalQuestions = sections.reduce((sum, s) => sum + s.question_count, 0);
                const totalMinutes = sections.reduce((sum, s) => sum + s.duration_minutes, 0);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <Link href={`/admin/assessments/${a.id}`} className="font-medium text-foreground hover:underline">
                        {a.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {totalQuestions} Questions &middot; {totalMinutes} Minutes
                      </p>
                    </div>
                    <AssessmentStatusBadge status={effectiveStatus(a)} />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
