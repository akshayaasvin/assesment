"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Difficulty } from "@/types/database";

const questionInputSchema = z.object({
  text: z.string().trim().min(1),
  categoryId: z.string().uuid().nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  marks: z.coerce.number().min(0.5).default(1),
  options: z.array(z.string().trim().min(1)).min(2, "Add at least two options."),
  correctIndex: z.coerce.number().int().min(0),
});

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
  if (qError || !question) throw new Error(qError?.message ?? "Could not create question.");

  const optionRows = input.options.map((text, i) => ({
    question_id: question.id,
    text,
    is_correct: i === input.correctIndex,
    order_index: i,
  }));
  const { error: oError } = await supabase.from("question_options").insert(optionRows);
  if (oError) throw new Error(oError.message);

  return question.id;
}

export async function createQuestion(raw: unknown) {
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };

  const supabase = await createClient();
  try {
    await insertQuestionWithOptions(supabase, parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create question." };
  }

  revalidatePath("/admin/question-bank");
  return { success: true };
}

export async function updateQuestion(id: string, raw: unknown) {
  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid question." };
  const input = parsed.data;

  const supabase = await createClient();
  const { error: qError } = await supabase
    .from("questions")
    .update({
      text: input.text,
      category_id: input.categoryId,
      difficulty: input.difficulty,
      marks: input.marks,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (qError) return { error: qError.message };

  await supabase.from("question_options").delete().eq("question_id", id);
  const optionRows = input.options.map((text, i) => ({
    question_id: id,
    text,
    is_correct: i === input.correctIndex,
    order_index: i,
  }));
  const { error: oError } = await supabase.from("question_options").insert(optionRows);
  if (oError) return { error: oError.message };

  revalidatePath("/admin/question-bank");
  return { success: true };
}

export async function deleteQuestion(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/question-bank");
  return { success: true };
}

export async function bulkDeleteQuestions(ids: string[]) {
  if (ids.length === 0) return { success: true };
  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/admin/question-bank");
  return { success: true };
}

/** Bulk import from the CSV/JSON preview screen - resolves category names to ids, creating new categories as needed. */
export async function bulkImportQuestions(rows: ImportRow[]) {
  if (rows.length === 0) return { error: "Nothing to import." };

  const supabase = await createClient();

  const categoryNames = [...new Set(rows.map((r) => r.categoryName).filter((n): n is string => Boolean(n)))];
  const categoryIdByName = new Map<string, string>();

  for (const name of categoryNames) {
    const { data, error } = await supabase
      .from("categories")
      .upsert({ name }, { onConflict: "name" })
      .select("id, name")
      .single();
    if (error || !data) return { error: `Could not resolve category "${name}".` };
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
    } catch {
      // Skip rows that fail to insert; report the shortfall to the admin.
    }
  }

  revalidatePath("/admin/question-bank");
  if (imported < rows.length) {
    return { success: true, imported, skipped: rows.length - imported };
  }
  return { success: true, imported, skipped: 0 };
}
