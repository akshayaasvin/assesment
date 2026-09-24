/**
 * Shared setup for the one-off Node scripts in this folder (seed.ts,
 * create-admin.ts). Not used by the Next.js app itself - `lib/supabase/admin.ts`
 * covers that, running inside Next's runtime which already provides a global
 * WebSocket. A plain `tsx` script on Node 20 does not, and @supabase/supabase-js
 * unconditionally initializes a Realtime client that requires one, so we
 * polyfill it here before creating the client.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { WebSocket } from "ws";
if (!("WebSocket" in globalThis)) {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
