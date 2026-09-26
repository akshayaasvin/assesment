"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/browser";
import { postJson } from "@/lib/fetch-json";
import type { CandidateType } from "@/types/database";

const MAX_RESUME_BYTES = 1024 * 1024; // matches the 'resumes' bucket limit

interface Values {
  name: string;
  email: string;
  phone: string;
  college: string;
  degree: string;
  branch: string;
  graduationYear: string;
  candidateType: CandidateType | "";
  yearsExperience: string;
  currentCompany: string;
}

const EMPTY: Values = {
  name: "",
  email: "",
  phone: "",
  college: "",
  degree: "",
  branch: "",
  graduationYear: "",
  candidateType: "",
  yearsExperience: "",
  currentCompany: "",
};

/** Client-side checks mirror the server's (app/api/drive/[driveId]/register). */
export function validate(v: Values, resume: File | null, consent: boolean): string | null {
  const year = new Date().getFullYear();
  if (v.name.trim().length < 2) return "Enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return "Enter a valid email address.";
  if (!/^\+?[\d\s-]{10,16}$/.test(v.phone.trim()) || v.phone.replace(/\D/g, "").length < 10) return "Enter a valid phone number.";
  if (v.college.trim().length < 2) return "Enter your college.";
  if (v.degree.trim().length < 2) return "Enter your degree.";
  if (v.branch.trim().length < 2) return "Enter your branch.";
  const gy = Number(v.graduationYear);
  if (!Number.isInteger(gy) || gy < 1970 || gy > year + 6) return "Enter a valid graduation year.";
  if (!v.candidateType) return "Choose Fresher or Experienced.";
  if (v.candidateType === "experienced") {
    const ye = Number(v.yearsExperience);
    if (v.yearsExperience.trim() === "" || !Number.isFinite(ye) || ye < 0 || ye > 60) return "Enter your years of experience.";
  }
  if (resume) {
    if (resume.type !== "application/pdf") return "Resume must be a PDF.";
    if (resume.size > MAX_RESUME_BYTES) return "Resume must be 1 MB or smaller.";
  }
  if (!consent) return "Please accept the monitoring and data-use consent.";
  return null;
}

export function RegistrationForm({ driveId, driveName }: { driveId: string; driveName: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [resume, setResume] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const problem = validate(values, resume, consent);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      // Every candidate gets an anonymous Supabase identity; database rules
      // (RLS) scope everything they can reach to it.
      const supabase = createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously();
        if (signInError || !data.user) {
          setError("Could not start your session. Please try again in a moment.");
          return;
        }
        user = data.user;
      }

      let resumePath: string | null = null;
      if (resume) {
        resumePath = `${user.id}/resume-${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("resumes").upload(resumePath, resume, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (uploadError) {
          setError("Could not upload your resume. Remove it or try a smaller PDF.");
          return;
        }
      }

      const result = await postJson(`/api/drive/${driveId}/register`, {
        ...values,
        graduationYear: Number(values.graduationYear),
        yearsExperience: values.candidateType === "experienced" ? Number(values.yearsExperience) : null,
        currentCompany: values.currentCompany.trim() || null,
        resumePath,
        consent: true,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl border-border/70 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Register</CardTitle>
        <CardDescription>{driveName}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="name" label="Full name" value={values.name} onChange={(v) => set("name", v)} autoComplete="name" />
            <Field id="email" label="Email" type="email" value={values.email} onChange={(v) => set("email", v)} autoComplete="email" />
            <Field id="phone" label="Phone" type="tel" value={values.phone} onChange={(v) => set("phone", v)} autoComplete="tel" />
            <Field id="college" label="College" value={values.college} onChange={(v) => set("college", v)} />
            <Field id="degree" label="Degree" value={values.degree} onChange={(v) => set("degree", v)} placeholder="B.E., B.Tech, MCA..." />
            <Field id="branch" label="Branch" value={values.branch} onChange={(v) => set("branch", v)} placeholder="CSE, ECE..." />
            <Field
              id="graduationYear"
              label="Graduation year"
              type="number"
              value={values.graduationYear}
              onChange={(v) => set("graduationYear", v)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="candidateType">Candidate type</Label>
              <Select value={values.candidateType} onValueChange={(v) => set("candidateType", v as CandidateType)}>
                <SelectTrigger id="candidateType" className="w-full">
                  <SelectValue placeholder="Choose..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresher">Fresher</SelectItem>
                  <SelectItem value="experienced">Experienced</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {values.candidateType === "experienced" && (
              <>
                <Field
                  id="yearsExperience"
                  label="Years of experience"
                  type="number"
                  value={values.yearsExperience}
                  onChange={(v) => set("yearsExperience", v)}
                />
                <Field
                  id="currentCompany"
                  label="Current company (optional)"
                  value={values.currentCompany}
                  onChange={(v) => set("currentCompany", v)}
                />
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="resume">Resume (optional, PDF, max 1 MB)</Label>
              <Input id="resume" type="file" accept="application/pdf" onChange={(e) => setResume(e.target.files?.[0] ?? null)} />
            </div>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} className="mt-0.5" aria-label="Consent" />
            <span>
              I agree that my <strong>camera and microphone</strong> will be monitored during the assessment, that snapshots
              may be taken when unusual activity is detected, and that my registration details, answers and results will be
              used by the organizer for this hiring process. <span className="text-destructive">*</span>
            </span>
          </label>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Registering..." : "Register and continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
