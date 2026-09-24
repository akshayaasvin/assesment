import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeAttempt } from "@/lib/assessment/finalize";

const bodySchema = z.object({
  attemptToken: z.string().min(1),
  type: z.enum(["fullscreen_exit", "tab_switch", "window_blur", "copy", "paste", "contextmenu", "resize"]),
  message: z.string().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { attemptToken, type, message } = parsed.data;

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status, warnings_count, assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json({ warningsCount: attempt.warnings_count, disqualified: attempt.status === "disqualified" });
  }

  const { data: assessment } = await admin
    .from("assessments")
    .select("max_warnings")
    .eq("id", attempt.assessment_id)
    .single();
  const maxWarnings = assessment?.max_warnings ?? 4;

  const warningsCount = attempt.warnings_count + 1;
  await admin.from("attempts").update({ warnings_count: warningsCount }).eq("id", attemptId);
  await admin.from("violations").insert({ attempt_id: attemptId, type, message });
  await admin.from("assessment_events").insert({
    attempt_id: attemptId,
    assessment_id: attempt.assessment_id,
    type: "violation",
    payload: { type, message, warningsCount },
  });

  const disqualified = warningsCount > maxWarnings;
  if (disqualified) {
    await finalizeAttempt(admin, attemptId, "disqualified");
  }

  return NextResponse.json({ warningsCount, maxWarnings, disqualified });
}
