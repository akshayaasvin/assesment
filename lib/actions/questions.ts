"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NOT_FOUND_OR_FORBIDDEN, toUserError } from "@/lib/db-errors";
import type { createClient } from "@/lib/supabase/server";
import type { Difficulty } from "@/types/database";

const questionInputSchema = z.object({
  text: z.string().trim().min(1, "Write the question text."),
  categoryId: z.string().uuid().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  marks: z.coerce.number().min(0.5).default(1),
  options: z.array(z.string().trim().min(1)).min(2, "Add at least two options."),
  correctIndex: z.coerce.number().int().min(0),
}).refine((q) => q.correctIndex < q.options.length, { message: "Select the correct option." });

export type QuestionInput = z.infer<typeof questionInputSchema>;

export interface ImportRow {
  text: string;
  categoryName: string | null;
  difficulty: Difficulty;
  marks: number;
  options: string[];
  correctIndex: number;
}

async function insertQuestionWithOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: QuestionInput
) {
  const { data: question, error: qError } = await supabase
    .from("questions")
    .insert({
      text: input.text,
      category_id: input.categoryId,
      difficulty: input.difficulty,
      marks: input.marks,
    })
    .select("id")
    .single();
  if (qError || !question) throw qError ?? new Error("Question insert returned no row.");

  const optionRows = input.options.map((text, i) => ({
    question_id: question.id,
    text,
    is_correct: i === input.correctIndex,
    order_index: i,
  }));
  const { error: oError } = await supabase.from("question_options").insert(optionRows);
  if (oError) {
    // Don't leave a question with no options in the bank.
    await supabase.from("questions").delete().eq("id", question.id);
    throw oError;
  }

  return question.id;
}

type ActionResult = { success: true; id?: string; error?: undefined } | { success?: false; error: string };

export async function createQuestion(raw: unknown): Promise<ActionResult> {
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  let id: string;
  try {
    id = await insertQuestionWithOptions(auth.supabase, parsed.data);
  } catch (e) {
    return { error: toUserError(e as { code?: string; message: string }, "Unable to create question.") };
  }

  revalidatePath("/admin/question-bank");
  revalidatePath("/admin/assessments", "layout");
  return { success: true, id };
}

export async function updateQuestion(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };
  const input = parsed.data;

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const { data: updated, error: qError } = await supabase
    .from("questions")
    .update({
      text: input.text,
      category_id: input.categoryId,
      difficulty: input.difficulty,
      marks: input.marks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  if (qError) return { error: toUserError(qError, "Unable to save question.") };
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  // Update options in place (matched by position) so option ids stay stable -
  // candidate answers reference them via answers.selected_option_id.
  const { data: existing, error: readError } = await supabase
    .from("question_options")
    .select("id, order_index")
    .eq("question_id", id)
    .order("order_index");
  if (readError) return { error: toUserError(readError, "Unable to save question options.") };

  const existingOptions = existing ?? [];
  for (let i = 0; i < input.options.length; i++) {
    const row = { text: input.options[i], is_correct: i === input.correctIndex, order_index: i };
    const current = existingOptions[i];
    const { error } = current
      ? await supabase.from("question_options").update(row).eq("id", current.id)
      : await supabase.from("question_options").insert({ ...row, question_id: id });
    if (error) return { error: toUserError(error, "Unable to save question options.") };
  }
  const extraIds = existingOptions.slice(input.options.length).map((o) => o.id);
  if (extraIds.length) {
    const { error } = await supabase.from("question_options").delete().in("id", extraIds);
    if (error) return { error: toUserError(error, "Unable to save question options.") };
  }

  revalidatePath("/admin/question-bank");
  return { success: true, id };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  // Options and fixed-section links are removed by ON DELETE CASCADE.
  const { data: deleted, error } = await auth.supabase.from("questions").delete().eq("id", id).select("id");
  if (error) return { error: toUserError(error, "Unable to delete question.") };
  if (!deleted?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/question-bank");
  revalidatePath("/admin/assessments", "layout");
  return { success: true };
}

export async function bulkDeleteQuestions(ids: string[]): Promise<ActionResult> {
  if (ids.length === 0) return { success: true };
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { data: deleted, error } = await auth.supabase.from("questions").delete().in("id", ids).select("id");
  if (error) return { error: toUserError(error, "Unable to delete questions.") };
  if (!deleted?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/question-bank");
  revalidatePath("/admin/assessments", "layout");
  return { success: true };
}

/** Bulk import from the CSV/JSON preview screen - resolves category names to ids, creating new categories as needed. */
export async function bulkImportQuestions(rows: ImportRow[]) {
  if (rows.length === 0) return { error: "Nothing to import." };

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

  const categoryNames = [...new Set(rows.map((r) => r.categoryName).filter((n): n is string => Boolean(n)))];
  const categoryIdByName = new Map<string, string>();

  for (const name of categoryNames) {
    const { data, error } = await supabase
      .from("categories")
      .upsert({ name }, { onConflict: "name" })
      .select("id, name")
      .single();
    if (error || !data) return { error: toUserError(error, `Could not create category "${name}".`) };
    categoryIdByName.set(name, data.id);
  }

  let imported = 0;
  for (const row of rows) {
    try {
      await insertQuestionWithOptions(supabase, {
        text: row.text,
        categoryId: row.categoryName ? categoryIdByName.get(row.categoryName) ?? null : null,
        difficulty: row.difficulty,
        marks: row.marks,
        options: row.options,
        correctIndex: row.correctIndex,
      });
      imported += 1;
    } catch (e) {
      // Skip rows that fail to insert; report the shortfall to the admin.
      console.error("[admin] Skipped import row:", row.text.slice(0, 80), e);
    }
  }

  revalidatePath("/admin/question-bank");
  if (imported === 0) return { error: "Unable to import questions. None of the rows could be saved." };
  if (imported < rows.length) {
    return { success: true, imported, skipped: rows.length - imported };
  }
  return { success: true, imported, skipped: 0 };
}
