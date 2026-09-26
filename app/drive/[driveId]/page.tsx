import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionCandidate, isDriveOpen, loadCandidateStep } from "@/lib/drive/server";
import { RegistrationForm } from "@/components/drive/registration-form";
import { DriveFlow } from "@/components/drive/drive-flow";

export const dynamic = "force-dynamic";

/**
 * One drive: registration if this browser isn't registered yet, otherwise the
 * candidate's current step (computed from the database, so refresh resumes).
 */
export default async function DrivePage({ params }: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(driveId)) notFound();

  const admin = createAdminClient();
  const { data: drive, error } = await admin.from("drives").select("*").eq("id", driveId).maybeSingle();
  if (error) throw error;
  if (!drive || drive.status === "draft") notFound();

  const candidate = await getSessionCandidate(admin);

  if (candidate && candidate.drive_id === drive.id) {
    const step = await loadCandidateStep(admin, candidate);
    return (
      <DriveFlow
        initialStep={step}
        candidate={{ name: candidate.name, email: candidate.email, college: candidate.college, status: candidate.status }}
      />
    );
  }

  if (candidate && candidate.drive_id && candidate.drive_id !== drive.id) {
    return (
      <Message text="This device is already registered for a different drive.">
        <Button asChild>
          <Link href={`/drive/${candidate.drive_id}`}>Go to my drive</Link>
        </Button>
      </Message>
    );
  }

  if (!isDriveOpen(drive)) {
    return (
      <Message text="This drive is not open for registration right now.">
        <Button asChild variant="outline">
          <Link href="/">See open drives</Link>
        </Button>
      </Message>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <RegistrationForm driveId={drive.id} driveName={drive.college_name ? `${drive.name} · ${drive.college_name}` : drive.name} />
    </div>
  );
}

function Message({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md border-border/70 text-center shadow-lg">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <p className="text-sm text-muted-foreground">{text}</p>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
