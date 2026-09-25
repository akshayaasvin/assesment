import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAssessmentAccess, normalizeEmail, samePhone } from "@/lib/portal/access";
import { setCandidateSession } from "@/lib/portal/session";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  college: z.string().trim().min(1),
  district: z.string().trim().min(1),
  department: z.string().trim().min(1),
});

/**
 * Registration via a direct assessment link (/a/[slug]). Applies the same
 * eligibility/role gate as the candidate portal, so a role assessment link
 * can't be used to skip the Aptitude Assessment.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fill in all fields with valid values." }, { status: 400 });
  }
  const { name, phone, college, district, department } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  try {
    const admin = createAdminClient();

    const { data: assessment, error: assessmentError } = await admin.from("assessments").select("*").eq("slug", slug).maybeSingle();
    if (assessmentError) throw assessmentError;
    if (!assessment) {
      return NextResponse.json({ error: "This assessment does not exist." }, { status: 404 });
    }

    // An existing candidate is identified by email + phone; their stored
    // details are never overwritten by someone else typing the same email.
    const { data: existingCandidate, error: findError } = await admin
      .from("candidates")
      .select("id, phone, aptitude_status, role_id")
      .eq("email", email)
      .maybeSingle();
    if (findError) throw findError;
    if (existingCandidate && !samePhone(existingCandidate.phone, phone)) {
      return NextResponse.json(
        { error: "This email is already registered with a different phone number." },
        { status: 403 }
      );
    }

    let candidate = existingCandidate;
    if (!candidate) {
      const { data: created, error: createError } = await admin
        .from("candidates")
        .insert({ name, email, phone, college, district, department })
        .select("id, phone, aptitude_status, role_id")
        .single();
      if (createError || !created) throw createError ?? new Error("Candidate insert returned no row.");
      candidate = created;
    }

    // Signed in either way, so the candidate can continue from the portal home page.
    await setCandidateSession(candidate.id);

    const { data: existingAttempt, error: attemptLookupError } = await admin
      .from("attempts")
      .select("id, attempt_token, status")
      .eq("candidate_id", candidate.id)
      .eq("assessment_id", assessment.id)
      .maybeSingle();
    if (attemptLookupError) throw attemptLookupError;

    if (existingAttempt?.status === "completed") {
      return NextResponse.json({ error: "You have already completed this assessment." }, { status: 409 });
    }
    if (existingAttempt?.status === "disqualified") {
      return NextResponse.json({ error: "You are disqualified and cannot attempt this test." }, { status: 403 });
    }
    if (existingAttempt?.status === "in_progress") {
      return NextResponse.json({ attemptId: existingAttempt.id, attemptToken: existingAttempt.attempt_token });
    }

    const denied = await checkAssessmentAccess(admin, candidate, assessment);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    if (existingAttempt) {
      return NextResponse.json({ attemptId: existingAttempt.id, attemptToken: existingAttempt.attempt_token });
    }

    const { data: attempt, error: attemptError } = await admin
      .from("attempts")
      .insert({ candidate_id: candidate.id, assessment_id: assessment.id })
      .select("id, attempt_token")
      .single();
    if (attemptError || !attempt) throw attemptError ?? new Error("Attempt insert returned no row.");

    await admin.from("assessment_events").insert({
      attempt_id: attempt.id,
      assessment_id: assessment.id,
      type: "joined",
      payload: { name, email },
    });

    return NextResponse.json({ attemptId: attempt.id, attemptToken: attempt.attempt_token });
  } catch (e) {
    console.error("[candidate] register via link failed:", e);
    return NextResponse.json({ error: "Could not register. Please try again." }, { status: 500 });
  }
}
