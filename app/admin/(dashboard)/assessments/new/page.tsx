import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { AssessmentForm } from "@/components/admin/assessment-form";

export default async function NewAssessmentPage() {
  const supabase = await createClient();
  const [{ data: roles }, { data: categories }, { data: questions }] = await Promise.all([
    supabase.from("roles").select("id, label").eq("is_active", true).order("label"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("questions").select("id, text, category_id").order("created_at", { ascending: false }),
  ]);

  return (
    <div>
      <PageHeader title="New assessment" description="Configure sections, timing, rules and scheduling." />
      <AssessmentForm roles={roles ?? []} categories={categories ?? []} questions={questions ?? []} />
    </div>
  );
}
