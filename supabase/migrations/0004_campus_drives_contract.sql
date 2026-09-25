-- Assistlana: campus drive flow - CONTRACT phase.
-- Apply only AFTER the drive-flow code is deployed and verified. Removes
-- pieces the new code no longer uses. Dropping columns deletes their values;
-- every dropped value is either superseded (see notes) or recoverable.

begin;

-- Email is unique per drive now (uq_candidates_drive_email), not globally:
-- the same person may register for a later drive.
alter table candidates drop constraint if exists candidates_email_key;

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
