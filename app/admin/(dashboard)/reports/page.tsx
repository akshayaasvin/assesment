import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import {
  AverageScoreByAssessmentChart,
  StatusBreakdownChart,
  HardestQuestionsChart,
  ReportCard,
} from "@/components/admin/reports-charts";
import { Users2, Percent, CheckCircle2, Clock3 } from "lucide-react";
import type { AttemptStatus } from "@/types/database";

interface ReportAttemptRow {
  status: AttemptStatus;
  percentage: number;
  started_at: string | null;
  submitted_at: string | null;
  assessments: { title: string; passing_percentage: number } | null;
}

interface ReportAnswerRow {
  question_id: string;
  is_correct: boolean;
  questions: { text: string } | null;
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const [{ count: candidateCount }, { data: attempts }, { data: answers }] = await Promise.all([
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase
      .from("attempts")
      .select("status, percentage, started_at, submitted_at, assessments(title, passing_percentage)") as unknown as Promise<{
      data: ReportAttemptRow[] | null;
    }>,
    supabase.from("answers").select("question_id, is_correct, questions(text)") as unknown as Promise<{
      data: ReportAnswerRow[] | null;
    }>,
  ]);

  const all = attempts ?? [];
  const completed = all.filter((a) => a.status === "completed");
  const avgScore = completed.length ? Math.round(completed.reduce((s, a) => s + a.percentage, 0) / completed.length) : 0;
  const completionRate = all.length ? Math.round(((completed.length + all.filter((a) => a.status === "disqualified").length) / all.length) * 100) : 0;
  const passCount = completed.filter((a) => a.percentage >= (a.assessments?.passing_percentage ?? 40)).length;
  const passRate = completed.length ? Math.round((passCount / completed.length) * 100) : 0;

  const durations = completed
    .filter((a) => a.started_at && a.submitted_at)
    .map((a) => (new Date(a.submitted_at!).getTime() - new Date(a.started_at!).getTime()) / 60000);
  const avgMinutes = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;

  const scoreByAssessment = new Map<string, { sum: number; count: number }>();
  for (const a of completed) {
    const title = a.assessments?.title ?? "Untitled";
    const entry = scoreByAssessment.get(title) ?? { sum: 0, count: 0 };
    entry.sum += a.percentage;
    entry.count += 1;
    scoreByAssessment.set(title, entry);
  }
  const scoreChartData = [...scoreByAssessment.entries()].map(([name, { sum, count }]) => ({
    name,
    avgScore: Math.round(sum / count),
  }));

  const statusLabels: Record<string, string> = {
    completed: "Completed",
    in_progress: "In Progress",
    not_started: "Not Started",
    disqualified: "Disqualified",
  };
  const statusCounts = new Map<string, number>();
  for (const a of all) {
    const label = statusLabels[a.status] ?? a.status;
    statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
  }
  const statusChartData = [...statusCounts.entries()].map(([name, value]) => ({ name, value }));

  const questionStats = new Map<string, { text: string; correct: number; total: number }>();
  for (const ans of answers ?? []) {
    const entry = questionStats.get(ans.question_id) ?? { text: ans.questions?.text ?? "Untitled", correct: 0, total: 0 };
    entry.total += 1;
    if (ans.is_correct) entry.correct += 1;
    questionStats.set(ans.question_id, entry);
  }
  const hardestQuestions = [...questionStats.values()]
    .filter((q) => q.total >= 1)
    .map((q) => ({ name: q.text.length > 42 ? q.text.slice(0, 42) + "…" : q.text, correctRate: Math.round((q.correct / q.total) * 100) }))
    .sort((a, b) => a.correctRate - b.correctRate)
    .slice(0, 8);

  return (
    <div>
      <PageHeader title="Reports" description="Aggregate performance across every assessment." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Candidates" value={candidateCount ?? 0} icon={Users2} />
        <StatCard label="Average Score" value={`${avgScore}%`} icon={Percent} />
        <StatCard label="Completion Rate" value={`${completionRate}%`} icon={CheckCircle2} tone="success" />
        <StatCard label="Average Time" value={`${avgMinutes} min`} icon={Clock3} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportCard title="Average score by assessment">
          <AverageScoreByAssessmentChart data={scoreChartData} />
        </ReportCard>
        <ReportCard title={`Attempt status breakdown (${passRate}% pass rate among completed)`}>
          <StatusBreakdownChart data={statusChartData} />
        </ReportCard>
        <ReportCard title="Hardest questions (lowest correct rate)">
          <HardestQuestionsChart data={hardestQuestions} />
        </ReportCard>
      </div>
    </div>
  );
}
