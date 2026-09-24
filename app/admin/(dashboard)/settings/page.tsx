import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { DefaultSettingsForm } from "@/components/admin/default-settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("default_settings").select("*").eq("id", 1).single();

  return (
    <div>
      <PageHeader title="Settings" description="Platform-wide defaults for new assessments." />
      <DefaultSettingsForm
        initial={{
          maxWarnings: settings?.max_warnings ?? 4,
          cameraRequired: settings?.camera_required ?? true,
          micRequired: settings?.mic_required ?? true,
          fullscreenRequired: settings?.fullscreen_required ?? true,
          tabSwitchMonitoring: settings?.tab_switch_monitoring ?? true,
          copyPasteBlock: settings?.copy_paste_block ?? true,
          autoSubmit: settings?.auto_submit ?? true,
          resultVisibleToCandidate: settings?.result_visible_to_candidate ?? false,
        }}
      />
    </div>
  );
}
