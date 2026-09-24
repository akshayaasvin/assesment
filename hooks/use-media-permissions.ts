"use client";

import { useCallback, useRef, useState } from "react";

export type PermissionState = "idle" | "checking" | "granted" | "denied";

interface UseMediaPermissionsOptions {
  cameraRequired: boolean;
  micRequired: boolean;
}

/**
 * Ports the old app's `startMediaStream`/`stopMediaStream` getUserMedia flow
 * into the System Check screen. Keeps the live MediaStream so the same
 * camera/mic grant can be reused once the exam starts, instead of prompting
 * twice.
 */
export function useMediaPermissions({ cameraRequired, micRequired }: UseMediaPermissionsOptions) {
  const [camera, setCamera] = useState<PermissionState>("idle");
  const [mic, setMic] = useState<PermissionState>("idle");
  const streamRef = useRef<MediaStream | null>(null);

  const requestAccess = useCallback(async () => {
    if (!cameraRequired && !micRequired) {
      setCamera("granted");
      setMic("granted");
      return;
    }

    setCamera(cameraRequired ? "checking" : "idle");
    setMic(micRequired ? "checking" : "idle");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: cameraRequired,
        audio: micRequired,
      });
      streamRef.current = stream;
      if (cameraRequired) setCamera(stream.getVideoTracks().length > 0 ? "granted" : "denied");
      if (micRequired) setMic(stream.getAudioTracks().length > 0 ? "granted" : "denied");
    } catch {
      if (cameraRequired) setCamera("denied");
      if (micRequired) setMic("denied");
    }
  }, [cameraRequired, micRequired]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const isReady =
    (!cameraRequired || camera === "granted") && (!micRequired || mic === "granted");

  return { camera, mic, isReady, requestAccess, stop, stream: streamRef };
}
