import { UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { CandidatesTable } from "@/components/admin/candidates-table";
import type { AttemptStatus } from "@/types/database";

interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  college: string | null;
  district: string | null;
  department: string | null;
  attempts: { status: AttemptStatus; percentage: number; assessments: { title: string } | null }[];
}

export default async function CandidatesPage() {
  const supabase = await createClient();
  const { data: candidates } = (await supabase
    .from("candidates")
    .select("id, name, email, phone, college, district, department, attempts(status, percentage, assessments(title))")
    .order("created_at", { ascending: false })) as { data: CandidateRow[] | null };

  return (
    <div>
      <PageHeader title="Candidates" description="Everyone who has registered for an assessment." />

      <Card className="border-border/70">
        <CardContent className="p-0">
          {!candidates?.length ? (
            <div className="p-6">
              <EmptyState icon={UserRound} title="No candidates yet" description="Candidates appear here as soon as they register for an assessment." />
            </div>
          ) : (
            <CandidatesTable
              rows={candidates.map((c) => ({
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                college: c.college,
                district: c.district,
                attempts: (c.attempts ?? []).map((a) => ({ status: a.status, percentage: a.percentage, title: a.assessments?.title ?? "—" })),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
