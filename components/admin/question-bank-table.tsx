"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { QuestionDialog } from "@/components/admin/question-dialog";
import { bulkDeleteQuestions, deleteQuestion } from "@/lib/actions/questions";
import type { Difficulty } from "@/types/database";

interface QuestionRow {
  id: string;
  text: string;
  difficulty: Difficulty;
  marks: number;
  category_id: string | null;
  categories: { name: string } | null;
  question_options: { id: string; text: string; is_correct: boolean; order_index: number }[];
}

const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  easy: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  hard: "bg-destructive/10 text-destructive border-destructive/30",
};

export function QuestionBankTable({
  questions,
  categories,
}: {
  questions: QuestionRow[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const allSelected = questions.length > 0 && selected.size === questions.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-accent/40 px-4 py-2.5 mb-3">
          <p className="text-sm font-medium">{selected.size} selected</p>
          <ConfirmAction
            trigger={
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4" /> Delete selected
              </Button>
            }
            title="Delete selected questions?"
            description={`${selected.size} question(s) will be permanently removed from the question bank.`}
            confirmLabel="Delete"
            pendingLabel="Deleting..."
            successMessage="Questions deleted."
            errorMessage="Unable to delete questions."
            destructive
            onConfirm={async () => {
              const result = await bulkDeleteQuestions([...selected]);
              if (!result?.error) {
                setSelected(new Set());
                router.refresh();
              }
              return result;
            }}
          />
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
            </TableHead>
            <TableHead>Question</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead>Marks</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((q) => (
            <TableRow key={q.id} data-state={selected.has(q.id) ? "selected" : undefined}>
              <TableCell>
                <Checkbox checked={selected.has(q.id)} onCheckedChange={() => toggleOne(q.id)} />
              </TableCell>
              <TableCell className="max-w-md">
                <p className="line-clamp-2 text-sm">{q.text}</p>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{q.categories?.name ?? "Uncategorized"}</TableCell>
              <TableCell>
                <Badge variant="outline" className={DIFFICULTY_STYLE[q.difficulty]}>
                  {q.difficulty}
                </Badge>
              </TableCell>
              <TableCell>{q.marks}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <QuestionDialog
                    categories={categories}
                    question={q}
                    trigger={
                      <Button variant="ghost" size="icon">
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <ConfirmAction
                    trigger={
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                    title="Delete this question?"
                    description="It is removed from the question bank and from any fixed-question assessment section. This cannot be undone."
                    confirmLabel="Delete"
                    pendingLabel="Deleting..."
                    successMessage="Question deleted."
                    errorMessage="Unable to delete question."
                    destructive
                    onConfirm={() =>
                      deleteQuestion(q.id).then((result) => {
                        if (!result?.error) startTransition(() => router.refresh());
                        return result;
                      })
                    }
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
