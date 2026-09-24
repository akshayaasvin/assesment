-- Assistlana Assessment Platform - Phase 1 schema
-- Run in the Supabase SQL editor, or via `supabase db push`, against a fresh project.

create extension if not exists "pgcrypto";

-- =========================================================
-- Tables
-- =========================================================

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories (id) on delete set null,
  text text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  marks numeric not null default 1,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions (id) on delete cascade,
  text text not null,
  is_correct boolean not null default false,
  order_index int not null default 0
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  role_id uuid references roles (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'paused', 'ended')),
  start_at timestamptz,
  end_at timestamptz,
  max_warnings int not null default 4,
  camera_required boolean not null default true,
  mic_required boolean not null default true,
  fullscreen_required boolean not null default true,
  tab_switch_monitoring boolean not null default true,
  copy_paste_block boolean not null default true,
  auto_submit boolean not null default true,
  result_visible_to_candidate boolean not null default false,
  passing_percentage numeric not null default 40,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assessment_sections (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments (id) on delete cascade,
  title text not null,
  order_index int not null default 0,
  duration_minutes int not null default 20,
  randomize_questions boolean not null default true,
  randomize_options boolean not null default true,
  source_type text not null default 'random_pool' check (source_type in ('fixed', 'random_pool')),
  source_category_id uuid references categories (id) on delete set null,
  question_count int not null default 10
);

create table if not exists assessment_questions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references assessment_sections (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  order_index int not null default 0,
  unique (section_id, question_id)
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  college text,
  district text,
  department text,
  created_at timestamptz not null default now()
);

create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  assessment_id uuid not null references assessments (id) on delete cascade,
  attempt_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'disqualified')),
  current_section_index int not null default 0,
  started_at timestamptz,
  submitted_at timestamptz,
  last_seen_at timestamptz,
  warnings_count int not null default 0,
  score numeric not null default 0,
  total_marks numeric not null default 0,
  percentage numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (candidate_id, assessment_id)
);

-- Snapshots the resolved question list for one attempt's section, generated
-- once the candidate first reaches that section. This is what makes a
-- `random_pool` section resumable after a refresh/reconnect: the random
-- selection is made exactly once per attempt, not re-rolled on every load.
create table if not exists attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  section_id uuid not null references assessment_sections (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  order_index int not null default 0,
  unique (attempt_id, section_id, question_id)
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  selected_option_id uuid references question_options (id) on delete set null,
  is_correct boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create table if not exists violations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references attempts (id) on delete cascade,
  type text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists assessment_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts (id) on delete cascade,
  assessment_id uuid not null references assessments (id) on delete cascade,
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists default_settings (
  id int primary key default 1 check (id = 1),
  max_warnings int not null default 4,
  camera_required boolean not null default true,
  mic_required boolean not null default true,
  fullscreen_required boolean not null default true,
  tab_switch_monitoring boolean not null default true,
  copy_paste_block boolean not null default true,
  auto_submit boolean not null default true,
  result_visible_to_candidate boolean not null default false
);
insert into default_settings (id) values (1) on conflict (id) do nothing;

-- =========================================================
-- Indexes
-- =========================================================

create index if not exists idx_questions_category on questions (category_id);
create index if not exists idx_question_options_question on question_options (question_id);
create index if not exists idx_assessment_sections_assessment on assessment_sections (assessment_id);
create index if not exists idx_assessment_questions_section on assessment_questions (section_id);
create index if not exists idx_attempt_questions_attempt on attempt_questions (attempt_id, section_id);
create index if not exists idx_attempts_assessment on attempts (assessment_id);
create index if not exists idx_attempts_status on attempts (status);
create index if not exists idx_answers_attempt on answers (attempt_id);
create index if not exists idx_violations_attempt on violations (attempt_id);
create index if not exists idx_assessment_events_assessment on assessment_events (assessment_id);

-- =========================================================
-- Helper: is_admin()
-- =========================================================

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================
-- Row Level Security
-- =========================================================
-- Every table has RLS enabled. Only admin-authenticated Supabase sessions
-- get policies below; there are no anon/candidate policies anywhere.
-- Candidate reads/writes never use the anon key directly - they go through
-- Next.js route handlers using the service role key, which bypasses RLS.
-- Net effect: direct browser access with the anon key is denied on every
-- table by default.

alter table profiles enable row level security;
alter table roles enable row level security;
alter table categories enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table assessments enable row level security;
alter table assessment_sections enable row level security;
alter table assessment_questions enable row level security;
alter table candidates enable row level security;
alter table attempts enable row level security;
alter table attempt_questions enable row level security;
alter table answers enable row level security;
alter table violations enable row level security;
alter table assessment_events enable row level security;
alter table default_settings enable row level security;

create policy "profiles_self_or_admin_select" on profiles for select using (id = auth.uid() or is_admin());
create policy "profiles_self_update" on profiles for update using (id = auth.uid());

create policy "roles_admin_all" on roles for all using (is_admin()) with check (is_admin());
create policy "categories_admin_all" on categories for all using (is_admin()) with check (is_admin());
create policy "questions_admin_all" on questions for all using (is_admin()) with check (is_admin());
create policy "question_options_admin_all" on question_options for all using (is_admin()) with check (is_admin());
create policy "assessments_admin_all" on assessments for all using (is_admin()) with check (is_admin());
create policy "assessment_sections_admin_all" on assessment_sections for all using (is_admin()) with check (is_admin());
create policy "assessment_questions_admin_all" on assessment_questions for all using (is_admin()) with check (is_admin());
create policy "candidates_admin_all" on candidates for all using (is_admin()) with check (is_admin());
create policy "attempts_admin_all" on attempts for all using (is_admin()) with check (is_admin());
create policy "attempt_questions_admin_all" on attempt_questions for all using (is_admin()) with check (is_admin());
create policy "answers_admin_all" on answers for all using (is_admin()) with check (is_admin());
create policy "violations_admin_all" on violations for all using (is_admin()) with check (is_admin());
create policy "assessment_events_admin_all" on assessment_events for all using (is_admin()) with check (is_admin());
create policy "default_settings_admin_all" on default_settings for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Realtime
-- =========================================================
-- Admin Live Monitoring subscribes to these for presence/violation updates.
alter publication supabase_realtime add table attempts;
alter publication supabase_realtime add table assessment_events;
alter publication supabase_realtime add table violations;
