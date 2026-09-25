import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { AssessmentForm } from "@/components/admin/assessment-form";
import { AssessmentActionsMenu } from "@/components/admin/assessment-actions-menu";
import { AssessmentStatusBadge } from "@/components/shared/status-badge";
import { CopyLinkButton } from "@/components/admin/copy-link-button";
import { effectiveStatus } from "@/lib/assessment/scheduling";

export default async function EditAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: assessment }, { data: sections }, { data: roles }, { data: categories }, { data: questions }] =
    await Promise.all([
      supabase.from("assessments").select("*").eq("id", id).maybeSingle(),
      supabase.from("assessment_sections").select("*").eq("assessment_id", id).order("order_index"),
      supabase.from("roles").select("id, label").eq("is_active", true).order("label"),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("questions").select("id, text, category_id").order("created_at", { ascending: false }),
    ]);

  if (!assessment) notFound();

  const sectionsWithFixed = await Promise.all(
    (sections ?? []).map(async (s) => {
      let fixedQuestionIds: string[] = [];
      if (s.source_type === "fixed") {
        const { data } = await supabase
          .from("assessment_questions")
          .select("question_id")
          .eq("section_id", s.id)
          .order("order_index");
        fixedQuestionIds = (data ?? []).map((r) => r.question_id);
      }
      return {
        id: s.id,
        title: s.title,
        durationMinutes: s.duration_minutes,
        randomizeQuestions: s.randomize_questions,
        randomizeOptions: s.randomize_options,
        sourceType: s.source_type,
        sourceCategoryId: s.source_category_id,
        questionCount: s.question_count,
        fixedQuestionIds,
      };
    })
  );

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const candidateLink = `${appUrl}/a/${assessment.slug}`;

  return (
    <div>
      <PageHeader
        title={assessment.title}
        description="Edit sections, timing, proctoring rules and scheduling."
        actions={
          <>
            <AssessmentStatusBadge status={effectiveStatus(assessment)} />
            <CopyLinkButton link={candidateLink} />
            <AssessmentActionsMenu id={assessment.id} status={assessment.status} />
          </>
        }
      />
      <AssessmentForm
        // Remount after each save so form state picks up fresh DB values
        // (e.g. ids of newly created sections).
        key={assessment.updated_at}
        assessmentId={assessment.id}
        roles={roles ?? []}
        categories={categories ?? []}
        questions={questions ?? []}
        initial={{
          title: assessment.title,
          description: assessment.description,
          kind: assessment.kind,
          roleId: assessment.role_id,
          startAt: assessment.start_at,
          endAt: assessment.end_at,
          maxWarnings: assessment.max_warnings,
          passingPercentage: assessment.passing_percentage,
          cameraRequired: assessment.camera_required,
          micRequired: assessment.mic_required,
          fullscreenRequired: assessment.fullscreen_required,
          tabSwitchMonitoring: assessment.tab_switch_monitoring,
          copyPasteBlock: assessment.copy_paste_block,
          autoSubmit: assessment.auto_submit,
          resultVisibleToCandidate: assessment.result_visible_to_candidate,
          sections: sectionsWithFixed,
        }}
      />
    </div>
  );
}
