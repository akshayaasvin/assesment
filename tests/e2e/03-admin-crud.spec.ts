import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { ADMIN_STATE, STATE_DIR, db, fixtures } from "./support/db";
import { choose, expectToast, statValue, watchForErrors } from "./support/admin";

test.use({ storageState: ADMIN_STATE });
test.describe.configure({ mode: "serial" });

test("dashboard stat cards match the database, and its links work", async ({ page }) => {
  const errors = watchForErrors(page);
  const s = db();
  const [{ data: assessments }, { count: candidates }, { data: attempts }] = await Promise.all([
    s.from("assessments").select("id"),
    s.from("candidates").select("id", { count: "exact", head: true }),
    s.from("attempts").select("status, percentage"),
  ]);
  const completed = (attempts ?? []).filter((a) => a.status === "completed");
  const avg = completed.length ? Math.round(completed.reduce((t, a) => t + Number(a.percentage), 0) / completed.length) : 0;

  await page.goto("/admin/dashboard");
  await expect(statValue(page, "Total Assessments")).toHaveText(String(assessments!.length));
  await expect(statValue(page, "Total Candidates")).toHaveText(String(candidates));
  await expect(statValue(page, "Completed Tests")).toHaveText(String(completed.length));
  await expect(statValue(page, "Average Score")).toHaveText(`${avg}%`);

  await page.getByRole("link", { name: "View all" }).click();
  await expect(page).toHaveURL(/\/admin\/assessments$/);
  await page.goto("/admin/dashboard");
  await page.getByRole("link", { name: "New assessment" }).click();
  await expect(page).toHaveURL(/\/admin\/assessments\/new$/);
  errors.assertClean();
});

test("roles: create, edit, delete", async ({ page }) => {
  const errors = watchForErrors(page);
  const { run } = fixtures();
  const label = `E2E UI Role ${run}`;
  await page.goto("/admin/roles");

  await page.getByRole("button", { name: "Add role" }).click();
  await page.getByLabel("Role name").fill(label);
  await page.getByLabel(/^Key/).fill(`e2e-ui-${run}`);
  await page.getByRole("button", { name: "Save role" }).click();
  await expectToast(page, "Role created.");
  const row = page.getByRole("row", { name: new RegExp(label) });
  await expect(row).toBeVisible();

  // Keys with spaces are rejected
  await page.getByRole("button", { name: "Add role" }).click();
  await page.getByLabel("Role name").fill(`${label} 2`);
  await page.getByLabel(/^Key/).fill("has spaces");
  await page.getByRole("button", { name: "Save role" }).click();
  await expectToast(page, "Key can't contain spaces.");
  await page.keyboard.press("Escape");

  await row.getByRole("button").first().click(); // pencil
  await page.getByLabel("Role name").fill(`${label} Edited`);
  await page.getByRole("button", { name: "Save role" }).click();
  await expectToast(page, "Role updated.");
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(`${label} Edited`) })).toBeVisible();
  const { data: saved } = await db().from("roles").select("label").eq("key", `e2e-ui-${run}`).single();
  expect(saved?.label).toBe(`${label} Edited`);

  await page.getByRole("button", { name: `Delete ${label} Edited` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expectToast(page, "Role deleted.");
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(label) })).toHaveCount(0);
  const { data: gone } = await db().from("roles").select("id").eq("key", `e2e-ui-${run}`);
  expect(gone).toEqual([]);
  errors.assertClean();
});

