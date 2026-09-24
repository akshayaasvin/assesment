import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ attemptToken: z.string().min(1) });

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.attempt_token !== parsed.data.attemptToken) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }
  if (attempt.status === "in_progress") {
    await admin.from("attempts").update({ last_seen_at: new Date().toISOString() }).eq("id", attemptId);
  }
  return NextResponse.json({ ok: true });
}
