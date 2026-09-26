import type { CandidateStatus, DriveMode } from "@/types/database";
import type { RuntimeSection } from "@/types/domain";

/** A live drive as shown on the home page. */
export interface DriveCard {
  id: string;
  name: string;
  mode: DriveMode;
  collegeName: string | null;
  startAt: string | null;
  endAt: string | null;
}

/** A role the candidate can pick after aptitude: one live role assessment in their drive. */
export interface RoleOption {
  assessmentId: string;
  roleLabel: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  questionCount: number;
}

/**
 * The candidate's next step, derived server-side from the database on every
 * load - so a refresh, a closed tab or a different page always resumes at the
 * same place.
 */
export type CandidateStep =
  | { step: "aptitude"; resume: boolean; title: string; durationMinutes: number; questionCount: number }
  | { step: "not_eligible"; percentage: number | null; cutoff: number | null }
  | { step: "role_select"; roles: RoleOption[] }
  | { step: "role"; resume: boolean; title: string; roleLabel: string | null; durationMinutes: number; questionCount: number }
  | { step: "completed" }
  | { step: "disqualified"; reason: string | null }
  | { step: "unavailable"; message: string };

export interface CandidateSummary {
  name: string;
  email: string;
  college: string | null;
  status: CandidateStatus;
}

/** What /api/drive/stage returns to start or resume a stage. Never contains answer keys. */
export interface StageRuntime {
  attemptId: string;
  stage: "aptitude" | "role";
  assessmentTitle: string;
  currentSectionIndex: number;
  sectionRemainingSeconds: number | null;
  sections: RuntimeSection[];
  savedAnswers: Record<string, string | null>;
  settings: { tabSwitchMonitoring: boolean; copyPasteBlock: boolean; fullscreenRequired: boolean };
}

export const DRIVE_MODE_LABEL: Record<DriveMode, string> = {
  campus: "On-campus drive",
  online: "Online interview",
  walkin: "Walk-in (experienced)",
};
