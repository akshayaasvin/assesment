# QA pass: bugs found and fixed

Branch: `fix/full-qa-pass`. Every fix below is covered by the Playwright suite in `tests/e2e` (42 tests, all passing) unless marked otherwise.

Severity: **Critical** = core feature unusable. **High** = wrong data, security or exam integrity. **Medium** = broken feature with a workaround. **Low** = polish.

| # | Severity | Bug | Root cause | Fix | Files |
|---|---|---|---|---|---|
| 1 | Critical | Admin could open every page but no save worked ("new row violates row-level security policy") | Postgres RLS allows writes only when `is_admin()` finds a `profiles` row with role `admin`. That row was never created, because login's server action was swallowed (#2). | Created the missing row (one-time). Login, every admin page load and every admin action now make sure the row exists. | `lib/auth/require-admin.ts`, `lib/actions/auth.ts`, `app/admin/(dashboard)/layout.tsx` |
| 2 | High | Login showed "An unexpected response was received from the server" | `verifyAdminSession()` is a server action, which is a POST to `/admin/login`. The middleware redirected signed-in admins away from `/admin/login`, including that POST, so the client got HTML instead of an action response. | Renamed `middleware.ts` to `proxy.ts` (the Next 16 name). Only GET/HEAD navigations are redirected. | `proxy.ts` |
| 3 | High | Admin server actions had no server-side authorization | They relied only on RLS. Server actions are public POST endpoints. | `requireAdmin()` runs first in every admin action: session + `ADMIN_UID` + profile row. | `lib/actions/*.ts`, `lib/auth/require-admin.ts` |
| 4 | High | "Saved" or "Deleted" shown even when nothing changed | RLS makes UPDATE/DELETE on hidden rows affect 0 rows, with no error. | Mutations `.select()` the affected rows and report "no longer exists, or no permission" when there are none. DB errors map to safe messages and are logged server-side. | `lib/actions/*.ts`, `lib/db-errors.ts` |
| 5 | High | Editing an assessment wiped in-progress candidates' question sets | Sections were deleted and re-inserted on every save. `attempt_questions` cascades from sections. | Sections are updated in place by id. Only sections the admin removed are deleted. | `lib/actions/assessments.ts`, `components/admin/assessment-form.tsx`, `app/admin/(dashboard)/assessments/[id]/page.tsx` |
| 6 | Medium | A failed save could leave a half-created assessment, or a question with no options | Multi-step inserts had no cleanup on failure. | Clean up the parent row when a child insert fails. | `lib/actions/assessments.ts`, `lib/actions/questions.ts` |
| 7 | Medium | Leaving an option blank could mark the wrong option correct | Blank options were dropped but `correctIndex` wasn't re-mapped. | Re-map the correct answer onto the cleaned option list. Options are now edited in place, so their ids stay stable. | `components/admin/question-dialog.tsx`, `lib/actions/questions.ts` |
| 8 | High | `/admin/roles`: 500, "Minified React error #441" | The Server Component passed an inline `onConfirm` function to the `ConfirmAction` client component ("Event handlers cannot be passed to Client Component props"). It only rendered once roles were visible, after #1 was fixed. | `RoleDeleteButton` client component. Admin-wide `error.tsx` so a failure no longer white-screens. | `app/admin/(dashboard)/roles/page.tsx`, `components/admin/role-delete-button.tsx`, `app/admin/(dashboard)/error.tsx` |
| 9 | Critical | Candidates, Results and Live Monitoring empty while Dashboard/Reports showed data | The applied migration added FK `candidates.aptitude_attempt_id → attempts`, a second candidates↔attempts relationship. Every `candidates(...)`/`attempts(...)` embed failed with PGRST201. Dashboard/Reports don't embed those tables, so they still worked. | Embeds name `attempts_candidate_id_fkey`, so they work with or without that FK. (The repo migration no longer declares it; optional SQL to drop it is under "Left for you".) No backfill needed: the stored records were complete. | `app/admin/(dashboard)/candidates/page.tsx`, `results/page.tsx`, `live-monitoring/page.tsx` |
| 10 | Medium | A failed query looked like "No candidates yet" / "No results match your filters" | Query errors were ignored. | List pages throw to the error boundary on a query error. | same as #9 |
| 11 | Medium | Live Monitoring showed no progress and no finished sessions | The feature was incomplete. | In-progress cards show start time, estimated time left, answered/total and proctoring flags. A "Recently finished (24h)" table. 10s polling on top of the existing realtime subscription. | `components/admin/live-monitoring-board.tsx`, `app/admin/(dashboard)/live-monitoring/page.tsx` |
| 12 | High | Refreshing during an exam restarted the section timer at full time (unlimited time) | The timer was client-only, and the server kept no section start time. | The server records section starts (`section_advanced` events, which already existed as a type) and returns the real time left. The exam resumes from it. | `lib/assessment/section-progress.ts`, `app/api/attempts/[attemptId]/{start,heartbeat,answer}/route.ts`, `components/candidate/exam-runner.tsx`, `types/domain.ts` |
| 13 | Medium | Refreshing right after moving to the next section sent the candidate back to the previous one, and the section index could move backwards | `current_section_index` was saved only with an answer, and was overwritten with whatever the client sent. | Section changes are reported through the heartbeat, and the index only moves forward. | same as #12 |
| 14 | High | "Assessment Completed" shown when the submission failed (0/0 score) | `ExamRunner` treated a failed submit as success. | Keep the candidate on the exam with a retry message. A "disqualified" response goes to the disqualified screen. | `components/candidate/exam-runner.tsx` |
| 15 | High | Anyone could overwrite a candidate's name, phone or college by registering on a link with their email | The link registration upserted by email. | An existing email must also match the phone. Details are never overwritten. | `app/api/assessments/[slug]/register/route.ts` |
| 16 | Medium | Settings → default proctoring rules were saved but never used | The new-assessment form hard-coded its defaults. | The new-assessment form loads `default_settings`. | `app/admin/(dashboard)/assessments/new/page.tsx` |
| 17 | Medium | React error #418 (hydration mismatch) on Results and Live Monitoring | `toLocaleString()` / `Date.now()` during render. The server runs in UTC and admins' browsers in IST. | Time-zone and clock-dependent text renders after hydration (`useIsClient`). | `hooks/use-is-client.ts`, `components/admin/results-explorer.tsx`, `components/admin/live-monitoring-board.tsx` |
| 18 | Low | Admin "Log out" signed the admin out on every device | `supabase.auth.signOut()` defaults to global scope. | `signOut({ scope: "local" })`. | `components/admin/topbar.tsx` |
| 19 | Low | Header search box and notification bell did nothing | Placeholders with no behaviour. | Hidden (see "Not implemented"). | `components/admin/topbar.tsx` |
| 20 | Low | Deleting a question gave no feedback. The assessment delete dialog claimed candidate attempts are kept (they're cascade-deleted). | Missing success message; wrong copy. | Success/error toasts, accurate dialog text, and the dialog stays open on failure. | `components/admin/question-bank-table.tsx`, `components/admin/assessment-actions-menu.tsx`, `components/shared/confirm-action.tsx` |
| 21 | Low | "Assessment created." toast never appeared, and a double-click could create two assessments | `redirect()` inside the action; the button re-enabled during navigation. | Return the id and navigate client-side. The button stays locked after success. | `lib/actions/assessments.ts`, `components/admin/assessment-form.tsx` |
| 22 | Low | Results had no time taken | Not rendered. | "Time taken" column and "Time Taken (min)" in CSV/Excel, using the same formula as Reports. | `components/admin/results-explorer.tsx`, `lib/export/results.ts` |
| 23 | Feature | Home page never showed assessments; no aptitude → eligibility → role flow | The home page was static text. | Candidate portal (email + phone sign-in). Eligibility is decided server-side when aptitude is graded. Role assessments are filtered by kind/role/open status in the DB. One server-side gate protects the portal, direct links and exam start. | `app/page.tsx`, `lib/portal/*`, `app/api/portal/*`, `components/portal/*`, `lib/assessment/finalize.ts`, migration `0002` |

## Verified (no bug found)

- Scoring matches the answer key: 2 of 3 one-mark questions right = 2/3 = 66.67%, and each answer's `is_correct` matches the key. Scoring logic unchanged.
- One attempt per assessment per candidate is enforced (retake and resubmit return 409).
- The anon key can't read or write any table (RLS). The exam payload never includes which option is correct.
- No server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_UID`) in client JS.
- Candidate registration and assessment pages fit at 375px wide.
- `/a/<unknown>` returns a proper 404. Draft links say "not open right now".

## Not implemented (feature gaps, not bugs)

- **Global admin search** (header): removed the inert box.
- **Notifications**: removed the inert bell.
- **Candidate detail page** and **search on the Candidates page**: the list shows registration fields and attempts inline.
- **Text search in the Question Bank**: category filter only.
- **Live video / push-to-talk in Live Monitoring**: marked "Phase 2" in the UI.
- **Server-side rejection of late answers**: the server now knows each section's deadline (#12), but the answer route doesn't yet refuse answers after it.
- **Retakes via a second email**: one attempt is enforced per email, but the same person can register again with another address (seen in production data: "Asvin R" registered twice with different emails).

## Known issues not fixed

- `xlsx@0.18.5` (SheetJS) has a high-severity advisory (prototype pollution / ReDoS when *parsing* files) with no fix on npm. It is used for admin-only bulk import and Excel export. SheetJS publishes fixed builds on its own CDN (`https://cdn.sheetjs.com`). Switching is a dependency decision for you.
- Node 20: `@supabase/supabase-js` recommends Node 22+.
