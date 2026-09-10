-- Authority lot 4. Additive; apply only to temporary D1 until separately authorized.
CREATE TABLE authority_sync_deliveries (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  authority_version TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('critical','privileged','standard')),
  committed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','leased','acknowledged')),
  lease_id TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  noticed_at TEXT,
  acknowledged_at TEXT,
  PRIMARY KEY (organization_id,event_id,installation_id),
  FOREIGN KEY (organization_id,event_id) REFERENCES authority_admin_outbox(organization_id,event_id),
  CHECK ((status='leased')=(lease_id IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK ((status='acknowledged')=(acknowledged_at IS NOT NULL))
);
CREATE INDEX authority_sync_claim ON authority_sync_deliveries(status,lease_expires_at,committed_at);

CREATE TABLE authority_sync_challenges (
  challenge_hash TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (installation_id) REFERENCES installation_keys(installation_id)
);
CREATE INDEX authority_sync_challenge_binding ON authority_sync_challenges(organization_id,installation_id,expires_at);

CREATE TABLE authority_sync_measurements (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  authority_version TEXT NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('critical','privileged','standard')),
  committed_at TEXT NOT NULL,
  noticed_at TEXT,
  pull_started_at TEXT,
  accepted_at TEXT,
  hypothetical_restriction_at TEXT,
  PRIMARY KEY (organization_id,event_id,installation_id),
  FOREIGN KEY (organization_id,event_id,installation_id)
    REFERENCES authority_sync_deliveries(organization_id,event_id,installation_id)
);

CREATE TRIGGER authority_sync_delivery_guard BEFORE UPDATE ON authority_sync_deliveries
WHEN NEW.organization_id<>OLD.organization_id OR NEW.event_id<>OLD.event_id
 OR NEW.installation_id<>OLD.installation_id OR NEW.authority_version<>OLD.authority_version
 OR NEW.correlation_id<>OLD.correlation_id OR NEW.urgency<>OLD.urgency OR NEW.committed_at<>OLD.committed_at
 OR NEW.attempts<OLD.attempts OR OLD.status='acknowledged'
BEGIN SELECT RAISE(ABORT,'authority_sync_delivery_conflict'); END;
CREATE TRIGGER authority_sync_delivery_no_delete BEFORE DELETE ON authority_sync_deliveries
BEGIN SELECT RAISE(ABORT,'authority_sync_delivery_immutable'); END;
CREATE TRIGGER authority_sync_challenge_guard BEFORE UPDATE ON authority_sync_challenges
WHEN OLD.consumed_at IS NOT NULL OR NEW.challenge_hash<>OLD.challenge_hash
 OR NEW.organization_id<>OLD.organization_id OR NEW.installation_id<>OLD.installation_id
 OR NEW.issued_at<>OLD.issued_at OR NEW.expires_at<>OLD.expires_at OR NEW.consumed_at IS NULL
BEGIN SELECT RAISE(ABORT,'authority_sync_challenge_conflict'); END;
CREATE TRIGGER authority_sync_challenge_no_delete BEFORE DELETE ON authority_sync_challenges
BEGIN SELECT RAISE(ABORT,'authority_sync_challenge_immutable'); END;
CREATE TRIGGER authority_sync_measurement_guard BEFORE UPDATE ON authority_sync_measurements
WHEN NEW.organization_id<>OLD.organization_id OR NEW.event_id<>OLD.event_id
 OR NEW.installation_id<>OLD.installation_id OR NEW.authority_version<>OLD.authority_version
 OR NEW.urgency<>OLD.urgency OR NEW.committed_at<>OLD.committed_at
 OR (OLD.noticed_at IS NOT NULL AND NEW.noticed_at<>OLD.noticed_at)
 OR (OLD.pull_started_at IS NOT NULL AND NEW.pull_started_at<>OLD.pull_started_at)
 OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at<>OLD.accepted_at)
 OR (OLD.hypothetical_restriction_at IS NOT NULL AND NEW.hypothetical_restriction_at<>OLD.hypothetical_restriction_at)
BEGIN SELECT RAISE(ABORT,'authority_sync_measurement_conflict'); END;
CREATE TRIGGER authority_sync_measurement_no_delete BEFORE DELETE ON authority_sync_measurements
BEGIN SELECT RAISE(ABORT,'authority_sync_measurement_immutable'); END;
