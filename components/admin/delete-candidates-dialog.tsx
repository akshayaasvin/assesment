"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteCandidates } from "@/lib/actions/candidates";

/** Delete one or more candidates after the admin types DELETE. */
export function DeleteCandidatesDialog({
  candidateIds,
  label,
  trigger,
  onDeleted,
}: {
  candidateIds: string[];
  /** e.g. "Asvin R" or "3 candidates" */
  label: string;
  trigger: ReactNode;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (typed !== "DELETE" || pending) return;
    setPending(true);
    try {
      const result = await deleteCandidates(candidateIds, typed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${result.deleted} candidate${result.deleted === 1 ? "" : "s"} and all their test data.`);
      setOpen(false);
      setTyped("");
      onDeleted?.();
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error("Unable to delete. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {label}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the candidate registration and all their attempts, answers, scores and proctoring
            records. It cannot be undone. Export the results first if you need them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">Type DELETE to confirm</Label>
          <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="DELETE" />
        </div>
        <DialogFooter>
          <Button variant="destructive" disabled={typed !== "DELETE" || pending} onClick={confirm}>
            {pending ? "Deleting..." : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
