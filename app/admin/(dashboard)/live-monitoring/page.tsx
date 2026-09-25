import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import {
  LiveMonitoringBoard,
  type LiveAttempt,
  type FinishedAttempt,
} from "@/components/admin/live-monitoring-board";
import type { AttemptStatus, ViolationType } from "@/types/database";

interface AttemptRow {
  id: string;
  status: AttemptStatus;
  started_at: string | null;
  submitted_at: string | null;
  last_seen_at: string | null;
  warnings_count: number;
  score: number;
  total_marks: number;
  percentage: number;
  candidates: { name: string; email: string } | null;
  assessments: {
    title: string;
    max_warnings: number;
    assessment_sections: { duration_minutes: number; question_count: number }[];
  } | null;
}

// attempts.candidate_id -> candidates is named explicitly: candidates also
// references attempts (aptitude_attempt_id), which makes an unqualified
// `candidates(...)` embed ambiguous.
const ATTEMPT_COLUMNS =
  "id, status, started_at, submitted_at, last_seen_at, warnings_count, score, total_marks, percentage, candidates!attempts_candidate_id_fkey(name, email), assessments(title, max_warnings, assessment_sections(duration_minutes, question_count))";

const RECENT_WINDOW_HOURS = 24;

function recentSinceIso() {
  return new Date(Date.now() - RECENT_WINDOW_HOURS * 3600 * 1000).toISOString();
}

function sections(a: AttemptRow) {
  const list = a.assessments?.assessment_sections ?? [];
  return {
    totalMinutes: list.reduce((sum, s) => sum + s.duration_minutes, 0),
    totalQuestions: list.reduce((sum, s) => sum + s.question_count, 0),
  };
}

export default async function LiveMonitoringPage() {
  const supabase = await createClient();
  const recentSince = recentSinceIso();

  const [live, finished] = (await Promise.all([
    supabase.from("attempts").select(ATTEMPT_COLUMNS).eq("status", "in_progress").order("started_at", { ascending: false }),
    supabase
      .from("attempts")
      .select(ATTEMPT_COLUMNS)
      .in("status", ["completed", "disqualified"])
      .gte("submitted_at", recentSince)
      .order("submitted_at", { ascending: false })
      .limit(25),
  ])) as unknown as { data: AttemptRow[] | null; error: { message: string } | null }[];
  if (live.error) throw new Error(`Could not load in-progress attempts: ${live.error.message}`);
  if (finished.error) throw new Error(`Could not load recent attempts: ${finished.error.message}`);

  const liveRows = live.data ?? [];
  const liveIds = liveRows.map((a) => a.id);

  // Answered-question counts and proctoring flags for in-progress attempts only.
  const answeredByAttempt = new Map<string, number>();
  const flagsByAttempt = new Map<string, Partial<Record<ViolationType, number>>>();
  if (liveIds.length) {
    const [answers, violations] = await Promise.all([
      supabase.from("answers").select("attempt_id").in("attempt_id", liveIds).not("selected_option_id", "is", null),
      supabase.from("violations").select("attempt_id, type").in("attempt_id", liveIds),
    ]);
    if (answers.error) throw new Error(`Could not load answers: ${answers.error.message}`);
    if (violations.error) throw new Error(`Could not load violations: ${violations.error.message}`);

    for (const a of answers.data ?? []) answeredByAttempt.set(a.attempt_id, (answeredByAttempt.get(a.attempt_id) ?? 0) + 1);
    for (const v of violations.data ?? []) {
      const flags = flagsByAttempt.get(v.attempt_id) ?? {};
      const type = v.type as ViolationType;
      flags[type] = (flags[type] ?? 0) + 1;
      flagsByAttempt.set(v.attempt_id, flags);
    }
  }

  const initial: LiveAttempt[] = liveRows.map((a) => {
    const { totalMinutes, totalQuestions } = sections(a);
    return {
      id: a.id,
      candidateName: a.candidates?.name ?? "Unknown",
      candidateEmail: a.candidates?.email ?? "",
      assessmentTitle: a.assessments?.title ?? "",
      startedAt: a.started_at,
      lastSeenAt: a.last_seen_at,
      warningsCount: a.warnings_count,
      maxWarnings: a.assessments?.max_warnings ?? 4,
      totalMinutes,
      answeredCount: answeredByAttempt.get(a.id) ?? 0,
      totalQuestions,
      flags: flagsByAttempt.get(a.id) ?? {},
    };
  });

  const recent: FinishedAttempt[] = (finished.data ?? []).map((a) => ({
    id: a.id,
    candidateName: a.candidates?.name ?? "Unknown",
    candidateEmail: a.candidates?.email ?? "",
    assessmentTitle: a.assessments?.title ?? "",
    status: a.status as "completed" | "disqualified",
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
    score: a.score,
    totalMarks: a.total_marks,
    percentage: a.percentage,
    warningsCount: a.warnings_count,
  }));

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        description="Candidates currently taking an assessment, plus attempts finished in the last 24 hours. Updates automatically."
      />
      <LiveMonitoringBoard initial={initial} recent={recent} />
    </div>
  );
}