test("question bank: add, edit, delete, persisted options and answer", async ({ page }) => {
  const errors = watchForErrors(page);
  const { run } = fixtures();
  const text = `E2E ${run} UI question: which is a prime number?`;
  await page.goto("/admin/question-bank");

  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("dialog").getByLabel("Question", { exact: true }).fill(text);
  await page.getByPlaceholder("Option 1").fill("4");
  await page.getByPlaceholder("Option 2").fill("6");
  await page.getByRole("button", { name: "Add option" }).click();
  await page.getByPlaceholder("Option 3").fill("7");
  await page.getByRole("radio").nth(2).click(); // "7" is correct
  await page.getByRole("dialog").getByLabel("Marks").fill("2");
  await page.getByRole("button", { name: "Save question" }).click();
  await expectToast(page, "Question added.");

  const s = db();
  const { data: q } = await s.from("questions").select("id, marks, question_options(text, is_correct, order_index)").eq("text", text).single();
  expect(q!.marks).toBe(2);
  const opts = (q!.question_options as { text: string; is_correct: boolean; order_index: number }[]).sort((a, b) => a.order_index - b.order_index);
  expect(opts.map((o) => o.text)).toEqual(["4", "6", "7"]);
  expect(opts.map((o) => o.is_correct)).toEqual([false, false, true]);

  await page.reload();
  const row = page.getByRole("row", { name: new RegExp("UI question: which is a prime") });
  await row.getByRole("button").first().click(); // pencil
  await page.getByRole("dialog").getByLabel("Question", { exact: true }).fill(`${text} (edited)`);
  await page.getByRole("button", { name: "Save question" }).click();
  await expectToast(page, "Question updated.");
  const { data: edited } = await s.from("questions").select("text, question_options(is_correct, order_index)").eq("id", q!.id).single();
  expect(edited!.text).toBe(`${text} (edited)`);
  expect((edited!.question_options as { is_correct: boolean }[]).filter((o) => o.is_correct)).toHaveLength(1);

  await page.reload();
  await page.getByRole("row", { name: /UI question: which is a prime/ }).getByRole("button").last().click(); // trash
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expectToast(page, "Question deleted.");
  await page.reload();
  await expect(page.getByRole("row", { name: /UI question: which is a prime/ })).toHaveCount(0);
  const { data: gone } = await s.from("questions").select("id").eq("id", q!.id);
  expect(gone).toEqual([]);
  errors.assertClean();
});

test("question bank: bulk import creates categories, and the category filter works", async ({ page }) => {
  const errors = watchForErrors(page);
  const { run } = fixtures();
  const category = `E2E ${run} Import Cat`;
  const csv = [
    "question,option1,option2,option3,correct,category,difficulty,marks",
    `"E2E ${run} Imported 1: 3 x 3?",6,9,12,2,${category},easy,1`,
    `"E2E ${run} Imported 2: largest?",1,100,10,B,${category},hard,2`,
  ].join("\n");
  const file = path.join(STATE_DIR, "import.csv");
  writeFileSync(file, csv);

  await page.goto("/admin/question-bank/import");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText("2 of 2 questions will be imported.")).toBeVisible();
  await page.getByRole("button", { name: "Import questions" }).click();
  await expectToast(page, "Imported 2 question(s).");
  await expect(page).toHaveURL(/\/admin\/question-bank$/);

  const { data: imported } = await db()
    .from("questions")
    .select("text, marks, difficulty, categories(name), question_options(text, is_correct)")
    .like("text", `E2E ${run} Imported%`)
    .order("text");
  expect(imported).toHaveLength(2);
  const correctText = (q: NonNullable<typeof imported>[number]) => (q.question_options as { text: string; is_correct: boolean }[]).find((o) => o.is_correct)!.text;
  expect(correctText(imported![0])).toBe("9");
  expect(correctText(imported![1])).toBe("100");
  expect(imported![1]).toMatchObject({ marks: 2, difficulty: "hard" });

  await page.getByRole("link", { name: category }).click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.getByRole("row")).toHaveCount(3); // header + 2
  errors.assertClean();
});

