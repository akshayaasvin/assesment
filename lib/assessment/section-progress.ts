import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

/**
 * Moves an attempt forward to `sectionIndex` and records when that section
 * started (an assessment_events 'section_advanced' row). Never moves
 * backwards, so a stale or tampered client can't reopen an earlier section.
 */
export async function advanceSection(
  admin: AdminClient,
  attempt: { id: string; assessment_id: string },
  sectionIndex: number
) {
  const { data: moved, error } = await admin
    .from("attempts")
    .update({ current_section_index: sectionIndex })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .lt("current_section_index", sectionIndex)
    .select("id");
  if (error) throw error;
  if (!moved?.length) return;

  const { error: eventError } = await admin.from("assessment_events").insert({
    attempt_id: attempt.id,
    assessment_id: attempt.assessment_id,
    type: "section_advanced",
    payload: { sectionIndex },
  });
  if (eventError) throw eventError;
}

/**
 * Seconds left in the attempt's current section, measured on the server so a
 * page refresh can't restart the section timer. The section's start time is
 * its 'section_advanced' event (or the attempt's started_at for section 0).
 * Attempts from before section events were recorded fall back to the latest
 * possible start: started_at plus the full duration of every earlier section.
 */
export async function sectionRemainingSeconds(
  admin: AdminClient,
  attempt: { id: string; started_at: string | null; current_section_index: number },
  sectionDurationsMinutes: number[]
): Promise<number | null> {
  const index = Math.min(attempt.current_section_index, sectionDurationsMinutes.length - 1);
  if (index < 0 || !attempt.started_at) return null;

  let sectionStart: number;
  if (index === 0) {
    sectionStart = new Date(attempt.started_at).getTime();
  } else {
    const { data: events, error } = await admin
      .from("assessment_events")
      .select("created_at, payload")
      .eq("attempt_id", attempt.id)
      .eq("type", "section_advanced")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const event = (events ?? []).find((e) => (e.payload as { sectionIndex?: number } | null)?.sectionIndex === index);
    sectionStart = event
      ? new Date(event.created_at).getTime()
      : new Date(attempt.started_at).getTime() + sectionDurationsMinutes.slice(0, index).reduce((s, m) => s + m, 0) * 60000;
  }

  const remaining = Math.round(sectionDurationsMinutes[index] * 60 - (Date.now() - sectionStart) / 1000);
  return Math.max(0, remaining);
}
