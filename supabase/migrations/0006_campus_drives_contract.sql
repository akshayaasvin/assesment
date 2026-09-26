-- Assistlana: campus drive flow - CONTRACT phase (was 0004).
-- Apply only after the drive-flow code has run on production for at least
-- one real drive (approved in principle 2026-09-26). Removes
-- pieces the new code no longer uses. Dropping columns deletes their values;
-- every dropped value is either superseded (see notes) or recoverable.

begin;

-- The old app wrote `violations`; the new app writes proctor_events directly.
drop view if exists violations;

-- The single-stage eligibility columns from 0002 are superseded by
-- candidates.status plus the aptitude attempt (attempts.stage = 'aptitude',
-- attempts.percentage) and drives.aptitude_cutoff. All values are NULL or
-- 'pending' in production today (verified 2026-09-25). Dropping
-- aptitude_attempt_id also removes the second candidates<->attempts foreign
-- key that made PostgREST embeds ambiguous (PGRST201).
alter table candidates
  drop column if exists aptitude_attempt_id,
  drop column if exists aptitude_status,
  drop column if exists aptitude_percentage,
  drop column if exists eligibility_decided_at;

commit;
