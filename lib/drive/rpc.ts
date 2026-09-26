import type { SupabaseClient } from "@supabase/supabase-js";
import type { CandidateSyncResult, ProctorEventType } from "@/types/database";

export interface CandidateSyncArgs {
  p_answers: { questionId: string; optionId: string | null }[];
  p_events: { type: ProctorEventType; message?: string; meta?: Record<string, unknown> }[];
  p_section_index: number | null;
  p_since: string | null;
}

/**
 * Typed wrapper for the candidate_sync RPC (migration 0005). The Database type
 * can't declare Functions without breaking relationship inference, so the
 * argument/result types live here.
 */
export async function callCandidateSync(
  supabase: SupabaseClient,
  args: CandidateSyncArgs
): Promise<{ data: CandidateSyncResult | null; error: { message: string } | null }> {
  const { data, error } = await supabase.rpc("candidate_sync", args as unknown as Record<string, unknown>);
  return { data: (data as CandidateSyncResult | null) ?? null, error };
}
