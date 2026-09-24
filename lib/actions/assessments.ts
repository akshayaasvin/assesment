"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AssessmentStatus } from "@/types/database";

const sectionSchema = z.object({
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

async function writeSections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assessmentId: string,
  sections: AssessmentFormInput["sections"]
) {
  await supabase.from("assessment_sections").delete().eq("assessment_id", assessmentId);

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const { data: section, error } = await supabase
      .from("assessment_sections")
      .insert({
        assessment_id: assessmentId,
        title: s.title,
        order_index: i,
        duration_minutes: s.durationMinutes,
        randomize_questions: s.randomizeQuestions,
        randomize_options: s.randomizeOptions,
        source_type: s.sourceType,
        source_category_id: s.sourceType === "random_pool" ? s.sourceCategoryId : null,
        question_count: s.sourceType === "fixed" ? (s.fixedQuestionIds?.length ?? 0) : s.questionCount,
      })
      .select("id")
      .single();
    if (error || !section) throw new Error(error?.message ?? "Could not create section.");

    if (s.sourceType === "fixed" && s.fixedQuestionIds?.length) {
      const rows = s.fixedQuestionIds.map((question_id, order_index) => ({
        section_id: section.id,
        question_id,
        order_index,
      }));
      const { error: aqError } = await supabase.from("assessment_questions").insert(rows);
      if (aqError) throw new Error(aqError.message);
    }
  }
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
