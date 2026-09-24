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

Built for Vercel. Set the same three Supabase env vars (plus `NEXT_PUBLIC_APP_URL` to your production
domain) in the Vercel project settings. No server filesystem or long-running process is required.

## Known follow-ups

- `middleware.ts` triggers a Next 16 deprecation notice ("use proxy instead") but works correctly; worth
  migrating when Next's replacement API stabilizes.
- Node 20 works but `@supabase/supabase-js` recommends Node 22+; upgrade when convenient.
"# assesment" 
"# assesment" 
"# assesment" 
 
