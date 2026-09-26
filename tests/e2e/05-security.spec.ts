import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PUBLISHABLE_KEY, SUPABASE_URL, db, fixtures } from "./support/db";
import { apiPost, candidate, register } from "./support/candidate";

const anonClient = () => createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** A signed-in anonymous candidate with an in-progress aptitude attempt (set up with the service role). */
async function seededCandidate(tag: string): Promise<{ client: SupabaseClient; candidateId: string; attemptId: string }> {
  const f = fixtures();
  const client = anonClient();
  const { data, error } = await client.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error("anonymous sign-in failed");

  const s = db();
  const { data: c } = await s
    .from("candidates")
    .insert({ drive_id: f.drive.id, auth_user_id: data.user.id, name: `E2E ${tag} ${f.run}`, email: `e2e+${f.run}-${tag}@example.test`, phone: `98765${Math.floor(10000 + Math.random() * 89999)}`, status: "aptitude_in_progress" })
    .select("id")
    .single();
  const { data: a } = await s
    .from("attempts")
    .insert({ candidate_id: c!.id, assessment_id: f.aptitude.id, stage: "aptitude", status: "in_progress", started_at: new Date().toISOString() })
    .select("id")
    .single();
  const { data: section } = await s.from("assessment_sections").select("id").eq("assessment_id", f.aptitude.id).single();
  await s.from("attempt_questions").insert(f.questions.map((q, i) => ({ attempt_id: a!.id, section_id: section!.id, question_id: q.id, order_index: i })));
  return { client, candidateId: c!.id, attemptId: a!.id };
}

test.describe("database rules (RLS) for candidates", () => {
  test("the public key alone can't read or write any table", async ({ request }) => {
    const headers = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };
    for (const table of ["question_options", "questions", "candidates", "attempts", "answers", "assessments", "profiles", "drives", "proctor_events", "announcements"]) {
      const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers });
      expect(await res.json(), table).toEqual([]);
    }
    const write = await request.post(`${SUPABASE_URL}/rest/v1/roles`, { headers: { ...headers, "Content-Type": "application/json" }, data: { key: "e2e-anon-hack", label: "hack" } });
    expect(write.status()).toBe(401);
  });

  test("a candidate sees only their own row, never answers or answer keys, and can't write tables", async () => {
    const a = await seededCandidate("rls-a");
    const b = await seededCandidate("rls-b");

    const { data: rows } = await a.client.from("candidates").select("id");
    expect(rows).toEqual([{ id: a.candidateId }]); // not b

    const { data: attempts } = await a.client.from("attempts").select("id");
    expect(attempts).toEqual([{ id: a.attemptId }]);

    expect((await a.client.from("question_options").select("id, is_correct").limit(5)).data ?? []).toEqual([]);
    expect((await a.client.from("answers").select("*").limit(5)).data ?? []).toEqual([]);
    expect((await a.client.from("drives").select("id").limit(5)).data ?? []).toEqual([]);

    const directWrite = await a.client.from("answers").insert({ attempt_id: a.attemptId, question_id: fixtures().questions[0].id });
    expect(directWrite.error).not.toBeNull();
    const selfPromote = await a.client.from("candidates").update({ status: "completed" }).eq("id", a.candidateId).select("id");
    expect(selfPromote.data ?? []).toEqual([]);

    // b's attempt is invisible to a, so a can't answer into it either
    const { data: sync } = await a.client.rpc("candidate_sync", {
      p_answers: [{ questionId: fixtures().questions[0].id, optionId: fixtures().questions[0].options[0].id }],
      p_events: [],
      p_section_index: null,
      p_since: null,
    });
    expect(sync).toMatchObject({ status: "aptitude_in_progress", rejectedAnswers: 0 });
    const { count: bAnswers } = await db().from("answers").select("id", { count: "exact", head: true }).eq("attempt_id", b.attemptId);
    expect(bAnswers).toBe(0);
  });

  test("once disqualified, the server refuses further answers", async () => {
    const f = fixtures();
    const c = await seededCandidate("dq");
    const q = f.questions[0];
    const args = (optionId: string) => ({ p_answers: [{ questionId: q.id, optionId }], p_events: [], p_section_index: null, p_since: null });

    const first = await c.client.rpc("candidate_sync", args(q.options[0].id));
    expect(first.data).toMatchObject({ rejectedAnswers: 0 });

    await db().from("candidates").update({ status: "disqualified", disqualified_reason: "E2E" }).eq("id", c.candidateId);
    const second = await c.client.rpc("candidate_sync", args(q.options[1].id));
    expect(second.data).toMatchObject({ status: "disqualified", disqualifiedReason: "E2E", rejectedAnswers: 1 });

    const { data: saved } = await db().from("answers").select("selected_option_id").eq("attempt_id", c.attemptId).eq("question_id", q.id).single();
    expect(saved!.selected_option_id).toBe(q.options[0].id); // unchanged
  });

  test("candidate_sync needs a signed-in candidate", async () => {
    const { error } = await anonClient().rpc("candidate_sync", { p_answers: [], p_events: [], p_section_index: null, p_since: null });
    expect(error).not.toBeNull();
  });
});

test.describe("server routes", () => {
  test("drive APIs require a session and return JSON errors", async ({ page }) => {
    await page.goto("/");
    for (const [path, body] of [
      ["/api/drive/stage", { stage: "aptitude" }],
      ["/api/drive/stage/submit", { attemptId: "00000000-0000-4000-8000-000000000000" }],
      [`/api/drive/${fixtures().drive.id}/register`, { name: "x" }],
    ] as const) {
      const res = await apiPost(page, path, body);
      expect([400, 401], path).toContain(res.status);
      expect(res.contentType).toContain("application/json");
      expect(res.json).toMatchObject({ success: false });
    }
  });

  test("the test payload never includes the answer key", async ({ page }) => {
    const f = fixtures();
    await register(page, f.drive.id, candidate(f.run, "key", "9876500004"));
    const res = await apiPost(page, "/api/drive/stage", { stage: "aptitude" });
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.json);
    expect(body).not.toMatch(/is_?correct/i);
    expect(body).toContain(f.questions[0].options[0].text); // options are there, just not which is right
  });
});

test("no server secrets in the client bundle", async ({ page, request }) => {
  const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY!, process.env.ADMIN_UID!, process.env.SUPABASE_DB_URL].filter((v): v is string => Boolean(v));
  const scripts = new Set<string>();
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.add(req.url());
  });
  for (const path of ["/", "/admin/login", `/drive/${fixtures().drive.id}`]) await page.goto(path);
  expect(scripts.size).toBeGreaterThan(0);
  for (const url of scripts) {
    const js = await (await request.get(url)).text();
    for (const secret of secrets) expect(js.includes(secret), `secret found in ${url}`).toBe(false);
    expect(js).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  }
});
