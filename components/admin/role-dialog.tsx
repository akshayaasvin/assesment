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
import { createRole, updateRole } from "@/lib/actions/roles";

export function RoleDialog({
  trigger,
  role,
}: {
  trigger: ReactNode;
  role?: { id: string; key: string; label: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = role ? await updateRole(role.id, formData) : await createRole(formData);
    setPending(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    toast.success(role ? "Role updated." : "Role created.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{role ? "Edit role" : "Add role"}</DialogTitle>
            <DialogDescription>Roles group assessments and candidates by job track.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="label">Role name</Label>
              <Input id="label" name="label" defaultValue={role?.label} placeholder="Full Stack Developer" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="key">Key (used in URLs, no spaces)</Label>
              <Input id="key" name="key" defaultValue={role?.key} placeholder="fullstack" required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
