import { redirect } from "next/navigation";

/**
 * Per-assessment links are retired: candidates start from the home page,
 * which lists every live drive. Old links (already shared) land there.
 */
export default function LegacyAssessmentLink() {
  redirect("/");
}
