"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Video, ShieldAlert, Clock3, UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { createClient } from "@/lib/supabase/browser";
import { disqualifyAttempt } from "@/lib/actions/results";

export interface LiveAttempt {
  id: string;
  candidateName: string;
  candidateEmail: string;
  assessmentTitle: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  warningsCount: number;
  maxWarnings: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "just now";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

export function LiveMonitoringBoard({ initial }: { initial: LiveAttempt[] }) {
  const router = useRouter();
  const attempts = initial;
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

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

  if (attempts.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No candidates in progress right now"
        description="Once a candidate starts an assessment, they'll show up here in real time with their violation count."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {attempts.map((a) => (
        <Card key={a.id} className="border-border/70">
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

            <div className="mt-3 flex h-24 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
              <div className="flex flex-col items-center gap-1">
                <Video className="h-5 w-5" />
                Live video coming in Phase 2
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{a.assessmentTitle}</span>
              <span className="flex items-center gap-1">
                <Clock3 className="h-3 w-3" /> {timeAgo(a.lastSeenAt)}
              </span>
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
              destructive
              onConfirm={() =>
                disqualifyAttempt(a.id).then((result) => {
                  if (result?.error) toast.error(result.error);
                  else router.refresh();
                  return result;
                })
              }
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
