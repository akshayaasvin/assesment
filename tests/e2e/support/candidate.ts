import { expect, type Page } from "@playwright/test";

export interface CandidateDetails {
  name: string;
  email: string;
  phone: string;
  college: string;
  district: string;
  department: string;
}

export function candidate(run: string, tag: string, phone: string): CandidateDetails {
  return {
    name: `E2E Candidate ${tag.toUpperCase()} ${run}`,
    email: `e2e+${run}-${tag}@example.test`,
    phone,
    college: "E2E College",
    district: "E2E District",
    department: "E2E Department",
  };
}

/** POST from inside the page, so the browser's own cookies (incl. the httpOnly candidate session) are used. */
export async function apiPost(page: Page, path: string, body: unknown = {}) {
  return page.evaluate(
    async ({ path, body }) => {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON body */
      }
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", json: json as Record<string, unknown> | null };
    },
    { path, body }
  );
}

export async function fillRegistration(page: Page, c: CandidateDetails) {
  await page.getByLabel("Full Name").fill(c.name);
  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Phone").fill(c.phone);
  await page.getByLabel("College Name").fill(c.college);
  await page.getByLabel("District").fill(c.district);
  await page.getByLabel("Department").fill(c.department);
}

export async function registerViaPortal(page: Page, c: CandidateDetails) {
  await page.goto("/");
  await fillRegistration(page, c);
  await page.getByText("I have read and agree").click();
  await page.getByRole("button", { name: "Proceed to Register" }).click();
  await expect(page.getByText("Complete Aptitude Assessment")).toBeVisible();
}

/** Clicks the option with this exact text for the question currently shown. */
export async function chooseOption(page: Page, questionText: string, optionText: string) {
  await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
  await page.getByRole("button", { name: optionText, exact: true }).click();
  await expect(page.getByRole("button", { name: optionText, exact: true })).toHaveClass(/bg-primary/);
}

/** Reads the section countdown ("m:ss") from the exam header, in seconds. */
export async function timerSeconds(page: Page) {
  const text = await page.locator("header p.tabular-nums").innerText();
  const [m, s] = text.trim().split(":").map(Number);
  return m * 60 + s;
}
