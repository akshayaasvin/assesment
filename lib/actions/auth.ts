"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUid } from "@/lib/auth/admin-uid";

/**
 * Called right after the browser client signs a user in. Reads the session
 * from cookies server-side and checks it against ADMIN_UID - this is what
 * lets the login page reject a valid Supabase login that isn't the
 * authorized admin account, without ever sending ADMIN_UID to the browser.
 *
 * On success it also makes sure a `profiles` row with role "admin" exists
 * for this user. Route access is gated by ADMIN_UID, but every admin data
 * mutation goes through Postgres RLS policies that check `profiles.role`
 * (see is_admin() in the migration) - if ADMIN_UID ever points at an account
 * that was created directly in the Supabase dashboard (no profile row yet),
 * this keeps the two authorization layers in sync automatically instead of
 * requiring a manual DB fix.
 */
export async function verifyAdminSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminUid(user.id)) return { authorized: false };

  const admin = createAdminClient();
  await admin.from("profiles").upsert({ id: user.id, email: user.email ?? "", role: "admin" }, { onConflict: "id" });

  return { authorized: true };
}
