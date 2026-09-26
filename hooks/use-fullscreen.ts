"use client";

import { useCallback, useEffect, useState } from "react";

function isDocumentFullscreen(): boolean {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return Boolean(
    doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement
  );
}

export function requestFullscreen() {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
    mozRequestFullScreen?: () => void;
    msRequestFullscreen?: () => void;
  };
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
  else if (el.msRequestFullscreen) el.msRequestFullscreen();
}

/**
 * Tries to enter fullscreen and reports whether it worked, within ~1.5 s.
 * Never throws and never blocks: iPhone Safari and some Android browsers
 * don't support fullscreen, and users can refuse it.
 */
export async function tryEnterFullscreen(timeoutMs = 1500): Promise<boolean> {
  if (isDocumentFullscreen()) return true;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (el.requestFullscreen) {
      await Promise.race([el.requestFullscreen(), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
      await new Promise((resolve) => setTimeout(resolve, 300));
    } else {
      return false;
    }
  } catch {
    return false;
  }
  return isDocumentFullscreen();
}

export function exitFullscreen() {
  const doc = document as Document & {
    webkitExitFullscreen?: () => void;
    mozCancelFullScreen?: () => void;
    msExitFullscreen?: () => void;
  };
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
  else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
  else if (doc.msExitFullscreen) doc.msExitFullscreen();
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(isDocumentFullscreen());
    handler();
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    document.addEventListener("mozfullscreenchange", handler);
    document.addEventListener("MSFullscreenChange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
      document.removeEventListener("mozfullscreenchange", handler);
      document.removeEventListener("MSFullscreenChange", handler);
    };
  }, []);

  const enter = useCallback(() => requestFullscreen(), []);
  const exit = useCallback(() => exitFullscreen(), []);

  return { isFullscreen, enter, exit };
}
