import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { getCandidateId } from "@/lib/portal/session";
import { checkAssessmentAccess } from "@/lib/portal/access";

const bodySchema = z.object({ assessmentId: z.string().uuid() });

/**
 * Starts (or resumes) the signed-in candidate's attempt on an assessment,
 * after the server-side eligibility/role/open checks. Returns the attempt
 * credentials the existing exam routes (/api/attempts/[id]/...) expect.
 */
export async function POST(request: Request) {
  const candidateId = await getCandidateId();
  if (!candidateId) return fail("Please log in again.", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request.", 400);

  try {
    const admin = createAdminClient();
    const [{ data: candidate, error: cError }, { data: assessment, error: aError }] = await Promise.all([
      admin.from("candidates").select("id, name, email, aptitude_status, role_id").eq("id", candidateId).maybeSingle(),
      admin.from("assessments").select("*").eq("id", parsed.data.assessmentId).maybeSingle(),
    ]);
    if (cError) throw cError;
    if (aError) throw aError;
    if (!candidate) return fail("Please log in again.", 401);
    if (!assessment) return fail("This assessment does not exist.", 404);

    const { data: existing, error: eError } = await admin
      .from("attempts")
      .select("id, attempt_token, status")
      .eq("candidate_id", candidate.id)
      .eq("assessment_id", assessment.id)
      .maybeSingle();
    if (eError) throw eError;

    // Existing retake rule: one attempt per candidate per assessment.
    if (existing?.status === "completed") return fail("You have already completed this assessment.", 409);
    if (existing?.status === "disqualified") return fail("You are disqualified and cannot attempt this test.", 403);

    // A candidate mid-exam can always resume, even if the admin paused scheduling
    // rules since - the exam routes themselves still enforce attempt status.
    if (existing?.status !== "in_progress") {
      const denied = await checkAssessmentAccess(admin, candidate, assessment);
      if (denied) return fail(denied, 403);
    }

    const settings = {
      cameraRequired: assessment.camera_required,
      micRequired: assessment.mic_required,
      fullscreenRequired: assessment.fullscreen_required,
      resultVisibleToCandidate: assessment.result_visible_to_candidate,
    };

    if (existing) return ok({ attemptId: existing.id, attemptToken: existing.attempt_token, settings });

    const { data: attempt, error: insertError } = await admin
      .from("attempts")
      .insert({ candidate_id: candidate.id, assessment_id: assessment.id })
      .select("id, attempt_token")
      .single();
    if (insertError?.code === "23505") {
      // Double-click / two tabs raced to create it - return the one that won.
      const { data: raced } = await admin
        .from("attempts")
        .select("id, attempt_token")
        .eq("candidate_id", candidate.id)
        .eq("assessment_id", assessment.id)
        .single();
      if (raced) return ok({ attemptId: raced.id, attemptToken: raced.attempt_token, settings });
    }
    if (insertError || !attempt) throw insertError ?? new Error("Attempt insert returned no row.");

    await admin.from("assessment_events").insert({
      attempt_id: attempt.id,
      assessment_id: assessment.id,
      type: "joined",
      payload: { name: candidate.name, email: candidate.email },
    });

    return ok({ attemptId: attempt.id, attemptToken: attempt.attempt_token, settings }, 201);
  } catch (e) {
    console.error("[portal] start attempt failed:", e);
    return fail("Could not start the assessment. Please try again.", 500);
  }
}
