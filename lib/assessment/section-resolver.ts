import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { shuffleArray } from "./shuffle";
import type { RuntimeOption, RuntimeQuestion, RuntimeSection } from "@/types/domain";

type AdminClient = SupabaseClient<Database>;
type SectionRow = Database["public"]["Tables"]["assessment_sections"]["Row"];

/**
 * Returns the ordered question ids for this attempt's section, creating and
 * persisting the snapshot on first access (see attempt_questions in the
 * migration). Every later call for the same attempt+section returns the same
 * set, which is what makes a random_pool section survive a refresh.
 */
async function getOrCreateAttemptQuestionIds(
  admin: AdminClient,
  attemptId: string,
  section: SectionRow
): Promise<string[]> {
  const { data: existing, error: existingError } = await admin
    .from("attempt_questions")
    .select("question_id, order_index")
    .eq("attempt_id", attemptId)
    .eq("section_id", section.id)
    .order("order_index", { ascending: true });

  if (existingError) throw existingError;
  if (existing && existing.length > 0) return existing.map((row) => row.question_id);

  let questionIds: string[];

  if (section.source_type === "fixed") {
    const { data, error } = await admin
      .from("assessment_questions")
      .select("question_id, order_index")
      .eq("section_id", section.id)
      .order("order_index", { ascending: true });
    if (error) throw error;
    questionIds = (data ?? []).map((row) => row.question_id);
  } else {
    let query = admin.from("questions").select("id");
    if (section.source_category_id) query = query.eq("category_id", section.source_category_id);
    const { data, error } = await query;
    if (error) throw error;
    const pool = (data ?? []).map((row) => row.id);
    questionIds = shuffleArray(pool).slice(0, section.question_count);
  }

  if (section.randomize_questions) questionIds = shuffleArray(questionIds);

  if (questionIds.length === 0) return [];

  const rows = questionIds.map((question_id, order_index) => ({
    attempt_id: attemptId,
    section_id: section.id,
    question_id,
    order_index,
  }));
  const { error: insertError } = await admin.from("attempt_questions").insert(rows);
  if (insertError) throw insertError;

  return questionIds;
}

/**
 * Builds the candidate-safe payload for a section: question text, marks and
 * option text/id only - is_correct never leaves this function.
 */
export async function buildRuntimeSection(
  admin: AdminClient,
  attemptId: string,
  section: SectionRow
): Promise<RuntimeSection> {
  const questionIds = await getOrCreateAttemptQuestionIds(admin, attemptId, section);
  if (questionIds.length === 0) {
    return {
      id: section.id,
      title: section.title,
      orderIndex: section.order_index,
      durationMinutes: section.duration_minutes,
      questions: [],
    };
  }

  const [{ data: questions, error: qError }, { data: options, error: oError }] = await Promise.all([
    admin.from("questions").select("id, text, marks").in("id", questionIds),
    admin
      .from("question_options")
      .select("id, question_id, text, order_index")
      .in("question_id", questionIds)
      .order("order_index", { ascending: true }),
  ]);
  if (qError) throw qError;
  if (oError) throw oError;

  const optionsByQuestion = new Map<string, RuntimeOption[]>();
  for (const opt of options ?? []) {
    const list = optionsByQuestion.get(opt.question_id) ?? [];
    list.push({ id: opt.id, text: opt.text });
    optionsByQuestion.set(opt.question_id, list);
  }

  const questionsById = new Map((questions ?? []).map((q) => [q.id, q]));

  const runtimeQuestions: RuntimeQuestion[] = questionIds
    .map((id) => questionsById.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const opts = optionsByQuestion.get(q.id) ?? [];
      return {
        id: q.id,
        text: q.text,
        marks: q.marks,
        options: section.randomize_options ? shuffleArray(opts) : opts,
      };
    });

  return {
    id: section.id,
    title: section.title,
    orderIndex: section.order_index,
    durationMinutes: section.duration_minutes,
    questions: runtimeQuestions,
  };
}