test("assessments: create, double-click guard, edit, status, copy link, delete", async ({ page, context }) => {
  const errors = watchForErrors(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { run, roleLabel, roleId } = fixtures();
  const title = `E2E ${run} Admin Created`;
  const s = db();

  await page.goto("/admin/assessments/new");
  await page.getByPlaceholder("Full Stack Developer Assessment").fill(title);
  await page.getByPlaceholder(/What this assessment covers/).fill("Created by the e2e suite.");
  await choose(page, "Role", roleLabel);
  // Double-click must still create exactly one assessment.
  await page.getByRole("button", { name: "Create assessment" }).dblclick();
  await expect(page).toHaveURL(/\/admin\/assessments\/[0-9a-f-]{36}$/);
  await expectToast(page, "Assessment created.");

  const { data: rows } = await s
    .from("assessments")
    .select("id, kind, role_id, status, description, assessment_sections(duration_minutes, question_count)")
    .eq("title", title);
  expect(rows).toHaveLength(1);
  const created = rows![0];
  expect(created).toMatchObject({ kind: "role", role_id: roleId, status: "draft", description: "Created by the e2e suite." });
  expect(created.assessment_sections).toEqual([{ duration_minutes: 20, question_count: 10 }]);

  // List shows question count and duration
  await page.goto("/admin/assessments");
  const listRow = page.getByRole("row", { name: new RegExp(title) });
  await expect(listRow).toContainText("10 Q");
  await expect(listRow).toContainText("20 min");
  await expect(listRow).toContainText(roleLabel);

  // Edit keeps the same id (no duplicate)
  await page.goto(`/admin/assessments/${created.id}`);
  await page.getByPlaceholder("Full Stack Developer Assessment").fill(`${title} (edited)`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expectToast(page, "Changes saved.");
  await page.reload();
  await expect(page.getByPlaceholder("Full Stack Developer Assessment")).toHaveValue(`${title} (edited)`);
  const { data: afterEdit } = await s.from("assessments").select("id").like("title", `${title}%`);
  expect(afterEdit).toEqual([{ id: created.id }]);

  // Status: draft -> live -> ended
  await page.getByRole("button", { name: "Assessment actions" }).click();
  await page.getByRole("menuitem", { name: "Start now" }).click();
  await expectToast(page, "Assessment is now live.");
  await expect.poll(async () => (await s.from("assessments").select("status").eq("id", created.id).single()).data?.status).toBe("live");
  await page.getByRole("button", { name: "Assessment actions" }).click();
  await page.getByRole("menuitem", { name: "Stop" }).click();
  await expectToast(page, "Assessment stopped.");
  await expect.poll(async () => (await s.from("assessments").select("status").eq("id", created.id).single()).data?.status).toBe("ended");

  // Candidate link
  await page.getByRole("button", { name: "Copy candidate link" }).click();
  await expectToast(page, "Candidate link copied.");
  const { data: slugRow } = await s.from("assessments").select("slug").eq("id", created.id).single();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/a/${slugRow!.slug}$`));

  // Delete from the detail page -> back to the list, gone from the DB
  await page.getByRole("button", { name: "Assessment actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Are you sure you want to delete this assessment?")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expectToast(page, "Assessment deleted.");
  await expect(page).toHaveURL(/\/admin\/assessments$/);
  const { data: gone } = await s.from("assessments").select("id").eq("id", created.id);
  expect(gone).toEqual([]);
  const { data: orphanSections } = await s.from("assessment_sections").select("id").eq("assessment_id", created.id);
  expect(orphanSections).toEqual([]);
  errors.assertClean();
});

test("assessments: a role assessment without a role is rejected", async ({ page }) => {
  await page.goto("/admin/assessments/new");
  await page.getByPlaceholder("Full Stack Developer Assessment").fill(`E2E ${fixtures().run} No Role`);
  await page.getByRole("button", { name: "Create assessment" }).click();
  await expectToast(page, /Choose the role this assessment is for/);
  await expect(page).toHaveURL(/\/admin\/assessments\/new$/);
});

test("settings: saved values persist and are used as new-assessment defaults", async ({ page }) => {
  const errors = watchForErrors(page);
  const s = db();
  const { data: original } = await s.from("default_settings").select("*").eq("id", 1).single();
  try {
    await page.goto("/admin/settings");
    const warnings = page.locator('input[type="number"]').first();
    const next = original!.max_warnings === 7 ? 6 : 7;
    await warnings.fill(String(next));
    await page.getByRole("button", { name: "Save settings" }).click();
    await expectToast(page, "Default settings saved.");
    await page.reload();
    await expect(page.locator('input[type="number"]').first()).toHaveValue(String(next));

    await page.goto("/admin/assessments/new");
    await expect(page.locator("div.space-y-1\\.5", { hasText: "Maximum warnings" }).locator("input")).toHaveValue(String(next));
  } finally {
    // Restore the real settings exactly as they were.
    await s.from("default_settings").update(original!).eq("id", 1);
  }
  errors.assertClean();
});
