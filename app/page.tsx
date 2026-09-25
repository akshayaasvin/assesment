import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCandidateId } from "@/lib/portal/session";
import { loadPortal } from "@/lib/portal/state";
import { PortalAuth } from "@/components/portal/portal-auth";
import { PortalDashboard } from "@/components/portal/portal-dashboard";

/**
 * Candidate portal. Signed out: register / log in. Signed in: the candidate's
 * next step (Aptitude -> Eligibility -> Role -> Role assessment), computed
 * server-side from the database on every request.
 */
export default async function Home() {
  const candidateId = await getCandidateId();
  if (!candidateId) return <PortalAuth />;

  let portal: Awaited<ReturnType<typeof loadPortal>>;
  try {
    portal = await loadPortal(createAdminClient(), candidateId);
  } catch (e) {
    console.error("[portal] Could not load candidate dashboard:", e);
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md border-border/70 text-center shadow-lg">
          <CardContent className="py-10 text-sm text-muted-foreground">
            We couldn&apos;t load your dashboard right now. Please refresh the page in a moment.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Signed cookie for a candidate that no longer exists (e.g. removed by an admin).
  if (!portal) return <PortalAuth />;

  return <PortalDashboard candidate={portal.candidate} state={portal.state} />;
}
