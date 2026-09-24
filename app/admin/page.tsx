import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * `/admin` itself has no UI - it only decides where to send the visitor.
 * The middleware already handles this redirect at the edge; this page is a
 * server-rendered fallback so the route never 404s even if middleware is
 * ever bypassed or misconfigured.
 */
export default async function AdminIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/admin/dashboard" : "/admin/login");
}
