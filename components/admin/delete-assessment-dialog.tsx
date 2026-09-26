"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { deleteAssessment } from "@/lib/actions/assessments";

/** Delete one assessment after the admin types DELETE. */
export function DeleteAssessmentDialog({ id, trigger }: { id: string; trigger: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (typed !== "DELETE" || pending) return;
    setPending(true);
    try {
      const result = await deleteAssessment(id, typed);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Assessment deleted (with its ${result.results} result${result.results === 1 ? "" : "s"}).`);
      setOpen(false);
      router.push("/admin/assessments");
      router.refresh();
    } catch (e) {
      console.error(e);
      toast.error("Unable to delete assessment. Please try again.");
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
          <DialogTitle>Delete this assessment?</DialogTitle>
          <DialogDescription>
            This permanently deletes the assessment, its sections and the results of candidates who took THIS assessment.
            Other assessments and candidate registrations are not affected. To stop candidates using it without losing
            results, use Stop instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete-assessment">Type DELETE to confirm</Label>
          <Input id="confirm-delete-assessment" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" placeholder="DELETE" />
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
