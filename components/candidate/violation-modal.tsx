"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViolationModalState } from "@/hooks/use-violation-tracker";

export function ViolationModal({ modal, onAction }: { modal: ViolationModalState; onAction: () => void }) {
  if (!modal.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{modal.title}</h3>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{modal.message}</p>
        <Button className="mt-5 w-full" onClick={onAction}>
          {modal.actionLabel}
        </Button>
      </div>
    </div>
  );
}
