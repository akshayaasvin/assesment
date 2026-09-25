import { test, expect } from "@playwright/test";
import { ADMIN_STATE, ADMIN_UID, NON_ADMIN_STATE, db, sessionCookies, sessionForEmail } from "./support/db";

const ADMIN_PAGES = [
  "/admin",
  "/admin/dashboard",
  "/admin/assessments",
  "/admin/assessments/new",
  "/admin/roles",
  "/admin/question-bank",
  "/admin/candidates",
  "/admin/results",
  "/admin/live-monitoring",
  "/admin/reports",
  "/admin/settings",
];

test.describe("admin route protection (signed out)", () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  }

  test("wrong credentials show an error and stay on login", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("signed in, but not the admin", () => {
  test.use({ storageState: NON_ADMIN_STATE });

  test("is denied every admin page", async ({ page }) => {
    for (const path of ["/admin/dashboard", "/admin/roles", "/admin/results"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login\?error=unauthorized/);
      await expect(page.getByText("That account does not have admin access.")).toBeVisible();
    }
  });
});

test.describe("admin session", () => {
  test.use({ storageState: ADMIN_STATE });

  test("/admin/login bounces an already signed-in admin to the dashboard", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test("log out ends the session", async ({ browser }) => {
    // Its own admin session: logging out revokes that session server-side,
    // which would break every later test sharing ADMIN_STATE.
    const { data } = await db().auth.admin.getUserById(ADMIN_UID);
    const session = await sessionForEmail(data.user!.email!);
    const context = await browser.newContext({ storageState: { cookies: await sessionCookies(session.access_token, session.refresh_token), origins: [] } });
    const page = await context.newPage();
    await page.goto("/admin/dashboard");
    await page.getByRole("button", { name: /@/ }).click(); // account menu shows the admin email
    await page.getByRole("menuitem", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);
    await context.close();
  });
});
