import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { getCandidateId } from "@/lib/portal/session";

const bodySchema = z.object({ roleId: z.string().uuid() });

/**
 * Saves the eligible candidate's selected role. Changing it is allowed until
 * they start an assessment for their current role.
 */
export async function POST(request: Request) {
  const candidateId = await getCandidateId();
  if (!candidateId) return fail("Please log in again.", 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Select a role.", 400);

  try {
    const admin = createAdminClient();
    const { data: candidate, error } = await admin
      .from("candidates")
      .select("id, aptitude_status")
      .eq("id", candidateId)
      .maybeSingle();
    if (error) throw error;
    if (!candidate) return fail("Please log in again.", 401);
    if (candidate.aptitude_status === "pending") return fail("Please complete the Aptitude Assessment first.", 403);
    if (candidate.aptitude_status !== "eligible") {
      return fail("You are not eligible for role assessments based on your Aptitude Assessment result.", 403);
    }

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("id")
      .eq("id", parsed.data.roleId)
      .eq("is_active", true)
      .maybeSingle();
    if (roleError) throw roleError;
    if (!role) return fail("That role is not available.", 404);

    const { data: started, error: startedError } = await admin
      .from("attempts")
      .select("id, assessments!inner(kind)")
      .eq("candidate_id", candidateId)
      .eq("assessments.kind", "role")
      .neq("status", "not_started")
      .limit(1);
    if (startedError) throw startedError;
    if (started?.length) return fail("Your role can't be changed after you've started a role assessment.", 409);

    const { data: updated, error: updateError } = await admin
      .from("candidates")
      .update({ role_id: role.id })
      .eq("id", candidateId)
      .select("role_id");
    if (updateError) throw updateError;
    if (!updated?.length) throw new Error("Candidate role update affected no rows.");

    return ok({ roleId: role.id });
  } catch (e) {
    console.error("[portal] role selection failed:", e);
    return fail("Could not save your role. Please try again.", 500);
  }
}
