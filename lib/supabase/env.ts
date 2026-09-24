/**
 * Public Supabase config, shared by the browser client, the server client and
 * the middleware. These are NEXT_PUBLIC_ vars by design - they're already in
 * the browser bundle, so there's nothing secret to guard here. The one rule
 * that matters is naming: this project's Supabase project issues a
 * "publishable key" (the anon-equivalent key), so every client reads
 * NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY - not NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * which this project does not set.
 *
 * Throws (naming which variable is missing, never its value) instead of
 * silently building a client with `undefined` - that's what previously
 * surfaced as an opaque "@supabase/ssr: Your project's URL and API key are
 * required" error in production.
 */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(`Supabase is not configured: missing ${missing}.`);
  }

  return { url, publishableKey };
}
