import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, Building2, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionCandidate, listLiveDrives } from "@/lib/drive/server";
import { DRIVE_MODE_LABEL } from "@/lib/drive/types";

export const dynamic = "force-dynamic";

/**
 * Candidate home: every drive that is live right now. No per-assessment links
 * - candidates pick their drive here. A candidate already registered in this
 * browser gets a "continue" shortcut.
 */
export default async function Home() {
  let drives: Awaited<ReturnType<typeof listLiveDrives>> = [];
  let continueDriveId: string | null = null;
  let loadFailed = false;
  try {
    drives = await listLiveDrives();
    const candidate = await getSessionCandidate();
    continueDriveId = candidate?.status !== "completed" ? (candidate?.drive_id ?? null) : null;
  } catch (e) {
    console.error("[home] Could not load drives:", e);
    loadFailed = true;
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">A</div>
          <h1 className="text-xl font-semibold">Assistlana Assessment Platform</h1>
          <p className="text-sm text-muted-foreground">Choose your drive to register and start your assessment.</p>
        </div>

        {continueDriveId && (
          <Card className="border-primary/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm font-medium">You&apos;re already registered on this device.</p>
              <Button asChild size="sm">
                <Link href={`/drive/${continueDriveId}`}>
                  Continue your assessment <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {loadFailed ? (
          <EmptyMessage text="We couldn't load the drives right now. Please refresh the page in a moment." />
        ) : drives.length === 0 ? (
          <EmptyMessage text="No assessment is open right now." />
        ) : (
          <ul className="space-y-3" aria-label="Live drives">
            {drives.map((d) => (
              <li key={d.id}>
                <Link href={`/drive/${d.id}`} className="block">
                  <Card className="border-border/70 transition-colors hover:border-primary/60">
                    <CardContent className="flex items-center justify-between gap-4 p-5">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{d.name}</p>
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Building2 className="h-4 w-4" /> {d.collegeName ?? DRIVE_MODE_LABEL[d.mode]}
                        </p>
                        {d.startAt && (
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CalendarDays className="h-4 w-4" /> {format(new Date(d.startAt), "d MMM yyyy")}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <Card className="border-border/70">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
