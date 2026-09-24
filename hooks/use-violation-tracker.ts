"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestFullscreen } from "@/hooks/use-fullscreen";
import type { ViolationType } from "@/types/database";

export interface ViolationModalState {
  open: boolean;
  title: string;
  message: string;
  actionLabel: string;
  mode: "fullscreen-retry" | "acknowledge";
}

interface UseViolationTrackerOptions {
  active: boolean;
  maxWarnings: number;
  fullscreenRequired: boolean;
  tabSwitchMonitoring: boolean;
  copyPasteBlock: boolean;
  onViolation: (type: ViolationType, message: string) => void;
  onDisqualify: () => void;
}

const CLOSED_MODAL: ViolationModalState = {
  open: false,
  title: "",
  message: "",
  actionLabel: "",
  mode: "acknowledge",
};

/**
 * Ports the old HTML's handleViolation/showModal/restoreFS malpractice
 * detection: fullscreen exit, tab switch, window blur (app switch), a
 * split-screen resize heuristic, and copy/paste/shortcut/right-click
 * blocking. Auto-disqualifies once `maxWarnings` is exceeded.
 */
export function useViolationTracker({
  active,
  maxWarnings,
  fullscreenRequired,
  tabSwitchMonitoring,
  copyPasteBlock,
  onViolation,
  onDisqualify,
}: UseViolationTrackerOptions) {
  const [modal, setModal] = useState<ViolationModalState>(CLOSED_MODAL);
  const [warningsCount, setWarningsCount] = useState(0);

  const violationInProgressRef = useRef(false);
  const warningsCountRef = useRef(0);
  const fsRetryIntervalRef = useRef<number | null>(null);
  const disqualifyTimeoutRef = useRef<number | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const windowSizeRef = useRef({ width: 0, height: 0 });
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const clearTimers = useCallback(() => {
    if (fsRetryIntervalRef.current) window.clearInterval(fsRetryIntervalRef.current);
    if (disqualifyTimeoutRef.current) window.clearTimeout(disqualifyTimeoutRef.current);
    fsRetryIntervalRef.current = null;
    disqualifyTimeoutRef.current = null;
  }, []);

  const disqualify = useCallback(() => {
    clearTimers();
    setModal(CLOSED_MODAL);
    violationInProgressRef.current = false;
    onDisqualify();
  }, [clearTimers, onDisqualify]);

  const handleViolation = useCallback(
    (type: ViolationType, message: string) => {
      clearTimers();
      if (!activeRef.current || violationInProgressRef.current) return;

      violationInProgressRef.current = true;
      warningsCountRef.current += 1;
      setWarningsCount(warningsCountRef.current);
      onViolation(type, message);

      if (warningsCountRef.current > maxWarnings) {
        disqualify();
        return;
      }

      setModal({
        open: true,
        title: "Warning",
        mode: "fullscreen-retry",
        actionLabel: "Return to Fullscreen",
        message: `Warning ${warningsCountRef.current} of ${maxWarnings}\n\n${message}\n\nReturning to fullscreen in 5 seconds...\nIf it doesn't work, click the button below.`,
      });

      let attempts = 0;
      fsRetryIntervalRef.current = window.setInterval(() => {
        if (!violationInProgressRef.current) {
          if (fsRetryIntervalRef.current) window.clearInterval(fsRetryIntervalRef.current);
          return;
        }
        requestFullscreen();
        attempts += 1;
        if (attempts >= 10) {
          if (fsRetryIntervalRef.current) window.clearInterval(fsRetryIntervalRef.current);
          if (!document.fullscreenElement) {
            setModal((prev) => ({
              ...prev,
              message: `Warning ${warningsCountRef.current} of ${maxWarnings}\n\n${message}\n\nAutomatic fullscreen failed. Please click the button below.`,
            }));
          }
        }
      }, 500);

      disqualifyTimeoutRef.current = window.setTimeout(() => {
        if (violationInProgressRef.current) disqualify();
      }, 30000);
    },
    [clearTimers, disqualify, maxWarnings, onViolation]
  );

  const restoreFullscreen = useCallback(() => {
    clearTimers();
    setModal(CLOSED_MODAL);
    violationInProgressRef.current = false;
    windowSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
    requestFullscreen();
  }, [clearTimers]);

  const acknowledgeModal = useCallback(() => {
    if (modal.mode === "fullscreen-retry") restoreFullscreen();
    else setModal(CLOSED_MODAL);
  }, [modal.mode, restoreFullscreen]);

  // DOM event wiring - registered once per config change, active-gated internally.
  useEffect(() => {
    windowSizeRef.current = { width: window.innerWidth, height: window.innerHeight };

    const onVisibilityChange = () => {
      if (activeRef.current && document.hidden && tabSwitchMonitoring) {
        handleViolation("tab_switch", "You switched tabs/apps! Tab switching is not allowed during the exam.");
      }
    };

    const onFullscreenChange = () => {
      if (!activeRef.current || violationInProgressRef.current || !fullscreenRequired) return;
      if (!document.fullscreenElement) {
        handleViolation("fullscreen_exit", "You exited fullscreen! Stay in fullscreen during the exam.");
      }
    };

    const onBlur = () => {
      if (!activeRef.current || !tabSwitchMonitoring) return;
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = window.setTimeout(() => {
        if (!document.hasFocus() && document.fullscreenElement) {
          handleViolation("window_blur", "You switched to another app! This is not allowed during the exam.");
        }
      }, 300);
    };

    const onFocus = () => {
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };

    const onResize = () => {
      if (!activeRef.current || violationInProgressRef.current || !fullscreenRequired) return;
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      const { width, height } = windowSizeRef.current;
      if ((Math.abs(nh - height) > 100 || Math.abs(nw - width) > 100) && !document.fullscreenElement) {
        handleViolation("resize", "Split screen detected! Only fullscreen mode is allowed.");
      }
      windowSizeRef.current = { width: nw, height: nh };
    };

    const onContextMenu = (e: MouseEvent) => {
      if (activeRef.current && copyPasteBlock) e.preventDefault();
    };

    const onCopy = (e: ClipboardEvent) => {
      if (activeRef.current && copyPasteBlock) {
        e.preventDefault();
        handleViolation("copy", "Copying is not allowed during the assessment.");
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeRef.current || !copyPasteBlock) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "u"].includes(key)) {
        const target = e.target as HTMLElement | null;
        if (target?.tagName === "TEXTAREA") {
          if (["v", "x"].includes(key)) e.preventDefault();
          return;
        }
        e.preventDefault();
      }
      if (e.key === "F12") e.preventDefault();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("resize", onResize);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("keydown", onKeyDown);
      clearTimers();
    };
  }, [handleViolation, fullscreenRequired, tabSwitchMonitoring, copyPasteBlock, clearTimers]);

  return { modal, warningsCount, acknowledgeModal };
}
