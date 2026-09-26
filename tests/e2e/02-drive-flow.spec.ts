import { test, expect } from "@playwright/test";
import { db, fixtures } from "./support/db";
import { apiPost, candidate, chooseOption, fillRegistration, register, startStage, submitStage, timerSeconds } from "./support/candidate";

test.describe.configure({ mode: "serial" });

const correct = (q: { options: { text: string; isCorrect: boolean }[] }) => q.options.find((o) => o.isCorrect)!.text;
const wrong = (q: { options: { text: string; isCorrect: boolean }[] }) => q.options.find((o) => !o.isCorrect)!.text;

test.describe("home page", () => {
  test("lists live drives only; draft and unknown drives 404", async ({ page }) => {
    const f = fixtures();
    await page.goto("/");
    const list = page.getByRole("list", { name: "Live drives" });
    await expect(list.getByText(f.drive.name)).toBeVisible();
    await expect(list.getByText(f.drive.college)).toBeVisible();
    await expect(list.getByText(f.cutoffDrive.name)).toBeVisible();
    await expect(page.getByText(f.draftDrive.name)).toHaveCount(0);

    expect((await page.goto(`/drive/${f.draftDrive.id}`))?.status()).toBe(404);
    expect((await page.goto("/drive/00000000-0000-4000-8000-000000000000"))?.status()).toBe(404);
  });
});

test.describe("registration validation", () => {
  test("every field, experience for experienced candidates, PDF-only resume, and consent", async ({ page }) => {
    const f = fixtures();
    await page.goto(`/drive/${f.drive.id}`);
    await page.getByRole("button", { name: "Register and continue" }).click();
    await expect(page.getByText("Enter your full name.")).toBeVisible();

    await fillRegistration(page, candidate(f.run, "val", "9000000001", { candidateType: "Experienced" }));
    await page.getByRole("button", { name: "Register and continue" }).click();
    await expect(page.getByText("Enter your years of experience.")).toBeVisible();

    await page.getByLabel("Years of experience").fill("3");
    await page.getByLabel(/^Resume/).setInputFiles({ name: "resume.txt", mimeType: "text/plain", buffer: Buffer.from("not a pdf") });
    await page.getByRole("button", { name: "Register and continue" }).click();
    await expect(page.getByText("Resume must be a PDF.")).toBeVisible();

    await page.getByLabel(/^Resume/).setInputFiles([]);
    await page.getByRole("button", { name: "Register and continue" }).click();
    await expect(page.getByText("Please accept the monitoring and data-use consent.")).toBeVisible();
  });
});

test.describe("full flow: register -> aptitude -> role select -> role test -> completed", () => {
  test("with refresh mid-test, scoring checked against the answer key", async ({ page }) => {
    const f = fixtures();
    const c = candidate(f.run, "a", "9876500001");
    const [q1, q2, q3] = f.questions;

    await register(page, f.drive.id, c);
    await expect(page.getByText(f.roleAssessment.title)).toHaveCount(0);

    // The role test can't be started before aptitude, even by calling the API directly.
    const early = await apiPost(page, "/api/drive/stage", { stage: "role", assessmentId: f.roleAssessment.id });
    expect(early.status).toBe(403);

    // Aptitude, refresh after one answer.
    await startStage(page, "Start aptitude test");
    await chooseOption(page, q1.text, correct(q1));
    await expect(page.getByText("1/3 answered")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click(); // question change -> debounced batch save
    await page.waitForTimeout(3_000);

    await page.reload();
    await startStage(page, "Resume test");
    await expect(page.getByText("1/3 answered")).toBeVisible(); // answer came back from the server
    expect(await timerSeconds(page)).toBeLessThanOrEqual(297); // timer continued, didn't restart at 5:00

    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q2.text, correct(q2));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q3.text, wrong(q3));
    await submitStage(page);

    // Role selection: only the LIVE role test of this drive.
    await expect(page.getByText("Choose your role")).toBeVisible();
    await expect(page.getByRole("button", { name: `Start ${f.roleLabel} test` })).toHaveCount(1);
    await expect(page.getByText(f.draftAssessment.title)).toHaveCount(0);

    // Scoring by hand: 2 of 3 one-mark questions right = 66.67%.
    const s = db();
    const { data: cand } = await s.from("candidates").select("id, status, consent_at, auth_user_id, drive_id").eq("email", c.email).single();
    expect(cand).toMatchObject({ status: "aptitude_done", drive_id: f.drive.id });
    expect(cand!.consent_at).toBeTruthy();
    expect(cand!.auth_user_id).toBeTruthy();
    const { data: apt } = await s.from("attempts").select("id, stage, status, score, total_marks, percentage").eq("candidate_id", cand!.id).eq("stage", "aptitude").single();
    expect(apt).toMatchObject({ status: "completed", score: 2, total_marks: 3, percentage: 66.67 });
    const { data: answers } = await s.from("answers").select("question_id, selected_option_id, is_correct").eq("attempt_id", apt!.id);
    expect(answers).toHaveLength(3);
    for (const a of answers ?? []) {
      const q = f.questions.find((x) => x.id === a.question_id)!;
      expect(a.is_correct).toBe(q.options.find((o) => o.id === a.selected_option_id)!.isCorrect);
    }

    // Role test.
    await startStage(page, `Start ${f.roleLabel} test`);
    await chooseOption(page, q1.text, correct(q1));
    await page.getByRole("button", { name: "Next" }).click();
    await chooseOption(page, q2.text, correct(q2));
    await submitStage(page);
    await expect(page.getByText("Assessment Completed")).toBeVisible();

    const { data: done } = await s.from("candidates").select("status, role_id").eq("id", cand!.id).single();
    expect(done).toMatchObject({ status: "completed", role_id: f.roleId });
    const { data: role } = await s.from("attempts").select("stage, status, percentage").eq("candidate_id", cand!.id).eq("stage", "role").single();
    expect(role).toMatchObject({ stage: "role", status: "completed", percentage: 100 });

    // Survives refresh; no second attempt at either stage.
    await page.reload();
    await expect(page.getByText("Assessment Completed")).toBeVisible();
    expect((await apiPost(page, "/api/drive/stage", { stage: "role" })).status).toBe(409);
    expect((await apiPost(page, "/api/drive/stage", { stage: "aptitude" })).status).toBe(409);
  });
});

