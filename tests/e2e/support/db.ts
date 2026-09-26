/**
 * Test-only database access (service role). Used to seed and clean up e2e
 * fixtures and to assert what the app wrote. Never imported by the app.
 *
 * Reads the STAGING project from .env.staging.local (override with
 * E2E_ENV_FILE) and refuses to run against the production project: the drive
 * flow tests create drives, anonymous users and live assessments.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { WebSocket } from "ws";

export const E2E_ENV_FILE = process.env.E2E_ENV_FILE ?? ".env.staging.local";
if (!existsSync(E2E_ENV_FILE)) {
  throw new Error(`e2e: ${E2E_ENV_FILE} not found. Create it with the STAGING project's keys (see README -> End-to-end tests).`);
}
config({ path: E2E_ENV_FILE, quiet: true, override: true });

/** Production project ref - the suite must never write there. */
const PRODUCTION_PROJECT_REF = "ieqrugvsgjpidrrsqufn";
if ((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("e2e: refusing to run against the PRODUCTION Supabase project. Point E2E_ENV_FILE at staging.");
}

// supabase-js needs a global WebSocket; Node 20 (this project's runtime) has
// none. Same polyfill as scripts/supabase-admin-client.ts.
if (!("WebSocket" in globalThis)) {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
export const PUBLISHABLE_KEY = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
export const ADMIN_UID = required("ADMIN_UID");

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`e2e: ${name} must be set in ${E2E_ENV_FILE}`);
  return value;
}

export const STATE_DIR = path.join("tests", "e2e", ".state");
export const ADMIN_STATE = path.join(STATE_DIR, "admin.json");
export const NON_ADMIN_STATE = path.join(STATE_DIR, "non-admin.json");
const FIXTURES_FILE = path.join(STATE_DIR, "fixtures.json");

export function db(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Question with a known answer key, so scoring can be checked by hand. */
export interface FixtureQuestion {
  id: string;
  text: string;
  options: { id: string; text: string; isCorrect: boolean }[];
}

export interface Fixtures {
  run: string;
  roleId: string;
  roleLabel: string;
  questions: FixtureQuestion[];
  aptitude: { id: string; slug: string; title: string; passingPercentage: number };
  roleAssessment: { id: string; slug: string; title: string };
  draftAssessment: { id: string; slug: string; title: string };
  /** Live drive: aptitude + the live role assessment (+ the draft one, which must not be offered). */
  drive: { id: string; name: string; college: string };
  /** Live drive with an 80% aptitude cutoff, for the "not eligible" path. */
  cutoffDrive: { id: string; name: string };
  /** Draft drive: never listed, 404 by URL. */
  draftDrive: { id: string; name: string };
  nonAdminUserId: string;
}

export function saveFixtures(f: Fixtures) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(FIXTURES_FILE, JSON.stringify(f, null, 2));
}

export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(FIXTURES_FILE, "utf8"));
}

export function hasFixtures() {
  return existsSync(FIXTURES_FILE);
}

/**
 * Builds a Playwright storageState holding a Supabase Auth session for the
 * given tokens, in the exact cookie format @supabase/ssr reads.
 */
export async function writeSessionState(file: string, accessToken: string, refreshToken: string) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ cookies: await sessionCookies(accessToken, refreshToken), origins: [] }));
}

/** Playwright cookies holding a Supabase Auth session, in the format @supabase/ssr reads. */
export async function sessionCookies(accessToken: string, refreshToken: string) {
  const jar: Record<string, string> = {};
  const ssr = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (jar[name] = value)),
    },
  });
  const { error } = await ssr.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;

  return Object.entries(jar).map(([name, value]) => ({
    name,
    value,
    domain: "localhost",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));
}

/** A session for an existing user without knowing their password (service-role magic link, no email sent). */
export async function sessionForEmail(email: string) {
  const { data, error } = await db().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !verified.session) throw vErr ?? new Error("No session from magic link.");
  return verified.session;
}

/**
 * Deletes every e2e-created record, and nothing else: rows are matched only
 * by the "E2E " / "e2e-" / "@example.test" markers the suite uses.
 */
export async function cleanupE2EData() {
  const s = db();

  // Anonymous auth users have no email; find the ones behind e2e candidates first.
  const { data: e2eCandidates } = await s.from("candidates").select("auth_user_id").like("email", "e2e+%@example.test");
  const anonymousUserIds = (e2eCandidates ?? []).map((c) => c.auth_user_id).filter((id): id is string => Boolean(id));

  const steps = [
    s.from("candidates").delete().like("email", "e2e+%@example.test"),
    s.from("drives").delete().like("name", "E2E %"),
    s.from("assessments").delete().like("title", "E2E %"),
    s.from("questions").delete().like("text", "E2E %"),
    s.from("roles").delete().like("key", "e2e-%"),
    s.from("categories").delete().like("name", "E2E %"),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) console.error("e2e cleanup:", error.message);
  }

  for (const id of anonymousUserIds) await s.auth.admin.deleteUser(id);
  const { data: users } = await s.auth.admin.listUsers({ perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (u.email?.startsWith("e2e-") && u.email.endsWith("@example.test")) await s.auth.admin.deleteUser(u.id);
  }
}
