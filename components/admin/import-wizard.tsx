"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileWarning, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseQuestionsCsv, parseQuestionsJson } from "@/lib/import/parse-questions";
import { bulkImportQuestions, type ImportRow } from "@/lib/actions/questions";

interface PreviewRow extends ImportRow {
  include: boolean;
}

export function ImportWizard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(file: File) {
    const text = await file.text();
    const isJson = file.name.toLowerCase().endsWith(".json");
    const result = isJson ? parseQuestionsJson(text) : parseQuestionsCsv(text);
    setFileName(file.name);
    setRows(result.rows.map((r) => ({ ...r, include: true })));
    setErrors(result.errors);
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function handleImport() {
    const toImport = rows.filter((r) => r.include);
    if (toImport.length === 0) {
      toast.error("Select at least one question to import.");
      return;
    }
    startTransition(async () => {
      const result = await bulkImportQuestions(toImport);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Imported ${result.imported} question(s).${result.skipped ? ` ${result.skipped} skipped.` : ""}`);
      setRows([]);
      setErrors([]);
      setFileName(null);
      router.push("/admin/question-bank");
    });
  }

  if (rows.length === 0) {
    return (
      <Card className="border-dashed border-2 border-border/80">
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="font-medium">Upload a CSV or JSON question file</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              CSV columns: question, option1..option6 (or optionA..optionF), correct (letter, number, or exact text),
              category, difficulty, marks. JSON: an array of {"{"}text, options[], correctIndex, category, difficulty, marks{"}"}.
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()}>Choose file</Button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          {errors.length > 0 && (
            <Alert variant="destructive" className="mt-4 text-left">
              <FileWarning className="h-4 w-4" />
              <AlertTitle>Could not read this file</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{fileName}</p>
          <p className="text-sm text-muted-foreground">
            {rows.filter((r) => r.include).length} of {rows.length} questions will be imported.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setRows([]); setErrors([]); setFileName(null); }}>
            Start over
          </Button>
          <Button onClick={handleImport} disabled={isPending}>
            <CheckCircle2 className="h-4 w-4" /> {isPending ? "Importing..." : "Import questions"}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>{errors.length} row(s) were skipped while parsing</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="border-border/70">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[220px]">Question</TableHead>
                <TableHead>Options (correct in bold)</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Difficulty</TableHead>
                <TableHead>Marks</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} className={!row.include ? "opacity-50" : undefined}>
                  <TableCell>
                    <Checkbox checked={row.include} onCheckedChange={(v) => updateRow(i, { include: Boolean(v) })} />
                  </TableCell>
                  <TableCell>
                    <Textarea
                      value={row.text}
                      onChange={(e) => updateRow(i, { text: e.target.value })}
                      className="min-h-[60px] text-sm"
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <ul className="space-y-0.5">
                      {row.options.map((opt, oi) => (
                        <li key={oi} className={oi === row.correctIndex ? "font-semibold text-success" : ""}>
                          {opt}
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.categoryName ?? ""}
                      onChange={(e) => updateRow(i, { categoryName: e.target.value || null })}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={row.difficulty} onValueChange={(v) => updateRow(i, { difficulty: v as ImportRow["difficulty"] })}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={row.marks}
                      onChange={(e) => updateRow(i, { marks: Number(e.target.value) || 1 })}
                      className="w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
