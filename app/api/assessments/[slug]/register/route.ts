import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";
import { hasTakenAnotherAssessment, ONE_ROLE_MESSAGE } from "@/lib/assessment/one-per-person";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  college: z.string().trim().min(1),
  district: z.string().trim().min(1),
  department: z.string().trim().min(1),
});

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in all fields with valid values." }, { status: 400 });
  }
  const { name, email, phone, college, district, department } = parsed.data;

  const admin = createAdminClient();

  const { data: assessment } = await admin.from("assessments").select("*").eq("slug", slug).maybeSingle();
  if (!assessment) {
    return NextResponse.json({ error: "This assessment does not exist." }, { status: 404 });
  }
  if (!isAssessmentOpen(assessment)) {
    return NextResponse.json(
      { error: "This assessment is not open right now. Please check the scheduled start and end time." },
      { status: 403 }
    );
  }

  // Find-or-create by email (same behaviour as the previous upsert) without
  // ON CONFLICT, so it works whether or not the database still has a global
  // unique constraint on candidates.email.
  const details = { name, email, phone, college, district, department };
  const { data: existing, error: findError } = await admin
    .from("candidates")
    .select("id")
    .eq("email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: candidate, error: candidateError } = findError
    ? { data: null, error: findError }
    : existing
      ? await admin.from("candidates").update(details).eq("id", existing.id).select("id").single()
      : await admin.from("candidates").insert(details).select("id").single();
  if (candidateError || !candidate) {
    console.error("[register] candidate upsert failed:", candidateError);
    return NextResponse.json({ error: "Could not register. Please try again." }, { status: 500 });
  }

  const { data: existingAttempt } = await admin
    .from("attempts")
    .select("id, attempt_token, status")
    .eq("candidate_id", candidate.id)
    .eq("assessment_id", assessment.id)
    .maybeSingle();

  if (existingAttempt?.status === "completed") {
    return NextResponse.json({ error: "You have already completed this assessment." }, { status: 409 });
  }
  if (existingAttempt?.status === "disqualified") {
    return NextResponse.json({ error: "You are disqualified and cannot attempt this test." }, { status: 403 });
  }
  // Resuming this same test (after a refresh) is always allowed.
  if (existingAttempt?.status === "in_progress") {
    return NextResponse.json({ attemptId: existingAttempt.id, attemptToken: existingAttempt.attempt_token });
  }

  // One test per person: same email or phone already took another role today.
  try {
    if (await hasTakenAnotherAssessment(admin, { email, phone }, assessment.id)) {
      return NextResponse.json({ error: ONE_ROLE_MESSAGE }, { status: 409 });
    }
  } catch (e) {
    console.error("[register] one-per-person check failed:", e);
    return NextResponse.json({ error: "Could not register. Please try again." }, { status: 500 });
  }

  if (existingAttempt) {
    return NextResponse.json({ attemptId: existingAttempt.id, attemptToken: existingAttempt.attempt_token });
  }

  const { data: attempt, error: attemptError } = await admin
    .from("attempts")
    .insert({ candidate_id: candidate.id, assessment_id: assessment.id })
    .select("id, attempt_token")
    .single();
  if (attemptError || !attempt) {
    return NextResponse.json({ error: "Could not start your attempt. Please try again." }, { status: 500 });
  }

  await admin.from("assessment_events").insert({
    attempt_id: attempt.id,
    assessment_id: assessment.id,
    type: "joined",
    payload: { name, email },
  });

  return NextResponse.json({ attemptId: attempt.id, attemptToken: attempt.attempt_token });
}
