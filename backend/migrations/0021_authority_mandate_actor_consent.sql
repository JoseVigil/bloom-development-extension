ALTER TABLE authority_actor_challenges ADD COLUMN mandate_operation TEXT;
ALTER TABLE authority_actor_challenges ADD COLUMN mandate_id TEXT;
ALTER TABLE authority_actor_challenges ADD COLUMN contract_digest TEXT;

CREATE TRIGGER authority_mandate_challenge_context_immutable BEFORE UPDATE ON authority_actor_challenges
WHEN NEW.mandate_operation IS NOT OLD.mandate_operation
 OR NEW.mandate_id IS NOT OLD.mandate_id
 OR NEW.contract_digest IS NOT OLD.contract_digest
BEGIN SELECT RAISE(ABORT,'authority_mandate_challenge_conflict'); END;

CREATE TABLE authority_mandate_consents (
 token_hash TEXT PRIMARY KEY,
 challenge_hash TEXT NOT NULL REFERENCES authority_actor_challenges(challenge_hash),
 session_id TEXT NOT NULL,
 principal_id TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 consumed_at TEXT
);
CREATE INDEX authority_mandate_consents_challenge ON authority_mandate_consents(challenge_hash,session_id);
