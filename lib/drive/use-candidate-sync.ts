"use client";

import { useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { callCandidateSync } from "./rpc";
import type { CandidateSyncResult, ProctorEventType } from "@/types/database";

export const SYNC_INTERVAL_MS = 10_000;
const DEBOUNCE_MS = 1_500;

interface QueuedEvent {
  type: ProctorEventType;
  message?: string;
  meta?: Record<string, unknown>;
}

/**
 * The candidate's single lightweight call (Supabase RPC candidate_sync), made
 * every 10 s while the tab is visible. Answers and proctor events are queued
 * locally and sent in batches - on question change (debounced) and with each
 * tick - never one request per click. Anything a failed request carried is
 * put back in the queue, so a network blip can't lose an answer.
 */
export function useCandidateSync({
  enabled,
  onResult,
}: {
  enabled: boolean;
  onResult: (result: CandidateSyncResult) => void;
}) {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const answers = useRef(new Map<string, string | null>());
  const events = useRef<QueuedEvent[]>([]);
  const sectionIndex = useRef<number | null>(null);
  const since = useRef<string | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const debounce = useRef<number | null>(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  /** Sends everything queued. Resolves true if the server accepted the batch. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) {
      await inFlight.current; // one request at a time; send what queued meanwhile next
    }
    supabaseRef.current ??= createClient();
    const batchAnswers = [...answers.current.entries()];
    const batchEvents = events.current;
    const batchSection = sectionIndex.current;
    answers.current = new Map();
    events.current = [];

    const run = (async () => {
      const { data, error } = await callCandidateSync(supabaseRef.current!, {
        p_answers: batchAnswers.map(([questionId, optionId]) => ({ questionId, optionId })),
        p_events: batchEvents,
        p_section_index: batchSection,
        p_since: since.current,
      });
      if (error || !data) {
        // Put the batch back; newer answers for the same question win.
        for (const [q, o] of batchAnswers) if (!answers.current.has(q)) answers.current.set(q, o);
        events.current = [...batchEvents, ...events.current];
        return false;
      }
      since.current = data.serverTime;
      onResultRef.current(data);
      return true;
    })();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  const queueAnswer = useCallback((questionId: string, optionId: string | null) => {
    answers.current.set(questionId, optionId);
  }, []);

  const queueEvent = useCallback((event: QueuedEvent) => {
    events.current.push(event);
  }, []);

  const setSection = useCallback(
    (index: number) => {
      sectionIndex.current = index;
      void flush(); // record the section change right away (timer resume depends on it)
    },
    [flush]
  );

  useEffect(() => {
    if (!enabled) return;
    void flush();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void flush();
    }, SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [enabled, flush]);

  return { queueAnswer, queueEvent, setSection, scheduleFlush, flush };
}
