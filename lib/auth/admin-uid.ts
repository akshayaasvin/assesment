import "server-only";

/**
 * Authorization for /admin is pinned to a single Supabase Auth user id via
 * the ADMIN_UID env var (server-side only - never prefix it with
 * NEXT_PUBLIC_). A session existing is not enough; the signed-in user's id
 * must match exactly. If ADMIN_UID isn't configured, access is denied by
 * default rather than silently allowing anyone in.
 */
export function isAdminUid(userId: string | null | undefined): boolean {
  const adminUid = process.env.ADMIN_UID;
  return Boolean(adminUid) && userId === adminUid;
}
