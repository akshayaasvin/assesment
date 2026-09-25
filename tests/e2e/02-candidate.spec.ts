import { test, expect } from "@playwright/test";
import { db, fixtures } from "./support/db";
import { apiPost, candidate, chooseOption, fillRegistration, registerViaPortal, timerSeconds } from "./support/candidate";

test.describe.configure({ mode: "serial" });

test.describe("candidate links", () => {
  test("an unknown assessment link shows a not-found page, not a crash", async ({ page }) => {
    const res = await page.goto("/a/this-assessment-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
  });

  test("a draft assessment link says it is not open", async ({ page }) => {
    await page.goto(`/a/${fixtures().draftAssessment.slug}`);
    await expect(page.getByText(/not open right now/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Proceed to Register" })).toHaveCount(0);
  });
});

test.describe("registration validation", () => {
  test("requires every field and the terms", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Proceed to Register" }).click();
    await expect(page.getByText("Please fill in all fields.")).toBeVisible();

    await fillRegistration(page, candidate(fixtures().run, "validation", "9000000001"));
    await page.getByRole("button", { name: "Proceed to Register" }).click();
    await expect(page.getByText(/accept the Terms/i)).toBeVisible();
  });

  test("rejects an invalid email and phone on the server", async ({ page }) => {
    await page.goto("/");
    const bad = await apiPost(page, "/api/portal/register", { ...candidate(fixtures().run, "bad", "12"), email: "not-an-email" });
    expect(bad.status).toBe(400);
    expect(bad.json).toMatchObject({ success: false });
  });
});

test.describe("happy path: aptitude -> eligible -> role -> role assessment", () => {
  test("full flow, with refresh and re-login along the way", async ({ page }) => {
    const f = fixtures();
    const c = candidate(f.run, "a", "9876500001");
    const [q1, q2, q3] = f.questions;
    const correct = (q: (typeof f.questions)[number]) => q.options.find((o) => o.isCorrect)!.text;
    const wrong = (q: (typeof f.questions)[number]) => q.options.find((o) => !o.isCorrect)!.text;

    // 1. Register -> aptitude is the only thing offered
    await registerViaPortal(page, c);
    await expect(page.getByText(f.aptitude.title)).toBeVisible();
    await expect(page.getByText(f.roleAssessment.title)).toHaveCount(0);

    // A role assessment can't be reached by its direct link before aptitude
    const bypass = await apiPost(page, `/api/assessments/${f.roleAssessment.slug}/register`, c);
    expect(bypass.status).toBe(403);
    expect(bypass.json?.error).toBe("Please complete the Aptitude Assessment first.");

    // 2. Take aptitude: answer Q1, then refresh mid-test
    await page.getByRole("button", { name: "Start Aptitude Assessment" }).click();
    await page.getByRole("button", { name: "Start Test" }).click();
    await chooseOption(page, q1.text, correct(q1));
    await expect(page.getByText("1/3 answered")).toBeVisible();
    await page.waitForTimeout(3_000);

    await page.reload();
    await page.getByRole("button", { name: "Resume Assessment" }).click();
    await page.getByRole("button", { name: "Start Test" }).click();
    // Answer kept, and the section timer continued instead of restarting at 5:00
    await expect(page.getByText("1/3 answered")).toBeVisible();
    expect(await timerSeconds(page)).toBeLessThanOrEqual(297);

    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q2.text, correct(q2));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q3.text, wrong(q3));
    await page.getByRole("button", { name: "Submit Assessment" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();

    await expect(page.getByText("Assessment Completed")).toBeVisible();
    await expect(page.getByText("66.67%")).toBeVisible();

    // 3. Scoring checked by hand against the answer key: 2 of 3 one-mark questions right.
    const s = db();
    const { data: cand } = await s.from("candidates").select("id, aptitude_status, aptitude_percentage").eq("email", c.email).single();
    const { data: attempt } = await s
      .from("attempts")
      .select("id, status, score, total_marks, percentage")
      .eq("candidate_id", cand!.id)
      .eq("assessment_id", f.aptitude.id)
      .single();
    expect(attempt).toMatchObject({ status: "completed", score: 2, total_marks: 3, percentage: 66.67 });
    const { data: answers } = await s.from("answers").select("question_id, selected_option_id, is_correct").eq("attempt_id", attempt!.id);
    for (const a of answers ?? []) {
      const q = f.questions.find((x) => x.id === a.question_id)!;
      expect(a.is_correct).toBe(q.options.find((o) => o.id === a.selected_option_id)!.isCorrect);
    }
    // Eligibility persisted: 66.67% >= 50% passing
    expect(cand).toMatchObject({ aptitude_status: "eligible", aptitude_percentage: 66.67 });

    // 4. Role selection, driven by the roles table
    await page.getByRole("button", { name: "Continue to dashboard" }).click();
    await expect(page.getByText("Select Your Role")).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByRole("option", { name: f.roleLabel }).click();
    await page.getByRole("button", { name: "Select Role" }).click();

    // Only the live assessment for that role - not the draft one
    await expect(page.getByText(f.roleAssessment.title)).toBeVisible();
    await expect(page.getByText(f.draftAssessment.title)).toHaveCount(0);

    // 5. Survives refresh and logout/login
    await page.reload();
    await expect(page.getByText(f.roleAssessment.title)).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await page.getByRole("button", { name: "Log in" }).click();
    await page.getByLabel("Email").fill(c.email);
    await page.getByLabel("Phone").fill(c.phone);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(f.roleAssessment.title)).toBeVisible();

    // 6. No retake of aptitude
    const retake = await apiPost(page, "/api/portal/attempts", { assessmentId: f.aptitude.id });
    expect(retake.status).toBe(409);

    // A draft role assessment can't be started even by id
    const draft = await apiPost(page, "/api/portal/attempts", { assessmentId: f.draftAssessment.id });
    expect(draft.status).toBe(403);

    // 7. Take the role assessment
    await page.getByRole("button", { name: "Start Assessment" }).click();
    await page.getByRole("button", { name: "Start Test" }).click();
    await chooseOption(page, q1.text, correct(q1));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q2.text, correct(q2));
    await page.getByRole("button", { name: "Submit Assessment" }).click();
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByText("Assessment Completed")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();

    await page.getByRole("button", { name: "Continue to dashboard" }).click();
    await expect(page.getByText(/Completed\. We will get back to you shortly/)).toBeVisible();

    // No resubmission
    const again = await apiPost(page, "/api/portal/attempts", { assessmentId: f.roleAssessment.id });
    expect(again.status).toBe(409);
  });
});

