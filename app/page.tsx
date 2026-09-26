import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAssessmentOpen } from "@/lib/assessment/scheduling";
import type { AssessmentStatus } from "@/types/database";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose your role" };

interface LiveAssessmentRow {
  title: string;
  slug: string;
  status: AssessmentStatus;
  start_at: string | null;
  end_at: string | null;
  roles: { label: string } | null;
  assessment_sections: { duration_minutes: number; question_count: number }[];
}

/**
 * One link for everyone: lists every live assessment as a role card. Picking
 * one opens that assessment's normal registration (/a/<slug>), so the older
 * per-assessment links keep working too.
 */
export default async function Home() {
  let cards: { slug: string; role: string; title: string; questions: number; minutes: number }[] = [];
  let failed = false;
  try {
    const { data, error } = (await createAdminClient()
      .from("assessments")
      .select("title, slug, status, start_at, end_at, roles(label), assessment_sections(duration_minutes, question_count)")
      .in("status", ["live", "scheduled"])
      .order("title")) as { data: LiveAssessmentRow[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    cards = (data ?? []).filter(isAssessmentOpen).map((a) => ({
      slug: a.slug,
      role: a.roles?.label ?? a.title,
      title: a.title,
      questions: a.assessment_sections.reduce((t, s) => t + s.question_count, 0),
      minutes: a.assessment_sections.reduce((t, s) => t + s.duration_minutes, 0),
    }));
  } catch (e) {
    console.error("[home] could not load assessments:", e);
    failed = true;
  }

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-foreground">Choose your role</h1>
          <p className="text-sm text-muted-foreground">Pick the role you are applying for. You can take only one assessment.</p>
        </div>

        {failed || cards.length === 0 ? (
          <Card className="border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {failed ? "Could not load the assessments. Please refresh the page." : "No assessment is open right now."}
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3" aria-label="Open assessments">
            {cards.map((c) => (
              <li key={c.slug}>
                <Link href={`/a/${c.slug}`} className="block">
                  <Card className="border-border/70 transition-colors hover:border-primary/60">
                    <CardContent className="flex items-center justify-between gap-4 p-5">
                      <div className="min-w-0 space-y-1.5">
                        <p className="font-medium text-foreground">{c.role}</p>
                        {c.role !== c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <ListChecks className="h-4 w-4" /> {c.questions} questions
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4" /> {c.minutes} min
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
