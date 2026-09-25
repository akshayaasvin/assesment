/**
 * Free-tier budget calculator for one drive.
 *
 *   npx tsx scripts/budget.ts                      # 300 candidates, 2 h, 10 s poll
 *   npx tsx scripts/budget.ts --candidates=500 --hours=3 --poll=15
 *
 * Limits are the free-tier numbers published by Supabase and Vercel
 * (checked 2026-09-25). Every row should stay under 50% of the monthly limit
 * per drive, so several drives fit in a month. Per-item sizes are estimates
 * to be replaced with measurements from the staging load test.
 */

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};

const P = {
  candidates: arg("candidates", 300),
  hours: arg("hours", 2),
  pollSeconds: arg("poll", 10), // candidate sync interval (Supabase RPC, not Vercel)
  admins: arg("admins", 3), // admin laptops watching Live Monitoring
  adminPollSeconds: arg("adminPoll", 10),
  photoKB: arg("photoKB", 20), // evidence / spot-check JPEG, 320px
  photosPerCandidate: arg("photos", 4), // flagged events + spot checks (capped at 20 per candidate)
  voiceClips: arg("clips", 4), // push-to-talk clips per drive
  voiceKB: arg("voiceKB", 120), // 60 s Opus at 16 kbps
  resumeKB: arg("resumeKB", 200), // typical PDF; hard cap 1 MB
  resumeShare: arg("resumeShare", 0.6), // fraction who upload one
  liveViews: arg("liveViews", 20), // on-demand live video sessions per drive
  liveViewMinutes: arg("liveMin", 5),
};

const seconds = P.hours * 3600;
const MB = 1024;
const GB = 1024 * MB;

// ---- Per-request sizes (KB), estimates
const SYNC_RESPONSE_KB = 0.7; // tiny JSON + HTTP headers; answers/events go up (ingress, free)
const EXAM_PAYLOAD_KB = 30; // questions + options for one stage, no answer keys
const TILE_KB = 0.2; // one candidate tile in the admin monitor response
const PAGE_WEIGHT_KB = 700; // first-load HTML/JS/CSS from Vercel's CDN
const PAGE_LOADS = 4; // home, register, aptitude, role (per candidate)
const VERCEL_CALLS_PER_CANDIDATE = 12; // SSR pages, register, start stage x2, submit x2, signed upload URLs
const CPU_MS_PER_CALL = 40; // SSR/route CPU time (not waiting on the DB)
const DB_KB_PER_CANDIDATE = 50; // answers, served questions, events, indexes

// ---- Derived per-drive usage
const syncCalls = (P.candidates * seconds) / P.pollSeconds;
const adminCalls = (P.admins * seconds) / P.adminPollSeconds;
const photos = P.candidates * P.photosPerCandidate;

const supabaseEgressKB =
  syncCalls * SYNC_RESPONSE_KB + // candidate sync responses
  P.candidates * 2 * EXAM_PAYLOAD_KB * 1.5 + // two stages, +50% for resumes after refresh
  adminCalls * P.candidates * TILE_KB + // admin monitor polling
  photos * P.photoKB * P.admins + // each photo viewed once per admin
  P.voiceClips * P.voiceKB * P.candidates + // every candidate fetches every clip once
  P.candidates * P.resumeShare * 0.2 * P.resumeKB; // admins open ~20% of resumes

const storageKB = P.candidates * P.resumeShare * P.resumeKB + photos * P.photoKB; // clips deleted at close
const storageWorstKB = P.candidates * 1024 + P.candidates * 20 * P.photoKB; // everyone uploads 1 MB + photo cap
const vercelCalls = P.candidates * VERCEL_CALLS_PER_CANDIDATE + adminCalls;
const vercelCpuHours = (vercelCalls * CPU_MS_PER_CALL) / 3_600_000;
const vercelCdnKB = P.candidates * PAGE_LOADS * PAGE_WEIGHT_KB;
const turnKB = P.liveViews * P.liveViewMinutes * 60 * (500 / 8); // 500 kbps video

type Row = [string, number, number, string];
const rows: Row[] = [
  ["Supabase: API requests/sec (peak, sync + admin)", (P.candidates / P.pollSeconds) + P.admins / P.adminPollSeconds, 0, "req/s"],
  ["Supabase: egress per drive", supabaseEgressKB / GB, 5, "GB"],
  ["Supabase: storage added (typical)", storageKB / GB, 1, "GB"],
  ["Supabase: storage added (worst case)", storageWorstKB / GB, 1, "GB"],
  ["Supabase: database growth", (P.candidates * DB_KB_PER_CANDIDATE) / GB, 0.5, "GB"],
  ["Supabase: auth MAU (anonymous sign-ins)", P.candidates, 50_000, "users"],
  ["Supabase: Realtime connections (candidates)", 0, 200, "conn"],
  ["Vercel: function invocations", vercelCalls, 1_000_000, "calls"],
  ["Vercel: active CPU", vercelCpuHours, 4, "hours"],
  ["Vercel: CDN transfer (page assets)", vercelCdnKB / GB, 100, "GB"],
  ["TURN relay (Open Relay free tier)", turnKB / GB, 20, "GB"],
];

const pct = (used: number, limit: number) => (limit ? (used / limit) * 100 : NaN);
console.log(`Drive: ${P.candidates} candidates, ${P.hours} h, sync every ${P.pollSeconds} s, ${P.admins} admins\n`);
console.log("Resource".padEnd(52) + "Per drive".padStart(17) + "Free limit".padStart(17) + "  % of month");
for (const [name, used, limit, unit] of rows) {
  const p = pct(used, limit);
  const flag = Number.isNaN(p) ? "   (no hard cap)" : `${p.toFixed(1).padStart(8)}%${p >= 50 ? "  <-- OVER 50%" : ""}`;
  const fmt = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(n < 1 ? 3 : 1));
  console.log(name.padEnd(52) + `${fmt(used)} ${unit}`.padStart(17) + (limit ? `${fmt(limit)} ${unit}` : "-").padStart(17) + flag);
}
console.log(`\nCandidate sync calls per drive: ${Math.round(syncCalls).toLocaleString("en-US")} (to Supabase, not Vercel)`);
