"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NOT_FOUND_OR_FORBIDDEN, toUserError } from "@/lib/db-errors";
import type { createClient } from "@/lib/supabase/server";
import type { AssessmentStatus } from "@/types/database";

const sectionSchema = z.object({
  // Present for sections loaded from the database; absent for new ones.
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "Every section needs a title."),
  durationMinutes: z.coerce.number().int().min(1, "Section duration must be at least 1 minute."),
  randomizeQuestions: z.boolean().default(true),
  randomizeOptions: z.boolean().default(true),
  sourceType: z.enum(["fixed", "random_pool"]),
  sourceCategoryId: z.string().uuid().nullable(),
  questionCount: z.coerce.number().int().min(1, "Number of questions must be at least 1."),
  fixedQuestionIds: z.array(z.string().uuid()).optional(),
});

const assessmentSchema = z
  .object({
    title: z.string().trim().min(1, "Give the assessment a title."),
    description: z.string().trim().max(2000).nullable().default(null),
    kind: z.enum(["aptitude", "role"]).default("role"),
    roleId: z.string().uuid().nullable(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    maxWarnings: z.coerce.number().int().min(1, "Maximum warnings must be at least 1."),
    passingPercentage: z.coerce.number().min(0).max(100, "Passing percentage must be between 0 and 100."),
    cameraRequired: z.boolean(),
    micRequired: z.boolean(),
    fullscreenRequired: z.boolean(),
    tabSwitchMonitoring: z.boolean(),
    copyPasteBlock: z.boolean(),
    autoSubmit: z.boolean(),
    resultVisibleToCandidate: z.boolean(),
    sections: z.array(sectionSchema).min(1, "Add at least one section."),
  })
  .refine((a) => a.kind === "aptitude" || a.roleId, {
    message: "Choose the role this assessment is for (or set its type to Aptitude).",
  })
  .refine((a) => !a.startAt || !a.endAt || new Date(a.endAt) > new Date(a.startAt), {
    message: "End time must be after the start time.",
  })
  .refine((a) => a.sections.every((s) => s.sourceType !== "fixed" || (s.fixedQuestionIds?.length ?? 0) > 0), {
    message: "Pick at least one question for each fixed-list section.",
  });

export type AssessmentFormInput = z.infer<typeof assessmentSchema>;

type ActionResult = { success: true; id?: string; error?: undefined } | { success?: false; error: string };

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "assessment"}-${suffix}`;
}

/**
 * Syncs an assessment's sections with the form. Existing sections are updated
 * in place (by id) rather than deleted and re-created: attempt_questions
 * references section ids with ON DELETE CASCADE, so re-creating sections would
 * wipe the question snapshot of any candidate mid-exam. Only sections the
 * admin actually removed are deleted.
 */
async function writeSections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assessmentId: string,
  sections: AssessmentFormInput["sections"]
) {
  const { data: existing, error: readError } = await supabase
    .from("assessment_sections")
    .select("id")
    .eq("assessment_id", assessmentId);
  if (readError) throw readError;

  const existingIds = new Set((existing ?? []).map((s) => s.id));
  const keptIds = new Set(sections.map((s) => s.id).filter((id): id is string => Boolean(id && existingIds.has(id))));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  if (removedIds.length) {
    const { error } = await supabase.from("assessment_sections").delete().in("id", removedIds);
    if (error) throw error;
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const row = {
      assessment_id: assessmentId,
      title: s.title,
      order_index: i,
      duration_minutes: s.durationMinutes,
      randomize_questions: s.randomizeQuestions,
      randomize_options: s.randomizeOptions,
      source_type: s.sourceType,
      source_category_id: s.sourceType === "random_pool" ? s.sourceCategoryId : null,
      question_count: s.sourceType === "fixed" ? (s.fixedQuestionIds?.length ?? 0) : s.questionCount,
    };

    let sectionId: string;
    if (s.id && keptIds.has(s.id)) {
      const { error } = await supabase.from("assessment_sections").update(row).eq("id", s.id);
      if (error) throw error;
      sectionId = s.id;
    } else {
      const { data: created, error } = await supabase.from("assessment_sections").insert(row).select("id").single();
      if (error || !created) throw error ?? new Error("Section insert returned no row.");
      sectionId = created.id;
    }

    // The fixed question list is plain config (nothing references it), so
    // replacing it wholesale is safe.
    const { error: clearError } = await supabase.from("assessment_questions").delete().eq("section_id", sectionId);
    if (clearError) throw clearError;

    if (s.sourceType === "fixed" && s.fixedQuestionIds?.length) {
      const rows = s.fixedQuestionIds.map((question_id, order_index) => ({
        section_id: sectionId,
        question_id,
        order_index,
      }));
      const { error: aqError } = await supabase.from("assessment_questions").insert(rows);
      if (aqError) throw aqError;
    }
  }
}

function assessmentColumns(input: AssessmentFormInput) {
  return {
    title: input.title,
    description: input.description || null,
    kind: input.kind,
    // Aptitude assessments are shared by every candidate, not tied to a role.
    role_id: input.kind === "aptitude" ? null : input.roleId,
    start_at: input.startAt,
    end_at: input.endAt,
    max_warnings: input.maxWarnings,
    passing_percentage: input.passingPercentage,
    camera_required: input.cameraRequired,
    mic_required: input.micRequired,
    fullscreen_required: input.fullscreenRequired,
    tab_switch_monitoring: input.tabSwitchMonitoring,
    copy_paste_block: input.copyPasteBlock,
    auto_submit: input.autoSubmit,
    result_visible_to_candidate: input.resultVisibleToCandidate,
  };
}

export async function createAssessment(raw: AssessmentFormInput): Promise<ActionResult> {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  const input = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({ ...assessmentColumns(input), slug: slugify(input.title), status: "draft", created_by: user.id })
    .select("id")
    .single();
  if (error || !assessment) return { error: toUserError(error, "Unable to create assessment.") };

  try {
    await writeSections(supabase, assessment.id, input.sections);
  } catch (e) {
    // Don't leave a half-created assessment with missing sections behind.
    await supabase.from("assessments").delete().eq("id", assessment.id);
    return { error: toUserError(e as { code?: string; message: string }, "Unable to create assessment.") };
  }

  revalidatePath("/admin/assessments");
  return { success: true, id: assessment.id };
}

export async function updateAssessment(id: string, raw: AssessmentFormInput): Promise<ActionResult> {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  const input = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: updated, error } = await supabase
    .from("assessments")
    .update({ ...assessmentColumns(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: toUserError(error, "Unable to save changes.") };
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  try {
    await writeSections(supabase, id, input.sections);
  } catch (e) {
    return { error: toUserError(e as { code?: string; message: string }, "Unable to save section changes.") };
  }

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { success: true, id };
}

export async function setAssessmentStatus(id: string, status: AssessmentStatus): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: updated, error } = await supabase
    .from("assessments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: toUserError(error, "Unable to change the assessment status.") };
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  // Audit trail only - a failure here shouldn't undo the status change.
  const { error: eventError } = await supabase.from("assessment_events").insert({
    assessment_id: id,
    type: status === "live" ? "started" : status === "paused" ? "paused" : status === "ended" ? "submitted" : "started",
  });
  if (eventError) console.error("[admin] Could not record assessment event:", eventError);

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { success: true };
}

export async function deleteAssessment(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  // Sections, fixed question lists, attempts, answers and events are removed
  // by ON DELETE CASCADE. Bank questions themselves are shared and kept.
  const { data: deleted, error } = await supabase.from("assessments").delete().eq("id", id).select("id");
  if (error) return { error: toUserError(error, "Unable to delete assessment.") };
  if (!deleted?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/assessments");
  return { success: true };
}

export async function duplicateAssessment(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;

  const { data: original, error: readError } = await supabase.from("assessments").select("*").eq("id", id).maybeSingle();
  if (readError) return { error: toUserError(readError, "Unable to duplicate assessment.") };
  if (!original) return { error: "Assessment not found." };

  const { data: sections, error: sectionsError } = await supabase
    .from("assessment_sections")
    .select("*")
    .eq("assessment_id", id)
    .order("order_index");
  if (sectionsError) return { error: toUserError(sectionsError, "Unable to duplicate assessment.") };

  const { data: copy, error } = await supabase
    .from("assessments")
    .insert({
      title: `${original.title} (Copy)`,
      description: original.description,
      kind: original.kind,
      slug: slugify(original.title),
      role_id: original.role_id,
      status: "draft",
      max_warnings: original.max_warnings,
      passing_percentage: original.passing_percentage,
      camera_required: original.camera_required,
      mic_required: original.mic_required,
      fullscreen_required: original.fullscreen_required,
      tab_switch_monitoring: original.tab_switch_monitoring,
      copy_paste_block: original.copy_paste_block,
      auto_submit: original.auto_submit,
      result_visible_to_candidate: original.result_visible_to_candidate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !copy) return { error: toUserError(error, "Unable to duplicate assessment.") };

  try {
    for (const section of sections ?? []) {
      const { data: newSection, error: sError } = await supabase
        .from("assessment_sections")
        .insert({
          assessment_id: copy.id,
          title: section.title,
          order_index: section.order_index,
          duration_minutes: section.duration_minutes,
          randomize_questions: section.randomize_questions,
          randomize_options: section.randomize_options,
          source_type: section.source_type,
          source_category_id: section.source_category_id,
          question_count: section.question_count,
        })
        .select("id")
        .single();
      if (sError || !newSection) throw sError ?? new Error("Section copy returned no row.");

      if (section.source_type === "fixed") {
        const { data: fixedQuestions, error: fqError } = await supabase
          .from("assessment_questions")
          .select("question_id, order_index")
          .eq("section_id", section.id);
        if (fqError) throw fqError;
        if (fixedQuestions?.length) {
          const { error: insError } = await supabase.from("assessment_questions").insert(
            fixedQuestions.map((q) => ({ section_id: newSection.id, question_id: q.question_id, order_index: q.order_index }))
          );
          if (insError) throw insError;
        }
      }
    }
  } catch (e) {
    await supabase.from("assessments").delete().eq("id", copy.id);
    return { error: toUserError(e as { code?: string; message: string }, "Unable to duplicate assessment.") };
  }

  revalidatePath("/admin/assessments");
  return { success: true, id: copy.id };
}
