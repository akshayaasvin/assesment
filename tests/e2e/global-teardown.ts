import { cleanupE2EData } from "./support/db";

export default async function globalTeardown() {
  if (process.env.E2E_KEEP_DATA === "1") return; // debugging: inspect what the run created
  await cleanupE2EData();
}
