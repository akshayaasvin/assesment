import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token." }, { status: 400 });

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status, score, total_marks, percentage, assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== token) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const { data: assessment } = await admin
    .from("assessments")
    .select("title, result_visible_to_candidate, passing_percentage")
    .eq("id", attempt.assessment_id)
    .single();

  return NextResponse.json({
    status: attempt.status,
    assessmentTitle: assessment?.title ?? "",
    resultVisible: Boolean(assessment?.result_visible_to_candidate),
    passed: attempt.percentage >= (assessment?.passing_percentage ?? 40),
    score: attempt.score,
    totalMarks: attempt.total_marks,
    percentage: attempt.percentage,
  });
}
