"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * false during server rendering and hydration, true afterwards. Use it to
 * render values that differ between server and browser - local time zones,
 * "5s ago" - without a hydration mismatch (React error #418). The server
 * runs in UTC on Vercel, while admins' browsers are in their local zone.
 */
export function useIsClient() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
