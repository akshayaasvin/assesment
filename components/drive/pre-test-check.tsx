"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, Mic, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestFullscreen } from "@/hooks/use-fullscreen";

type State = "checking" | "granted" | "denied";

/**
 * Before a stage starts: camera + microphone permission with a live camera
 * preview (the test is blocked until both are granted), then one button that
 * enters fullscreen AND unlocks audio playback - browsers only allow sound
 * after a user gesture, and voice announcements must be able to auto-play.
 * The granted stream is handed back so proctoring reuses it without a second prompt.
 */
export function PreTestCheck({
  title,
  onReady,
}: {
  title: string;
  onReady: (stream: MediaStream) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<State>("checking");
  const [mic, setMic] = useState<State>("checking");

  /** Asks the browser for camera + mic; state changes only in the promise callbacks. */
  const acquire = useCallback(() => {
    return navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: true }).then(
      (stream) => {
        streamRef.current = stream;
        setCamera(stream.getVideoTracks().length ? "granted" : "denied");
        setMic(stream.getAudioTracks().length ? "granted" : "denied");
        if (videoRef.current) videoRef.current.srcObject = stream;
      },
      () => {
        setCamera("denied");
        setMic("denied");
      }
    );
  }, []);

  function retry() {
    setCamera("checking");
    setMic("checking");
    void acquire();
  }

  useEffect(() => {
    // Asks for permission as soon as the check screen opens.
    void acquire();
  }, [acquire]);

  function start() {
    if (!streamRef.current) return;
    requestFullscreen();
    unlockAudio();
    onReady(streamRef.current);
  }

  const ready = camera === "granted" && mic === "granted";

  return (
    <Card className="w-full max-w-lg border-border/70 shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Before you start</CardTitle>
        <CardDescription>{title}: camera, microphone and fullscreen check.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-xl bg-muted">
          <video ref={videoRef} autoPlay muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Camera preview" />
        </div>
        <Status icon={Camera} label="Camera" state={camera} />
        <Status icon={Mic} label="Microphone" state={mic} />
        {(camera === "denied" || mic === "denied") && (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Camera and microphone access is required to take this test.</p>
            <p className="text-muted-foreground">
              Allow access from the camera icon in your browser&apos;s address bar, then press Retry. On a phone, check that no
              other app is using the camera.
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="h-4 w-4" /> Keep your volume on - the invigilator may send spoken instructions.
        </p>
        <Button className="w-full" size="lg" disabled={!ready} onClick={start}>
          Enter fullscreen and start
        </Button>
      </CardContent>
    </Card>
  );
}

/** Plays a silent sound inside the click handler so later announcements can auto-play. */
function unlockAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    void ctx.resume();
  } catch {
    // Audio unlock is best effort; text announcements still work.
  }
}

function Status({ icon: Icon, label, state }: { icon: React.ElementType; label: string; state: State }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="flex items-center gap-3 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" /> {label}
      </span>
      {state === "checking" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {state === "granted" && (
        <span className="flex items-center gap-1 text-xs font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> Working
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
