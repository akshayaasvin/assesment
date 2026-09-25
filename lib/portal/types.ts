import type { AttemptStatus } from "@/types/database";

export interface PortalAssessmentCard {
  id: string;
  title: string;
  description: string | null;
  roleLabel: string | null;
  durationMinutes: number;
  questionCount: number;
  /** The candidate's attempt on this assessment, if any. */
  attemptStatus: AttemptStatus | null;
}

export interface PortalRole {
  id: string;
  label: string;
}

/** What the candidate should see next - computed server-side from the database on every load. */
export type PortalState =
  | { stage: "aptitude"; aptitude: PortalAssessmentCard | null }
  | {
      stage: "not_eligible";
      /** Only present when the aptitude assessment is configured to show results to candidates. */
      percentage: number | null;
      requiredPercentage: number | null;
    }
  | { stage: "select_role"; roles: PortalRole[] }
  | {
      stage: "role_assessment";
      role: PortalRole;
      roles: PortalRole[];
      /** False once the candidate has started or finished an assessment for their role. */
      canChangeRole: boolean;
      assessments: PortalAssessmentCard[];
    };

export interface PortalCandidate {
  name: string;
  email: string;
}
