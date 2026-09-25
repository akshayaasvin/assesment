"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel = "Continue",
  pendingLabel = "Working...",
  successMessage,
  errorMessage = "Something went wrong. Please try again.",
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  pendingLabel?: string;
  /** Toasted only once onConfirm resolves without an error. */
  successMessage?: string;
  /** Shown if onConfirm throws (network failure, bad server response). */
  errorMessage?: string;
  destructive?: boolean;
  onConfirm: () => Promise<{ error?: string } | object | void>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={(e) => {
              e.preventDefault();
              startTransition(async () => {
                try {
                  const result = await onConfirm();
                  if (result && "error" in result && result.error) {
                    // Keep the dialog open so the admin can retry or cancel.
                    toast.error(result.error);
                    return;
                  }
                  if (successMessage) toast.success(successMessage);
                  setOpen(false);
                } catch (err) {
                  console.error(err);
                  toast.error(errorMessage);
                }
              });
            }}
          >
            {isPending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
