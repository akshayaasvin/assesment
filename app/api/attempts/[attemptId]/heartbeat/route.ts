import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceSection } from "@/lib/assessment/section-progress";

const bodySchema = z.object({
  attemptToken: z.string().min(1),
  // Sent when the candidate moves to a new section (and with every heartbeat).
  currentSectionIndex: z.number().int().min(0).max(100).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status, assessment_id")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== parsed.data.attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status === "in_progress") {
    await admin.from("attempts").update({ last_seen_at: new Date().toISOString() }).eq("id", attemptId);
    const index = parsed.data.currentSectionIndex;
    if (typeof index === "number") {
      try {
        await advanceSection(admin, attempt, index);
      } catch (e) {
        console.error("[exam] Could not record section advance:", e);
        return NextResponse.json({ error: "Could not save your progress." }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
