import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabasePublicEnv } from "./env";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
