"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createQuestion, updateQuestion } from "@/lib/actions/questions";
import type { Difficulty } from "@/types/database";

interface QuestionRecord {
  id: string;
  text: string;
  category_id: string | null;
  difficulty: Difficulty;
  marks: number;
  question_options: { id: string; text: string; is_correct: boolean; order_index: number }[];
}

export function QuestionDialog({
  trigger,
  categories,
  question,
}: {
  trigger: ReactNode;
  categories: { id: string; name: string }[];
  question?: QuestionRecord;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const sortedOptions = question?.question_options?.slice().sort((a, b) => a.order_index - b.order_index) ?? [];
  const [options, setOptions] = useState<string[]>(sortedOptions.length ? sortedOptions.map((o) => o.text) : ["", ""]);
  const [correctIndex, setCorrectIndex] = useState(
    Math.max(0, sortedOptions.findIndex((o) => o.is_correct))
  );
  const [categoryId, setCategoryId] = useState(question?.category_id ?? "");
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? "medium");

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  function addOption() {
    if (options.length >= 6) return;
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setCorrectIndex((prev) => (prev === i ? 0 : prev > i ? prev - 1 : prev));
  }

  async function handleSubmit(formData: FormData) {
    const text = String(formData.get("text") ?? "").trim();
    const marks = Number(formData.get("marks") ?? 1);
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);

    if (cleanOptions.length < 2) {
      toast.error("Add at least two options.");
      return;
    }

    // correctIndex points into `options`; blank options are dropped above, so
    // re-map it onto the cleaned list.
    const correctText = options[correctIndex]?.trim();
    const cleanCorrectIndex = correctText ? cleanOptions.indexOf(correctText) : -1;
    if (cleanCorrectIndex < 0) {
      toast.error("Select the correct option.");
      return;
    }
    if (!text) {
      toast.error("Write the question text.");
      return;
    }
    if (pending) return;

    setPending(true);
    const input = {
      text,
      categoryId: categoryId || null,
      difficulty,
      marks,
      options: cleanOptions,
      correctIndex: cleanCorrectIndex,
    };
    try {
      const result = question ? await updateQuestion(question.id, input) : await createQuestion(input);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(question ? "Question updated." : "Question added.");
      setOpen(false);
      if (!question) {
        // Fresh form for the next "Add question".
        setOptions(["", ""]);
        setCorrectIndex(0);
      }
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error(question ? "Unable to save question." : "Unable to create question. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
            <DialogDescription>Select the correct option with the radio button on the left.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="text">Question</Label>
              <Textarea id="text" name="text" defaultValue={question?.text} required placeholder="Write the question" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="marks">Marks</Label>
              <Input id="marks" name="marks" type="number" min={0.5} step={0.5} defaultValue={question?.marks ?? 1} className="w-28" />
            </div>

            <div className="space-y-2">
              <Label>Options</Label>
              <RadioGroup value={String(correctIndex)} onValueChange={(v) => setCorrectIndex(Number(v))}>
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <RadioGroupItem value={String(i)} id={`opt-${i}`} />
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={options.length <= 2}
                      onClick={() => removeOption(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </RadioGroup>
              <Button type="button" variant="outline" size="sm" onClick={addOption} disabled={options.length >= 6}>
                <Plus className="h-4 w-4" /> Add option
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
