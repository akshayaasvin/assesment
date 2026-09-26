-- Assistlana: campus drive flow - candidate access (DRAFT, not applied anywhere).
--
-- Candidates sign in with Supabase anonymous auth (role 'authenticated',
-- JWT claim is_anonymous = true) and are linked by candidates.auth_user_id.
-- Everything here is scoped to auth.uid(): a candidate can reach only their
-- own registration, attempts, events and files - never answer keys, other
-- candidates or admin data. Scoring stays on the server (finalizeAttempt in
-- a Vercel route, service role), never in the browser.
--
-- Requires 0003. Approved for LOCAL only; production only at cutover, after
-- the backup, on explicit go. Idempotent (safe to re-run).

begin;

-- =========================================================
-- 1. Who is calling?
-- =========================================================
-- The candidate row for the current session, or null. SECURITY DEFINER so it
-- works inside RLS policies without recursion.
create or replace function current_candidate_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from candidates where auth_user_id = auth.uid()
$$;
revoke all on function current_candidate_id() from public, anon;
grant execute on function current_candidate_id() to authenticated;

-- =========================================================
-- 2. RLS: read-only access to a candidate's own rows.
--    All candidate WRITES go through candidate_sync() below or through
--    server routes; there are no candidate insert/update/delete policies.
-- =========================================================
drop policy if exists "candidates_self_select" on candidates;
create policy "candidates_self_select" on candidates
  for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists "attempts_self_select" on attempts;
create policy "attempts_self_select" on attempts
  for select to authenticated using (candidate_id = current_candidate_id());

-- answers: NO candidate policy at all. Candidates never read this table (saved
-- answers for a resume come back from the server route), so is_correct can't
-- leak even for their own graded answers.

drop policy if exists "announcements_self_select" on announcements;
create policy "announcements_self_select" on announcements
  for select to authenticated
  using (
    drive_id = (select drive_id from candidates where id = current_candidate_id())
    and (candidate_id is null or candidate_id = current_candidate_id())
    and (college_name is null or college_name = (select college from candidates where id = current_candidate_id()))
  );

drop policy if exists "candidate_requests_self_select" on candidate_requests;
create policy "candidate_requests_self_select" on candidate_requests
  for select to authenticated using (candidate_id = current_candidate_id());

-- Live-view signalling: the candidate end reads admin messages and writes its own.
drop policy if exists "webrtc_signals_self_select" on webrtc_signals;
create policy "webrtc_signals_self_select" on webrtc_signals
  for select to authenticated using (candidate_id = current_candidate_id());
drop policy if exists "webrtc_signals_self_insert" on webrtc_signals;
create policy "webrtc_signals_self_insert" on webrtc_signals
  for insert to authenticated with check (candidate_id = current_candidate_id() and sender = 'candidate');

-- =========================================================
-- 3. Storage: candidates upload into their own folder (<auth uid>/...) only.
--    Bucket size/type limits are enforced by the buckets themselves (0003).
-- =========================================================
drop policy if exists "resumes_self_insert" on storage.objects;
create policy "resumes_self_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "snapshots_self_insert" on storage.objects;
create policy "snapshots_self_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proctor-snapshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- Voice announcements are stored as announcements/<drive id>/<file>; candidates
-- of that drive may download them.
drop policy if exists "announcements_audio_select" on storage.objects;
create policy "announcements_audio_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcements'
    and (storage.foldername(name))[1] = (select drive_id::text from candidates where id = current_candidate_id())
  );

drop policy if exists "storage_admin_all" on storage.objects;
create policy "storage_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id in ('resumes', 'proctor-snapshots', 'announcements') and is_admin())
  with check (bucket_id in ('resumes', 'proctor-snapshots', 'announcements') and is_admin());

