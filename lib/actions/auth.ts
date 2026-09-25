"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminUid } from "@/lib/auth/admin-uid";
import { ensureAdminProfile } from "@/lib/auth/require-admin";

/**
 * Called right after the browser client signs a user in. Reads the session
 * from cookies server-side and checks it against ADMIN_UID - this is what
 * lets the login page reject a valid Supabase login that isn't the
 * authorized admin account, without ever sending ADMIN_UID to the browser.
 *
 * On success it also makes sure the `profiles` row that Postgres RLS checks
 * (is_admin()) exists - see ensureAdminProfile. If that fails, login fails
 * too, rather than letting the admin in to a panel where nothing can be saved.
 */
export async function verifyAdminSession(): Promise<{ authorized: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUid(user.id)) return { authorized: false };

  const profileError = await ensureAdminProfile(user);
  if (profileError) return { authorized: false, error: profileError };

  return { authorized: true };
}
