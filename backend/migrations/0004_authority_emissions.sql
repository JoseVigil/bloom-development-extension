-- Authority 1B. Additive; requires 0001_authority_snapshot.sql.
-- No backfill: legacy rows are not evidence of verified wire authority.
CREATE TABLE authority_emissions (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  authority_version TEXT NOT NULL CHECK (
    authority_version <> '' AND authority_version NOT GLOB '*[^0-9]*'
    AND substr(authority_version, 1, 1) <> '0'
    AND (length(authority_version) < 20 OR
      (length(authority_version) = 20 AND authority_version <= '18446744073709551615'))
  ),
  base_version TEXT,
  request_id TEXT NOT NULL CHECK (request_id <> ''),
  request_digest TEXT NOT NULL,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  state_digest TEXT NOT NULL,
  full_json TEXT NOT NULL CHECK (json_valid(full_json)),
  delta_json TEXT CHECK (delta_json IS NULL OR json_valid(delta_json)),
  initial_evidence TEXT,
  PRIMARY KEY (organization_id, authority_version),
  UNIQUE (organization_id, request_id),
  FOREIGN KEY (organization_id, base_version)
    REFERENCES authority_emissions(organization_id, authority_version),
  CHECK ((base_version IS NULL AND delta_json IS NULL AND initial_evidence IS NOT NULL)
    OR (base_version IS NOT NULL AND delta_json IS NOT NULL AND initial_evidence IS NULL))
);

CREATE TABLE authority_emission_heads (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  authority_version TEXT NOT NULL,
  FOREIGN KEY (organization_id, authority_version)
    REFERENCES authority_emissions(organization_id, authority_version)
);

-- A failed CAS raises an error: zero affected UPDATE rows must never allow
-- the remainder of a batch to commit. The insert and head publication are one statement.
CREATE TRIGGER authority_emission_preconditions BEFORE INSERT ON authority_emissions
BEGIN
  SELECT CASE WHEN (SELECT authority_version FROM authority_emission_heads
    WHERE organization_id = NEW.organization_id) IS NOT NEW.base_version
    THEN RAISE(ABORT, 'authority_cas_conflict') END;
  SELECT CASE WHEN NEW.base_version IS NULL AND (
    EXISTS (SELECT 1 FROM authority_emissions WHERE organization_id = NEW.organization_id)
    OR EXISTS (SELECT 1 FROM authority_state WHERE organization_id = NEW.organization_id)
    OR EXISTS (SELECT 1 FROM memberships WHERE organization_id = NEW.organization_id)
    OR EXISTS (SELECT 1 FROM role_assignments WHERE organization_id = NEW.organization_id)
    OR EXISTS (SELECT 1 FROM role_definitions WHERE organization_id = NEW.organization_id)
    OR EXISTS (SELECT 1 FROM revocations WHERE organization_id = NEW.organization_id))
    THEN RAISE(ABORT, 'authority_recovery_required') END;
  SELECT CASE WHEN NEW.base_version IS NOT NULL AND NOT (
    length(NEW.authority_version) > length(NEW.base_version) OR
    (length(NEW.authority_version) = length(NEW.base_version) AND NEW.authority_version > NEW.base_version))
    THEN RAISE(ABORT, 'authority_version_order') END;
END;

CREATE TRIGGER authority_emission_publish AFTER INSERT ON authority_emissions
BEGIN
  INSERT INTO authority_emission_heads (organization_id, authority_version)
    VALUES (NEW.organization_id, NEW.authority_version)
    ON CONFLICT(organization_id) DO UPDATE SET authority_version = excluded.authority_version;
END;

CREATE TRIGGER authority_emission_immutable_update BEFORE UPDATE ON authority_emissions
BEGIN SELECT RAISE(ABORT, 'authority_emission_immutable'); END;
CREATE TRIGGER authority_emission_immutable_delete BEFORE DELETE ON authority_emissions
BEGIN SELECT RAISE(ABORT, 'authority_emission_immutable'); END;
