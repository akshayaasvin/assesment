import type { Database } from "@/types/database";

type Assessment = Database["public"]["Tables"]["assessments"]["Row"];

/**
 * A `scheduled` assessment becomes candidate-accessible automatically once
 * `now` falls inside [start_at, end_at], without the admin needing to click
 * Start. A manually `live` assessment is open regardless of schedule.
 * `paused`/`ended`/`draft` are never open, even inside the window.
 */
export function isAssessmentOpen(assessment: Pick<Assessment, "status" | "start_at" | "end_at">): boolean {
  if (assessment.status === "live") return true;
  if (assessment.status !== "scheduled") return false;

  const now = Date.now();
  const startsOk = !assessment.start_at || now >= new Date(assessment.start_at).getTime();
  const endsOk = !assessment.end_at || now <= new Date(assessment.end_at).getTime();
  return startsOk && endsOk;
}

/** Effective status for display purposes - folds the schedule window into "live". */
export function effectiveStatus(assessment: Pick<Assessment, "status" | "start_at" | "end_at">): Assessment["status"] {
  return isAssessmentOpen(assessment) ? "live" : assessment.status;
}
