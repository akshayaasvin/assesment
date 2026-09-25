import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRuntimeSection } from "@/lib/assessment/section-resolver";
import { checkAssessmentAccess } from "@/lib/portal/access";
import { sectionRemainingSeconds } from "@/lib/assessment/section-progress";
import type { RuntimeAssessment } from "@/types/domain";

const bodySchema = z.object({ attemptToken: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: attempt } = await admin.from("attempts").select("*").eq("id", attemptId).maybeSingle();
  if (!attempt || attempt.attempt_token !== parsed.data.attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status === "completed" || attempt.status === "disqualified") {
    return NextResponse.json({ error: `This attempt is already ${attempt.status}.` }, { status: 409 });
  }

  const { data: assessment } = await admin.from("assessments").select("*").eq("id", attempt.assessment_id).single();
  if (!assessment) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });

  // Re-check the eligibility/role gate before the first start (the candidate's
  // role or the assessment's schedule may have changed since registration).
  // An exam already in progress can always be resumed.
  if (attempt.status === "not_started") {
    const { data: candidate } = await admin
      .from("candidates")
      .select("id, aptitude_status, role_id")
      .eq("id", attempt.candidate_id)
      .single();
    if (!candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
    const denied = await checkAssessmentAccess(admin, candidate, assessment);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });
  }

  const { data: sections } = await admin
    .from("assessment_sections")
    .select("*")
    .eq("assessment_id", assessment.id)
    .order("order_index", { ascending: true });

  const runtimeSections = await Promise.all(
    (sections ?? []).map((section) => buildRuntimeSection(admin, attemptId, section))
  );

  const now = new Date().toISOString();
  let startedAt = attempt.started_at;
  if (attempt.status === "not_started") {
    startedAt = now;
    await admin.from("attempts").update({ status: "in_progress", started_at: now, last_seen_at: now }).eq("id", attemptId);
    await admin.from("assessment_events").insert({ attempt_id: attemptId, assessment_id: assessment.id, type: "started" });
  } else {
    await admin.from("attempts").update({ last_seen_at: now }).eq("id", attemptId);
  }

  const { data: savedAnswers } = await admin
    .from("answers")
    .select("question_id, selected_option_id")
    .eq("attempt_id", attemptId);

  const payload: RuntimeAssessment & { savedAnswers: Record<string, string | null> } = {
    attemptId: attempt.id,
    attemptToken: attempt.attempt_token,
    assessmentTitle: assessment.title,
    currentSectionIndex: attempt.current_section_index,
    // Server-measured, so refreshing the page doesn't restart the section timer.
    sectionRemainingSeconds: await sectionRemainingSeconds(
      admin,
      { id: attempt.id, started_at: startedAt, current_section_index: attempt.current_section_index },
      (sections ?? []).map((s) => s.duration_minutes)
    ),
    maxWarnings: assessment.max_warnings,
    warningsCount: attempt.warnings_count,
    settings: {
      cameraRequired: assessment.camera_required,
      micRequired: assessment.mic_required,
      fullscreenRequired: assessment.fullscreen_required,
      tabSwitchMonitoring: assessment.tab_switch_monitoring,
      copyPasteBlock: assessment.copy_paste_block,
      autoSubmit: assessment.auto_submit,
    },
    sections: runtimeSections,
    savedAnswers: Object.fromEntries((savedAnswers ?? []).map((a) => [a.question_id, a.selected_option_id])),
  };

  return NextResponse.json(payload);
}
