"use client";

import { useState } from "react";
import { RegisterForm, type CandidateDetails } from "@/components/candidate/register-form";
import { SystemCheck } from "@/components/candidate/system-check";
import { ExamRunner } from "@/components/candidate/exam-runner";
import { FinishScreen } from "@/components/candidate/finish-screen";
import { requestFullscreen } from "@/hooks/use-fullscreen";
import { postJson } from "@/lib/fetch-json";
import type { RuntimeAssessment } from "@/types/domain";

interface AssessmentPublicInfo {
  title: string;
  roleLabel: string | null;
  isOpen: boolean;
  cameraRequired: boolean;
  micRequired: boolean;
  fullscreenRequired: boolean;
  resultVisibleToCandidate: boolean;
}

type Step = "register" | "check" | "exam" | "finished";

export function CandidateFlow({ slug, info }: { slug: string; info: AssessmentPublicInfo }) {
  const [step, setStep] = useState<Step>("register");
  const [attempt, setAttempt] = useState<{ attemptId: string; attemptToken: string } | null>(null);
  const [runtime, setRuntime] = useState<(RuntimeAssessment & { savedAnswers: Record<string, string | null> }) | null>(null);
  const [outcome, setOutcome] = useState<{ disqualified: boolean; score?: number; totalMarks?: number; percentage?: number }>({
    disqualified: false,
  });

  async function handleRegister(details: CandidateDetails): Promise<string | void> {
    const result = await postJson<{ attemptId: string; attemptToken: string }>(`/api/assessments/${slug}/register`, details);
    if (!result.success) return result.error;

    setAttempt({ attemptId: result.data.attemptId, attemptToken: result.data.attemptToken });
    setStep("check");
  }

  async function handleReadyToStart() {
    if (!attempt) return;
    if (info.fullscreenRequired) requestFullscreen();

    const result = await postJson<RuntimeAssessment & { savedAnswers: Record<string, string | null> }>(
      `/api/attempts/${attempt.attemptId}/start`,
      { attemptToken: attempt.attemptToken }
    );
    if (!result.success) {
      alert(result.error);
      return;
    }
    setRuntime(result.data);
    setStep("exam");
  }

  function handleSubmitted(result: { score: number; totalMarks: number; percentage: number }) {
    setOutcome({ disqualified: false, ...result });
    setStep("finished");
  }

  function handleDisqualified() {
    setOutcome({ disqualified: true });
    setStep("finished");
  }

  if (step === "register") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <RegisterForm assessmentTitle={info.title} roleLabel={info.roleLabel} isOpen={info.isOpen} onSubmit={handleRegister} />
      </div>
    );
  }

  if (step === "check") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <SystemCheck
          cameraRequired={info.cameraRequired}
          micRequired={info.micRequired}
          fullscreenRequired={info.fullscreenRequired}
          onReady={handleReadyToStart}
        />
      </div>
    );
  }

  if (step === "exam" && runtime) {
    return (
      <ExamRunner
        runtime={runtime}
        savedAnswers={runtime.savedAnswers}
        onSubmitted={handleSubmitted}
        onDisqualified={handleDisqualified}
      />
    );
  }

  return <FinishScreen resultVisible={info.resultVisibleToCandidate} {...outcome} />;
}
