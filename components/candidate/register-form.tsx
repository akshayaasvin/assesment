"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export interface CandidateDetails {
  name: string;
  email: string;
  phone: string;
  college: string;
  district: string;
  department: string;
}

export function RegisterForm({
  assessmentTitle,
  roleLabel,
  isOpen,
  onSubmit,
}: {
  assessmentTitle: string;
  roleLabel: string | null;
  isOpen: boolean;
  onSubmit: (details: CandidateDetails) => Promise<string | void>;
}) {
  const [values, setValues] = useState<CandidateDetails>({
    name: "",
    email: "",
    phone: "",
    college: "",
    district: "",
    department: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof CandidateDetails>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (Object.values(values).some((v) => !v.trim())) {
      setError("Please fill in all fields.");
      return;
    }
    if (!agreed) {
      setError("Please read and accept the Terms & Conditions before proceeding.");
      return;
    }

    setLoading(true);
    const result = await onSubmit(values);
    setLoading(false);
    if (result) setError(result);
  }

  return (
    <Card className="w-full max-w-xl border-border/70 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">{assessmentTitle}</CardTitle>
        <CardDescription>{roleLabel ? `${roleLabel} · ` : ""}Assessment Registration</CardDescription>
      </CardHeader>
      <CardContent>
        {!isOpen ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This assessment is not open right now. Please check back during the scheduled window, or contact the
              organizer.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name" value={values.name} onChange={(v) => set("name", v)} />
              <Field label="Email" type="email" value={values.email} onChange={(v) => set("email", v)} />
              <Field label="Phone" type="tel" value={values.phone} onChange={(v) => set("phone", v)} />
              <Field label="College Name" value={values.college} onChange={(v) => set("college", v)} />
              <Field label="District" value={values.district} onChange={(v) => set("district", v)} />
              <Field label="Department" value={values.department} onChange={(v) => set("department", v)} />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Terms &amp; Conditions</p>
              <ul className="list-disc space-y-1.5 pl-4">
                <li>Your camera and microphone may be used for proctoring, if required for this assessment.</li>
                <li>The exam must be taken in fullscreen; exiting is recorded as a violation.</li>
                <li>Switching tabs or applications during the exam is not allowed.</li>
                <li>Copying, pasting and right-click are disabled throughout the assessment.</li>
                <li>Exceeding the allowed number of warnings results in automatic disqualification.</li>
                <li>Each section has its own timer and auto-submits when time runs out.</li>
                <li>This assessment can be attempted only once per email address.</li>
              </ul>
            </div>

            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(Boolean(v))} className="mt-0.5" />
              <span>
                I have read and agree to the Terms &amp; Conditions of this assessment.{" "}
                <span className="text-destructive">*</span>
              </span>
            </label>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Please wait..." : "Proceed to Register"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
