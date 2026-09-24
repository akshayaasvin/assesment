"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleRoleActive } from "@/lib/actions/roles";
import { toast } from "sonner";

export function RoleActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [checked, setChecked] = useState(isActive);
  const [, startTransition] = useTransition();

  return (
    <Switch
      checked={checked}
      onCheckedChange={(next) => {
        setChecked(next);
        startTransition(async () => {
          const result = await toggleRoleActive(id, next);
          if (result?.error) {
            setChecked(!next);
            toast.error(result.error);
          }
        });
      }}
    />
  );
}
