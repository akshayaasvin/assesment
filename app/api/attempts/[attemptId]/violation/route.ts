import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizeAttempt } from "@/lib/assessment/finalize";

const bodySchema = z.object({
  attemptToken: z.string().min(1),
  type: z.enum(["fullscreen_exit", "tab_switch", "window_blur", "copy", "paste", "contextmenu", "resize"]),
  message: z.string().min(1),
  // Record for the admin without counting a warning (e.g. fullscreen not available on this phone).
  logOnly: z.boolean().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { attemptToken, type, message, logOnly } = parsed.data;

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

  if (logOnly) {
    await admin.from("violations").insert({ attempt_id: attemptId, type, message });
    return NextResponse.json({ warningsCount: attempt.warnings_count, logged: true });
  }

  const { data: assessment } = await admin
    .from("assessments")
    .select("max_warnings")
    .eq("id", attempt.assessment_id)
    .single();
  const maxWarnings = assessment?.max_warnings ?? 4;

  // Count the saved violation rows instead of "read count + 1": two violations
  // arriving at the same moment both read the old count and one was lost.
  await admin.from("violations").insert({ attempt_id: attemptId, type, message });
  const { count: saved } = await admin
    .from("violations")
    .select("id", { count: "exact", head: true })
    .eq("attempt_id", attemptId);
  const warningsCount = Math.max(saved ?? 0, attempt.warnings_count + 1);
  // Only ever raise the stored count (a slower concurrent request must not lower it).
  await admin.from("attempts").update({ warnings_count: warningsCount }).eq("id", attemptId).lt("warnings_count", warningsCount);
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
