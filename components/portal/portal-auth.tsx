"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RegisterForm, type CandidateDetails } from "@/components/candidate/register-form";
import { postJson } from "@/lib/fetch-json";

/** Signed-out home page: register once, or log back in with email + phone. */
export function PortalAuth() {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");

  async function handleRegister(details: CandidateDetails): Promise<string | void> {
    const result = await postJson("/api/portal/register", details);
    if (!result.success) return result.error;
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
          A
        </div>
        <h1 className="text-xl font-semibold text-foreground">Assistlana Assessment Platform</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Register, take the Aptitude Assessment, then choose your role to take its assessment.
        </p>
      </div>

      {mode === "register" ? (
        <>
          <RegisterForm assessmentTitle="Candidate Registration" roleLabel={null} isOpen onSubmit={handleRegister} />
          <p className="text-sm text-muted-foreground">
            Already registered?{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("login")}>
              Log in
            </button>
          </p>
        </>
      ) : (
        <>
          <LoginForm onSignedIn={() => router.refresh()} />
          <p className="text-sm text-muted-foreground">
            New here?{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setMode("register")}>
              Register
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function LoginForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    const result = await postJson("/api/portal/login", { email, phone });
    if (!result.success) {
      setError(result.error);
      setLoading(false);
      return;
    }
    onSignedIn();
  }

  return (
    <Card className="w-full max-w-sm border-border/70 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Candidate Login</CardTitle>
        <CardDescription>Use the email and phone number you registered with.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-phone">Phone</Label>
            <Input id="login-phone" type="tel" required autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Log in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
