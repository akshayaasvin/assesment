import { expect, type Page } from "@playwright/test";

/**
 * Fails the test if the page logs a console error or a request to this app
 * fails with a 5xx. Call once per test (inside the test or a beforeEach).
 */
export function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 500 && res.url().startsWith(new URL(page.url() || "http://localhost").origin)) {
      problems.push(`HTTP ${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return {
    assertClean() {
      expect(problems, problems.join("\n")).toEqual([]);
    },
  };
}

/** Radix Select inside a form field, found by the field's visible label text. */
export function selectIn(page: Page, label: string) {
  return page.locator("div.space-y-1\\.5", { has: page.getByText(label, { exact: true }) }).getByRole("combobox");
}

export async function choose(page: Page, label: string, option: string) {
  await selectIn(page, label).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** The number shown on a StatCard, located by its label. */
export function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=following-sibling::p[1]");
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
