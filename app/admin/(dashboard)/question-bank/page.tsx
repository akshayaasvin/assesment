import Link from "next/link";
import { Plus, UploadCloud, Database } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { QuestionBankTable } from "@/components/admin/question-bank-table";

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const supabase = await createClient();

  const { data: categories } = await supabase.from("categories").select("id, name").order("name");

  let query = supabase
    .from("questions")
    .select("id, text, difficulty, marks, category_id, categories(name), question_options(id, text, is_correct, order_index)")
    .order("created_at", { ascending: false });
  if (category) query = query.eq("category_id", category);

  const { data: questions } = await query;

  return (
    <div>
      <PageHeader
        title="Question Bank"
        description="Manage MCQ questions by category, difficulty and marks."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/question-bank/import">
                <UploadCloud className="h-4 w-4" /> Bulk import
              </Link>
            </Button>
            <QuestionDialog
              categories={categories ?? []}
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> Add question
                </Button>
              }
            />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant={!category ? "default" : "outline"} size="sm" asChild>
          <Link href="/admin/question-bank">All categories</Link>
        </Button>
        {(categories ?? []).map((c) => (
          <Button key={c.id} variant={category === c.id ? "default" : "outline"} size="sm" asChild>
            <Link href={`/admin/question-bank?category=${c.id}`}>{c.name}</Link>
          </Button>
        ))}
      </div>

      <Card className="border-border/70">
        <CardContent className="p-4">
          {!questions?.length ? (
            <EmptyState
              icon={Database}
              title="No questions yet"
              description="Add questions manually, or bulk-import a CSV/JSON file of questions."
            />
          ) : (
            <QuestionBankTable questions={questions} categories={categories ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
