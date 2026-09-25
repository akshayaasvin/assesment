import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AttemptStatus } from "@/types/database";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";
import { decideEligibility, openStatusFilter } from "./access";
import type { PortalAssessmentCard, PortalCandidate, PortalRole, PortalState } from "./types";

type AdminClient = SupabaseClient<Database>;

interface AssessmentWithSections {
  id: string;
  title: string;
  description: string | null;
  status: Database["public"]["Tables"]["assessments"]["Row"]["status"];
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  roles: { label: string } | null;
  assessment_sections: { duration_minutes: number; question_count: number }[];
}

const CARD_COLUMNS =
  "id, title, description, status, start_at, end_at, created_at, roles(label), assessment_sections(duration_minutes, question_count)";

function toCard(a: AssessmentWithSections, attemptStatus: AttemptStatus | null): PortalAssessmentCard {
  const sections = a.assessment_sections ?? [];
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    roleLabel: a.roles?.label ?? null,
    durationMinutes: sections.reduce((sum, s) => sum + s.duration_minutes, 0),
    questionCount: sections.reduce((sum, s) => sum + s.question_count, 0),
    attemptStatus,
  };
}

async function activeRoles(admin: AdminClient): Promise<PortalRole[]> {
  const { data, error } = await admin.from("roles").select("id, label").eq("is_active", true).order("label");
  if (error) throw error;
  return data ?? [];
}

/**
 * Loads the signed-in candidate and works out their current step:
 * Aptitude -> (not eligible | select role) -> role assessment.
 * Everything comes from the database, so the result is the same after a
 * refresh, a logout/login, or on another device. Returns null if the
 * candidate no longer exists.
 */
export async function loadPortal(
  admin: AdminClient,
  candidateId: string
): Promise<{ candidate: PortalCandidate; state: PortalState } | null> {
  let { data: candidate, error } = await admin.from("candidates").select("*").eq("id", candidateId).maybeSingle();
  if (error) throw error;
  if (!candidate) return null;

  const { data: attempts, error: attemptsError } = (await admin
    .from("attempts")
    .select("id, assessment_id, status, created_at, assessments(kind)")
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false })) as {
    data: { id: string; assessment_id: string; status: AttemptStatus; assessments: { kind: string } | null }[] | null;
    error: { message: string } | null;
  };
  if (attemptsError) throw attemptsError;

  const attemptList = (attempts ?? []).map((a) => ({ ...a, kind: a.assessments?.kind }));
  const aptitudeAttempt = attemptList.find((a) => a.kind === "aptitude") ?? null;

  // Self-heal: an aptitude attempt that finished but whose eligibility wasn't
  // recorded (e.g. a transient DB error at submit time) gets decided now.
  if (
    candidate.aptitude_status === "pending" &&
    aptitudeAttempt &&
    (aptitudeAttempt.status === "completed" || aptitudeAttempt.status === "disqualified")
  ) {
    await decideEligibility(admin, aptitudeAttempt.id);
    ({ data: candidate, error } = await admin.from("candidates").select("*").eq("id", candidateId).single());
    if (error || !candidate) throw error ?? new Error("Candidate disappeared.");
  }

  const identity: PortalCandidate = { name: candidate.name, email: candidate.email };

  // ---- Step 1: Aptitude
  if (candidate.aptitude_status === "pending") {
    let aptitude: AssessmentWithSections | null = null;

    if (aptitudeAttempt) {
      // Already started one - always resume that exact assessment.
      const { data, error: e } = await admin.from("assessments").select(CARD_COLUMNS).eq("id", aptitudeAttempt.assessment_id).single();
      if (e) throw e;
      aptitude = data as unknown as AssessmentWithSections;
    } else {
      const { data, error: e } = await admin
        .from("assessments")
        .select(CARD_COLUMNS)
        .eq("kind", "aptitude")
        .or(openStatusFilter())
        .order("created_at", { ascending: false })
        .limit(1);
      if (e) throw e;
      aptitude = (data?.[0] as unknown as AssessmentWithSections) ?? null;
    }

    return {
      candidate: identity,
      state: {
        stage: "aptitude",
        aptitude: aptitude && (aptitudeAttempt || isAssessmentOpen(aptitude)) ? toCard(aptitude, aptitudeAttempt?.status ?? null) : null,
      },
    };
  }

  // ---- Step 2: Eligibility
  if (candidate.aptitude_status === "not_eligible") {
    let percentage: number | null = null;
    let requiredPercentage: number | null = null;
    if (aptitudeAttempt) {
      const { data } = await admin
        .from("assessments")
        .select("passing_percentage, result_visible_to_candidate")
        .eq("id", aptitudeAttempt.assessment_id)
        .single();
      if (data?.result_visible_to_candidate) {
        percentage = candidate.aptitude_percentage;
        requiredPercentage = data.passing_percentage;
      }
    }
    return { candidate: identity, state: { stage: "not_eligible", percentage, requiredPercentage } };
  }

  // ---- Step 3: Role selection
  const roles = await activeRoles(admin);
  const role = candidate.role_id ? await admin.from("roles").select("id, label").eq("id", candidate.role_id).maybeSingle() : null;
  if (role?.error) throw role.error;
  if (!role?.data) {
    return { candidate: identity, state: { stage: "select_role", roles } };
  }

  // ---- Step 4: Role assessments - filtered by kind, role and open status in the database.
  const { data: open, error: openError } = (await admin
    .from("assessments")
    .select(CARD_COLUMNS)
    .eq("kind", "role")
    .eq("role_id", role.data.id)
    .or(openStatusFilter())
    .order("created_at", { ascending: false })) as { data: AssessmentWithSections[] | null; error: { message: string } | null };
  if (openError) throw openError;

  const roleAttempts = attemptList.filter((a) => a.kind === "role");
  const statusByAssessment = new Map(roleAttempts.map((a) => [a.assessment_id, a.status]));

  // Also keep showing assessments for this role the candidate already started
  // or finished, even if the admin has since paused/ended them.
  const openIds = new Set((open ?? []).map((a) => a.id));
  const extraIds = roleAttempts.map((a) => a.assessment_id).filter((id) => !openIds.has(id));
  let extra: AssessmentWithSections[] = [];
  if (extraIds.length) {
    const { data, error: e } = await admin.from("assessments").select(CARD_COLUMNS).in("id", extraIds).eq("role_id", role.data.id);
    if (e) throw e;
    extra = (data ?? []) as unknown as AssessmentWithSections[];
  }

  const assessments = [...(open ?? []).filter(isAssessmentOpen), ...extra].map((a) =>
    toCard(a, statusByAssessment.get(a.id) ?? null)
  );

  return {
    candidate: identity,
    state: {
      stage: "role_assessment",
      role: role.data,
      roles,
      canChangeRole: !roleAttempts.some((a) => a.status !== "not_started"),
      assessments,
    },
  };
}
