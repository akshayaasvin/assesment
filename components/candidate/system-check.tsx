"use client";

import { useEffect } from "react";
import { Camera, Mic, Monitor, Maximize, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useMediaPermissions } from "@/hooks/use-media-permissions";

interface Props {
  cameraRequired: boolean;
  micRequired: boolean;
  fullscreenRequired: boolean;
  onReady: () => void;
}

function StatusRow({
  icon: Icon,
  label,
  state,
}: {
  icon: React.ElementType;
  label: string;
  state: "idle" | "checking" | "granted" | "denied" | "skip";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="h-4.5 w-4.5 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {state === "skip" && <span className="text-xs text-muted-foreground">Not required</span>}
      {state === "idle" && <span className="text-xs text-muted-foreground">Waiting...</span>}
      {state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {state === "granted" && (
        <span className="flex items-center gap-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> Connected
        </span>
      )}
      {state === "denied" && (
        <span className="flex items-center gap-1 text-xs font-medium text-destructive">
          <XCircle className="h-4 w-4" /> Blocked
        </span>
      )}
    </div>
  );
}

export function SystemCheck({ cameraRequired, micRequired, fullscreenRequired, onReady }: Props) {
  const { camera, mic, isReady, requestAccess } = useMediaPermissions({ cameraRequired, micRequired });

  useEffect(() => {
    requestAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="w-full max-w-lg border-border/70 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">System check</CardTitle>
        <CardDescription>We need to confirm a few things before your assessment begins.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <StatusRow icon={Camera} label="Camera" state={cameraRequired ? camera : "skip"} />
        <StatusRow icon={Mic} label="Microphone" state={micRequired ? mic : "skip"} />
        <StatusRow icon={Monitor} label="Browser" state="granted" />
        <StatusRow icon={Maximize} label="Fullscreen" state={fullscreenRequired ? "idle" : "skip"} />

        {(cameraRequired || micRequired) && !isReady && (
          <Button variant="outline" className="w-full" onClick={requestAccess}>
            Retry camera / microphone access
          </Button>
        )}

        <Button className="w-full" size="lg" disabled={!isReady} onClick={onReady}>
          Start Test
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          The test will go fullscreen{fullscreenRequired ? " and stay there until you submit" : ""}.
        </p>
      </CardContent>
    </Card>
  );
}
