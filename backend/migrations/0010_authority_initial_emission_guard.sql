-- Durable receipt and atomic revalidation for Initial Authority Emission.
CREATE TABLE authority_initial_emission_commits (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  request_id TEXT NOT NULL UNIQUE,
  authority_version TEXT NOT NULL CHECK (authority_version = '1'),
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_revision TEXT NOT NULL,
  identity_revision TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  FOREIGN KEY (organization_id, authority_version)
    REFERENCES authority_emissions(organization_id, authority_version)
);

CREATE TRIGGER authority_initial_emission_commit_guard BEFORE INSERT ON authority_initial_emission_commits
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM authority_emissions e JOIN authority_emission_heads h
      ON h.organization_id=e.organization_id AND h.authority_version=e.authority_version
    WHERE e.organization_id=NEW.organization_id AND e.authority_version='1' AND e.base_version IS NULL
      AND e.request_id=NEW.request_id
      AND json_extract(e.initial_evidence,'$.kind')='canonical'
  ) THEN RAISE(ABORT,'authority_initial_emission_conflict') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM authority_human_sessions s JOIN authority_human_identities i
      ON i.organization_id=s.organization_id AND i.principal_id=s.principal_id
    WHERE s.organization_id=NEW.organization_id AND s.principal_id=NEW.principal_id
      AND s.session_id=NEW.session_id AND s.revision=NEW.session_revision
      AND s.identity_revision=NEW.identity_revision AND i.revision=NEW.identity_revision
      AND i.evidence_kind='canonical' AND i.status='active' AND i.verified_at IS NOT NULL
      AND s.status='active' AND julianday(s.expires_at)>julianday(NEW.committed_at)
      AND julianday(s.absolute_expires_at)>julianday(NEW.committed_at)
  ) THEN RAISE(ABORT,'authority_session_conflict') END;
END;

CREATE TRIGGER authority_initial_emission_commit_immutable_update BEFORE UPDATE ON authority_initial_emission_commits
BEGIN SELECT RAISE(ABORT,'authority_initial_emission_immutable'); END;
CREATE TRIGGER authority_initial_emission_commit_immutable_delete BEFORE DELETE ON authority_initial_emission_commits
BEGIN SELECT RAISE(ABORT,'authority_initial_emission_immutable'); END;
