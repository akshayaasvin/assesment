import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Candidate sessions. Candidates don't have Supabase Auth accounts - they sign
 * in with the email + phone they registered with. After that, the candidate id
 * is kept in an httpOnly cookie signed with HMAC-SHA256, so it survives refresh
 * and browser restarts, can't be read by page scripts, and can't be forged to
 * impersonate another candidate. All portal DB access is server-side and keyed
 * on the id from this cookie.
 *
 * The signing key is CANDIDATE_SESSION_SECRET if set, otherwise derived from
 * SUPABASE_SERVICE_ROLE_KEY (already a server-only secret), so no new env var
 * is required.
 */

const COOKIE_NAME = "candidate_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function signingKey(): Buffer {
  const base = process.env.CANDIDATE_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Candidate sessions need CANDIDATE_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  return createHmac("sha256", base).update("assistlana-candidate-session-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export async function setCandidateSession(candidateId: string) {
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${candidateId}.${expires}`;
  const store = await cookies();
  store.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearCandidateSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** The signed-in candidate's id, or null if there's no valid, unexpired session cookie. */
export async function getCandidateId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const [candidateId, expires, signature] = raw.split(".");
  if (!candidateId || !expires || !signature) return null;
  if (Number(expires) < Date.now()) return null;

  const expected = Buffer.from(sign(`${candidateId}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  return candidateId;
}
