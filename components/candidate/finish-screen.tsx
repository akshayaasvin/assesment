"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function FinishScreen({
  disqualified,
  resultVisible,
  score,
  totalMarks,
  percentage,
}: {
  disqualified: boolean;
  resultVisible: boolean;
  score?: number;
  totalMarks?: number;
  percentage?: number;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/70 text-center shadow-lg">
        <CardContent className="flex flex-col items-center gap-3 py-10">
          {disqualified ? (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-semibold text-destructive">You Are Disqualified</h1>
              <p className="text-sm text-muted-foreground">
                Your assessment was ended due to repeated proctoring violations.
              </p>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-12 w-12 text-success" />
              <h1 className="text-xl font-semibold text-foreground">Assessment Completed</h1>
              <p className="text-sm text-muted-foreground">Thank you for completing the assessment. We will get back to you shortly.</p>
              {resultVisible && typeof percentage === "number" && (
                <div className="mt-4 w-full rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-3xl font-semibold text-foreground">{percentage}%</p>
                  <p className="text-sm text-muted-foreground">
                    {score} / {totalMarks} marks
                  </p>
                </div>
              )}
            </>
          )}
          <p className="mt-4 text-xs font-medium uppercase tracking-wide text-primary">Assistlana</p>
        </CardContent>
      </Card>
    </div>
  );
}
