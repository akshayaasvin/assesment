"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Catches render/data errors in any admin page so a failure shows a
 * recoverable message inside the admin layout (sidebar and topbar stay
 * usable) instead of a white "This page couldn't load" screen.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card className="mx-auto mt-10 max-w-md border-border/70 text-center">
      <CardContent className="flex flex-col items-center gap-3 py-10">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">This page couldn&apos;t load</h2>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading this page. Please try again. If it keeps happening, contact the administrator
          {error.digest ? ` and mention error reference ${error.digest}` : ""}.
        </p>
        <Button onClick={() => retry()}>Try again</Button>
      </CardContent>
    </Card>
  );
}
