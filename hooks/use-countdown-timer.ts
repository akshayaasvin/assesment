"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Ports the old app's `startTimer`/`setInterval` countdown, as a hook.
 * Restarts cleanly whenever `resetKey` (or `seconds`, if no key is given)
 * changes - e.g. moving to a new section with its own duration.
 */
export function useCountdownTimer(seconds: number, onExpire: () => void, resetKey?: string | number) {
  const key = resetKey ?? seconds;
  const [remaining, setRemaining] = useState(seconds);
  const [trackedKey, setTrackedKey] = useState(key);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  // Adjusting state during render (React's documented pattern for "reset state
  // when a prop changes") instead of in an effect, so the reset is visible in
  // the same commit rather than causing an extra render pass.
  if (key !== trackedKey) {
    setTrackedKey(key);
    setRemaining(seconds);
  }

  useEffect(() => {
    if (seconds <= 0) return;

    const intervalId = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(intervalId);
          onExpireRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reset = useCallback((next: number) => setRemaining(next), []);

  return { remaining, formatted: formatDuration(remaining), reset };
}
