import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { ResultsExplorer, type ResultRow } from "@/components/admin/results-explorer";
import type { AttemptStatus } from "@/types/database";

interface ResultAttemptRow {
  id: string;
  started_at: string | null;
  submitted_at: string | null;
  score: number;
  total_marks: number;
  percentage: number;
  status: AttemptStatus;
  candidates: {
    name: string;
    email: string;
    phone: string | null;
    college: string | null;
    district: string | null;
    department: string | null;
  } | null;
  assessments: { title: string; roles: { label: string } | null } | null;
}

export default async function ResultsPage() {
  const supabase = await createClient();

  const [{ data: attempts, error }, { data: violations, error: violationsError }] = await Promise.all([
    supabase
      .from("attempts")
      .select(
        "id, started_at, submitted_at, score, total_marks, percentage, status, candidates!attempts_candidate_id_fkey(name, email, phone, college, district, department), assessments(title, roles(label))"
      )
      .order("submitted_at", { ascending: false, nullsFirst: false }) as unknown as Promise<{
      data: ResultAttemptRow[] | null;
      error: { message: string } | null;
    }>,
    supabase.from("proctor_events").select("attempt_id").not("attempt_id", "is", null),
  ]);
  // A failed query must not look like "No results match your filters".
  if (error) throw new Error(`Could not load results: ${error.message}`);
  if (violationsError) throw new Error(`Could not load violations: ${violationsError.message}`);

  const violationCounts = new Map<string, number>();
  for (const v of violations ?? []) {
    if (!v.attempt_id) continue;
    violationCounts.set(v.attempt_id, (violationCounts.get(v.attempt_id) ?? 0) + 1);
  }

  const rows: ResultRow[] = (attempts ?? []).map((a) => ({
    id: a.id,
    name: a.candidates?.name ?? "—",
    email: a.candidates?.email ?? "",
    phone: a.candidates?.phone ?? "",
    college: a.candidates?.college ?? "",
    district: a.candidates?.district ?? "",
    department: a.candidates?.department ?? "",
    role: a.assessments?.roles?.label ?? "—",
    assessment: a.assessments?.title ?? "—",
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    score: a.score,
    totalMarks: a.total_marks,
    percentage: a.percentage,
    status: a.status,
    violations: violationCounts.get(a.id) ?? 0,
  }));

  return (
    <div>
      <PageHeader title="Results" description="Every candidate attempt, filterable and exportable." />
      <ResultsExplorer rows={rows} />
    </div>
  );
}
