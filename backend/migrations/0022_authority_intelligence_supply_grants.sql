CREATE TABLE authority_intelligence_supply_grant_requests (
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('issue','revoke')),
  authority_version TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, request_id)
);
CREATE INDEX authority_intelligence_supply_grant_by_grant
  ON authority_intelligence_supply_grant_requests(organization_id, grant_id);
CREATE TRIGGER authority_intelligence_supply_grant_request_no_update
BEFORE UPDATE ON authority_intelligence_supply_grant_requests
BEGIN SELECT RAISE(ABORT, 'authority_intelligence_supply_grant_history_immutable'); END;
CREATE TRIGGER authority_intelligence_supply_grant_request_no_delete
BEFORE DELETE ON authority_intelligence_supply_grant_requests
BEGIN SELECT RAISE(ABORT, 'authority_intelligence_supply_grant_history_immutable'); END;

CREATE TABLE authority_installation_capability_declarations (
  organization_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  supported_authority_schema_versions_json TEXT NOT NULL CHECK (json_valid(supported_authority_schema_versions_json)),
  source TEXT NOT NULL CHECK (source IN ('registration','signed_update')),
  declared_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, installation_id, revision),
  UNIQUE (organization_id, installation_id, request_id)
);
CREATE TABLE authority_installation_capability_heads (
  organization_id TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  PRIMARY KEY (organization_id, installation_id),
  FOREIGN KEY (organization_id, installation_id, revision)
    REFERENCES authority_installation_capability_declarations(organization_id, installation_id, revision)
);
CREATE TRIGGER authority_installation_capability_preconditions
BEFORE INSERT ON authority_installation_capability_declarations
BEGIN
  SELECT CASE WHEN NEW.revision <> '1' AND NOT EXISTS (
    SELECT 1 FROM authority_installation_capability_heads h
    WHERE h.organization_id=NEW.organization_id AND h.installation_id=NEW.installation_id
      AND CAST(NEW.revision AS INTEGER)=CAST(h.revision AS INTEGER)+1)
    THEN RAISE(ABORT, 'authority_installation_capability_revision_conflict') END;
  SELECT CASE WHEN NEW.revision='1' AND EXISTS (
    SELECT 1 FROM authority_installation_capability_heads h
    WHERE h.organization_id=NEW.organization_id AND h.installation_id=NEW.installation_id)
    THEN RAISE(ABORT, 'authority_installation_capability_revision_conflict') END;
END;
CREATE TRIGGER authority_installation_capability_publish
AFTER INSERT ON authority_installation_capability_declarations
BEGIN
  INSERT INTO authority_installation_capability_heads(organization_id,installation_id,revision)
  VALUES(NEW.organization_id,NEW.installation_id,NEW.revision)
  ON CONFLICT(organization_id,installation_id) DO UPDATE SET revision=excluded.revision;
END;
CREATE TRIGGER authority_installation_capability_no_update
BEFORE UPDATE ON authority_installation_capability_declarations
BEGIN SELECT RAISE(ABORT, 'authority_installation_capability_history_immutable'); END;
CREATE TRIGGER authority_installation_capability_no_delete
BEFORE DELETE ON authority_installation_capability_declarations
BEGIN SELECT RAISE(ABORT, 'authority_installation_capability_history_immutable'); END;
