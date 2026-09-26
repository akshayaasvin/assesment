-- Assistlana: campus drive flow - CUTOVER step, run right after the drive-flow
-- code is deployed (approved 2026-09-26; moved out of the contract migration).
--
-- Email becomes unique per drive (uq_candidates_drive_email from 0003) instead
-- of globally, so a person who registered before - or in an earlier drive -
-- can register for a new drive. The old code upserted on this constraint,
-- which is why it must wait until the new code is live.

alter table candidates drop constraint if exists candidates_email_key;
