/**
 * Seeds categories, roles, MCQ questions (ported from the legacy static HTML app)
 * and one draft demo assessment per role. Requires Supabase keys in .env.local.
 *
 * Usage: npm run seed
 */
import { supabaseAdmin as supabase } from "./supabase-admin-client";
import { APTITUDE_QUESTIONS, ROLE_SEED_DATA, type SeedQuestion } from "./seed-data";

async function upsertCategory(name: string): Promise<string> {
  const { data, error } = await supabase.from("categories").upsert({ name }, { onConflict: "name" }).select("id").single();
  if (error || !data) throw new Error(`Category "${name}": ${error?.message}`);
  return data.id;
}

async function insertQuestions(categoryId: string, questions: SeedQuestion[]) {
  let inserted = 0;
  for (const q of questions) {
    const { data: question, error: qError } = await supabase
      .from("questions")
      .insert({ text: q.text, category_id: categoryId, difficulty: "medium", marks: 1 })
      .select("id")
      .single();
    if (qError || !question) {
      console.warn(`Skipped question "${q.text.slice(0, 40)}...": ${qError?.message}`);
      continue;
    }
    const options = q.options.map((text, i) => ({
      question_id: question.id,
      text,
      is_correct: i === q.correctIndex,
      order_index: i,
    }));
    const { error: oError } = await supabase.from("question_options").insert(options);
    if (oError) console.warn(`Options failed for "${q.text.slice(0, 40)}...": ${oError.message}`);
    else inserted += 1;
  }
  return inserted;
}

async function main() {
  console.log("Seeding categories and questions...");
  const aptitudeCategoryId = await upsertCategory("Aptitude");
  const aptitudeCount = await insertQuestions(aptitudeCategoryId, APTITUDE_QUESTIONS);
  console.log(`  Aptitude: ${aptitudeCount} questions`);

  for (const role of ROLE_SEED_DATA) {
    const categoryId = await upsertCategory(role.categoryName);
    const count = await insertQuestions(categoryId, role.questions);
    console.log(`  ${role.categoryName}: ${count} questions`);

    const { data: roleRow, error: roleError } = await supabase
      .from("roles")
      .upsert({ key: role.key, label: role.label }, { onConflict: "key" })
      .select("id")
      .single();
    if (roleError || !roleRow) {
      console.warn(`Role "${role.label}" failed: ${roleError?.message}`);
      continue;
    }

    const slug = `${role.key}-demo-${Math.random().toString(36).slice(2, 7)}`;
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .insert({ title: `${role.label} Assessment`, slug, role_id: roleRow.id, status: "draft" })
      .select("id")
      .single();
    if (assessmentError || !assessment) {
      console.warn(`Assessment for "${role.label}" failed: ${assessmentError?.message}`);
      continue;
    }

    await supabase.from("assessment_sections").insert([
      {
        assessment_id: assessment.id,
        title: "Aptitude",
        order_index: 0,
        duration_minutes: 20,
        source_type: "random_pool",
        source_category_id: aptitudeCategoryId,
        question_count: Math.min(10, APTITUDE_QUESTIONS.length),
      },
      {
        assessment_id: assessment.id,
        title: "Technical",
        order_index: 1,
        duration_minutes: 20,
        source_type: "random_pool",
        source_category_id: categoryId,
        question_count: Math.min(10, role.questions.length),
      },
    ]);
    console.log(`  Created draft assessment "${role.label} Assessment" (slug: ${slug})`);
  }

  console.log("Done. Publish assessments from the admin panel when you're ready (they start as Draft).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
