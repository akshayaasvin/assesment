import { expect, type Page } from "@playwright/test";

export interface CandidateDetails {
  name: string;
  email: string;
  phone: string;
  college: string;
  degree: string;
  branch: string;
  graduationYear: string;
  candidateType: "Fresher" | "Experienced";
  yearsExperience?: string;
}

export function candidate(run: string, tag: string, phone: string, overrides: Partial<CandidateDetails> = {}): CandidateDetails {
  return {
    name: `E2E Candidate ${tag.toUpperCase()} ${run}`,
    email: `e2e+${run}-${tag}@example.test`,
    phone,
    college: "E2E College",
    degree: "B.E.",
    branch: "CSE",
    graduationYear: "2026",
    candidateType: "Fresher",
    ...overrides,
  };
}

/** POST from inside the page, so the browser's own cookies (the anonymous Supabase session) are used. */
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
  await page.getByLabel("Full name").fill(c.name);
  await page.getByLabel("Email").fill(c.email);
  await page.getByLabel("Phone").fill(c.phone);
  await page.getByLabel("College", { exact: true }).fill(c.college);
  await page.getByLabel("Degree").fill(c.degree);
  await page.getByLabel("Branch").fill(c.branch);
  await page.getByLabel("Graduation year").fill(c.graduationYear);
  await page.getByLabel("Candidate type").click();
  await page.getByRole("option", { name: c.candidateType }).click();
  if (c.candidateType === "Experienced" && c.yearsExperience) await page.getByLabel("Years of experience").fill(c.yearsExperience);
}

/** Registers on /drive/<id> and waits for the aptitude step. */
export async function register(page: Page, driveId: string, c: CandidateDetails) {
  await page.goto(`/drive/${driveId}`);
  await fillRegistration(page, c);
  await page.getByLabel("Consent").click();
  await page.getByRole("button", { name: "Register and continue" }).click();
  await expect(page.getByText("Aptitude test", { exact: true })).toBeVisible();
}

/** From a stage card: through the camera/mic check (Chromium fake devices) into the test. */
export async function startStage(page: Page, button: string | RegExp) {
  await page.getByRole("button", { name: button }).click();
  const check = page.getByRole("button", { name: "Enter fullscreen and start" });
  // Skipped when the camera stream from an earlier stage is still live.
  if (await check.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await expect(check).toBeEnabled();
    await check.click();
  }
  await expect(page.getByTestId("section-timer")).toBeVisible();
}

/** Picks an option for the question on screen. */
export async function chooseOption(page: Page, questionText: string, optionText: string) {
  await expect(page.getByRole("heading", { name: questionText })).toBeVisible();
  const option = page.getByRole("button", { name: optionText, exact: true });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
}

export async function submitStage(page: Page) {
  await page.getByRole("button", { name: "Submit", exact: true }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Submit", exact: true }).click();
}

/** The section countdown ("m:ss"), in seconds. */
export async function timerSeconds(page: Page) {
  const text = await page.getByTestId("section-timer").innerText();
  const [m, s] = text.trim().split(":").map(Number);
  return m * 60 + s;
}
