"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUid } from "@/lib/auth/admin-uid";

const idsSchema = z.array(z.string().uuid()).min(1).max(1000);

/**
 * Permanently deletes candidates. Admin-only (checked here, server-side), and
 * the admin must have typed DELETE. The database's ON DELETE CASCADE rules
 * remove each candidate's attempts, answers, served questions, events and
 * proctor events with them.
 */
export async function deleteCandidates(candidateIds: string[], confirmation: string) {
  if (confirmation !== "DELETE") return { error: "Type DELETE to confirm." };
  const parsed = idsSchema.safeParse([...new Set(candidateIds)]);
  if (!parsed.success) return { error: "Select at least one candidate." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminUid(user.id)) return { error: "You do not have permission to perform this action." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("candidates").delete().in("id", parsed.data).select("id");
  if (error) {
    console.error("[admin] delete candidates failed:", error);
    return { error: "Unable to delete. Please try again." };
  }

  for (const path of ["/admin/candidates", "/admin/results", "/admin/live-monitoring", "/admin/dashboard", "/admin/reports"]) {
    revalidatePath(path);
  }
  return { success: true, deleted: data?.length ?? 0 };
}
