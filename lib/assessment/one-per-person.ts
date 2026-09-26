import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

export const ONE_ROLE_MESSAGE = "You have already taken an assessment. Only one role per candidate is allowed.";

/** Midnight today in India (the drives run in IST), as an ISO timestamp. */
function startOfTodayIst(): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); // YYYY-MM-DD
  return `${day}T00:00:00+05:30`;
}

/**
 * One test per person: true if anyone with this email OR phone has already
 * started (in progress / completed / disqualified) a DIFFERENT assessment
 * today. Attempts from before today (old test data) are ignored. Registering
 * without starting doesn't count, and resuming the same assessment is allowed.
 * Phones are compared by their last 10 digits (candidates.phone_normalized).
 */
export async function hasTakenAnotherAssessment(
  admin: AdminClient,
  person: { email: string; phone: string | null },
  currentAssessmentId: string
): Promise<boolean> {
  const email = person.email.trim().toLowerCase();
  const phone = (person.phone ?? "").replace(/\D/g, "").slice(-10);

  const matches = [admin.from("candidates").select("id").filter("email_normalized", "eq", email)];
  if (phone.length === 10) matches.push(admin.from("candidates").select("id").filter("phone_normalized", "eq", phone));
  const results = await Promise.all(matches);
  for (const r of results) if (r.error) throw r.error;
  const candidateIds = [...new Set(results.flatMap((r) => (r.data ?? []).map((c) => c.id)))];
  if (!candidateIds.length) return false;

  const { data, error } = await admin
    .from("attempts")
    .select("id")
    .in("candidate_id", candidateIds)
    .in("status", ["in_progress", "completed", "disqualified"])
    .neq("assessment_id", currentAssessmentId)
    .gte("created_at", startOfTodayIst())
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
