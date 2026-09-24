"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function disqualifyAttempt(attemptId: string) {
  const supabase = await createClient();
  const { data: attempt, error } = await supabase
    .from("attempts")
    .update({ status: "disqualified", submitted_at: new Date().toISOString() })
    .eq("id", attemptId)
    .select("assessment_id")
    .single();
  if (error || !attempt) return { error: error?.message ?? "Could not disqualify this candidate." };

  await supabase.from("assessment_events").insert({
    attempt_id: attemptId,
    assessment_id: attempt.assessment_id,
    type: "disqualified",
  });

  revalidatePath("/admin/results");
  revalidatePath("/admin/live-monitoring");
  return { success: true };
}
