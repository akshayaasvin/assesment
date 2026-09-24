import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md border-border/70 text-center shadow-lg">
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground text-lg font-semibold">
            A
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Assistlana Assessment Platform</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Candidates take assessments via the link shared by their organizer.
            </p>
          </div>
          <Button asChild size="lg" className="mt-2 w-full">
            <Link href="/admin/login">
              <ShieldCheck className="h-4 w-4" /> Admin console
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
