// Hand-authored to match supabase/migrations/0001_init.sql.
// If you have the Supabase CLI linked to the project, prefer regenerating this
// with `supabase gen types typescript --linked` once the schema evolves.

export type AssessmentStatus = "draft" | "scheduled" | "live" | "paused" | "ended";
export type AssessmentKind = "aptitude" | "role";
export type DriveMode = "campus" | "online" | "walkin";
export type DriveStatus = "draft" | "live" | "closed";
export type CandidateStatus =
  | "registered"
  | "aptitude_in_progress"
  | "aptitude_done"
  | "role_in_progress"
  | "completed"
  | "disqualified";
export type CandidateType = "fresher" | "experienced";
export type AttemptStage = "aptitude" | "role";
export type ProctorEventType =
  | "tab_switch"
  | "fullscreen_exit"
  | "window_blur"
  | "copy_paste"
  | "no_face"
  | "multiple_faces"
  | "camera_off"
  | "mic_off"
  | "admin_warning"
  // written by the pre-drive exam runner
  | "copy"
  | "paste"
  | "contextmenu"
  | "resize";
export type CandidateRequestType = "snapshot" | "warning" | "live_view";
export type AttemptStatus ="not_started" | "in_progress" | "completed" | "disqualified";
export type SectionSourceType = "fixed" | "random_pool";
export type Difficulty = "easy" | "medium" | "hard";
export type ViolationType =
  | "fullscreen_exit"
  | "tab_switch"
  | "window_blur"
  | "copy"
  | "paste"
  | "contextmenu"
  | "resize";
export type AssessmentEventType =
  | "joined"
  | "started"
  | "section_advanced"
  | "submitted"
  | "paused"
  | "resumed"
  | "violation"
  | "disqualified";

