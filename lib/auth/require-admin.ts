import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUid } from "./admin-uid";

/**
 * Two authorization layers must agree for an admin to do anything:
 *  1. ADMIN_UID (env) gates routes and Server Actions in Next.js.
 *  2. Postgres RLS gates every read/write via is_admin(), which checks for a
 *     `profiles` row with role 'admin'.
 * If (1) passes but the profile row is missing, the admin can open every page
 * yet every save fails with "new row violates row-level security policy".
 * This creates the row (service role, server-side only) when it's missing, so
 * the two layers can't drift apart. Returns an error message on failure.
 */
export async function ensureAdminProfile(user: User): Promise<string | null> {
  if (!isAdminUid(user.id)) return "You do not have permission to perform this action.";

  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) {
    console.error("[admin] Could not read admin profile:", readError);
    return "Database permission error. Please contact the administrator.";
  }
  if (existing?.role === "admin") return null;

  const { error } = await admin
    .from("profiles")
    .upsert({ id: user.id, email: user.email ?? "", role: "admin" }, { onConflict: "id" });
  if (error) {
    console.error("[admin] Could not create admin profile:", error);
    return "Database permission error. Please contact the administrator.";
  }
  return null;
}

type RequireAdminResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; user: User }
  | { ok: false; error: string };

/**
 * First line of every admin Server Action. Server Actions are public POST
 * endpoints - the proxy and layout checks don't protect them - so each one
 * re-verifies the session and admin identity itself before touching data.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Your session has expired. Please sign in again." };
  if (!isAdminUid(user.id)) return { ok: false, error: "You do not have permission to perform this action." };

  const profileError = await ensureAdminProfile(user);
  if (profileError) return { ok: false, error: profileError };

  return { ok: true, supabase, user };
}
