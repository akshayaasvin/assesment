import "server-only";

interface DbError {
  code?: string;
  message: string;
}

/**
 * Turns a Supabase/Postgres error into a message that's safe to show an admin,
 * and logs the technical details server-side (visible in Vercel function logs).
 * `fallback` is the operation-specific message, e.g. "Unable to create assessment."
 */
export function toUserError(error: DbError | null | undefined, fallback: string): string {
  console.error(`[admin] ${fallback}`, error);
  switch (error?.code) {
    case "42501": // insufficient_privilege - RLS rejected the write
      return "Database permission error. Please contact the administrator.";
    case "23505": // unique_violation
      return "A record with these details already exists.";
    case "23503": // foreign_key_violation
      return "This record is still referenced by other data and can't be changed that way.";
    default:
      return `${fallback} Please try again.`;
  }
}

/**
 * RLS doesn't error on UPDATE/DELETE of rows the user can't see - it just
 * affects zero rows. Callers `.select("id")` the mutated rows and use this so
 * a blocked or missing row is reported instead of a false success.
 */
export const NOT_FOUND_OR_FORBIDDEN =
  "That record no longer exists, or you do not have permission to change it.";