type PublicTablesBare = {
  profiles: {
    Row: {
      id: string;
      email: string;
      full_name: string | null;
      role: "admin";
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["profiles"]["Row"]> & { id: string; email: string };
    Update: Partial<PublicTablesBare["profiles"]["Row"]>;
  };
  roles: {
    Row: {
      id: string;
      key: string;
      label: string;
      is_active: boolean;
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["roles"]["Row"]> & { key: string; label: string };
    Update: Partial<PublicTablesBare["roles"]["Row"]>;
  };
  categories: {
    Row: { id: string; name: string; created_at: string };
    Insert: Partial<PublicTablesBare["categories"]["Row"]> & { name: string };
    Update: Partial<PublicTablesBare["categories"]["Row"]>;
  };
  questions: {
    Row: {
      id: string;
      category_id: string | null;
      text: string;
      difficulty: Difficulty;
      marks: number;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<PublicTablesBare["questions"]["Row"]> & { text: string };
    Update: Partial<PublicTablesBare["questions"]["Row"]>;
  };
  question_options: {
    Row: {
      id: string;
      question_id: string;
      text: string;
      is_correct: boolean;
      order_index: number;
    };
    Insert: Partial<PublicTablesBare["question_options"]["Row"]> & { question_id: string; text: string };
    Update: Partial<PublicTablesBare["question_options"]["Row"]>;
  };
  assessments: {
    Row: {
      id: string;
      title: string;
      slug: string;
      role_id: string | null;
      status: AssessmentStatus;
      start_at: string | null;
      end_at: string | null;
      max_warnings: number;
      camera_required: boolean;
      mic_required: boolean;
      fullscreen_required: boolean;
      tab_switch_monitoring: boolean;
      copy_paste_block: boolean;
      auto_submit: boolean;
      result_visible_to_candidate: boolean;
      passing_percentage: number;
      kind: AssessmentKind;
      description: string | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<PublicTablesBare["assessments"]["Row"]> & { title: string; slug: string };
    Update: Partial<PublicTablesBare["assessments"]["Row"]>;
  };
  assessment_sections: {
    Row: {
      id: string;
      assessment_id: string;
      title: string;
      order_index: number;
      duration_minutes: number;
      randomize_questions: boolean;
      randomize_options: boolean;
      source_type: SectionSourceType;
      source_category_id: string | null;
      question_count: number;
    };
    Insert: Partial<PublicTablesBare["assessment_sections"]["Row"]> & { assessment_id: string; title: string };
    Update: Partial<PublicTablesBare["assessment_sections"]["Row"]>;
  };
  assessment_questions: {
    Row: {
      id: string;
      section_id: string;
      question_id: string;
      order_index: number;
    };
    Insert: Partial<PublicTablesBare["assessment_questions"]["Row"]> & { section_id: string; question_id: string };
    Update: Partial<PublicTablesBare["assessment_questions"]["Row"]>;
  };
  candidates: {
    Row: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      college: string | null;
      district: string | null;
      department: string | null;
      role_id: string | null;
      /** null = registered before drives existed ("Legacy"). */
      drive_id: string | null;
      degree: string | null;
      branch: string | null;
      graduation_year: number | null;
      candidate_type: CandidateType | null;
      years_experience: number | null;
      current_company: string | null;
      resume_path: string | null;
      consent_at: string | null;
      status: CandidateStatus;
      disqualified_reason: string | null;
      disqualified_at: string | null;
      disqualified_by: string | null;
      high_risk: boolean;
      auth_user_id: string | null;
      last_seen_at: string | null;
      /** generated */ email_normalized: string;
      /** generated */ phone_normalized: string;
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["candidates"]["Row"]> & { name: string; email: string };
    Update: Partial<PublicTablesBare["candidates"]["Row"]>;
  };
  attempts: {
    Row: {
      id: string;
      candidate_id: string;
      assessment_id: string;
      attempt_token: string;
      status: AttemptStatus;
      current_section_index: number;
      started_at: string | null;
      submitted_at: string | null;
      last_seen_at: string | null;
      warnings_count: number;
      score: number;
      total_marks: number;
      percentage: number;
      stage: AttemptStage | null;
      /** generated from started_at/submitted_at */ time_taken_seconds: number | null;
      created_at: string;
    };
    Insert: Partial<Omit<PublicTablesBare["attempts"]["Row"], "time_taken_seconds">> & { candidate_id: string; assessment_id: string };
    Update: Partial<PublicTablesBare["attempts"]["Row"]>;
  };
  attempt_questions: {
    Row: {
      id: string;
      attempt_id: string;
      section_id: string;
      question_id: string;
      order_index: number;
    };
    Insert: Partial<PublicTablesBare["attempt_questions"]["Row"]> & {
      attempt_id: string;
      section_id: string;
      question_id: string;
    };
    Update: Partial<PublicTablesBare["attempt_questions"]["Row"]>;
  };
  answers: {
    Row: {
      id: string;
      attempt_id: string;
      question_id: string;
      selected_option_id: string | null;
      is_correct: boolean;
      answered_at: string;
    };
    Insert: Partial<PublicTablesBare["answers"]["Row"]> & { attempt_id: string; question_id: string };
    Update: Partial<PublicTablesBare["answers"]["Row"]>;
  };
  proctor_events: {
    Row: {
      id: string;
      attempt_id: string | null;
      candidate_id: string | null;
      type: ProctorEventType;
      message: string | null;
      meta: Record<string, unknown> | null;
      snapshot_path: string | null;
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["proctor_events"]["Row"]> & { type: ProctorEventType };
    Update: Partial<PublicTablesBare["proctor_events"]["Row"]>;
  };
  drives: {
    Row: {
      id: string;
      name: string;
      mode: DriveMode;
      college_name: string | null;
      start_at: string | null;
      end_at: string | null;
      status: DriveStatus;
      aptitude_assessment_id: string | null;
      /** null = off */ aptitude_cutoff: number | null;
      /** null = off; flags "high risk", never disqualifies */ high_risk_tab_switches: number | null;
      created_by: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: Partial<PublicTablesBare["drives"]["Row"]> & { name: string; mode: DriveMode };
    Update: Partial<PublicTablesBare["drives"]["Row"]>;
  };
  drive_role_assessments: {
    Row: { drive_id: string; assessment_id: string };
    Insert: { drive_id: string; assessment_id: string };
    Update: Partial<{ drive_id: string; assessment_id: string }>;
  };
  announcements: {
    Row: {
      id: string;
      drive_id: string;
      college_name: string | null;
      candidate_id: string | null;
      type: "text" | "audio";
      text: string | null;
      audio_path: string | null;
      created_by: string | null;
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["announcements"]["Row"]> & { drive_id: string; type: "text" | "audio" };
    Update: Partial<PublicTablesBare["announcements"]["Row"]>;
  };
  candidate_requests: {
    Row: {
      id: string;
      candidate_id: string;
      type: CandidateRequestType;
      payload: Record<string, unknown> | null;
      created_by: string | null;
      created_at: string;
      delivered_at: string | null;
      fulfilled_at: string | null;
      result_path: string | null;
    };
    Insert: Partial<PublicTablesBare["candidate_requests"]["Row"]> & { candidate_id: string; type: CandidateRequestType };
    Update: Partial<PublicTablesBare["candidate_requests"]["Row"]>;
  };
  webrtc_signals: {
    Row: {
      id: number;
      session_id: string;
      candidate_id: string;
      sender: "admin" | "candidate";
      kind: "offer" | "answer" | "ice" | "end";
      payload: Record<string, unknown> | null;
      created_at: string;
    };
    Insert: Omit<Partial<PublicTablesBare["webrtc_signals"]["Row"]>, "id"> & {
      session_id: string;
      candidate_id: string;
      sender: "admin" | "candidate";
      kind: "offer" | "answer" | "ice" | "end";
    };
    Update: Partial<PublicTablesBare["webrtc_signals"]["Row"]>;
  };
  assessment_events: {
    Row: {
      id: string;
      attempt_id: string | null;
      assessment_id: string;
      type: AssessmentEventType;
      payload: Record<string, unknown> | null;
      created_at: string;
    };
    Insert: Partial<PublicTablesBare["assessment_events"]["Row"]> & { assessment_id: string; type: AssessmentEventType };
    Update: Partial<PublicTablesBare["assessment_events"]["Row"]>;
  };
  default_settings: {
    Row: {
      id: number;
      max_warnings: number;
      camera_required: boolean;
      mic_required: boolean;
      fullscreen_required: boolean;
      tab_switch_monitoring: boolean;
      copy_paste_block: boolean;
      auto_submit: boolean;
      result_visible_to_candidate: boolean;
    };
    Insert: Partial<PublicTablesBare["default_settings"]["Row"]>;
    Update: Partial<PublicTablesBare["default_settings"]["Row"]>;
  };
}

export interface CandidateSyncResult {
  status: CandidateStatus;
  disqualifiedReason: string | null;
  serverTime: string;
  /** Answers the server refused (attempt closed, time over, or not this candidate's question). */
  rejectedAnswers: number;
  announcements: { id: string; type: "text" | "audio"; text: string | null; audioPath: string | null; private: boolean; createdAt: string }[];
  requests: { id: string; type: CandidateRequestType; payload: Record<string, unknown> | null }[];
}

interface Relationship {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

function fk<Name extends string, Column extends string, Ref extends string>(name: Name, column: Column, referencedRelation: Ref) {
  return { foreignKeyName: name, columns: [column], referencedRelation, referencedColumns: ["id"] };
}

// Declared so embedded/nested `.select("foo(bar)")` queries resolve correctly -
// postgrest-js needs each foreign key listed (on the table that owns the FK
// column) to type both the forward embed and the reverse/array embed.
export const relationships = {
  profiles: [] as Relationship[],
  roles: [] as Relationship[],
  categories: [] as Relationship[],
  questions: [fk("questions_category_id_fkey", "category_id", "categories")],
  question_options: [fk("question_options_question_id_fkey", "question_id", "questions")],
  assessments: [fk("assessments_role_id_fkey", "role_id", "roles")],
  assessment_sections: [
    fk("assessment_sections_assessment_id_fkey", "assessment_id", "assessments"),
    fk("assessment_sections_source_category_id_fkey", "source_category_id", "categories"),
  ],
  assessment_questions: [
    fk("assessment_questions_section_id_fkey", "section_id", "assessment_sections"),
    fk("assessment_questions_question_id_fkey", "question_id", "questions"),
  ],
  candidates: [
    fk("candidates_drive_id_fkey", "drive_id", "drives"),
    fk("candidates_role_id_fkey", "role_id", "roles"),
  ],
  attempts: [
    fk("attempts_candidate_id_fkey", "candidate_id", "candidates"),
    fk("attempts_assessment_id_fkey", "assessment_id", "assessments"),
  ],
  attempt_questions: [
    fk("attempt_questions_attempt_id_fkey", "attempt_id", "attempts"),
    fk("attempt_questions_section_id_fkey", "section_id", "assessment_sections"),
    fk("attempt_questions_question_id_fkey", "question_id", "questions"),
  ],
  answers: [
    fk("answers_attempt_id_fkey", "attempt_id", "attempts"),
    fk("answers_question_id_fkey", "question_id", "questions"),
    fk("answers_selected_option_id_fkey", "selected_option_id", "question_options"),
  ],
  // The FK names keep their pre-rename "violations_" prefix (ALTER TABLE RENAME doesn't rename constraints).
  proctor_events: [
    fk("violations_attempt_id_fkey", "attempt_id", "attempts"),
    fk("proctor_events_candidate_id_fkey", "candidate_id", "candidates"),
  ],
  drives: [fk("drives_aptitude_assessment_id_fkey", "aptitude_assessment_id", "assessments")],
  drive_role_assessments: [
    fk("drive_role_assessments_drive_id_fkey", "drive_id", "drives"),
    fk("drive_role_assessments_assessment_id_fkey", "assessment_id", "assessments"),
  ],
  announcements: [
    fk("announcements_drive_id_fkey", "drive_id", "drives"),
    fk("announcements_candidate_id_fkey", "candidate_id", "candidates"),
  ],
  candidate_requests: [fk("candidate_requests_candidate_id_fkey", "candidate_id", "candidates")],
  webrtc_signals: [fk("webrtc_signals_candidate_id_fkey", "candidate_id", "candidates")],
  assessment_events: [
    fk("assessment_events_attempt_id_fkey", "attempt_id", "attempts"),
    fk("assessment_events_assessment_id_fkey", "assessment_id", "assessments"),
  ],
  default_settings: [] as Relationship[],
} satisfies Record<keyof PublicTablesBare, Relationship[]>;

type RelationshipMap = typeof relationships;

export interface Database {
  public: {
    Tables: {
      [K in keyof PublicTablesBare]: PublicTablesBare[K] & { Relationships: RelationshipMap[K] };
    };
    Views: Record<string, never>;
    // RPCs are typed in lib/drive/rpc.ts instead: any entry here breaks
    // postgrest-js's relationship inference for this hand-written schema.
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
