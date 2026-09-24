"use client";

import { cn } from "@/lib/utils";

interface Props {
  totalQuestions: number;
  currentIndex: number;
  isAnswered: (index: number) => boolean;
  isMarked: (index: number) => boolean;
  onJump: (index: number) => void;
}

export function QuestionNavigator({ totalQuestions, currentIndex, isAnswered, isMarked, onJump }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium text-foreground">Question Navigator</p>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-5">
        {Array.from({ length: totalQuestions }, (_, i) => {
          const answered = isAnswered(i);
          const marked = isMarked(i);
          const current = i === currentIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJump(i)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                current && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                marked
                  ? "border-warning/30 bg-warning/20 text-warning-foreground"
                  : answered
                    ? "border-success/30 bg-success/15 text-success"
                    : "border-border bg-muted text-muted-foreground"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <Legend swatch="bg-success/60" label="Answered" />
        <Legend swatch="bg-muted-foreground/30" label="Not answered" />
        <Legend swatch="bg-warning/60" label="Marked for review" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", swatch)} />
      {label}
    </div>
  );
}
