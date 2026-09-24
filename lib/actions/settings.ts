"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface DefaultSettingsInput {
  maxWarnings: number;
  cameraRequired: boolean;
  micRequired: boolean;
  fullscreenRequired: boolean;
  tabSwitchMonitoring: boolean;
  copyPasteBlock: boolean;
  autoSubmit: boolean;
  resultVisibleToCandidate: boolean;
}

export async function updateDefaultSettings(input: DefaultSettingsInput) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("default_settings")
    .update({
      max_warnings: input.maxWarnings,
      camera_required: input.cameraRequired,
      mic_required: input.micRequired,
      fullscreen_required: input.fullscreenRequired,
      tab_switch_monitoring: input.tabSwitchMonitoring,
      copy_paste_block: input.copyPasteBlock,
      auto_submit: input.autoSubmit,
      result_visible_to_candidate: input.resultVisibleToCandidate,
    })
    .eq("id", 1);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { success: true };
}
