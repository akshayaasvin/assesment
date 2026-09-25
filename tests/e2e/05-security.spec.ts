import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { PUBLISHABLE_KEY, SUPABASE_URL, fixtures } from "./support/db";
import { apiPost } from "./support/candidate";

config({ path: ".env.local", quiet: true });

test.describe("data access without admin rights", () => {
  test("the public (anon) key can't read or write any table directly", async ({ request }) => {
    const headers = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };
    for (const table of ["question_options", "questions", "candidates", "attempts", "answers", "assessments", "profiles"]) {
      const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=5`, { headers });
      expect(await res.json(), table).toEqual([]);
    }
    const write = await request.post(`${SUPABASE_URL}/rest/v1/roles`, {
      headers: { ...headers, "Content-Type": "application/json" },
      data: { key: "e2e-anon-hack", label: "hack" },
    });
    expect(write.status()).toBe(401);
  });

  test("portal APIs require a candidate session and return JSON errors", async ({ page }) => {
    await page.goto("/");
    for (const [path, body] of [
      ["/api/portal/attempts", { assessmentId: fixtures().aptitude.id }],
      ["/api/portal/role", { roleId: fixtures().roleId }],
    ] as const) {
      const res = await apiPost(page, path, body);
      expect(res.status, path).toBe(401);
      expect(res.contentType).toContain("application/json");
      expect(res.json).toMatchObject({ success: false });
    }
  });

  test("exam APIs reject a wrong attempt token and malformed input", async ({ page }) => {
    await page.goto("/");
    const fakeId = "00000000-0000-4000-8000-000000000000";
    expect((await apiPost(page, `/api/attempts/${fakeId}/start`, { attemptToken: "nope" })).status).toBe(404);
    expect((await apiPost(page, `/api/attempts/${fakeId}/submit`, { attemptToken: "nope" })).status).toBe(404);
    expect((await apiPost(page, `/api/attempts/${fakeId}/answer`, { attemptToken: "x", questionId: "not-a-uuid" })).status).toBe(400);
    expect((await apiPost(page, `/api/attempts/${fakeId}/violation`, { attemptToken: "x", type: "made-up" })).status).toBe(400);
  });

  test("the exam payload never includes the answer key", async ({ page }) => {
    const f = fixtures();
    await page.goto("/");
    // Candidate A (from 02-candidate) is done, so use a fresh candidate on the aptitude link.
    const reg = await apiPost(page, `/api/assessments/${f.aptitude.slug}/register`, {
      name: `E2E Candidate Key ${f.run}`,
      email: `e2e+${f.run}-key@example.test`,
      phone: "9876500004",
      college: "c",
      district: "d",
      department: "e",
    });
    expect(reg.status).toBe(200);
    const { attemptId, attemptToken } = reg.json as { attemptId: string; attemptToken: string };
    const runtime = await apiPost(page, `/api/attempts/${attemptId}/start`, { attemptToken });
    expect(runtime.status).toBe(200);
    const body = JSON.stringify(runtime.json);
    expect(body).not.toMatch(/is_?correct/i);
    expect(body).toContain(f.questions[0].options[0].text); // options are there, just not which is right
  });
});

test("no server secrets in the client bundle", async ({ page, request }) => {
  const secrets = [process.env.SUPABASE_SERVICE_ROLE_KEY!, process.env.ADMIN_UID!, process.env.CANDIDATE_SESSION_SECRET].filter(
    (v): v is string => Boolean(v)
  );
  const scripts = new Set<string>();
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.add(req.url());
  });
  for (const path of ["/", "/admin/login", `/a/${fixtures().aptitude.slug}`]) await page.goto(path);
  expect(scripts.size).toBeGreaterThan(0);

  for (const url of scripts) {
    const js = await (await request.get(url)).text();
    for (const secret of secrets) expect(js.includes(secret), `secret found in ${url}`).toBe(false);
    expect(js).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  }
});
