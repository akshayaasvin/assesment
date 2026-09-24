import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AssessmentStatus, AttemptStatus } from "@/types/database";

const ASSESSMENT_STYLES: Record<AssessmentStatus, string> = {
  draft: "bg-secondary text-secondary-foreground border-transparent",
  scheduled: "bg-warning/15 text-warning-foreground border-warning/30",
  live: "bg-success/15 text-success border-success/30",
  paused: "bg-warning/15 text-warning-foreground border-warning/30",
  ended: "bg-muted text-muted-foreground border-transparent",
};

const ATTEMPT_STYLES: Record<AttemptStatus, string> = {
  not_started: "bg-secondary text-secondary-foreground border-transparent",
  in_progress: "bg-accent text-accent-foreground border-transparent",
  completed: "bg-success/15 text-success border-success/30",
  disqualified: "bg-destructive/10 text-destructive border-destructive/30",
};

const LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
};

function label(value: string) {
  return LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", ASSESSMENT_STYLES[status])}>
      {status === "live" && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-success animate-pulse" />}
      {label(status)}
    </Badge>
  );
}

export function AttemptStatusBadge({ status }: { status: AttemptStatus }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ATTEMPT_STYLES[status])}>
      {label(status)}
    </Badge>
  );
}
