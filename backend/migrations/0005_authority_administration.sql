-- Authority 2A; additive, temporary databases only until separately authorized.
CREATE TABLE authority_admin_proposals (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  proposal_id TEXT NOT NULL,
  grantor_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  created_version TEXT NOT NULL,
  accepted_version TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  PRIMARY KEY (organization_id, proposal_id),
  FOREIGN KEY (organization_id, created_version) REFERENCES authority_emissions(organization_id, authority_version),
  FOREIGN KEY (organization_id, accepted_version) REFERENCES authority_emissions(organization_id, authority_version),
  CHECK ((status = 'pending' AND accepted_version IS NULL) OR (status = 'accepted' AND accepted_version IS NOT NULL))
);

-- Canonical membership evidence must be supplied by a trusted adapter. No public
-- write API is provided. Tests insert explicitly labelled fixture evidence here.
CREATE TABLE authority_project_scope_evidence (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN ('canonical', 'test-fixture')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  valid_until TEXT NOT NULL,
  PRIMARY KEY (organization_id, project_id)
);

CREATE TABLE authority_admin_requests (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  base_version TEXT NOT NULL,
  authority_version TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  command_json TEXT NOT NULL CHECK (json_valid(command_json)),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  proposal_id TEXT,
  consumed_proposal_id TEXT,
  project_checks_json TEXT NOT NULL CHECK (json_valid(project_checks_json)),
  PRIMARY KEY (organization_id, request_id),
  UNIQUE (organization_id, authority_version),
  FOREIGN KEY (organization_id, authority_version) REFERENCES authority_emissions(organization_id, authority_version)
);

CREATE TRIGGER authority_admin_preconditions BEFORE INSERT ON authority_admin_requests
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM authority_emission_heads h JOIN authority_emissions e
    ON e.organization_id = h.organization_id AND e.authority_version = h.authority_version
    WHERE h.organization_id = NEW.organization_id AND h.authority_version = NEW.authority_version
    AND e.base_version = NEW.base_version)
    THEN RAISE(ABORT, 'authority_admin_head_conflict') END;
  SELECT CASE WHEN NEW.proposal_id IS NOT NULL AND EXISTS (SELECT 1 FROM authority_admin_proposals
    WHERE organization_id = NEW.organization_id AND proposal_id = NEW.proposal_id)
    THEN RAISE(ABORT, 'authority_proposal_conflict') END;
  SELECT CASE WHEN NEW.consumed_proposal_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM authority_admin_proposals
    WHERE organization_id = NEW.organization_id AND proposal_id = NEW.consumed_proposal_id
    AND status = 'pending' AND accepted_version IS NULL)
    THEN RAISE(ABORT, 'authority_proposal_conflict') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM json_each(NEW.project_checks_json) check_item
    WHERE NOT EXISTS (SELECT 1 FROM authority_project_scope_evidence e
      WHERE e.organization_id = NEW.organization_id
      AND e.project_id = json_extract(check_item.value, '$.project_id')
      AND e.revision = json_extract(check_item.value, '$.revision')
      AND e.source_ref = json_extract(check_item.value, '$.source_ref')
      AND e.evidence_kind = json_extract(check_item.value, '$.evidence_kind')
      AND e.valid_until = json_extract(check_item.value, '$.valid_until')
      AND e.status = 'active' AND julianday(e.valid_until) > julianday(NEW.decided_at)))
    THEN RAISE(ABORT, 'authority_scope_conflict') END;
END;

CREATE TABLE authority_admin_audit (
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  before_version TEXT NOT NULL,
  after_version TEXT NOT NULL,
  at TEXT NOT NULL,
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  PRIMARY KEY (organization_id, request_id),
  FOREIGN KEY (organization_id, request_id) REFERENCES authority_admin_requests(organization_id, request_id)
);

CREATE TABLE authority_admin_outbox (
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  authority_version TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  PRIMARY KEY (organization_id, event_id),
  FOREIGN KEY (organization_id, event_id) REFERENCES authority_admin_requests(organization_id, request_id)
);

CREATE TRIGGER authority_admin_request_no_update BEFORE UPDATE ON authority_admin_requests
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_admin_request_no_delete BEFORE DELETE ON authority_admin_requests
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_admin_audit_no_update BEFORE UPDATE ON authority_admin_audit
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_admin_audit_no_delete BEFORE DELETE ON authority_admin_audit
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_admin_proposal_no_delete BEFORE DELETE ON authority_admin_proposals
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_admin_proposal_transition BEFORE UPDATE ON authority_admin_proposals
BEGIN
  SELECT CASE WHEN OLD.status <> 'pending' OR NEW.status <> 'accepted'
    OR OLD.organization_id <> NEW.organization_id OR OLD.proposal_id <> NEW.proposal_id
    OR OLD.grantor_id <> NEW.grantor_id OR OLD.recipient_id <> NEW.recipient_id
    OR OLD.body_json <> NEW.body_json OR OLD.created_version <> NEW.created_version
    THEN RAISE(ABORT, 'authority_proposal_conflict') END;
END;
