-- Assistlana Assessment Platform - candidate portal: Aptitude -> Eligibility -> Role -> Role assessment
-- Additive only (new nullable/defaulted columns). Safe to run on the existing database.
-- Run in the Supabase SQL editor.

-- ---------------------------------------------------------
-- assessments: what kind of assessment this is, plus a description shown to candidates
-- ---------------------------------------------------------
-- 'aptitude' = the first step every candidate takes; its passing_percentage is the
--              eligibility cut-off for role assessments.
-- 'role'     = a role/job-specific assessment, shown only to eligible candidates
--              whose selected role matches assessments.role_id.
alter table assessments
  add column if not exists kind text not null default 'role' check (kind in ('aptitude', 'role')),
  add column if not exists description text;

create index if not exists idx_assessments_kind_status on assessments (kind, status);
create index if not exists idx_assessments_role on assessments (role_id);

-- ---------------------------------------------------------
-- candidates: persisted eligibility + selected role (the database is the source of truth)
-- ---------------------------------------------------------
alter table candidates
  add column if not exists aptitude_status text not null default 'pending'
    check (aptitude_status in ('pending', 'eligible', 'not_eligible')),
  -- Deliberately NOT a foreign key: a second candidates<->attempts relationship
  -- would make existing PostgREST embeds like attempts(...candidates(...))
  -- ambiguous and break the Results/Live Monitoring/Candidates pages.
  add column if not exists aptitude_attempt_id uuid,
  add column if not exists aptitude_percentage numeric,
  add column if not exists eligibility_decided_at timestamptz,
  add column if not exists role_id uuid references roles (id) on delete set null;

create index if not exists idx_candidates_role on candidates (role_id);

-- RLS: unchanged. candidates/assessments/attempts already have RLS enabled with
-- admin-only policies; the candidate portal reads and writes these tables only
-- from server-side Route Handlers (service role), scoped to the signed-in
-- candidate's id from a signed httpOnly cookie. The browser never queries them.
