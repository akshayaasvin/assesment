import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { ADMIN_STATE, db, fixtures } from "./support/db";
import { statValue, watchForErrors } from "./support/admin";

/**
 * Runs after 02-drive-flow, which leaves candidate A (campus drive) with a
 * completed aptitude (66.67%) and role test (100%), and candidate B (cutoff
 * drive) with a completed aptitude (0%) below the cutoff.
 */
test.use({ storageState: ADMIN_STATE });

const candidateA = () => `E2E Candidate A ${fixtures().run}`;
const candidateB = () => `E2E Candidate B ${fixtures().run}`;

test("candidates: self-registered candidates are listed with their details and attempts", async ({ page }) => {
  const errors = watchForErrors(page);
  const { run, aptitude, roleLabel } = fixtures();
  await page.goto("/admin/candidates");
  const row = page.getByRole("row", { name: new RegExp(candidateA()) });
  await expect(row).toContainText(`e2e+${run}-a@example.test`);
  await expect(row).toContainText("9876500001");
  await expect(row).toContainText("E2E College");
  await expect(row).toContainText("Completed");
  await expect(row).toContainText(roleLabel);
  await expect(row).toContainText(aptitude.title);
  await expect(page.getByRole("row", { name: new RegExp(candidateB()) })).toContainText("Aptitude done");

  // Same count as the dashboard's "Total Candidates"
  const { count } = await db().from("candidates").select("id", { count: "exact", head: true });
  await expect(page.getByRole("row")).toHaveCount((count ?? 0) + 1);
  errors.assertClean();
});

test("results: rows, search, both filters, and CSV/Excel exports", async ({ page }) => {
  const errors = watchForErrors(page);
  const { aptitude } = fixtures();
  await page.goto("/admin/results");

  const aptitudeRow = page.getByRole("row", { name: new RegExp(`${candidateA()}.*${aptitude.title}`) });
  await expect(aptitudeRow).toContainText("2/3 (66.67%)");
  await expect(aptitudeRow).toContainText("Completed");
  await expect(aptitudeRow).toContainText(/\d+m \d+s|\d+s/); // time taken

  // Every attempt in the DB is listed (with "All" filters)
  const { count } = await db().from("attempts").select("id", { count: "exact", head: true });
  await expect(page.getByRole("row")).toHaveCount((count ?? 0) + 1);

  await page.getByPlaceholder("Search name, email, college...").fill(candidateB());
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.getByPlaceholder("Search name, email, college...").fill("");

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: aptitude.title }).click();
  await page.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: "Completed" }).click();
  await expect(page.getByRole("row")).toHaveCount(3); // header + A and B aptitude attempts

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  const csvText = readFileSync((await csv.path())!, "utf8");
  const header = csvText.split(/\r?\n/)[0];
  for (const col of ["Name", "Email", "Phone", "College", "Assessment", "Score", "Percentage", "Status", "Time Taken (min)"]) {
    expect(header).toContain(col);
  }
  expect(csvText).toContain(candidateA());
  expect(csvText).toContain("66.67");
  expect(csvText.trim().split(/\r?\n/)).toHaveLength(3); // header + 2 filtered rows

  const [xlsx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  const book = XLSX.read(readFileSync((await xlsx.path())!));
  const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]]);
  expect(sheetRows).toHaveLength(2);
  expect(sheetRows.map((r) => r.Name)).toContain(candidateA());
  errors.assertClean();
});

test("live monitoring: recently finished attempts appear", async ({ page }) => {
  const errors = watchForErrors(page);
  const { roleAssessment } = fixtures();
  await page.goto("/admin/live-monitoring");
  await expect(page.getByText("Recently finished (last 24 hours)")).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`${candidateA()}.*${roleAssessment.title}`) });
  await expect(row).toContainText("2/2 (100%)");
  errors.assertClean();
});

test("live monitoring: an in-progress attempt shows progress and time left", async ({ page }) => {
  const errors = watchForErrors(page);
  const { run, roleAssessment, questions } = fixtures();
  const s = db();
  // An in-progress attempt, created directly so this test doesn't depend on a second browser.
  const { data: cand } = await s
    .from("candidates")
    .insert({ name: `E2E Candidate Live ${run}`, email: `e2e+${run}-live@example.test`, phone: "9876500003" })
    .select("id")
    .single();
  const { data: attempt } = await s
    .from("attempts")
    .insert({ candidate_id: cand!.id, assessment_id: roleAssessment.id, status: "in_progress", started_at: new Date().toISOString(), warnings_count: 1 })
    .select("id")
    .single();
  await s.from("answers").insert({ attempt_id: attempt!.id, question_id: questions[0].id, selected_option_id: questions[0].options[0].id });
  await s.from("violations").insert({ attempt_id: attempt!.id, type: "tab_switch", message: "e2e" });

  await page.goto("/admin/live-monitoring");
  const card = page.locator("div", { hasText: `E2E Candidate Live ${run}` }).filter({ has: page.getByRole("button", { name: "Disqualify" }) }).last();
  await expect(card).toContainText(roleAssessment.title);
  await expect(card).toContainText("1/2 answered");
  await expect(card).toContainText(/~\dm left/);
  await expect(card).toContainText("Tab switch ×1");
  await expect(card).toContainText("1/4");

  // Disqualify from the board
  await card.getByRole("button", { name: "Disqualify" }).click();
  await page.getByRole("button", { name: "Disqualify", exact: true }).last().click();
  await expect.poll(async () => (await s.from("attempts").select("status").eq("id", attempt!.id).single()).data?.status).toBe("disqualified");
  errors.assertClean();
});

test("reports: numbers are consistent with results", async ({ page }) => {
  const errors = watchForErrors(page);
  const { data: attempts } = await db().from("attempts").select("status, percentage");
  const completed = (attempts ?? []).filter((a) => a.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((t, a) => t + Number(a.percentage), 0) / completed.length) : 0;

  await page.goto("/admin/reports");
  await expect(statValue(page, "Average Score")).toHaveText(`${avg}%`);
  await expect(page.getByText(/Hardest questions/i)).toBeVisible();
  errors.assertClean();
});

test("every admin page loads without console errors", async ({ page }) => {
  const errors = watchForErrors(page);
  for (const path of ["/admin/dashboard", "/admin/assessments", "/admin/assessments/new", "/admin/roles", "/admin/question-bank", "/admin/question-bank/import", "/admin/candidates", "/admin/results", "/admin/live-monitoring", "/admin/reports", "/admin/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
  }
  errors.assertClean();
});