test.describe("not eligible path", () => {
  test("a failed aptitude blocks role selection and role assessments", async ({ page }) => {
    const f = fixtures();
    const c = candidate(f.run, "b", "9876500002");
    await registerViaPortal(page, c);

    // Take aptitude through the same API the UI uses, answering everything wrong.
    const start = await apiPost(page, "/api/portal/attempts", { assessmentId: f.aptitude.id });
    expect(start.status).toBe(201);
    const { attemptId, attemptToken } = start.json!.data as { attemptId: string; attemptToken: string };
    const runtime = await apiPost(page, `/api/attempts/${attemptId}/start`, { attemptToken });
    expect(runtime.status).toBe(200);
    for (const q of f.questions) {
      const wrong = q.options.find((o) => !o.isCorrect)!;
      const saved = await apiPost(page, `/api/attempts/${attemptId}/answer`, { attemptToken, questionId: q.id, selectedOptionId: wrong.id });
      expect(saved.status).toBe(200);
    }
    const submitted = await apiPost(page, `/api/attempts/${attemptId}/submit`, { attemptToken });
    expect(submitted.json).toMatchObject({ score: 0, percentage: 0 });

    await page.goto("/");
    await expect(page.getByText("Not eligible for role assessments")).toBeVisible();
    await expect(page.getByText("Your score: 0%")).toBeVisible();

    const role = await apiPost(page, "/api/portal/role", { roleId: f.roleId });
    expect(role.status).toBe(403);
    const direct = await apiPost(page, "/api/portal/attempts", { assessmentId: f.roleAssessment.id });
    expect(direct.status).toBe(403);
    const viaLink = await apiPost(page, `/api/assessments/${f.roleAssessment.slug}/register`, c);
    expect(viaLink.status).toBe(403);
  });
});

test.describe("identity", () => {
  test("login needs the matching phone, and a link can't overwrite someone's details", async ({ page }) => {
    const f = fixtures();
    await page.goto("/");
    const wrongPhone = await apiPost(page, "/api/portal/login", { email: `e2e+${f.run}-a@example.test`, phone: "1111111111" });
    expect(wrongPhone.status).toBe(401);

    const hijack = await apiPost(page, `/api/assessments/${f.aptitude.slug}/register`, {
      ...candidate(f.run, "a", "1111111111"),
      name: "Someone Else",
    });
    expect(hijack.status).toBe(403);
    const { data } = await db().from("candidates").select("name").eq("email", `e2e+${f.run}-a@example.test`).single();
    expect(data?.name).toBe(`E2E Candidate A ${f.run}`);
  });
});

test.describe("mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("registration fits without horizontal scrolling", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Proceed to Register" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a live assessment link fits too", async ({ page }) => {
    await page.goto(`/a/${fixtures().aptitude.slug}`);
    await expect(page.getByRole("button", { name: "Proceed to Register" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
