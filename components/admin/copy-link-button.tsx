"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({ link }: { link: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast.success("Candidate link copied.");
        } catch {
          toast.error("Could not copy link.");
        }
      }}
    >
      <Copy className="h-4 w-4" /> Copy candidate link
    </Button>
  );
}
