import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";
import { CandidateFlow } from "./candidate-flow";

interface AssessmentRow {
  title: string;
  camera_required: boolean;
  mic_required: boolean;
  fullscreen_required: boolean;
  result_visible_to_candidate: boolean;
  status: "draft" | "scheduled" | "live" | "paused" | "ended";
  start_at: string | null;
  end_at: string | null;
  roles: { label: string } | null;
}

export default async function CandidateAssessmentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: assessment } = (await admin
    .from("assessments")
    .select(
      "title, camera_required, mic_required, fullscreen_required, result_visible_to_candidate, status, start_at, end_at, roles(label)"
    )
    .eq("slug", slug)
    .maybeSingle()) as { data: AssessmentRow | null };

  if (!assessment) notFound();

  return (
    <CandidateFlow
      slug={slug}
      info={{
        title: assessment.title,
        roleLabel: assessment.roles?.label ?? null,
        isOpen: isAssessmentOpen(assessment),
        cameraRequired: assessment.camera_required,
        micRequired: assessment.mic_required,
        fullscreenRequired: assessment.fullscreen_required,
        resultVisibleToCandidate: assessment.result_visible_to_candidate,
      }}
    />
  );
}
