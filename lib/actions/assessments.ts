"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentStatus } from "@/types/database";

const sectionSchema = z.object({
  // Present for sections loaded from the database; absent for new ones.
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1),
  durationMinutes: z.coerce.number().int().min(1),
  randomizeQuestions: z.boolean().default(true),
  randomizeOptions: z.boolean().default(true),
  sourceType: z.enum(["fixed", "random_pool"]),
  sourceCategoryId: z.string().uuid().nullable(),
  questionCount: z.coerce.number().int().min(1),
  fixedQuestionIds: z.array(z.string().uuid()).optional(),
});

const assessmentSchema = z.object({
  title: z.string().trim().min(1),
  roleId: z.string().uuid().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  maxWarnings: z.coerce.number().int().min(1),
  passingPercentage: z.coerce.number().min(0).max(100),
  cameraRequired: z.boolean(),
  micRequired: z.boolean(),
  fullscreenRequired: z.boolean(),
  tabSwitchMonitoring: z.boolean(),
  copyPasteBlock: z.boolean(),
  autoSubmit: z.boolean(),
  resultVisibleToCandidate: z.boolean(),
  sections: z.array(sectionSchema).min(1, "Add at least one section."),
});

export type AssessmentFormInput = z.infer<typeof assessmentSchema>;

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "assessment"}-${suffix}`;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface SectionStructure {
  id: string;
  sourceType: string;
  sourceCategoryId: string | null;
  questionCount: number;
  fixedQuestionIds: string[];
}

/**
 * The parts of an assessment's sections that decide which questions a
 * candidate gets. Changing these while candidates are mid-exam would change
 * their test under them, so it's blocked (see checkSectionChanges).
 */
function structureKey(sections: SectionStructure[]) {
  return JSON.stringify(
    sections.map((s) => ({
      id: s.id,
      sourceType: s.sourceType,
      sourceCategoryId: s.sourceType === "random_pool" ? s.sourceCategoryId : null,
      questionCount: s.sourceType === "fixed" ? s.fixedQuestionIds.length : s.questionCount,
      fixedQuestionIds: s.sourceType === "fixed" ? s.fixedQuestionIds : [],
    }))
  );
}

async function loadStructure(supabase: Supabase, assessmentId: string): Promise<SectionStructure[]> {
  const { data: sections, error } = await supabase
    .from("assessment_sections")
    .select("id, source_type, source_category_id, question_count")
    .eq("assessment_id", assessmentId)
    .order("order_index");
  if (error) throw new Error(error.message);

  const result: SectionStructure[] = [];
  for (const s of sections ?? []) {
    const { data: fixed, error: fixedError } = await supabase
      .from("assessment_questions")
      .select("question_id")
      .eq("section_id", s.id)
      .order("order_index");
    if (fixedError) throw new Error(fixedError.message);
    result.push({
      id: s.id,
      sourceType: s.source_type,
      sourceCategoryId: s.source_category_id,
      questionCount: s.question_count,
      fixedQuestionIds: (fixed ?? []).map((f) => f.question_id),
    });
  }
  return result;
}

/**
 * Saves an assessment's sections IN PLACE. Existing sections are updated by
 * id instead of being deleted and re-created: attempt_questions (the
 * questions each candidate was served) cascades from assessment_sections, so
 * re-creating sections silently erased candidates' progress.
 * Callers must run checkSectionChanges() first.
 */
async function writeSections(supabase: Supabase, assessmentId: string, sections: AssessmentFormInput["sections"]) {
  const { data: existing, error: readError } = await supabase
    .from("assessment_sections")
    .select("id")
    .eq("assessment_id", assessmentId);
  if (readError) throw new Error(readError.message);

  const existingIds = new Set((existing ?? []).map((s) => s.id));
  const keptIds = new Set(sections.map((s) => s.id).filter((id): id is string => Boolean(id && existingIds.has(id))));
  const removedIds = [...existingIds].filter((id) => !keptIds.has(id));

  if (removedIds.length) {
    const { error } = await supabase.from("assessment_sections").delete().in("id", removedIds);
    if (error) throw new Error(error.message);
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
      if (error) throw new Error(error.message);
      sectionId = s.id;
    } else {
      const { data: created, error } = await supabase.from("assessment_sections").insert(row).select("id").single();
      if (error || !created) throw new Error(error?.message ?? "Could not create section.");
      sectionId = created.id;
    }

    // The fixed question list is configuration only (nothing references it),
    // so replacing it is safe.
    const { error: clearError } = await supabase.from("assessment_questions").delete().eq("section_id", sectionId);
    if (clearError) throw new Error(clearError.message);
    if (s.sourceType === "fixed" && s.fixedQuestionIds?.length) {
      const rows = s.fixedQuestionIds.map((question_id, order_index) => ({ section_id: sectionId, question_id, order_index }));
      const { error: aqError } = await supabase.from("assessment_questions").insert(rows);
      if (aqError) throw new Error(aqError.message);
    }
  }
}

/**
 * Validates section changes before anything is written. Returns an error
 * message, or null if the save may proceed:
 *  - no structural change (sections/questions) while candidates are mid-exam
 *  - never remove a section whose questions were already served to someone
 */
async function checkSectionChanges(
  supabase: Supabase,
  assessmentId: string,
  sections: AssessmentFormInput["sections"]
): Promise<string | null> {
  const current = await loadStructure(supabase, assessmentId);
  const proposed: SectionStructure[] = sections.map((s) => ({
    id: s.id ?? "new",
    sourceType: s.sourceType,
    sourceCategoryId: s.sourceCategoryId,
    questionCount: s.questionCount,
    fixedQuestionIds: s.fixedQuestionIds ?? [],
  }));

  if (structureKey(current) !== structureKey(proposed)) {
    const inProgress = await countInProgress(supabase, assessmentId);
    if (inProgress > 0) {
      return `Close the assessment to edit questions. ${inProgress} candidate${inProgress === 1 ? " is" : "s are"} taking it right now.`;
    }
  }

  const keptIds = new Set(sections.map((s) => s.id).filter(Boolean));
  const removedIds = current.map((s) => s.id).filter((id) => !keptIds.has(id));
  if (removedIds.length) {
    const { count, error } = await supabase
      .from("attempt_questions")
      .select("id", { count: "exact", head: true })
      .in("section_id", removedIds);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) {
      return "A section you removed has already been served to candidates, so it can't be deleted. Close this assessment and create a new one instead.";
    }
  }
  return null;
}

async function countInProgress(supabase: Supabase, assessmentId: string) {
  const { count, error } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId)
    .eq("status", "in_progress");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function createAssessment(raw: AssessmentFormInput) {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  const input = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      title: input.title,
      slug: slugify(input.title),
      role_id: input.roleId,
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
      status: "draft",
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !assessment) return { error: error?.message ?? "Could not create assessment." };

  try {
    await writeSections(supabase, assessment.id, input.sections);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create sections." };
  }

  revalidatePath("/admin/assessments");
  redirect(`/admin/assessments/${assessment.id}`);
}

export async function updateAssessment(id: string, raw: AssessmentFormInput) {
  const parsed = assessmentSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  const input = parsed.data;

  const supabase = await createClient();

  // Validate first, so a rejected save changes nothing.
  try {
    const blocked = await checkSectionChanges(supabase, id, input.sections);
    if (blocked) return { error: blocked };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not check the assessment." };
  }

  const { error } = await supabase
    .from("assessments")
    .update({
      title: input.title,
      role_id: input.roleId,
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
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  try {
    await writeSections(supabase, id, input.sections);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update sections." };
  }

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { success: true };
}

export async function setAssessmentStatus(id: string, status: AssessmentStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("assessment_events").insert({ assessment_id: id, type: status === "live" ? "started" : status === "paused" ? "paused" : status === "ended" ? "submitted" : "started" });

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { success: true };
}

export async function deleteAssessment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/assessments");
  return { success: true };
}

export async function duplicateAssessment(id: string) {
  const supabase = await createClient();

  const { data: original } = await supabase.from("assessments").select("*").eq("id", id).single();
  if (!original) return { error: "Assessment not found." };

  const { data: sections } = await supabase
    .from("assessment_sections")
    .select("*")
    .eq("assessment_id", id)
    .order("order_index");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: copy, error } = await supabase
    .from("assessments")
    .insert({
      title: `${original.title} (Copy)`,
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
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !copy) return { error: error?.message ?? "Could not duplicate assessment." };

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
    if (sError || !newSection) continue;

    if (section.source_type === "fixed") {
      const { data: fixedQuestions } = await supabase
        .from("assessment_questions")
        .select("question_id, order_index")
        .eq("section_id", section.id);
      if (fixedQuestions?.length) {
        await supabase.from("assessment_questions").insert(
          fixedQuestions.map((q) => ({ section_id: newSection.id, question_id: q.question_id, order_index: q.order_index }))
        );
      }
    }
  }

  revalidatePath("/admin/assessments");
  return { success: true, id: copy.id };
}
