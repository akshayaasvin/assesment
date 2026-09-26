"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Brain, Briefcase, CheckCircle2, Clock, ListChecks, Megaphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { postJson } from "@/lib/fetch-json";
import { useCandidateSync } from "@/lib/drive/use-candidate-sync";
import type { CandidateStep, CandidateSummary, RoleOption, StageRuntime } from "@/lib/drive/types";
import type { CandidateSyncResult } from "@/types/database";
import { PreTestCheck } from "./pre-test-check";
import { DriveExamRunner, type SyncApi } from "./drive-exam-runner";

type Phase =
  | { kind: "step" } // show the server-computed step
  | { kind: "check"; stage: "aptitude" | "role"; assessmentId?: string; title: string }
  | { kind: "exam"; runtime: StageRuntime };

/**
 * Walks a registered candidate through: aptitude -> (role select) -> role
 * test -> done. The server decides the step (from the database), so a
 * refresh always lands in the right place; this component only drives the
 * screens in between. The 10 s sync runs throughout, so disqualification and
 * announcements arrive even between stages.
 */
export function DriveFlow({ initialStep, candidate }: { initialStep: CandidateStep; candidate: CandidateSummary }) {
  const router = useRouter();
  const [step, setStep] = useState<CandidateStep>(initialStep);
  const [phase, setPhase] = useState<Phase>({ kind: "step" });
  const [announcements, setAnnouncements] = useState<{ id: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const finished = step.step === "completed" || step.step === "disqualified" || step.step === "not_eligible";

  const onSyncResult = useCallback((result: CandidateSyncResult) => {
    if (result.status === "disqualified") {
      // The server already refuses further answers; lock the screen too.
      setStep({ step: "disqualified", reason: result.disqualifiedReason });
      setPhase({ kind: "step" });
      document.exitFullscreen?.().catch(() => {});
    }
    const texts = result.announcements.filter((a) => a.type === "text" && a.text);
    if (texts.length) {
      chime();
      setAnnouncements((prev) => [...prev, ...texts.map((a) => ({ id: a.id, text: a.text! }))]);
      for (const a of texts) toast.info(a.private ? `Message from the invigilator: ${a.text}` : a.text!, { duration: 15_000 });
    }
  }, []);

  const sync = useCandidateSync({ enabled: !finished, onResult: onSyncResult });
  const syncApi: SyncApi = useMemo(() => sync, [sync]);

  async function beginStage(stage: "aptitude" | "role", assessmentId?: string) {
    if (loading) return;
    setLoading(true);
    const result = await postJson<StageRuntime>("/api/drive/stage", { stage, assessmentId });
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    setPhase({ kind: "exam", runtime: result.data });
  }

  const submitStage = useCallback(async (): Promise<string | null> => {
    if (phase.kind !== "exam") return null;
    const result = await postJson<{ next: CandidateStep }>("/api/drive/stage/submit", { attemptId: phase.runtime.attemptId });
    if (!result.success) return result.error;
    setStep(result.data.next);
    setPhase({ kind: "step" });
    return null;
  }, [phase]);

  function openCheck(stage: "aptitude" | "role", title: string, assessmentId?: string) {
    // Camera already granted and still live for this session -> skip straight to the test.
    const live = stream?.getVideoTracks().some((t) => t.readyState === "live");
    if (live) void beginStage(stage, assessmentId);
    else setPhase({ kind: "check", stage, assessmentId, title });
  }

  if (step.step === "disqualified") {
    return (
      <Centered>
        <Ban className="h-12 w-12 text-destructive" />
        <h1 className="text-xl font-semibold text-destructive">You have been disqualified</h1>
        {step.reason && <p className="text-sm text-foreground">Reason: {step.reason}</p>}
        <p className="text-sm text-muted-foreground">Your answers up to this point have been saved. Please speak to the invigilator.</p>
      </Centered>
    );
  }

  if (phase.kind === "check") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <PreTestCheck
          title={phase.title}
          onReady={(granted) => {
            setStream(granted);
            void beginStage(phase.stage, phase.assessmentId);
          }}
        />
      </div>
    );
  }

  if (phase.kind === "exam") {
    return <DriveExamRunner key={phase.runtime.attemptId} runtime={phase.runtime} sync={syncApi} stream={stream} onSubmit={submitStage} />;
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center gap-3 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">A</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{candidate.name}</p>
          <p className="truncate text-xs text-muted-foreground">{candidate.college ?? candidate.email}</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {announcements.length > 0 && (
          <div className="space-y-2" role="status" aria-live="polite">
            {announcements.slice(-3).map((a) => (
              <p key={a.id} className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {a.text}
              </p>
            ))}
          </div>
        )}

        {step.step === "aptitude" && (
          <StageCard icon={Brain} title={step.resume ? "Resume your aptitude test" : "Aptitude test"} description="Everyone takes this first. Your role test unlocks after you submit it.">
            <Facts minutes={step.durationMinutes} questions={step.questionCount} />
            <Button className="mt-4" disabled={loading} onClick={() => openCheck("aptitude", step.title)}>
              {loading ? "Loading..." : step.resume ? "Resume test" : "Start aptitude test"}
            </Button>
          </StageCard>
        )}

        {step.step === "role_select" && <RoleSelect roles={step.roles} loading={loading} onPick={(r) => openCheck("role", r.title, r.assessmentId)} />}

        {step.step === "role" && (
          <StageCard icon={Briefcase} title={step.resume ? "Resume your role test" : "Role test"} description={step.roleLabel ? `${step.roleLabel} - ${step.title}` : step.title}>
            <Facts minutes={step.durationMinutes} questions={step.questionCount} />
            <Button className="mt-4" disabled={loading} onClick={() => openCheck("role", step.title)}>
              {loading ? "Loading..." : step.resume ? "Resume test" : "Start role test"}
            </Button>
          </StageCard>
        )}

        {step.step === "not_eligible" && (
          <StageCard icon={XCircle} title="Thank you for taking the aptitude test" description="Your score is below this drive's cutoff for the role test.">
            {step.percentage !== null && step.cutoff !== null && (
              <p className="text-sm text-muted-foreground">
                Your score: <strong className="text-foreground">{step.percentage}%</strong> · Cutoff: <strong className="text-foreground">{step.cutoff}%</strong>
              </p>
            )}
          </StageCard>
        )}

        {step.step === "completed" && (
          <StageCard icon={CheckCircle2} title="Assessment Completed" description="Thank you. Both tests are submitted - we will get back to you shortly." />
        )}

        {step.step === "unavailable" && <StageCard icon={XCircle} title="Not available" description={step.message} />}
      </main>
    </div>
  );
}

