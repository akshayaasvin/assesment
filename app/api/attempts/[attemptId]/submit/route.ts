import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeAttempt } from "@/lib/assessment/finalize";

const bodySchema = z.object({ attemptToken: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status, score, total_marks, percentage")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== parsed.data.attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  if (attempt.status === "disqualified") {
    return NextResponse.json({ error: "This attempt was disqualified." }, { status: 409 });
  }

  if (attempt.status === "completed") {
    return NextResponse.json({
      score: attempt.score,
      totalMarks: attempt.total_marks,
      percentage: attempt.percentage,
      alreadySubmitted: true,
    });
  }

  const graded = await finalizeAttempt(admin, attemptId, "completed");

  return NextResponse.json({
    score: graded.score,
    totalMarks: graded.totalMarks,
    percentage: graded.percentage,
    alreadySubmitted: false,
  });
}
