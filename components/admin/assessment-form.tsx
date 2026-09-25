"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAssessment, updateAssessment, type AssessmentFormInput } from "@/lib/actions/assessments";

interface SectionState {
  id?: string;
  title: string;
  durationMinutes: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  sourceType: "fixed" | "random_pool";
  sourceCategoryId: string | null;
  questionCount: number;
  fixedQuestionIds: string[];
}

function emptySection(): SectionState {
  return {
    title: "New Section",
    durationMinutes: 20,
    randomizeQuestions: true,
    randomizeOptions: true,
    sourceType: "random_pool",
    sourceCategoryId: null,
    questionCount: 10,
    fixedQuestionIds: [],
  };
}

export function AssessmentForm({
  roles,
  categories,
  questions,
  initial,
  assessmentId,
}: {
  roles: { id: string; label: string }[];
  categories: { id: string; name: string }[];
  questions: { id: string; text: string; category_id: string | null }[];
  initial?: {
    title: string;
    description: string | null;
    kind: "aptitude" | "role";
    roleId: string | null;
    startAt: string | null;
    endAt: string | null;
    maxWarnings: number;
    passingPercentage: number;
    cameraRequired: boolean;
    micRequired: boolean;
    fullscreenRequired: boolean;
    tabSwitchMonitoring: boolean;
    copyPasteBlock: boolean;
    autoSubmit: boolean;
    resultVisibleToCandidate: boolean;
    sections: SectionState[];
  };
  assessmentId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Stays true after a successful create while we navigate away, so a second
  // click can't insert a duplicate assessment.
  const [created, setCreated] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<"aptitude" | "role">(initial?.kind ?? "role");
  const [roleId, setRoleId] = useState(initial?.roleId ?? "");
  const [startAt, setStartAt] = useState(initial?.startAt?.slice(0, 16) ?? "");
  const [endAt, setEndAt] = useState(initial?.endAt?.slice(0, 16) ?? "");
  const [maxWarnings, setMaxWarnings] = useState(initial?.maxWarnings ?? 4);
  const [passingPercentage, setPassingPercentage] = useState(initial?.passingPercentage ?? 40);
  const [cameraRequired, setCameraRequired] = useState(initial?.cameraRequired ?? true);
  const [micRequired, setMicRequired] = useState(initial?.micRequired ?? true);
  const [fullscreenRequired, setFullscreenRequired] = useState(initial?.fullscreenRequired ?? true);
  const [tabSwitchMonitoring, setTabSwitchMonitoring] = useState(initial?.tabSwitchMonitoring ?? true);
  const [copyPasteBlock, setCopyPasteBlock] = useState(initial?.copyPasteBlock ?? true);
  const [autoSubmit, setAutoSubmit] = useState(initial?.autoSubmit ?? true);
  const [resultVisibleToCandidate, setResultVisibleToCandidate] = useState(initial?.resultVisibleToCandidate ?? false);
  const [sections, setSections] = useState<SectionState[]>(initial?.sections?.length ? initial.sections : [emptySection()]);

  function updateSection(index: number, patch: Partial<SectionState>) {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function validate(): string | null {
    if (!title.trim()) return "Give the assessment a title.";
    if (kind === "role" && !roleId) return "Choose the role this assessment is for (or set its type to Aptitude).";
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) return "End time must be after the start time.";
    for (const s of sections) {
      if (!s.title.trim()) return "Every section needs a title.";
      if (!(s.durationMinutes >= 1)) return `"${s.title}": duration must be at least 1 minute.`;
      if (s.sourceType === "fixed" && s.fixedQuestionIds.length === 0) return `"${s.title}": pick at least one question.`;
      if (s.sourceType === "random_pool" && !(s.questionCount >= 1)) return `"${s.title}": number of questions must be at least 1.`;
    }
    return null;
  }

  function handleSubmit() {
    if (isPending || created) return;
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const input: AssessmentFormInput = {
      title,
      description: description.trim() || null,
      kind,
      roleId: kind === "role" ? roleId || null : null,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
      maxWarnings,
      passingPercentage,
      cameraRequired,
      micRequired,
      fullscreenRequired,
      tabSwitchMonitoring,
      copyPasteBlock,
      autoSubmit,
      resultVisibleToCandidate,
      sections,
    };

    startTransition(async () => {
      try {
        const result = assessmentId ? await updateAssessment(assessmentId, input) : await createAssessment(input);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        if (assessmentId) {
          toast.success("Changes saved.");
          router.refresh();
        } else {
          setCreated(true);
          toast.success("Assessment created.");
          router.push(`/admin/assessments/${result.id}`);
        }
      } catch (e) {
        // Network failure or an invalid server response - never report success.
        console.error(e);
        toast.error(assessmentId ? "Unable to save changes." : "Unable to create assessment. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Full Stack Developer Assessment" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description (shown to candidates)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this assessment covers and what candidates should expect."
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as "aptitude" | "role")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aptitude">Aptitude (first step for every candidate)</SelectItem>
                <SelectItem value="role">Role assessment (eligible candidates of one role)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {kind === "aptitude"
                ? "Candidates scoring at or above the passing percentage become eligible for role assessments."
                : "Shown only to candidates who passed Aptitude and selected this role, once it's live."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={kind === "aptitude" ? "" : roleId} onValueChange={setRoleId} disabled={kind === "aptitude"}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={kind === "aptitude" ? "All candidates" : "Choose a role"} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Passing percentage</Label>
            <Input type="number" min={0} max={100} value={passingPercentage} onChange={(e) => setPassingPercentage(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Start date &amp; time</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End date &amp; time</Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Maximum warnings before disqualification</Label>
            <Input type="number" min={1} value={maxWarnings} onChange={(e) => setMaxWarnings(Number(e.target.value))} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">Proctoring rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ToggleRow label="Camera required" checked={cameraRequired} onChange={setCameraRequired} />
          <ToggleRow label="Microphone required" checked={micRequired} onChange={setMicRequired} />
          <ToggleRow label="Fullscreen required" checked={fullscreenRequired} onChange={setFullscreenRequired} />
          <ToggleRow label="Tab-switch monitoring" checked={tabSwitchMonitoring} onChange={setTabSwitchMonitoring} />
          <ToggleRow label="Block copy / paste / right-click" checked={copyPasteBlock} onChange={setCopyPasteBlock} />
          <ToggleRow label="Auto-submit when time expires" checked={autoSubmit} onChange={setAutoSubmit} />
          <ToggleRow label="Show result to candidate after submit" checked={resultVisibleToCandidate} onChange={setResultVisibleToCandidate} />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sections</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setSections((prev) => [...prev, emptySection()])}>
            <Plus className="h-4 w-4" /> Add section
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {sections.map((section, i) => (
            <SectionEditor
              key={i}
              section={section}
              categories={categories}
              questions={questions}
              onChange={(patch) => updateSection(i, patch)}
              onRemove={sections.length > 1 ? () => setSections((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
            />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={isPending || created} size="lg">
          {created ? "Saved" : isPending ? "Saving..." : assessmentId ? "Save changes" : "Create assessment"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
      <Label className="font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SectionEditor({
  section,
  categories,
  questions,
  onChange,
  onRemove,
}: {
  section: SectionState;
  categories: { id: string; name: string }[];
  questions: { id: string; text: string; category_id: string | null }[];
  onChange: (patch: Partial<SectionState>) => void;
  onRemove?: () => void;
}) {
  const [search, setSearch] = useState("");

  const filteredQuestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return questions;
    return questions.filter((q) => q.text.toLowerCase().includes(term));
  }, [questions, search]);

  function toggleQuestion(id: string) {
    const next = section.fixedQuestionIds.includes(id)
      ? section.fixedQuestionIds.filter((q) => q !== id)
      : [...section.fixedQuestionIds, id];
    onChange({ fixedQuestionIds: next });
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Section title</Label>
          <Input value={section.title} onChange={(e) => onChange({ title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={section.durationMinutes}
            onChange={(e) => onChange({ durationMinutes: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={section.sourceType} onValueChange={(v) => onChange({ sourceType: v as SectionState["sourceType"] })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="random_pool">Random from category</SelectItem>
              <SelectItem value="fixed">Fixed question list</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={section.randomizeQuestions} onCheckedChange={(v) => onChange({ randomizeQuestions: Boolean(v) })} />
          Randomize question order
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={section.randomizeOptions} onCheckedChange={(v) => onChange({ randomizeOptions: Boolean(v) })} />
          Randomize option order
        </label>
      </div>

      <Separator className="my-4" />

      {section.sourceType === "random_pool" ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:max-w-md">
          <div className="space-y-1.5">
            <Label>Category to draw from</Label>
            <Select value={section.sourceCategoryId ?? ""} onValueChange={(v) => onChange({ sourceCategoryId: v || null })}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Any category" />
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
            <Label>Number of questions</Label>
            <Input
              type="number"
              min={1}
              value={section.questionCount}
              onChange={(e) => onChange({ questionCount: Number(e.target.value) })}
            />
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label>Pick questions ({section.fixedQuestionIds.length} selected)</Label>
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-sm" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {filteredQuestions.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No questions match.</p>
            ) : (
              filteredQuestions.map((q) => (
                <label key={q.id} className="flex cursor-pointer items-start gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-0 hover:bg-accent/40">
                  <Checkbox
                    className="mt-0.5"
                    checked={section.fixedQuestionIds.includes(q.id)}
                    onCheckedChange={() => toggleQuestion(q.id)}
                  />
                  <span className="line-clamp-2">{q.text}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}

      {onRemove && (
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Remove section
          </Button>
        </div>
      )}
    </div>
  );
}