function RoleSelect({ roles, loading, onPick }: { roles: RoleOption[]; loading: boolean; onPick: (role: RoleOption) => void }) {
  return (
    <StageCard icon={Briefcase} title="Choose your role" description="Aptitude submitted. Pick the role you're applying for - you can take one role test.">
      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          No role test is open right now. Please wait here or speak to the invigilator.
        </p>
      ) : (
        <div className="space-y-3">
          {roles.map((r) => (
            <div key={r.assessmentId} className="rounded-xl border border-border bg-background p-4">
              <p className="font-medium">{r.roleLabel}</p>
              {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
              <Facts minutes={r.durationMinutes} questions={r.questionCount} />
              <Button className="mt-3" disabled={loading} onClick={() => onPick(r)}>
                {loading ? "Loading..." : `Start ${r.roleLabel} test`}
              </Button>
            </div>
          ))}
        </div>
      )}
    </StageCard>
  );
}

function StageCard({ icon: Icon, title, description, children }: { icon: React.ElementType; title: string; description: string; children?: React.ReactNode }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader>
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function Facts({ minutes, questions }: { minutes: number; questions: number }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Clock className="h-4 w-4" /> {minutes} min
      </span>
      <span className="flex items-center gap-1.5">
        <ListChecks className="h-4 w-4" /> {questions} questions
      </span>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md border-border/70 text-center shadow-lg">
        <CardContent className="flex flex-col items-center gap-3 py-10">{children}</CardContent>
      </Card>
    </div>
  );
}

/** Short two-tone chime for new announcements (audio was unlocked in the pre-test check). */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
  } catch {
    // no audio available
  }
}
