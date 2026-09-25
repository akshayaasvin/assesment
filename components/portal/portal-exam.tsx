"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SystemCheck } from "@/components/candidate/system-check";
import { ExamRunner } from "@/components/candidate/exam-runner";
import { FinishScreen } from "@/components/candidate/finish-screen";
import { requestFullscreen } from "@/hooks/use-fullscreen";
import { postJson } from "@/lib/fetch-json";
import type { RuntimeAssessment } from "@/types/domain";

export interface PortalExamLaunch {
  attemptId: string;
  attemptToken: string;
  settings: {
    cameraRequired: boolean;
    micRequired: boolean;
    fullscreenRequired: boolean;
    resultVisibleToCandidate: boolean;
  };
}

type Runtime = RuntimeAssessment & { savedAnswers: Record<string, string | null> };

/**
 * System check -> exam -> finish, reusing the existing candidate exam
 * components and /api/attempts routes. `onExit` returns to the dashboard,
 * which re-reads the candidate's progress from the database.
 */
export function PortalExam({ launch, onExit }: { launch: PortalExamLaunch; onExit: () => void }) {
  const [step, setStep] = useState<"check" | "exam" | "finished">("check");
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ disqualified: boolean; score?: number; totalMarks?: number; percentage?: number }>({
    disqualified: false,
  });

  async function handleReady() {
    setError(null);
    if (launch.settings.fullscreenRequired) requestFullscreen();
    const result = await postJson<Runtime>(`/api/attempts/${launch.attemptId}/start`, { attemptToken: launch.attemptToken });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setRuntime(result.data);
    setStep("exam");
  }

  if (step === "check") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-10">
        <SystemCheck
          cameraRequired={launch.settings.cameraRequired}
          micRequired={launch.settings.micRequired}
          fullscreenRequired={launch.settings.fullscreenRequired}
          onReady={handleReady}
        />
        {error && <p className="max-w-lg text-center text-sm text-destructive">{error}</p>}
        <Button variant="ghost" onClick={onExit}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  if (step === "exam" && runtime) {
    return (
      <ExamRunner
        runtime={runtime}
        savedAnswers={runtime.savedAnswers}
        onSubmitted={(result) => {
          setOutcome({ disqualified: false, ...result });
          setStep("finished");
        }}
        onDisqualified={() => {
          setOutcome({ disqualified: true });
          setStep("finished");
        }}
      />
    );
  }

  return (
    <FinishScreen
      resultVisible={launch.settings.resultVisibleToCandidate}
      {...outcome}
      action={
        <Button className="w-full" onClick={onExit}>
          Continue to dashboard
        </Button>
      }
    />
  );
}
