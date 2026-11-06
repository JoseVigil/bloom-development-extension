CREATE TABLE authority_actor_attestation_deliveries (
 challenge_hash TEXT PRIMARY KEY REFERENCES authority_actor_challenges(challenge_hash),
 organization_id TEXT NOT NULL,
 installation_id TEXT NOT NULL,
 attestation_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 consumed_at TEXT
);

CREATE INDEX authority_actor_attestation_delivery_binding
 ON authority_actor_attestation_deliveries(organization_id,installation_id,consumed_at);

CREATE TRIGGER authority_actor_attestation_delivery_immutable BEFORE UPDATE ON authority_actor_attestation_deliveries
WHEN OLD.consumed_at IS NOT NULL
 OR NEW.challenge_hash<>OLD.challenge_hash
 OR NEW.organization_id<>OLD.organization_id
 OR NEW.installation_id<>OLD.installation_id
 OR NEW.attestation_json<>OLD.attestation_json
 OR NEW.created_at<>OLD.created_at
 OR NEW.consumed_at IS NULL
BEGIN SELECT RAISE(ABORT,'authority_actor_attestation_delivery_conflict'); END;

CREATE TRIGGER authority_actor_attestation_delivery_no_delete BEFORE DELETE ON authority_actor_attestation_deliveries
BEGIN SELECT RAISE(ABORT,'authority_actor_attestation_delivery_immutable'); END;
