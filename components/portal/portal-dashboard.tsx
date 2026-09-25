"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Brain, Briefcase, CheckCircle2, Clock, ListChecks, LogOut, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { postJson } from "@/lib/fetch-json";
import type { PortalAssessmentCard, PortalCandidate, PortalRole, PortalState } from "@/lib/portal/types";
import { PortalExam, type PortalExamLaunch } from "./portal-exam";

export function PortalDashboard({ candidate, state }: { candidate: PortalCandidate; state: PortalState }) {
  const router = useRouter();
  const [launch, setLaunch] = useState<PortalExamLaunch | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  async function start(assessmentId: string) {
    if (startingId) return;
    setStartingId(assessmentId);
    const result = await postJson<PortalExamLaunch>("/api/portal/attempts", { assessmentId });
    setStartingId(null);
    if (!result.success) {
      toast.error(result.error);
      router.refresh();
      return;
    }
    setLaunch(result.data);
  }

  async function logout() {
    const result = await postJson("/api/portal/logout");
    if (!result.success) toast.error(result.error);
    router.refresh();
  }

  if (launch) {
    return (
      <PortalExam
        launch={launch}
        onExit={() => {
          setLaunch(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">A</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{candidate.name}</p>
            <p className="truncate text-xs text-muted-foreground">{candidate.email}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" /> Log out
        </Button>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <ProgressSteps state={state} />
        <StageView state={state} startingId={startingId} onStart={start} />
      </main>
    </div>
  );
}

function ProgressSteps({ state }: { state: PortalState }) {
  const current = { aptitude: 0, not_eligible: 1, select_role: 2, role_assessment: 3 }[state.stage];
  const steps = ["Aptitude", "Eligibility", "Select role", "Role assessment"];
  return (
    <ol className="grid grid-cols-4 gap-2 text-center text-xs">
      {steps.map((label, i) => (
        <li key={label} className="space-y-1.5">
          <div className={`h-1.5 rounded-full ${i <= current ? "bg-primary" : "bg-border"}`} />
          <span className={i === current ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

function StageView({
  state,
  startingId,
  onStart,
}: {
  state: PortalState;
  startingId: string | null;
  onStart: (assessmentId: string) => void;
}) {
  switch (state.stage) {
    case "aptitude":
      return (
        <StageCard icon={Brain} title="Complete Aptitude Assessment" description="Please complete the Aptitude Assessment first. Your result decides whether you can continue to a role assessment.">
          {state.aptitude ? (
            <AssessmentItem assessment={state.aptitude} startingId={startingId} onStart={onStart} startLabel="Start Aptitude Assessment" />
          ) : (
            <p className="text-sm text-muted-foreground">The Aptitude Assessment is not open yet. Please check back later.</p>
          )}
        </StageCard>
      );

    case "not_eligible":
      return (
        <StageCard icon={XCircle} title="Not eligible for role assessments" description="Thank you for completing the Aptitude Assessment. Unfortunately, you did not meet the eligibility criteria to continue to a role assessment.">
          {state.percentage !== null && state.requiredPercentage !== null && (
            <p className="text-sm text-muted-foreground">
              Your score: <span className="font-medium text-foreground">{state.percentage}%</span> · Required:{" "}
              <span className="font-medium text-foreground">{state.requiredPercentage}%</span>
            </p>
          )}
        </StageCard>
      );

    case "select_role":
      return (
        <StageCard icon={Briefcase} title="Select Your Role" description="You passed the Aptitude Assessment. Choose the role you're applying for to see its assessment.">
          <RolePicker roles={state.roles} currentRoleId={null} />
        </StageCard>
      );

    case "role_assessment":
      return (
        <StageCard
          icon={Briefcase}
          title={`${state.role.label} assessment`}
          description="You're eligible. Here's the assessment for your selected role."
        >
          <div className="space-y-4">
            {state.assessments.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                No assessment is currently available for your selected role. Please check back later.
              </p>
            ) : (
              state.assessments.map((a) => (
                <AssessmentItem key={a.id} assessment={a} startingId={startingId} onStart={onStart} startLabel="Start Assessment" />
              ))
            )}
            {state.canChangeRole && (
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-sm font-medium">Change role</p>
                <RolePicker roles={state.roles} currentRoleId={state.role.id} />
              </div>
            )}
          </div>
        </StageCard>
      );
  }
}

function StageCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children?: ReactNode;
}) {
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

function AssessmentItem({
  assessment: a,
  startingId,
  onStart,
  startLabel,
}: {
  assessment: PortalAssessmentCard;
  startingId: string | null;
  onStart: (id: string) => void;
  startLabel: string;
}) {
  const done = a.attemptStatus === "completed" || a.attemptStatus === "disqualified";
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{a.title}</p>
          {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
        </div>
        {a.roleLabel && <Badge variant="outline">{a.roleLabel}</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4" /> {a.durationMinutes} min
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" /> {a.questionCount} questions
        </span>
      </div>
      <div className="mt-4">
        {a.attemptStatus === "completed" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Completed. We will get back to you shortly.
          </p>
        ) : a.attemptStatus === "disqualified" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <XCircle className="h-4 w-4" /> Disqualified due to proctoring violations.
          </p>
        ) : (
          <Button onClick={() => onStart(a.id)} disabled={done || startingId !== null}>
            {startingId === a.id ? "Loading..." : a.attemptStatus === "in_progress" ? "Resume Assessment" : startLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function RolePicker({ roles, currentRoleId }: { roles: PortalRole[]; currentRoleId: string | null }) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(currentRoleId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!roleId || saving) return;
    setSaving(true);
    const result = await postJson("/api/portal/role", { roleId });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Role saved.");
    router.refresh();
  }

  if (roles.length === 0) {
    return <p className="text-sm text-muted-foreground">No roles are open right now. Please check back later.</p>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select value={roleId} onValueChange={setRoleId}>
        <SelectTrigger className="w-full sm:w-72">
          <SelectValue placeholder="Choose a role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button onClick={save} disabled={!roleId || roleId === currentRoleId || saving}>
        {saving ? "Saving..." : currentRoleId ? "Change role" : "Select Role"}
      </Button>
    </div>
  );
}
