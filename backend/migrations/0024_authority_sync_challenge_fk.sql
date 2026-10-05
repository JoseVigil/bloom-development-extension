-- installation_keys permits historical key rotation: installation_id is unique only
-- among active rows. SQLite cannot use that partial index as a foreign-key parent.
-- Preserve issued challenges while removing the invalid FK from migration 0008.
-- The signed installation middleware verifies the active organization/key before
-- either challenge endpoint can write or consume a row.
DROP TRIGGER authority_sync_challenge_guard;
DROP TRIGGER authority_sync_challenge_no_delete;
CREATE TABLE authority_sync_challenges_rebuilt (
  challenge_hash TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
INSERT INTO authority_sync_challenges_rebuilt
  (challenge_hash, organization_id, installation_id, issued_at, expires_at, consumed_at)
SELECT challenge_hash, organization_id, installation_id, issued_at, expires_at, consumed_at
FROM authority_sync_challenges;
DROP TABLE authority_sync_challenges;
ALTER TABLE authority_sync_challenges_rebuilt RENAME TO authority_sync_challenges;
CREATE INDEX authority_sync_challenge_binding ON authority_sync_challenges(organization_id,installation_id,expires_at);
CREATE TRIGGER authority_sync_challenge_guard BEFORE UPDATE ON authority_sync_challenges
WHEN OLD.consumed_at IS NOT NULL OR NEW.challenge_hash<>OLD.challenge_hash
 OR NEW.organization_id<>OLD.organization_id OR NEW.installation_id<>OLD.installation_id
 OR NEW.issued_at<>OLD.issued_at OR NEW.expires_at<>OLD.expires_at OR NEW.consumed_at IS NULL
BEGIN SELECT RAISE(ABORT,'authority_sync_challenge_conflict'); END;
CREATE TRIGGER authority_sync_challenge_no_delete BEFORE DELETE ON authority_sync_challenges
BEGIN SELECT RAISE(ABORT,'authority_sync_challenge_immutable'); END;