test.describe("duplicates", () => {
  test("the same email or phone can't register twice in the same drive", async ({ browser }) => {
    const f = fixtures();
    for (const [dup, message] of [
      [candidate(f.run, "a", "9876599999"), "This email is already registered in this drive."],
      [candidate(f.run, "dup", "9876500001"), "This phone number is already registered in this drive."],
    ] as const) {
      const context = await browser.newContext(); // a different device = a new anonymous session
      const page = await context.newPage();
      await page.goto(`/drive/${f.drive.id}`);
      await fillRegistration(page, dup);
      await page.getByLabel("Consent").click();
      await page.getByRole("button", { name: "Register and continue" }).click();
      await expect(page.getByText(message)).toBeVisible();
      await context.close();
    }
  });
});

test.describe("aptitude cutoff", () => {
  test("below the drive's cutoff, the role test doesn't unlock", async ({ page }) => {
    const f = fixtures();
    await register(page, f.cutoffDrive.id, candidate(f.run, "b", "9876500002"));
    await startStage(page, "Start aptitude test");
    for (const [i, q] of f.questions.entries()) {
      await chooseOption(page, q.text, wrong(q));
      if (i < f.questions.length - 1) await page.getByRole("button", { name: "Next" }).click();
    }
    await submitStage(page);
    await expect(page.getByText("Thank you for taking the aptitude test")).toBeVisible();
    await expect(page.getByText("Cutoff: 80%")).toBeVisible();
    expect((await apiPost(page, "/api/drive/stage", { stage: "role", assessmentId: f.roleAssessment.id })).status).toBe(403);
  });
});

test.describe("announcements and disqualification", () => {
  test("a broadcast reaches the candidate; disqualification locks the test within one sync", async ({ page }) => {
    const f = fixtures();
    const c = candidate(f.run, "c", "9876500003");
    await register(page, f.drive.id, c);
    await startStage(page, "Start aptitude test");
    await chooseOption(page, f.questions[0].text, correct(f.questions[0]));

    const s = db();
    const { data: cand } = await s.from("candidates").select("id").eq("email", c.email).single();

    // Admin broadcast (P4 builds the admin UI; the delivery path is what's tested here).
    await s.from("announcements").insert({ drive_id: f.drive.id, type: "text", text: `E2E ${f.run}: 10 minutes left` });
    await expect(page.getByText(`E2E ${f.run}: 10 minutes left`).first()).toBeVisible({ timeout: 20_000 });

    // Admin disqualifies (P5 builds the button; the enforcement path is what's tested here).
    await s.from("candidates").update({ status: "disqualified", disqualified_reason: "E2E: phone use", disqualified_at: new Date().toISOString() }).eq("id", cand!.id);
    await expect(page.getByText("You have been disqualified")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Reason: E2E: phone use")).toBeVisible();

    // The server refuses to continue, whatever the browser does.
    expect((await apiPost(page, "/api/drive/stage", { stage: "aptitude" })).status).toBe(403);
    const { data: apt } = await s.from("attempts").select("id").eq("candidate_id", cand!.id).single();
    expect((await apiPost(page, "/api/drive/stage/submit", { attemptId: apt!.id })).status).toBe(403);
  });
});

test.describe("mobile (375px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of ["/", "drive"] as const) {
    test(`${path === "/" ? "home" : "registration"} fits without horizontal scrolling`, async ({ page }) => {
      await page.goto(path === "/" ? "/" : `/drive/${fixtures().drive.id}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
