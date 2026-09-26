import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { finalizeAttempt } from "@/lib/assessment/finalize";
import { getSessionCandidate, loadCandidateStep } from "@/lib/drive/server";

const bodySchema = z.object({ attemptId: z.string().uuid() });

/**
 * Submits the current stage. Grading runs here, on the server, against the
 * answer key the browser never sees. The client flushes its last batch of
 * answers through candidate_sync before calling this.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request.", 400);

  try {
    const admin = createAdminClient();
    const candidate = await getSessionCandidate(admin);
    if (!candidate) return fail("Please register first.", 401);
    if (candidate.status === "disqualified") return fail("You have been disqualified from this drive.", 403);

    const { data: attempt, error } = await admin
      .from("attempts")
      .select("id, candidate_id, stage, status")
      .eq("id", parsed.data.attemptId)
      .maybeSingle();
    if (error) throw error;
    if (!attempt || attempt.candidate_id !== candidate.id) return fail("Test not found.", 404);
    if (attempt.status === "disqualified") return fail("You have been disqualified from this drive.", 403);

    if (attempt.status === "in_progress") {
      await finalizeAttempt(admin, attempt.id, "completed");
      await admin
        .from("candidates")
        .update({ status: attempt.stage === "aptitude" ? "aptitude_done" : "completed" })
        .eq("id", candidate.id)
        .neq("status", "disqualified");
    } else if (attempt.status !== "completed") {
      return fail("This test hasn't started.", 409);
    }

    // Already-completed submits (a retry after a network drop) just return the next step.
    const { data: fresh } = await admin.from("candidates").select("*").eq("id", candidate.id).single();
    return ok({ next: await loadCandidateStep(admin, fresh ?? candidate) });
  } catch (e) {
    console.error("[drive] submit failed:", e);
    return fail("Could not submit your test. Your answers are saved - please press Submit again.", 500);
  }
}
