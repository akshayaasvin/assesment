"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, ShieldAlert, Clock3, UserX, ListChecks, Timer, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { AttemptStatusBadge } from "@/components/shared/status-badge";
import { createClient } from "@/lib/supabase/browser";
import { disqualifyAttempt } from "@/lib/actions/results";
import type { ViolationType } from "@/types/database";

export interface LiveAttempt {
  id: string;
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  warningsCount: number;
  maxWarnings: number;
  /** Sum of all section durations - the attempt's overall time budget. */
  totalMinutes: number;
  answeredCount: number;
  totalQuestions: number;
  flags: Partial<Record<ViolationType, number>>;
}

export interface FinishedAttempt {
  id: string;
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  status: "completed" | "disqualified";
  startedAt: string | null;
  submittedAt: string | null;
  score: number;
  totalMarks: number;
  percentage: number;
  warningsCount: number;
}

const FLAG_LABELS: Record<ViolationType, string> = {
  fullscreen_exit: "Left fullscreen",
  tab_switch: "Tab switch",
  window_blur: "Window blur",
  copy: "Copy",
  paste: "Paste",
  contextmenu: "Right-click",
  resize: "Resize",
};

const POLL_INTERVAL_MS = 10_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "just now";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

function formatClock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

/**
 * Estimated time left = overall budget minus time since the attempt started.
 * Section timers run in the candidate's browser, so this is an upper-bound
 * estimate rather than the exact per-section countdown.
 */
function timeLeft(a: LiveAttempt): string {
  if (!a.startedAt || !a.totalMinutes) return "—";
  const left = a.totalMinutes * 60 - (Date.now() - new Date(a.startedAt).getTime()) / 1000;
  if (left <= 0) return "Time up";
  return `~${Math.ceil(left / 60)}m left`;
}

function formatDuration(startedAt: string | null, submittedAt: string | null): string {
  if (!startedAt || !submittedAt) return "—";
  const seconds = Math.max(0, Math.round((new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  const m = Math.floor(seconds / 60);
  return m ? `${m}m ${seconds % 60}s` : `${seconds}s`;
}

export function LiveMonitoringBoard({ initial, recent }: { initial: LiveAttempt[]; recent: FinishedAttempt[] }) {
  const router = useRouter();
  const attempts = initial;
  const [, forceTick] = useState(0);

  // Re-render every 5s so "last seen" and "time left" stay current between fetches.
  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Refetch from the server every 10s. Realtime below makes changes appear
  // sooner; polling guarantees updates even if the realtime socket drops.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("live-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "attempts" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "violations" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">In progress ({attempts.length})</h2>
        {attempts.length === 0 ? (
          <EmptyState
            icon={Video}
            title="No candidates in progress right now"
            description="Once a candidate starts an assessment, they'll show up here with their progress and proctoring flags."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {attempts.map((a) => (
              <LiveAttemptCard key={a.id} attempt={a} onChanged={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Recently finished (last 24 hours)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No attempts have been submitted in the last 24 hours.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Warnings</TableHead>
                    <TableHead>Time taken</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <p className="font-medium">{r.candidateName}</p>
                        <p className="text-xs text-muted-foreground">{r.candidateEmail}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.assessmentTitle}</TableCell>
                      <TableCell className="text-sm">
                        {r.score}/{r.totalMarks} ({r.percentage}%)
                      </TableCell>
                      <TableCell>
                        <AttemptStatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.warningsCount}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDuration(r.startedAt, r.submittedAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(r.submittedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LiveAttemptCard({ attempt: a, onChanged }: { attempt: LiveAttempt; onChanged: () => void }) {
  const flags = Object.entries(a.flags) as [ViolationType, number][];

  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="truncate font-medium">{a.candidateName}</p>
            <p className="truncate text-xs text-muted-foreground">{a.candidateEmail}</p>
          </div>
          {a.warningsCount > 0 ? (
            <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning-foreground">
              <ShieldAlert className="h-3 w-3" /> {a.warningsCount}/{a.maxWarnings}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
              Normal
            </Badge>
          )}
        </div>

        <p className="mt-2 truncate text-sm text-muted-foreground">{a.assessmentTitle}</p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock3 className="h-3 w-3" /> Started {formatClock(a.startedAt)}
          </span>
          <span className="flex items-center gap-1" title="Overall time budget minus time since start">
            <Timer className="h-3 w-3" /> {timeLeft(a)}
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="h-3 w-3" /> {a.answeredCount}/{a.totalQuestions} answered
          </span>
          <span className="flex items-center gap-1">Seen {timeAgo(a.lastSeenAt)}</span>
        </div>

        {flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {flags.map(([type, count]) => (
              <Badge key={type} variant="outline" className="border-warning/30 text-xs font-normal">
                {FLAG_LABELS[type] ?? type} ×{count}
              </Badge>
            ))}
          </div>
        )}

        <div className="mt-3 flex h-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-1">
            <Video className="h-5 w-5" />
            Live video coming in Phase 2
          </div>
        </div>

        <ConfirmAction
          trigger={
            <Button variant="outline" size="sm" className="mt-3 w-full text-destructive hover:text-destructive">
              <UserX className="h-4 w-4" /> Disqualify
            </Button>
          }
          title={`Disqualify ${a.candidateName}?`}
          description="This immediately ends their attempt and marks it as Disqualified."
          confirmLabel="Disqualify"
          pendingLabel="Disqualifying..."
          successMessage="Candidate disqualified."
          errorMessage="Unable to disqualify this candidate."
          destructive
          onConfirm={async () => {
            const result = await disqualifyAttempt(a.id);
            if (!result?.error) onChanged();
            return result;
          }}
        />
      </CardContent>
    </Card>
  );
}
