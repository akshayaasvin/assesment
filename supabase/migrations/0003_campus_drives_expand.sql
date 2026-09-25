-- Assistlana: campus drive flow - EXPAND phase.
--
-- Backward compatible with the currently deployed app: only adds tables,
-- nullable/defaulted columns, and a compatibility view. Apply to STAGING
-- first; apply to production immediately before deploying the new code.
-- 0004_campus_drives_contract.sql removes the compatibility pieces AFTER the
-- new code is live.
--
-- Nothing here deletes or rewrites existing rows except the explicit
-- backfills in section 7 (which only fill new columns).

begin;

-- =========================================================
-- 1. Drives: a live hiring event (campus / online / walk-in)
-- =========================================================
create table if not exists drives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null check (mode in ('campus', 'online', 'walkin')),
  college_name text,                       -- null for online / walk-in
  start_at timestamptz,
  end_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  aptitude_assessment_id uuid references assessments (id) on delete restrict,
  aptitude_cutoff numeric check (aptitude_cutoff is null or aptitude_cutoff between 0 and 100), -- null = off
  high_risk_tab_switches int check (high_risk_tab_switches is null or high_risk_tab_switches > 0), -- null = off; flags only, never disqualifies
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at > start_at)
);
create index if not exists idx_drives_status on drives (status);

-- "Allowed role assessments" for a drive (many-to-many).
create table if not exists drive_role_assessments (
  drive_id uuid not null references drives (id) on delete cascade,
  assessment_id uuid not null references assessments (id) on delete restrict,
  primary key (drive_id, assessment_id)
);

-- =========================================================
-- 2. Candidates: one row per registration in a drive
-- =========================================================
-- drive_id is NULL for the 4 candidates who registered before drives existed
-- ("Legacy" in the UI). Two of them share a phone number, so per-drive
-- uniqueness must not apply to them - NULL drive_id rows never conflict in a
-- unique index.
alter table candidates
  add column if not exists drive_id uuid references drives (id) on delete restrict,
  add column if not exists degree text,
  add column if not exists branch text,
  add column if not exists graduation_year int check (graduation_year is null or graduation_year between 1970 and 2100),
  add column if not exists candidate_type text check (candidate_type is null or candidate_type in ('fresher', 'experienced')),
  add column if not exists years_experience numeric check (years_experience is null or years_experience between 0 and 60),
  add column if not exists current_company text,
  add column if not exists resume_path text,               -- object path in the 'resumes' bucket
  add column if not exists consent_at timestamptz,
  add column if not exists status text not null default 'registered'
    check (status in ('registered', 'aptitude_in_progress', 'aptitude_done', 'role_in_progress', 'completed', 'disqualified')),
  add column if not exists disqualified_reason text,
  add column if not exists disqualified_at timestamptz,
  add column if not exists disqualified_by uuid references profiles (id) on delete set null,
  add column if not exists high_risk boolean not null default false,
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null, -- anonymous sign-in; RLS keys on this
  add column if not exists last_seen_at timestamptz,        -- updated by the 10 s sync; "offline" after 30 s
  add column if not exists email_normalized text generated always as (lower(btrim(email))) stored,
  add column if not exists phone_normalized text generated always as (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) stored;

-- Same email or phone can't register twice in the same drive (includes
-- disqualified registrations, so they can't re-register either).
create unique index if not exists uq_candidates_drive_email on candidates (drive_id, email_normalized);
create unique index if not exists uq_candidates_drive_phone on candidates (drive_id, phone_normalized) where phone_normalized <> '';
create index if not exists idx_candidates_drive_status on candidates (drive_id, status);
create index if not exists idx_candidates_created on candidates (created_at);

-- =========================================================
-- 3. Attempts: which stage an attempt belongs to
-- =========================================================
-- score / total_marks / started_at / submitted_at already exist. Answers stay
-- in the existing `answers` table (one row per question, graded server-side)
-- rather than a JSON column, so they remain queryable for Reports.
alter table attempts
  add column if not exists stage text check (stage is null or stage in ('aptitude', 'role')),
  add column if not exists time_taken_seconds int generated always as (
    case when started_at is not null and submitted_at is not null
      then greatest(0, extract(epoch from (submitted_at - started_at))::int) end
  ) stored;
create index if not exists idx_attempts_candidate on attempts (candidate_id);

-- =========================================================
-- 4. Proctor events (the existing `violations` table, renamed and extended)
-- =========================================================
do $$ begin
  -- Rename only if `violations` is still the real table (safe to re-run).
  if exists (select 1 from pg_class where relname = 'violations' and relkind = 'r' and relnamespace = 'public'::regnamespace) then
    alter table violations rename to proctor_events;
  end if;
end $$;
alter table proctor_events
  add column if not exists candidate_id uuid references candidates (id) on delete cascade,
  add column if not exists meta jsonb,
  add column if not exists snapshot_path text;              -- evidence image in 'proctor-snapshots'
alter table proctor_events alter column attempt_id drop not null; -- admin warnings can happen outside an attempt
alter table proctor_events drop constraint if exists proctor_events_type_check;
alter table proctor_events add constraint proctor_events_type_check check (type in (
  'tab_switch', 'fullscreen_exit', 'window_blur', 'copy_paste', 'no_face', 'multiple_faces',
  'camera_off', 'mic_off', 'admin_warning',
  'copy', 'paste', 'contextmenu', 'resize'                    -- values written by the current app
));
create index if not exists idx_proctor_events_candidate on proctor_events (candidate_id, created_at);

