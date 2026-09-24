// App-level shapes used by the candidate runtime and admin UI. These are
// derived/composed from the raw Database rows, not 1:1 with tables.

export interface RuntimeOption {
  id: string;
  text: string;
}

/** A question as sent to the candidate browser - never carries is_correct. */
export interface RuntimeQuestion {
  id: string;
  text: string;
  marks: number;
  options: RuntimeOption[];
}

export interface RuntimeSection {
  id: string;
  title: string;
  orderIndex: number;
  durationMinutes: number;
  questions: RuntimeQuestion[];
}

export interface RuntimeAssessment {
  attemptId: string;
  attemptToken: string;
  assessmentTitle: string;
  currentSectionIndex: number;
  maxWarnings: number;
  warningsCount: number;
  settings: {
    cameraRequired: boolean;
    micRequired: boolean;
    fullscreenRequired: boolean;
    tabSwitchMonitoring: boolean;
    copyPasteBlock: boolean;
    autoSubmit: boolean;
  };
  sections: RuntimeSection[];
}

export type AnswerMap = Record<string, string | undefined>; // questionId -> selectedOptionId
export type MarkedMap = Record<string, boolean>; // questionId -> marked for review

export interface QuestionStatusCounts {
  answered: number;
  notAnswered: number;
  markedForReview: number;
  total: number;
}
