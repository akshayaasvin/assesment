import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";

type AdminClient = SupabaseClient<Database>;
type Candidate = Database["public"]["Tables"]["candidates"]["Row"];
type Assessment = Database["public"]["Tables"]["assessments"]["Row"];

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Compares phones by digits only, ignoring spaces, dashes and a leading country code. */
export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);
  const da = digits(a);
  return da.length >= 6 && da === digits(b);
}

/**
 * PostgREST filter for "open to candidates right now", evaluated in the
 * database: status 'live', or 'scheduled' with now inside [start_at, end_at].
 * Mirrors isAssessmentOpen() in lib/assessment/scheduling.ts.
 */
export function openStatusFilter(now = new Date().toISOString()) {
  return `status.eq.live,and(status.eq.scheduled,or(start_at.is.null,start_at.lte.${now}),or(end_at.is.null,end_at.gte.${now}))`;
}

/**
 * Records the aptitude outcome on the candidate - the persisted eligibility
 * that gates every role assessment. Eligible = completed (not disqualified)
 * with a percentage at or above the aptitude assessment's passing_percentage.
 * Only decides once: a candidate who already has a decision keeps it.
 */
export async function decideEligibility(admin: AdminClient, attemptId: string) {
  const { data: attempt, error } = await admin
    .from("attempts")
    .select("id, candidate_id, assessment_id, status, percentage")
    .eq("id", attemptId)
    .single();
  if (error) throw error;

  const { data: assessment, error: assessmentError } = await admin
    .from("assessments")
    .select("kind, passing_percentage")
    .eq("id", attempt.assessment_id)
    .single();
  if (assessmentError) throw assessmentError;
  if (assessment.kind !== "aptitude") return;
  if (attempt.status !== "completed" && attempt.status !== "disqualified") return;

  const eligible = attempt.status === "completed" && Number(attempt.percentage) >= Number(assessment.passing_percentage);
  const { error: updateError } = await admin
    .from("candidates")
    .update({
      aptitude_status: eligible ? "eligible" : "not_eligible",
      aptitude_attempt_id: attempt.id,
      aptitude_percentage: attempt.percentage,
      eligibility_decided_at: new Date().toISOString(),
    })
    .eq("id", attempt.candidate_id)
    .eq("aptitude_status", "pending");
  if (updateError) throw updateError;
}

/**
 * The single server-side gate for starting an assessment, shared by the
 * portal, the direct /a/[slug] link and the exam start route. Returns a
 * candidate-facing reason if access is denied, or null if allowed.
 */
export async function checkAssessmentAccess(
  admin: AdminClient,
  candidate: Pick<Candidate, "id" | "aptitude_status" | "role_id">,
  assessment: Pick<Assessment, "id" | "kind" | "role_id" | "status" | "start_at" | "end_at">
): Promise<string | null> {
  if (!isAssessmentOpen(assessment)) {
    return "This assessment is not open right now. Please check the scheduled start and end time.";
  }

  if (assessment.kind === "aptitude") {
    if (candidate.aptitude_status !== "pending") return "You have already completed the Aptitude Assessment.";
    // One aptitude attempt per candidate, even if more than one aptitude assessment is open.
    const { data: other, error } = await admin
      .from("attempts")
      .select("id, assessments!inner(kind)")
      .eq("candidate_id", candidate.id)
      .eq("assessments.kind", "aptitude")
      .neq("assessment_id", assessment.id)
      .limit(1);
    if (error) throw error;
    if (other?.length) return "You have already started a different Aptitude Assessment.";
    return null;
  }

  if (candidate.aptitude_status === "pending") return "Please complete the Aptitude Assessment first.";
  if (candidate.aptitude_status === "not_eligible") {
    return "You are not eligible for role assessments based on your Aptitude Assessment result.";
  }
  if (!candidate.role_id) return "Please select your role first.";
  if (assessment.role_id !== candidate.role_id) return "This assessment is not for your selected role.";
  return null;
}
