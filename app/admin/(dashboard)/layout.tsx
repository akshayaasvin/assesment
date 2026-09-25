import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminUid } from "@/lib/auth/admin-uid";
import { ensureAdminProfile } from "@/lib/auth/require-admin";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  // Authoritative check - the proxy already confirms this, but every admin
  // page re-verifies server-side before rendering anything, in case this
  // layout is ever reached by a path the proxy doesn't cover.
  if (!isAdminUid(user.id)) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=unauthorized");
  }

  // Self-heals a session that predates the admin profile row (RLS would
  // otherwise hide all data and reject every save).
  await ensureAdminProfile(user);

  return (
    <div className="flex min-h-screen bg-muted/30">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar email={user.email ?? ""} />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
