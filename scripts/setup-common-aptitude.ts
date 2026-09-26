/**
 * One-time data setup for the campus drive flow (approved 2026-09-25):
 *  1. Create ONE shared "Common Aptitude Assessment" (draft, kind 'aptitude'),
 *     drawing from the "Aptitude" question category like the old per-role
 *     Aptitude sections did.
 *  2. Remove the "Aptitude" section from each role assessment, so candidates
 *     don't take aptitude twice.
 *
 * Dry run by default - prints what it would do. Pass --apply to write.
 * Refuses to remove a section that any attempt has already been served
 * questions from (attempt_questions), or while an attempt is in progress.
 *
 *   npx tsx scripts/setup-common-aptitude.ts           # dry run
 *   npx tsx scripts/setup-common-aptitude.ts --apply   # do it
 *
 * Targets LOCAL Supabase by default. Production only at cutover, on go:
 *   CONFIRM_PRODUCTION=ieqrugvsgjpidrrsqufn npx tsx scripts/setup-common-aptitude.ts --apply --production
 */
import { supabaseAdmin as s } from "./supabase-admin-client";

const APPLY = process.argv.includes("--apply");
const TITLE = "Common Aptitude Assessment";

function slug() {
  return `common-aptitude-${Math.random().toString(36).slice(2, 7)}`;
}

async function main() {
  console.log(`Project: ${process.env.NEXT_PUBLIC_SUPABASE_URL}  (${APPLY ? "APPLY" : "dry run"})\n`);

  const { data: category, error: catError } = await s.from("categories").select("id").eq("name", "Aptitude").maybeSingle();
  if (catError) throw catError;
  if (!category) throw new Error('No "Aptitude" question category found.');
  const { count: poolSize } = await s.from("questions").select("id", { count: "exact", head: true }).eq("category_id", category.id);

  // 1. Common aptitude assessment
  const { data: existing } = await s.from("assessments").select("id, status").eq("title", TITLE).maybeSingle();
  if (existing) {
    console.log(`= "${TITLE}" already exists (${existing.status}) - leaving it as is.`);
  } else {
    console.log(`+ Create "${TITLE}": draft, 1 section "Aptitude", 10 random questions from Aptitude (${poolSize} in pool), 20 min.`);
    if (APPLY) {
      const { data: created, error } = await s
        .from("assessments")
        .insert({ title: TITLE, slug: slug(), kind: "aptitude", status: "draft", description: "Shared first stage for every candidate." })
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error("insert failed");
      const { error: sError } = await s.from("assessment_sections").insert({
        assessment_id: created.id,
        title: "Aptitude",
        order_index: 0,
        duration_minutes: 20,
        source_type: "random_pool",
        source_category_id: category.id,
        question_count: Math.min(10, poolSize ?? 10),
      });
      if (sError) throw sError;
      console.log(`  created ${created.id}`);
    }
  }

  // 2. Remove per-role Aptitude sections
  const { data: sections, error: secError } = await s
    .from("assessment_sections")
    .select("id, title, order_index, assessment_id, assessments!inner(title, kind)")
    .eq("title", "Aptitude")
    .eq("assessments.kind", "role");
  if (secError) throw secError;

  for (const section of sections ?? []) {
    const assessment = section.assessments as unknown as { title: string };
    const [{ count: served }, { count: live }] = await Promise.all([
      s.from("attempt_questions").select("id", { count: "exact", head: true }).eq("section_id", section.id),
      s.from("attempts").select("id", { count: "exact", head: true }).eq("assessment_id", section.assessment_id).eq("status", "in_progress"),
    ]);
    if ((served ?? 0) > 0 || (live ?? 0) > 0) {
      console.log(`! SKIP "${assessment.title}" Aptitude section: ${served} served questions, ${live} attempts in progress.`);
      continue;
    }
    console.log(`- Remove Aptitude section from "${assessment.title}" (no attempt has used it).`);
    if (APPLY) {
      const { error } = await s.from("assessment_sections").delete().eq("id", section.id);
      if (error) throw error;
      // Re-number the remaining sections so order_index stays 0-based.
      const { data: rest } = await s.from("assessment_sections").select("id").eq("assessment_id", section.assessment_id).order("order_index");
      for (const [i, r] of (rest ?? []).entries()) await s.from("assessment_sections").update({ order_index: i }).eq("id", r.id);
    }
  }
  if (!sections?.length) console.log("= No role assessment has an Aptitude section.");
  if (!APPLY) console.log("\nDry run only. Re-run with --apply to make these changes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
