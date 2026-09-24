"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { MoreHorizontal, Play, Pause, Square, Copy, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { setAssessmentStatus, duplicateAssessment, deleteAssessment } from "@/lib/actions/assessments";
import type { AssessmentStatus } from "@/types/database";

export function AssessmentActionsMenu({ id, status }: { id: string; status: AssessmentStatus }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function runStatus(next: AssessmentStatus, message: string) {
    startTransition(async () => {
      const result = await setAssessmentStatus(id, next);
      if (result?.error) toast.error(result.error);
      else toast.success(message);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/admin/assessments/${id}`}>
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </DropdownMenuItem>

        {(status === "draft" || status === "scheduled" || status === "paused") && (
          <DropdownMenuItem onClick={() => runStatus("live", "Assessment is now live.")}>
            <Play className="h-4 w-4" /> {status === "paused" ? "Resume" : "Start now"}
          </DropdownMenuItem>
        )}
        {status === "draft" && (
          <DropdownMenuItem onClick={() => runStatus("scheduled", "Assessment scheduled.")}>
            <Play className="h-4 w-4" /> Schedule (use start/end time)
          </DropdownMenuItem>
        )}
        {status === "live" && (
          <DropdownMenuItem onClick={() => runStatus("paused", "Assessment paused.")}>
            <Pause className="h-4 w-4" /> Pause
          </DropdownMenuItem>
        )}
        {(status === "live" || status === "paused" || status === "scheduled") && (
          <DropdownMenuItem onClick={() => runStatus("ended", "Assessment stopped.")}>
            <Square className="h-4 w-4" /> Stop
          </DropdownMenuItem>
        )}
        {status === "ended" && (
          <DropdownMenuItem onClick={() => runStatus("draft", "Moved back to draft.")}>
            <RotateCcw className="h-4 w-4" /> Reopen as draft
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateAssessment(id);
              if (result?.error) toast.error(result.error);
              else {
                toast.success("Assessment duplicated.");
                router.refresh();
              }
            })
          }
        >
          <Copy className="h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <ConfirmAction
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          }
          title="Delete this assessment?"
          description="All sections and configuration will be removed. Candidate attempts already recorded are kept for audit history."
          confirmLabel="Delete"
          destructive
          onConfirm={() =>
            deleteAssessment(id).then((result) => {
              if (!result?.error) router.refresh();
              return result;
            })
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