-- =========================================================
-- 4. candidate_sync: the ONE call a candidate makes every 10 s.
--    Saves batched answers + proctor events, advances the section, marks the
--    candidate seen, and returns status / new announcements / admin requests.
--    Disqualification and time limits are enforced HERE, server-side.
-- =========================================================
create or replace function candidate_sync(
  p_answers jsonb default '[]',          -- [{questionId, optionId}]
  p_events jsonb default '[]',           -- [{type, message?, meta?}]
  p_section_index int default null,      -- section the candidate is on now
  p_since timestamptz default null       -- last serverTime this client saw
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_candidate candidates%rowtype;
  v_attempt attempts%rowtype;
  v_deadline timestamptz;
  v_rejected int := 0;
  v_item jsonb;
  v_question uuid;
  v_option uuid;
  v_event_count int;
  v_tab_switches int;
  v_threshold int;
  v_now timestamptz := now();
  v_announcements jsonb;
  v_requests jsonb;
begin
  select * into v_candidate from candidates where auth_user_id = auth.uid();
  if not found then
    raise exception 'not_registered' using errcode = '42501';
  end if;

  update candidates set last_seen_at = v_now where id = v_candidate.id;

  -- The attempt currently being taken (at most one in progress per candidate).
  select * into v_attempt from attempts
   where candidate_id = v_candidate.id and status = 'in_progress'
   order by started_at desc limit 1;

  if v_attempt.id is not null then
    update attempts set last_seen_at = v_now where id = v_attempt.id;

    -- Overall deadline: started_at + all section durations + 60 s grace for the last sync.
    select v_attempt.started_at + make_interval(mins => coalesce(sum(duration_minutes), 0)) + interval '60 seconds'
      into v_deadline
      from assessment_sections where assessment_id = v_attempt.assessment_id;

    -- ---- Answers: refused once disqualified or past the deadline.
    for v_item in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) loop
      begin
        v_question := (v_item->>'questionId')::uuid;
        v_option := nullif(v_item->>'optionId', '')::uuid;
      exception when others then
        v_rejected := v_rejected + 1; continue;
      end;

      if v_candidate.status = 'disqualified' or v_now > v_deadline
         or not exists (select 1 from attempt_questions where attempt_id = v_attempt.id and question_id = v_question)
         or (v_option is not null and not exists (select 1 from question_options where id = v_option and question_id = v_question)) then
        v_rejected := v_rejected + 1; continue;
      end if;

      insert into answers (attempt_id, question_id, selected_option_id, answered_at)
      values (v_attempt.id, v_question, v_option, v_now)
      on conflict (attempt_id, question_id)
      do update set selected_option_id = excluded.selected_option_id, answered_at = excluded.answered_at;
    end loop;

    -- ---- Section progress: forward only (same event the timer resume reads).
    if p_section_index is not null and p_section_index > v_attempt.current_section_index
       and v_candidate.status <> 'disqualified' then
      update attempts set current_section_index = p_section_index where id = v_attempt.id;
      insert into assessment_events (attempt_id, assessment_id, type, payload)
      values (v_attempt.id, v_attempt.assessment_id, 'section_advanced', jsonb_build_object('sectionIndex', p_section_index));
    end if;
  end if;

  -- ---- Proctor events (capped at 300 per candidate to bound storage).
  select count(*) into v_event_count from proctor_events where candidate_id = v_candidate.id;
  for v_item in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    exit when v_event_count >= 300;
    if (v_item->>'type') in ('tab_switch', 'fullscreen_exit', 'window_blur', 'copy_paste', 'no_face',
                             'multiple_faces', 'camera_off', 'mic_off', 'copy', 'paste', 'contextmenu', 'resize') then
      insert into proctor_events (candidate_id, attempt_id, type, message, meta)
      values (v_candidate.id, v_attempt.id, v_item->>'type', left(v_item->>'message', 300), v_item->'meta');
      v_event_count := v_event_count + 1;
      if v_attempt.id is not null then
        update attempts set warnings_count = warnings_count + 1 where id = v_attempt.id;
      end if;
    end if;
  end loop;

  -- ---- Optional per-drive "high risk" flag after N tab switches. Never disqualifies.
  select high_risk_tab_switches into v_threshold from drives where id = v_candidate.drive_id;
  if v_threshold is not null and not v_candidate.high_risk then
    select count(*) into v_tab_switches from proctor_events where candidate_id = v_candidate.id and type = 'tab_switch';
    if v_tab_switches >= v_threshold then
      update candidates set high_risk = true where id = v_candidate.id;
    end if;
  end if;

  -- ---- What's new for this candidate since the last sync.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'type', a.type, 'text', a.text, 'audioPath', a.audio_path,
           'private', a.candidate_id is not null, 'createdAt', a.created_at) order by a.created_at), '[]'::jsonb)
    into v_announcements
    from announcements a
   where a.drive_id = v_candidate.drive_id
     and (a.candidate_id is null or a.candidate_id = v_candidate.id)
     and (a.college_name is null or a.college_name = v_candidate.college)
     and a.created_at > coalesce(p_since, v_candidate.created_at);

  with pending as (
    update candidate_requests set delivered_at = v_now
     where candidate_id = v_candidate.id and delivered_at is null
    returning id, type, payload, created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'type', type, 'payload', payload) order by created_at), '[]'::jsonb)
    into v_requests from pending;

  return jsonb_build_object(
    'status', (select status from candidates where id = v_candidate.id),
    'disqualifiedReason', (select disqualified_reason from candidates where id = v_candidate.id),
    'serverTime', v_now,
    'rejectedAnswers', v_rejected,
    'announcements', v_announcements,
    'requests', v_requests
  );
end $$;
revoke all on function candidate_sync(jsonb, jsonb, int, timestamptz) from public, anon;
grant execute on function candidate_sync(jsonb, jsonb, int, timestamptz) to authenticated;

commit;
