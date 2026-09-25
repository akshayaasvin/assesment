import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { AssessmentForm } from "@/components/admin/assessment-form";

export default async function NewAssessmentPage() {
  const supabase = await createClient();
  const [{ data: roles }, { data: categories }, { data: questions }, { data: defaults }] = await Promise.all([
    supabase.from("roles").select("id, label").eq("is_active", true).order("label"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("questions").select("id, text, category_id").order("created_at", { ascending: false }),
    supabase.from("default_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  return (
    <div>
      <PageHeader title="New assessment" description="Configure sections, timing, rules and scheduling." />
      <AssessmentForm
        roles={roles ?? []}
        categories={categories ?? []}
        questions={questions ?? []}
        // Pre-fill proctoring rules from Settings -> Default settings.
        initial={
          defaults
            ? {
                title: "",
                description: null,
                kind: "role",
                roleId: null,
                startAt: null,
                endAt: null,
                passingPercentage: 40,
                maxWarnings: defaults.max_warnings,
                cameraRequired: defaults.camera_required,
                micRequired: defaults.mic_required,
                fullscreenRequired: defaults.fullscreen_required,
                tabSwitchMonitoring: defaults.tab_switch_monitoring,
                copyPasteBlock: defaults.copy_paste_block,
                autoSubmit: defaults.auto_submit,
                resultVisibleToCandidate: defaults.result_visible_to_candidate,
                sections: [],
              }
            : undefined
        }
      />
    </div>
  );
}
