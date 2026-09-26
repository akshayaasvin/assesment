# Assistlana Assessment Platform (Phase 1)

A Next.js + Supabase rebuild of the legacy static assessment page in `../Campus Assessment`. See
`Campus Assessment/` for the original single-file HTML app - it is left untouched.

Full scope, phasing rationale and architecture decisions: see the plan this was built from, or the
summary at the bottom of this file.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the SQL editor, run the contents of `supabase/migrations/0001_init.sql` once. It creates every
   table, the `is_admin()` helper, RLS policies (admin-only; there are no anon policies anywhere - see
   the comment block in the migration for why that's intentional), and enables Realtime on
   `attempts`/`assessment_events`/`violations`.
3. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Project Settings -> API.
   - `SUPABASE_SERVICE_ROLE_KEY` - same page, **server-only**, never expose to the browser.

## 2. Install and seed

```bash
npm install
npm run create-admin -- admin@yourcompany.com "StrongPassword123"   # first admin login
npm run seed                                                        # ports the legacy MCQ question banks
```

`npm run seed` creates the Aptitude/Full Stack/AI Product/Data Science/Digital Marketing categories and
questions from the old app (MCQ only - the old free-text debugging/output/concept questions relied on a
mini compiler-adjacent flow this platform intentionally drops), plus one **draft** demo assessment per
role with an Aptitude + Technical section. Publish/schedule them from the admin panel when ready.

Forgot the admin password? There's no in-app "forgot password" flow - reset it directly via Supabase:

```bash
npm run reset-admin-password -- "NewStrongPassword123"          # resets the ADMIN_UID account
npm run reset-admin-password -- "NewStrongPassword123" a@b.com  # or reset a specific account by email
```

## 3. Run

```bash
npm run dev
```

- Admin: `/admin/login`
- Candidates: `/a/<assessment-slug>` (copy the link from an assessment's edit page in the admin panel)

## Phase 1 vs Phase 2

Everything in the spec is implemented **except**:

- **PDF/Excel question import** - only CSV/JSON bulk import is built. PDF/XLSX parsing is a distinct,
  higher-risk feature (layout-dependent extraction) deferred to Phase 2.
- **Live video monitoring + admin push-to-talk** - Live Monitoring shows real-time presence (who's
  active, violation counts, last-seen) via Supabase Realtime, but no camera stream or WebRTC audio yet.
  That requires a signaling layer and is scoped as Phase 2.

Everything else - roles, question bank, scheduling, manual start/pause/stop/publish, per-section timing
and randomization, the full candidate exam flow (camera/mic/fullscreen checks, question navigator,
violation tracking and auto-disqualify, autosave, resumability), results with filters + CSV/Excel export,
and the reports dashboard - is real, database-backed, and server-graded (correct answers never reach the
browser).

## Deployment

Built for Vercel. In the Vercel project's Settings -> Environment Variables, set exactly these four
names (typos here are the #1 cause of a broken deployment - e.g. `SUPABASE_ANON_KEY` instead of
`NEXT_PUBLIC_SUPABASE_ANON_KEY` will make `/admin/login` return `500 MIDDLEWARE_INVOCATION_FAILED`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only)
- `NEXT_PUBLIC_APP_URL` (your production domain, no trailing slash)
- `ADMIN_UID` (server-only; the Supabase Auth user id allowed into /admin)

No server filesystem or long-running process is required. `proxy.ts` is defensive about this
class of misconfiguration (it treats a missing/broken Supabase connection as "not signed in" rather
than crashing), but sign-in itself still needs correct values to actually work.

## Admin authorization

Two layers must agree: `ADMIN_UID` gates the /admin routes and every Server Action
(`lib/auth/require-admin.ts`), and Postgres RLS gates every row via `is_admin()`, which requires a
`profiles` row with `role = 'admin'`. The app creates that row automatically on login and on every
admin action, so if saves ever fail with a "row-level security" error, the profile row is what to check.

## Local Supabase (development and tests)

Everything is built and tested against a local Supabase first; production database changes are the last
step of a release. Requires Docker Desktop (with WSL 2 on Windows) and the Supabase CLI.

```bash
supabase start                   # applies supabase/migrations 0001-0006 to a local database
npm run local:setup              # writes .env.test.local, creates admin@local.test, loads questions + aptitude
npm run dev:local                # next dev against local Supabase (refuses production)
```

`supabase/config.toml` enables anonymous sign-ins and raises the auth rate limits the drive flow needs.

All scripts (`scripts/*.ts`) and the test suites target `.env.test.local` by default and **refuse the
production project**. An approved cutover step can target production only deliberately:
`CONFIRM_PRODUCTION=<project ref> npx tsx scripts/<script>.ts ... --production`.

## End-to-end tests

```bash
npx playwright install chromium   # once
npm run test:e2e                  # builds, starts on :3200 against local Supabase, runs tests/e2e
```

`tests/e2e/global-setup.ts` creates its own fixtures (titles/names prefixed `E2E <run id>`, keys `e2e-…`,
emails `…@example.test`) and `global-teardown.ts` deletes exactly those, plus the anonymous auth users the
tests created. Admin tests sign in with a service-role magic link, so no admin password is needed. Set
`E2E_KEEP_DATA=1` to keep the fixtures for debugging.

## Known follow-ups

- Node 20 works but `@supabase/supabase-js` recommends Node 22+; upgrade when convenient.
