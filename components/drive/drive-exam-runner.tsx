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
import type { StageRuntime } from "@/lib/drive/types";
import type { ProctorEventType, ViolationType } from "@/types/database";

export interface SyncApi {
  queueAnswer: (questionId: string, optionId: string | null) => void;
  queueEvent: (event: { type: ProctorEventType; message?: string; meta?: Record<string, unknown> }) => void;
  setSection: (index: number) => void;
  scheduleFlush: () => void;
  flush: () => Promise<boolean>;
}

/** Old tracker names -> proctor_events types. */
const EVENT_TYPE: Record<ViolationType, ProctorEventType> = {
  tab_switch: "tab_switch",
  window_blur: "window_blur",
  fullscreen_exit: "fullscreen_exit",
  copy: "copy_paste",
  paste: "copy_paste",
  contextmenu: "copy_paste",
  resize: "resize",
};

/**
 * One stage (aptitude or role) of a drive. Answers are kept locally and
 * sent in batches through the candidate sync (debounced on question change,
 * plus every 10 s) instead of one request per click. Proctoring here only
 * records and warns - it never ends the test; disqualification is the
 * invigilator's decision, enforced by the server.
 */
export function DriveExamRunner({
  runtime,
  sync,
  stream,
  onSubmit,
}: {
  runtime: StageRuntime;
  sync: SyncApi;
  stream: MediaStream | null;
  /** Called after the last batch is flushed; resolves to an error message or null. */
  onSubmit: () => Promise<string | null>;
}) {
  const { sections, settings } = runtime;
  const initialSectionIndex = Math.max(0, Math.min(runtime.currentSectionIndex, sections.length - 1));
  const [sectionIndex, setSectionIndex] = useState(initialSectionIndex);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | undefined>>(() => {
    const initial: Record<string, string | undefined> = {};
    for (const [qId, optId] of Object.entries(runtime.savedAnswers)) if (optId) initial[qId] = optId;
    return initial;
  });
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const selfViewRef = useRef<HTMLVideoElement>(null);

  const section = sections[sectionIndex];
  const question = section?.questions[questionIndex];
  const isLastSection = sectionIndex === sections.length - 1;
  const isLastQuestion = questionIndex === (section?.questions.length ?? 0) - 1;

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    // Make sure the last answers reached the server before grading.
    const flushed = (await sync.flush()) || (await sync.flush());
    const error = flushed ? await onSubmit() : "Could not reach the server to save your last answers. Check your connection and press Submit again.";
    if (error) {
      submittingRef.current = false;
      setSubmitting(false);
      setSubmitError(error);
    }
  }, [sync, onSubmit]);

  const goToNextSection = useCallback(() => {
    if (isLastSection) {
      void submit();
      return;
    }
    const next = sectionIndex + 1;
    setSectionIndex(next);
    setQuestionIndex(0);
    sync.setSection(next); // recorded server-side so a refresh resumes here with the real time left
  }, [isLastSection, submit, sectionIndex, sync]);

  // Resume with the server-measured time left (at least 1 s, so an already
  // expired section expires immediately).
  const sectionSeconds =
    sectionIndex === initialSectionIndex && typeof runtime.sectionRemainingSeconds === "number"
      ? Math.max(1, Math.min(runtime.sectionRemainingSeconds, (section?.durationMinutes ?? 0) * 60))
      : (section?.durationMinutes ?? 0) * 60;
  const { remaining, formatted } = useCountdownTimer(sectionSeconds, goToNextSection, section?.id);

  const onViolation = useCallback(
    (type: ViolationType, message: string) => {
      sync.queueEvent({ type: EVENT_TYPE[type], message, meta: type === "copy" || type === "paste" || type === "contextmenu" ? { action: type } : undefined });
      sync.scheduleFlush();
    },
    [sync]
  );
  const { modal, acknowledgeModal } = useViolationTracker({
    active: !submitting,
    maxWarnings: Number.MAX_SAFE_INTEGER,
    autoDisqualify: false,
    fullscreenRequired: settings.fullscreenRequired,
    tabSwitchMonitoring: settings.tabSwitchMonitoring,
    copyPasteBlock: settings.copyPasteBlock,
    onViolation,
    onDisqualify: () => {},
  });

  // Small self-view, and report if the camera or microphone stops.
  useEffect(() => {
    if (selfViewRef.current && stream) selfViewRef.current.srcObject = stream;
    const tracks = stream?.getTracks() ?? [];
    const onEnded = (e: Event) => {
      const kind = (e.target as MediaStreamTrack).kind;
      sync.queueEvent({ type: kind === "video" ? "camera_off" : "mic_off", message: `${kind} stopped` });
      sync.scheduleFlush();
    };
    tracks.forEach((t) => t.addEventListener("ended", onEnded));
    return () => tracks.forEach((t) => t.removeEventListener("ended", onEnded));
  }, [stream, sync]);

  function selectOption(optionId: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
    sync.queueAnswer(question.id, optionId);
  }

  function changeQuestion(index: number) {
    setQuestionIndex(index);
    sync.scheduleFlush(); // batch-save on question change
  }

  function goNext() {
    if (isLastQuestion) {
      if (isLastSection) setConfirmSubmitOpen(true);
      else goToNextSection();
      return;
    }
    changeQuestion(questionIndex + 1);
  }

  const answeredCount = useMemo(() => (section ? section.questions.filter((q) => answers[q.id]).length : 0), [section, answers]);

  if (!section || !question) {
    return <div className="p-8 text-center text-muted-foreground">This test has no questions configured yet. Please tell the invigilator.</div>;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl select-none flex-col px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <video ref={selfViewRef} autoPlay muted playsInline className="h-12 w-16 rounded-md bg-muted object-cover" aria-label="Your camera" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{runtime.stage === "aptitude" ? "Aptitude test" : "Role test"}</p>
            <h1 className="text-lg font-semibold text-foreground">{runtime.assessmentTitle}</h1>
            <p className="text-sm text-muted-foreground">{section.title}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={cn("text-xl font-semibold tabular-nums", remaining < 60 && "text-destructive")} data-testid="section-timer">
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
            Question {questionIndex + 1} of {section.questions.length} &middot; {question.marks} mark{question.marks === 1 ? "" : "s"}
          </p>
          <h2 className="mb-6 text-base font-medium leading-relaxed text-foreground">{question.text}</h2>

          <div className="space-y-2.5">
            {question.options.map((opt) => {
              const selected = answers[question.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectOption(opt.id)}
                  className={cn(
                    "w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50 hover:bg-accent/40"
                  )}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => changeQuestion(questionIndex - 1)} disabled={questionIndex === 0}>
              Previous
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMarked((prev) => ({ ...prev, [question.id]: !prev[question.id] }))}>
                {marked[question.id] ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {marked[question.id] ? "Marked" : "Mark for review"}
              </Button>
              {isLastQuestion && isLastSection ? (
                <Button onClick={() => setConfirmSubmitOpen(true)} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit"}
                </Button>
              ) : (
                <Button onClick={goNext}>{isLastQuestion ? "Next section" : "Next"}</Button>
              )}
            </div>
          </div>
          {submitError && <p className="mt-4 text-sm text-destructive">{submitError}</p>}
        </div>

        <QuestionNavigator
          totalQuestions={section.questions.length}
          currentIndex={questionIndex}
          isAnswered={(i) => Boolean(answers[section.questions[i]?.id])}
          isMarked={(i) => Boolean(marked[section.questions[i]?.id])}
          onJump={changeQuestion}
        />
      </div>

      <ViolationModal modal={modal} onAction={acknowledgeModal} />

      <AlertDialog open={confirmSubmitOpen} onOpenChange={setConfirmSubmitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this test?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered {answeredCount} of {section.questions.length} questions in this section. You can&apos;t change your
              answers after submitting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>Submit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
