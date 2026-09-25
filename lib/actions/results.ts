"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { toUserError } from "@/lib/db-errors";

export async function disqualifyAttempt(attemptId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: attempt, error } = await supabase
    .from("attempts")
    .update({ status: "disqualified", submitted_at: new Date().toISOString() })
    .eq("id", attemptId)
    .select("assessment_id")
    .maybeSingle();
  if (error) return { error: toUserError(error, "Unable to disqualify this candidate.") };
  if (!attempt) return { error: "That attempt no longer exists, or you do not have permission to change it." };

  const { error: eventError } = await supabase.from("assessment_events").insert({
    attempt_id: attemptId,
    assessment_id: attempt.assessment_id,
    type: "disqualified",
  });
  if (eventError) console.error("[admin] Could not record disqualification event:", eventError);

  revalidatePath("/admin/results");
  revalidatePath("/admin/live-monitoring");
  return { success: true };
}
