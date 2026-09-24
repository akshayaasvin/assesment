"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCountdownTimer } from "@/hooks/use-countdown-timer";
import { useViolationTracker } from "@/hooks/use-violation-tracker";
import { QuestionNavigator } from "@/components/candidate/question-navigator";
import { ViolationModal } from "@/components/candidate/violation-modal";
import { cn } from "@/lib/utils";
import type { RuntimeAssessment } from "@/types/domain";
import type { ViolationType } from "@/types/database";

interface Props {
  runtime: RuntimeAssessment;
  savedAnswers: Record<string, string | null>;
  onSubmitted: (result: { score: number; totalMarks: number; percentage: number }) => void;
  onDisqualified: () => void;
}

async function callApi(path: string, body: unknown) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export function ExamRunner({ runtime, savedAnswers, onSubmitted, onDisqualified }: Props) {
  const { attemptId, attemptToken, sections, settings, maxWarnings } = runtime;
  const [sectionIndex, setSectionIndex] = useState(Math.min(runtime.currentSectionIndex, sections.length - 1));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | undefined>>(() => {
    const initial: Record<string, string | undefined> = {};
    for (const [qId, optId] of Object.entries(savedAnswers)) if (optId) initial[qId] = optId;
    return initial;
  });
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const isSubmittingRef = useRef(false);

  const section = sections[sectionIndex];
  const question = section?.questions[questionIndex];
  const isLastSection = sectionIndex === sections.length - 1;
  const isLastQuestion = questionIndex === (section?.questions.length ?? 0) - 1;

  const submit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const result = await callApi(`/api/attempts/${attemptId}/submit`, { attemptToken });
    if (result && !result.error) {
      onSubmitted({ score: result.score, totalMarks: result.totalMarks, percentage: result.percentage });
    } else {
      onSubmitted({ score: 0, totalMarks: 0, percentage: 0 });
    }
  }, [attemptId, attemptToken, onSubmitted]);

  const goToNextSection = useCallback(() => {
    if (isLastSection) {
      submit();
      return;
    }
    setSectionIndex((i) => i + 1);
    setQuestionIndex(0);
  }, [isLastSection, submit]);

  const handleSectionExpire = useCallback(() => {
    goToNextSection();
  }, [goToNextSection]);

  const { remaining, formatted } = useCountdownTimer(
    (section?.durationMinutes ?? 0) * 60,
    handleSectionExpire,
    section?.id
  );

  const handleViolation = useCallback(
    (type: ViolationType, message: string) => {
      callApi(`/api/attempts/${attemptId}/violation`, { attemptToken, type, message });
    },
    [attemptId, attemptToken]
  );

  const handleDisqualify = useCallback(() => {
    isSubmittingRef.current = true;
    onDisqualified();
  }, [onDisqualified]);

  const { modal, acknowledgeModal } = useViolationTracker({
    active: true,
    maxWarnings,
    fullscreenRequired: settings.fullscreenRequired,
    tabSwitchMonitoring: settings.tabSwitchMonitoring,
    copyPasteBlock: settings.copyPasteBlock,
    onViolation: handleViolation,
    onDisqualify: handleDisqualify,
  });

  // Heartbeat so Live Monitoring shows an accurate "last seen".
  useEffect(() => {
    const interval = setInterval(() => callApi(`/api/attempts/${attemptId}/heartbeat`, { attemptToken }), 20000);
    return () => clearInterval(interval);
  }, [attemptId, attemptToken]);

  function selectOption(optionId: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
    callApi(`/api/attempts/${attemptId}/answer`, {
      attemptToken,
      questionId: question.id,
      selectedOptionId: optionId,
      currentSectionIndex: sectionIndex,
    });
  }

  function toggleMark() {
    if (!question) return;
    setMarked((prev) => ({ ...prev, [question.id]: !prev[question.id] }));
  }

  function goNext() {
    if (isLastQuestion) {
      if (isLastSection) setConfirmSubmitOpen(true);
      else goToNextSection();
      return;
    }
    setQuestionIndex((i) => i + 1);
  }

  function goPrevious() {
    if (questionIndex > 0) setQuestionIndex((i) => i - 1);
  }

  const answeredCount = useMemo(
    () => (section ? section.questions.filter((q) => answers[q.id]).length : 0),
    [section, answers]
  );

  if (!section || !question) {
    return <div className="p-8 text-center text-muted-foreground">This section has no questions configured yet.</div>;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 select-none">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Assistlana</p>
          <h1 className="text-lg font-semibold text-foreground">{runtime.assessmentTitle}</h1>
          <p className="text-sm text-muted-foreground">{section.title}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-xl font-semibold tabular-nums", remaining < 60 && "text-destructive")}>
            {formatted}
          </p>
          <p className="text-xs text-muted-foreground">
            {answeredCount}/{section.questions.length} answered
          </p>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <div className="rounded-xl border border-border bg-card p-6">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Question {questionIndex + 1} of {section.questions.length} &middot; {question.marks} mark
            {question.marks === 1 ? "" : "s"}
          </p>
          <h2 className="mb-6 text-base font-medium leading-relaxed text-foreground">{question.text}</h2>

          <div className="space-y-2.5">
            {question.options.map((opt) => {
              const selected = answers[question.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectOption(opt.id)}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/50 hover:bg-accent/40"
                  )}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={goPrevious} disabled={questionIndex === 0}>
              Previous
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={toggleMark}>
                {marked[question.id] ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {marked[question.id] ? "Marked" : "Mark for review"}
              </Button>
              {isLastQuestion && isLastSection ? (
                <Button onClick={() => setConfirmSubmitOpen(true)}>Submit Assessment</Button>
              ) : (
                <Button onClick={goNext}>{isLastQuestion ? "Next Section" : "Next"}</Button>
              )}
            </div>
          </div>
        </div>

        <QuestionNavigator
          totalQuestions={section.questions.length}
          currentIndex={questionIndex}
          isAnswered={(i) => Boolean(answers[section.questions[i]?.id])}
          isMarked={(i) => Boolean(marked[section.questions[i]?.id])}
          onJump={setQuestionIndex}
        />
      </div>

      <ViolationModal modal={modal} onAction={acknowledgeModal} />

      <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit your assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered {answeredCount} of {section.questions.length} questions in this section. You cannot
              make changes after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={goToNextSection}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
