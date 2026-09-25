export type JsonResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * POSTs JSON to one of this app's own Route Handlers (relative URL, so it works
 * the same locally and on Vercel) and never throws. Checks the response status
 * and content type before parsing, so an HTML error page, an empty body or a
 * network failure becomes a readable error instead of a crash.
 *
 * Understands both the `{ success, data | error }` envelope used by /api/portal
 * and the plain `{ ...data } | { error }` bodies of the older exam routes.
 */
export async function postJson<T>(path: string, body: unknown = {}): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { success: false, error: "Could not reach the server. Check your internet connection and try again." };
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await res.json().catch(() => null) : null;
  const obj = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  if (!res.ok || obj.success === false) {
    const error = typeof obj.error === "string" ? obj.error : `Something went wrong (error ${res.status}). Please try again.`;
    return { success: false, error };
  }
  if (!isJson) return { success: false, error: "Unexpected response from the server. Please try again." };

  return { success: true, data: ("data" in obj && obj.success === true ? obj.data : obj) as T };
}
