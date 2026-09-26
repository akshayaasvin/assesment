import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { buildRuntimeSection } from "@/lib/assessment/section-resolver";
import { sectionRemainingSeconds } from "@/lib/assessment/section-progress";
import { getSessionCandidate, isDriveOpen, listRoleOptions } from "@/lib/drive/server";
import type { StageRuntime } from "@/lib/drive/types";

const bodySchema = z.object({
  stage: z.enum(["aptitude", "role"]),
  // Required to START the role stage (the role the candidate picked); ignored on resume.
  assessmentId: z.string().uuid().optional(),
});

/**
 * Starts or resumes the candidate's aptitude or role stage and returns the
 * questions (never the answer key), saved answers and server-measured time left.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request.", 400);
  const { stage } = parsed.data;

  try {
    const admin = createAdminClient();
    const candidate = await getSessionCandidate(admin);
    if (!candidate) return fail("Please register first.", 401);
    if (candidate.status === "disqualified") return fail("You have been disqualified from this drive.", 403);
    if (!candidate.drive_id) return fail("This registration isn't linked to a drive.", 409);

    const { data: drive, error: driveError } = await admin.from("drives").select("*").eq("id", candidate.drive_id).single();
    if (driveError) throw driveError;

    const { data: attempts, error: attemptsError } = await admin.from("attempts").select("*").eq("candidate_id", candidate.id);
    if (attemptsError) throw attemptsError;
    const aptitude = attempts?.find((a) => a.stage === "aptitude");
    let attempt = attempts?.find((a) => a.stage === stage) ?? null;

    if (attempt?.status === "completed") return fail("You have already completed this test.", 409);
    if (attempt?.status === "disqualified") return fail("You have been disqualified from this drive.", 403);

    if (!attempt) {
      if (!isDriveOpen(drive)) return fail("This drive is closed.", 403);

      let assessmentId: string | null;
      if (stage === "aptitude") {
        assessmentId = drive.aptitude_assessment_id;
        if (!assessmentId) return fail("This drive has no aptitude test configured yet.", 409);
      } else {
        if (aptitude?.status !== "completed") return fail("Please complete the aptitude test first.", 403);
        const cutoff = drive.aptitude_cutoff === null ? null : Number(drive.aptitude_cutoff);
        if (cutoff !== null && Number(aptitude.percentage) < cutoff) return fail("The role test is not available for you.", 403);
        const roles = await listRoleOptions(admin, drive.id);
        assessmentId = parsed.data.assessmentId ?? null;
        if (!assessmentId || !roles.some((r) => r.assessmentId === assessmentId)) return fail("Please choose one of the listed roles.", 400);
      }

      const { data: created, error: insertError } = await admin
        .from("attempts")
        .insert({ candidate_id: candidate.id, assessment_id: assessmentId, stage })
        .select("*")
        .single();
      if (insertError?.code === "23505") {
        // Double-click: the other request created it first.
        const { data: raced } = await admin.from("attempts").select("*").eq("candidate_id", candidate.id).eq("assessment_id", assessmentId).single();
        attempt = raced;
      } else if (insertError || !created) {
        throw insertError ?? new Error("Attempt insert returned no row.");
      } else {
        attempt = created;
      }
      if (!attempt) throw new Error("Attempt not found after insert.");

      if (stage === "role") {
        const { data: roleAssessment } = await admin.from("assessments").select("role_id").eq("id", assessmentId).single();
        await admin.from("candidates").update({ role_id: roleAssessment?.role_id ?? null }).eq("id", candidate.id);
      }
    }

    const { data: assessment, error: aError } = await admin.from("assessments").select("*").eq("id", attempt.assessment_id).single();
    if (aError) throw aError;
    const { data: sections, error: sError } = await admin
      .from("assessment_sections")
      .select("*")
      .eq("assessment_id", assessment.id)
      .order("order_index", { ascending: true });
    if (sError) throw sError;

    const runtimeSections = await Promise.all((sections ?? []).map((section) => buildRuntimeSection(admin, attempt.id, section)));

    const now = new Date().toISOString();
    let startedAt = attempt.started_at;
    if (attempt.status === "not_started") {
      startedAt = now;
      await admin.from("attempts").update({ status: "in_progress", started_at: now, last_seen_at: now }).eq("id", attempt.id);
      await admin.from("assessment_events").insert({ attempt_id: attempt.id, assessment_id: assessment.id, type: "started" });
      await admin
        .from("candidates")
        .update({ status: stage === "aptitude" ? "aptitude_in_progress" : "role_in_progress" })
        .eq("id", candidate.id)
        .neq("status", "disqualified");
    }

    const { data: saved, error: savedError } = await admin.from("answers").select("question_id, selected_option_id").eq("attempt_id", attempt.id);
    if (savedError) throw savedError;

    const payload: StageRuntime = {
      attemptId: attempt.id,
      stage,
      assessmentTitle: assessment.title,
      currentSectionIndex: attempt.current_section_index,
      sectionRemainingSeconds: await sectionRemainingSeconds(
        admin,
        { id: attempt.id, started_at: startedAt, current_section_index: attempt.current_section_index },
        (sections ?? []).map((s) => s.duration_minutes)
      ),
      sections: runtimeSections,
      savedAnswers: Object.fromEntries((saved ?? []).map((a) => [a.question_id, a.selected_option_id])),
      settings: {
        tabSwitchMonitoring: assessment.tab_switch_monitoring,
        copyPasteBlock: assessment.copy_paste_block,
        fullscreenRequired: assessment.fullscreen_required,
      },
    };
    return ok(payload);
  } catch (e) {
    console.error("[drive] start stage failed:", e);
    return fail("Could not load your test. Please try again.", 500);
  }
}
