"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { deleteRole } from "@/lib/actions/roles";

/**
 * Client wrapper so the delete handler lives on the client. The roles page is
 * a Server Component and can't pass an inline `onConfirm` function to
 * ConfirmAction - that crashed /admin/roles with a 500 ("Event handlers
 * cannot be passed to Client Component props", React #441 in production).
 */
export function RoleDeleteButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete ${label}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      }
      title="Delete this role?"
      description={`"${label}" will be removed. Assessments already using it are not deleted.`}
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        const result = await deleteRole(id);
        if (!result?.error) router.refresh();
        return result;
      }}
    />
  );
}
