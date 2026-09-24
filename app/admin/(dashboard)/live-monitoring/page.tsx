import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { LiveMonitoringBoard, type LiveAttempt } from "@/components/admin/live-monitoring-board";

interface LiveAttemptRow {
  id: string;
  started_at: string | null;
  last_seen_at: string | null;
  warnings_count: number;
  candidates: { name: string; email: string } | null;
  assessments: { title: string; max_warnings: number } | null;
}

export default async function LiveMonitoringPage() {
  const supabase = await createClient();
  const { data: attempts } = (await supabase
    .from("attempts")
    .select("id, started_at, last_seen_at, warnings_count, candidates(name, email), assessments(title, max_warnings)")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })) as { data: LiveAttemptRow[] | null };

  const initial: LiveAttempt[] = (attempts ?? []).map((a) => ({
    id: a.id,
    candidateName: a.candidates?.name ?? "Unknown",
    candidateEmail: a.candidates?.email ?? "",
    assessmentTitle: a.assessments?.title ?? "",
    startedAt: a.started_at,
    lastSeenAt: a.last_seen_at,
    warningsCount: a.warnings_count,
    maxWarnings: a.assessments?.max_warnings ?? 4,
  }));

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        description="Candidates currently taking an assessment, updated in real time. Video preview and push-to-talk arrive in Phase 2."
      />
      <LiveMonitoringBoard initial={initial} />
    </div>
  );
}
