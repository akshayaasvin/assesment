import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";
import type { Database } from "@/types/database";
import type { CandidateStep, DriveCard, RoleOption } from "./types";

type Admin = SupabaseClient<Database>;
type Drive = Database["public"]["Tables"]["drives"]["Row"];
export type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];

interface AssessmentSummary {
  title: string;
  assessment_sections: { duration_minutes: number; question_count: number }[] | null;
}

/** Live = status 'live' and, if set, now inside [start_at, end_at]. */
export function isDriveOpen(drive: Pick<Drive, "status" | "start_at" | "end_at">, now = Date.now()) {
  if (drive.status !== "live") return false;
  if (drive.start_at && now < new Date(drive.start_at).getTime()) return false;
  if (drive.end_at && now > new Date(drive.end_at).getTime()) return false;
  return true;
}

export async function listLiveDrives(admin: Admin = createAdminClient()): Promise<DriveCard[]> {
  const { data, error } = await admin
    .from("drives")
    .select("id, name, mode, college_name, start_at, end_at, status")
    .eq("status", "live")
    .order("start_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data ?? []).filter((d) => isDriveOpen(d)).map((d) => ({
    id: d.id,
    name: d.name,
    mode: d.mode,
    collegeName: d.college_name,
    startAt: d.start_at,
    endAt: d.end_at,
  }));
}

/** The browser's Supabase session user (anonymous for candidates), or null. */
export async function getSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The candidate registered with this browser's anonymous session, or null. */
export async function getSessionCandidate(admin: Admin = createAdminClient()): Promise<CandidateRow | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data, error } = await admin.from("candidates").select("*").eq("auth_user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

function sectionTotals(sections: { duration_minutes: number; question_count: number }[] | null) {
  return {
    durationMinutes: (sections ?? []).reduce((t, s) => t + s.duration_minutes, 0),
    questionCount: (sections ?? []).reduce((t, s) => t + s.question_count, 0),
  };
}

/** Roles with a live role assessment in this drive - the only roles a candidate may pick. */
export async function listRoleOptions(admin: Admin, driveId: string): Promise<RoleOption[]> {
  const { data, error } = (await admin
    .from("drive_role_assessments")
    .select(
      "assessments!inner(id, title, description, kind, status, start_at, end_at, roles(label), assessment_sections(duration_minutes, question_count))"
    )
    .eq("drive_id", driveId)) as unknown as {
    data:
      | {
          assessments: {
            id: string;
            title: string;
            description: string | null;
            kind: string;
            status: Database["public"]["Tables"]["assessments"]["Row"]["status"];
            start_at: string | null;
            end_at: string | null;
            roles: { label: string } | null;
            assessment_sections: { duration_minutes: number; question_count: number }[];
          };
        }[]
      | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((r) => r.assessments)
    .filter((a) => a.kind === "role" && isAssessmentOpen(a))
    .map((a) => ({
      assessmentId: a.id,
      roleLabel: a.roles?.label ?? a.title,
      title: a.title,
      description: a.description,
      ...sectionTotals(a.assessment_sections),
    }))
    .sort((x, y) => x.roleLabel.localeCompare(y.roleLabel));
}

/**
 * Works out the candidate's next step from the database: aptitude ->
 * (not eligible | role select) -> role test -> completed.
 */
export async function loadCandidateStep(admin: Admin, candidate: CandidateRow): Promise<CandidateStep> {
  if (candidate.status === "disqualified") return { step: "disqualified", reason: candidate.disqualified_reason };
  if (!candidate.drive_id) return { step: "unavailable", message: "This registration isn't linked to a drive." };

  const { data: drive, error: driveError } = await admin.from("drives").select("*").eq("id", candidate.drive_id).single();
  if (driveError) throw driveError;

  const { data: attempts, error: attemptsError } = await admin
    .from("attempts")
    .select("id, stage, status, percentage, assessment_id")
    .eq("candidate_id", candidate.id);
  if (attemptsError) throw attemptsError;
  const aptitude = (attempts ?? []).find((a) => a.stage === "aptitude");
  const role = (attempts ?? []).find((a) => a.stage === "role");

  if (!aptitude || aptitude.status === "not_started" || aptitude.status === "in_progress") {
    if (!drive.aptitude_assessment_id) return { step: "unavailable", message: "This drive has no aptitude test configured yet." };
    const { data: a, error } = (await admin
      .from("assessments")
      .select("title, assessment_sections(duration_minutes, question_count)")
      .eq("id", drive.aptitude_assessment_id)
      .single()) as unknown as { data: AssessmentSummary; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return { step: "aptitude", resume: aptitude?.status === "in_progress", title: a.title, ...sectionTotals(a.assessment_sections) };
  }
  if (aptitude.status === "disqualified") return { step: "disqualified", reason: candidate.disqualified_reason };

  const cutoff = drive.aptitude_cutoff === null ? null : Number(drive.aptitude_cutoff);
  if (cutoff !== null && Number(aptitude.percentage) < cutoff) {
    return { step: "not_eligible", percentage: Number(aptitude.percentage), cutoff };
  }

  if (!role) return { step: "role_select", roles: await listRoleOptions(admin, drive.id) };
  if (role.status === "completed") return { step: "completed" };
  if (role.status === "disqualified") return { step: "disqualified", reason: candidate.disqualified_reason };

  const { data: ra, error: raError } = (await admin
    .from("assessments")
    .select("title, roles(label), assessment_sections(duration_minutes, question_count)")
    .eq("id", role.assessment_id)
    .single()) as unknown as { data: AssessmentSummary & { roles: { label: string } | null }; error: { message: string } | null };
  if (raError) throw new Error(raError.message);
  const roleLabel = ra.roles?.label ?? null;
  return { step: "role", resume: role.status === "in_progress", title: ra.title, roleLabel, ...sectionTotals(ra.assessment_sections) };
}
