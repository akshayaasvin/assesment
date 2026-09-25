import "server-only";
import { NextResponse } from "next/server";

/** Standard success envelope for candidate-portal Route Handlers: `{ success: true, data }`. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** Standard error envelope: `{ success: false, error }` with a human-readable message. */
export function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}