-- Fill candidate_id from the attempt when a writer only knows the attempt.
create or replace function proctor_events_fill_candidate() returns trigger
language plpgsql as $$
begin
  if new.candidate_id is null and new.attempt_id is not null then
    select candidate_id into new.candidate_id from attempts where id = new.attempt_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_proctor_events_fill_candidate on proctor_events;
create trigger trg_proctor_events_fill_candidate before insert on proctor_events
  for each row execute function proctor_events_fill_candidate();

-- Compatibility view so the currently deployed app (which reads/writes
-- `violations`) keeps working until 0004. security_invoker makes RLS on
-- proctor_events apply to the caller, not the view owner.
create or replace view violations with (security_invoker = true) as
  select id, attempt_id, type, message, created_at from proctor_events;

-- =========================================================
-- 5. Announcements (text or voice) to a drive, a college, or one candidate
-- =========================================================
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  drive_id uuid not null references drives (id) on delete cascade,
  college_name text,                                        -- null = whole drive
  candidate_id uuid references candidates (id) on delete cascade, -- set = private warning
  type text not null check (type in ('text', 'audio')),
  text text,
  audio_path text,                                          -- object path in 'announcements'
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (type = 'text' and text is not null or type = 'audio' and audio_path is not null)
);
create index if not exists idx_announcements_drive on announcements (drive_id, created_at desc);

-- =========================================================
-- 5b. Admin -> candidate requests, delivered by the candidate's 10 s sync
--     (no Realtime): spot-check photo, private warning, live-view invite.
-- =========================================================
create table if not exists candidate_requests (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  type text not null check (type in ('snapshot', 'warning', 'live_view')),
  payload jsonb,                                            -- warning text / audio path, live-view session id
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  fulfilled_at timestamptz,
  result_path text                                          -- spot-check photo in 'proctor-snapshots'
);
create index if not exists idx_candidate_requests_pending on candidate_requests (candidate_id) where delivered_at is null;

-- WebRTC signalling for ONE on-demand live view, polled by both ends (no Realtime).
create table if not exists webrtc_signals (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  candidate_id uuid not null references candidates (id) on delete cascade,
  sender text not null check (sender in ('admin', 'candidate')),
  kind text not null check (kind in ('offer', 'answer', 'ice', 'end')),
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_webrtc_signals_session on webrtc_signals (session_id, id);

-- =========================================================
-- 6. RLS: admin-only, like every other table. Candidates never query
--    these tables directly; server routes act for them.
-- =========================================================
alter table drives enable row level security;
alter table drive_role_assessments enable row level security;
alter table announcements enable row level security;
alter table candidate_requests enable row level security;
alter table webrtc_signals enable row level security;
create policy "drives_admin_all" on drives for all using (is_admin()) with check (is_admin());
create policy "drive_role_assessments_admin_all" on drive_role_assessments for all using (is_admin()) with check (is_admin());
create policy "announcements_admin_all" on announcements for all using (is_admin()) with check (is_admin());
create policy "candidate_requests_admin_all" on candidate_requests for all using (is_admin()) with check (is_admin());
create policy "webrtc_signals_admin_all" on webrtc_signals for all using (is_admin()) with check (is_admin());
-- Candidate-side access (own rows only, via auth.uid()) and the candidate
-- sync/submit RPCs are added in 0005 alongside the code that uses them.
-- proctor_events keeps the violations_admin_all policy it had before the rename.

-- =========================================================
-- 7. Backfill existing data (fills new columns only)
-- =========================================================
update attempts a
   set stage = case when s.kind = 'aptitude' then 'aptitude' else 'role' end
  from assessments s
 where s.id = a.assessment_id and a.stage is null;

-- They accepted the Terms & Conditions checkbox to register; record that as consent.
update candidates set consent_at = created_at where consent_at is null;

update candidates c
   set status = case
     when exists (select 1 from attempts a where a.candidate_id = c.id and a.status = 'disqualified') then 'disqualified'
     when exists (select 1 from attempts a where a.candidate_id = c.id and a.status = 'completed') then 'completed'
     when exists (select 1 from attempts a where a.candidate_id = c.id and a.status = 'in_progress') then 'role_in_progress'
     else 'registered' end
 where c.drive_id is null;

update proctor_events p
   set candidate_id = a.candidate_id
  from attempts a
 where a.id = p.attempt_id and p.candidate_id is null;

-- =========================================================
-- 8. Storage buckets (private; the app serves signed URLs)
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 1048576, array['application/pdf']),           -- 1 MB, optional
  ('proctor-snapshots', 'proctor-snapshots', false, 51200, array['image/jpeg']), -- ~320px JPEG, target <= 20 KB
  ('announcements', 'announcements', false, 1048576, array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'])
on conflict (id) do nothing;

-- =========================================================
-- 9. Admin-only usage RPC for Settings -> Storage panel
-- =========================================================
create or replace function admin_usage() returns table (database_bytes bigint, bucket_id text, bucket_bytes bigint, bucket_objects bigint)
language plpgsql security definer set search_path = public, storage as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
    select pg_database_size(current_database())::bigint, b.id::text,
           coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(o.id)::bigint
      from storage.buckets b left join storage.objects o on o.bucket_id = b.id
     group by b.id;
end $$;
revoke all on function admin_usage() from public, anon;
grant execute on function admin_usage() to authenticated;

commit;
