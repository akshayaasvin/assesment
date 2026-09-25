"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NOT_FOUND_OR_FORBIDDEN, toUserError } from "@/lib/db-errors";

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
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { data: updated, error } = await auth.supabase
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
    .eq("id", 1)
    .select("id");
  if (error) return { error: toUserError(error, "Unable to save settings.") };
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/settings");
  return { success: true };
}
