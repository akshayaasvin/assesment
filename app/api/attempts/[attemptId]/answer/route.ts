import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceSection } from "@/lib/assessment/section-progress";

const bodySchema = z.object({
  attemptToken: z.string().min(1),
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().nullable(),
  currentSectionIndex: z.number().int().min(0).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { attemptToken, questionId, selectedOptionId, currentSectionIndex } = parsed.data;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status, assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ error: "This attempt is not in progress." }, { status: 409 });
  }

  const { error } = await admin.from("answers").upsert(
    {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: selectedOptionId,
      answered_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" }
  );
  if (error) return NextResponse.json({ error: "Could not save your answer." }, { status: 500 });

  await admin.from("attempts").update({ last_seen_at: new Date().toISOString() }).eq("id", attemptId);
  // Forward-only: an answer can't move the attempt back to an earlier section.
  if (typeof currentSectionIndex === "number") {
    await advanceSection(admin, attempt, currentSectionIndex).catch((e) =>
      console.error("[exam] Could not record section advance:", e)
    );
  }

  return NextResponse.json({ ok: true });
}
