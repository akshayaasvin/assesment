import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AssessmentEventType } from "@/types/database";
import { gradeAttempt } from "./scoring";
import { decideEligibility } from "@/lib/portal/access";

type AdminClient = SupabaseClient<Database>;

/**
 * Shared by the submit route and the violation route's auto-disqualify path:
 * grades everything answered so far against the server-only correct-option
 * lookup, then closes out the attempt. Disqualified candidates keep the
 * score for whatever they had already answered, matching the old app's
 * behaviour of recording partial credit on disqualification.
 */
export async function finalizeAttempt(
  admin: AdminClient,
  attemptId: string,
  status: "completed" | "disqualified"
) {
  const { data: attemptQuestions, error: aqError } = await admin
    .from("attempt_questions")
    .select("question_id")
    .eq("attempt_id", attemptId);
  if (aqError) throw aqError;

  const questionIds = [...new Set((attemptQuestions ?? []).map((r) => r.question_id))];

  const [{ data: questions, error: qError }, { data: correctOptions, error: cError }, { data: answers, error: ansError }] =
    await Promise.all([
      admin.from("questions").select("id, marks").in("id", questionIds),
      admin.from("question_options").select("id, question_id").in("question_id", questionIds).eq("is_correct", true),
      admin.from("answers").select("question_id, selected_option_id").eq("attempt_id", attemptId),
    ]);
  if (qError) throw qError;
  if (cError) throw cError;
  if (ansError) throw ansError;

  const correctByQuestion = new Map((correctOptions ?? []).map((o) => [o.question_id, o.id]));

  const graded = gradeAttempt(
    (questions ?? []).map((q) => ({ id: q.id, marks: q.marks, correctOptionId: correctByQuestion.get(q.id) ?? null })),
    (answers ?? []).map((a) => ({ questionId: a.question_id, selectedOptionId: a.selected_option_id }))
  );

  const answerRows = graded.answers
    .filter((a) => a.selectedOptionId)
    .map((a) => ({
      attempt_id: attemptId,
      question_id: a.questionId,
      selected_option_id: a.selectedOptionId,
      is_correct: a.isCorrect,
      answered_at: new Date().toISOString(),
    }));
  if (answerRows.length > 0) {
    const { error } = await admin.from("answers").upsert(answerRows, { onConflict: "attempt_id,question_id" });
    if (error) throw error;
  }

  const { data: attempt, error: updateError } = await admin
    .from("attempts")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      score: graded.score,
      total_marks: graded.totalMarks,
      percentage: graded.percentage,
    })
    .eq("id", attemptId)
    .select("assessment_id")
    .single();
  if (updateError) throw updateError;

  const eventType: AssessmentEventType = status === "completed" ? "submitted" : "disqualified";
  await admin.from("assessment_events").insert({
    attempt_id: attemptId,
    assessment_id: attempt.assessment_id,
    type: eventType,
  });

  // For aptitude attempts, persist the candidate's eligibility right away.
  // Non-fatal: the score is already saved, and the portal re-derives a missing
  // decision from the finished attempt on the candidate's next page load.
  try {
    await decideEligibility(admin, attemptId);
  } catch (e) {
    console.error("[assessment] Could not record eligibility for attempt", attemptId, e);
  }

  return graded;
}
