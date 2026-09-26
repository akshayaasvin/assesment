import { randomUUID } from "node:crypto";
import {
  ADMIN_STATE,
  ADMIN_UID,
  NON_ADMIN_STATE,
  PUBLISHABLE_KEY,
  SUPABASE_URL,
  cleanupE2EData,
  db,
  saveFixtures,
  sessionForEmail,
  writeSessionState,
  type FixtureQuestion,
} from "./support/db";
import { createClient } from "@supabase/supabase-js";

const QUESTION_BANK: { text: string; options: string[]; correct: number }[] = [
  { text: "What is 2 + 2?", options: ["3", "4", "5"], correct: 1 },
  { text: "What is the capital of France?", options: ["Paris", "Rome"], correct: 0 },
  { text: "What colour is a clear daytime sky?", options: ["Green", "Blue", "Red"], correct: 1 },
];

/** Proctoring off so the exam runs headlessly; everything else is the real app flow. */
const EXAM_SETTINGS = {
  status: "live",
  camera_required: false,
  mic_required: false,
  fullscreen_required: false,
  tab_switch_monitoring: false,
  copy_paste_block: false,
  auto_submit: true,
  result_visible_to_candidate: true,
  max_warnings: 4,
};

/** Awaits a Supabase query, throwing on error or no data. T is the row shape the caller selected. */
async function must<T = { id: string }>(
  p: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  what: string
): Promise<T> {
  const { data, error } = await p;
  if (error || data === null) throw new Error(`e2e setup: ${what}: ${error?.message ?? "no data"}`);
  return data as T;
}

export default async function globalSetup() {
  await cleanupE2EData(); // leftovers from an interrupted run

  const s = db();
  const run = randomUUID().slice(0, 8);

  // --- Questions with a known answer key
  const questions: FixtureQuestion[] = [];
  for (const [i, q] of QUESTION_BANK.entries()) {
    const text = `E2E ${run} Q${i + 1}: ${q.text}`;
    const question = await must(s.from("questions").insert({ text, marks: 1 }).select("id").single(), "question");
    const options = await must<{ id: string; text: string; is_correct: boolean }[]>(
      s
        .from("question_options")
        .insert(q.options.map((t, idx) => ({ question_id: question.id, text: t, is_correct: idx === q.correct, order_index: idx })))
        .select("id, text, is_correct, order_index")
        .order("order_index"),
      "options"
    );
    questions.push({ id: question.id, text, options: options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })) });
  }

  // --- Role + assessments
  const roleLabel = `E2E Role ${run}`;
  const role = await must(s.from("roles").insert({ key: `e2e-${run}`, label: roleLabel }).select("id").single(), "role");

  async function assessment(title: string, extra: Record<string, unknown>, questionIds: string[]) {
    const slug = `e2e-${run}-${Math.random().toString(36).slice(2, 7)}`;
    const a = await must(
      s.from("assessments").insert({ title, slug, passing_percentage: 50, ...EXAM_SETTINGS, ...extra }).select("id").single(),
      title
    );
    const section = await must(
      s
        .from("assessment_sections")
        .insert({
          assessment_id: a.id,
          title: "Section 1",
          duration_minutes: 5,
          randomize_questions: false,
          randomize_options: false,
          source_type: "fixed",
          question_count: questionIds.length,
        })
        .select("id")
        .single(),
      `${title} section`
    );
    await must(
      s
        .from("assessment_questions")
        .insert(questionIds.map((question_id, order_index) => ({ section_id: section.id, question_id, order_index })))
        .select("id"),
      `${title} questions`
    );
    return { id: a.id as string, slug, title };
  }

  const ids = questions.map((q) => q.id);
  const aptitude = await assessment(`E2E ${run} Aptitude`, { kind: "aptitude" }, ids);
  const roleAssessment = await assessment(`E2E ${run} Role Assessment`, { kind: "role", role_id: role.id }, ids.slice(0, 2));
  const draftAssessment = await assessment(
    `E2E ${run} Draft Role Assessment`,
    { kind: "role", role_id: role.id, status: "draft" },
    ids.slice(0, 2)
  );

  // --- Drives
  async function drive(name: string, extra: Record<string, unknown>, roleAssessmentIds: string[]) {
    const d = await must(
      s.from("drives").insert({ name, status: "live", aptitude_assessment_id: aptitude.id, ...extra }).select("id").single(),
      name
    );
    if (roleAssessmentIds.length) {
      await must(
        s.from("drive_role_assessments").insert(roleAssessmentIds.map((assessment_id) => ({ drive_id: d.id, assessment_id }))).select("drive_id"),
        `${name} roles`
      );
    }
    return d.id as string;
  }
  const driveName = `E2E ${run} Campus Drive`;
  const driveId = await drive(driveName, { mode: "campus", college_name: "E2E College" }, [roleAssessment.id, draftAssessment.id]);
  const cutoffName = `E2E ${run} Cutoff Drive`;
  const cutoffDriveId = await drive(cutoffName, { mode: "online", aptitude_cutoff: 80 }, [roleAssessment.id]);
  const draftName = `E2E ${run} Draft Drive`;
  const draftDriveId = await drive(draftName, { mode: "walkin", status: "draft" }, []);

  // --- Admin session (magic link via service role - no password needed, no email sent)
  const { data: adminUser, error: adminErr } = await s.auth.admin.getUserById(ADMIN_UID);
  if (adminErr || !adminUser.user?.email) throw new Error(`e2e setup: admin user: ${adminErr?.message}`);
  const adminSession = await sessionForEmail(adminUser.user.email);
  await writeSessionState(ADMIN_STATE, adminSession.access_token, adminSession.refresh_token);

  // --- A signed-in user who is NOT the admin
  const nonAdminEmail = `e2e-nonadmin-${run}@example.test`;
  const password = `E2e!${randomUUID()}`;
  const created = await s.auth.admin.createUser({ email: nonAdminEmail, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`e2e setup: non-admin user: ${created.error?.message}`);
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const signIn = await anon.auth.signInWithPassword({ email: nonAdminEmail, password });
  if (signIn.error || !signIn.data.session) throw new Error(`e2e setup: non-admin sign-in: ${signIn.error?.message}`);
  await writeSessionState(NON_ADMIN_STATE, signIn.data.session.access_token, signIn.data.session.refresh_token);

  saveFixtures({
    run,
    roleId: role.id,
    roleLabel,
    questions,
    aptitude: { ...aptitude, passingPercentage: 50 },
    roleAssessment,
    draftAssessment,
    drive: { id: driveId, name: driveName, college: "E2E College" },
    cutoffDrive: { id: cutoffDriveId, name: cutoffName },
    draftDrive: { id: draftDriveId, name: draftName },
    nonAdminUserId: created.data.user.id,
  });
}
