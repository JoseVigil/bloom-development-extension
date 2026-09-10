-- Explicit organization correspondence, never inferred from a GitHub login or tenant.
CREATE TABLE authority_human_identities (
 organization_id TEXT NOT NULL REFERENCES organizations(id), principal_id TEXT NOT NULL,
 subject TEXT NOT NULL, source_ref TEXT NOT NULL CHECK(length(source_ref)>0),
 evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('canonical','test-fixture')),
 revision TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 verified_at TEXT, display_handle TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(organization_id,principal_id), UNIQUE(organization_id,subject)
);
CREATE TRIGGER authority_human_identity_binding_immutable BEFORE UPDATE ON authority_human_identities
WHEN NEW.organization_id<>OLD.organization_id OR NEW.principal_id<>OLD.principal_id OR NEW.subject<>OLD.subject
 OR NEW.source_ref<>OLD.source_ref OR NEW.evidence_kind<>OLD.evidence_kind
 OR (OLD.status='revoked' AND NEW.status<>'revoked')
 OR (OLD.verified_at IS NOT NULL AND NEW.verified_at IS NOT OLD.verified_at)
BEGIN SELECT RAISE(ABORT,'authority_identity_conflict'); END;
CREATE TRIGGER authority_human_identity_no_delete BEFORE DELETE ON authority_human_identities
BEGIN SELECT RAISE(ABORT,'authority_identity_conflict'); END;
CREATE TABLE authority_human_flows (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, organization_id TEXT NOT NULL REFERENCES organizations(id),
 verifier TEXT NOT NULL, expires_at TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
);
CREATE TABLE authority_human_sessions (
 session_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, csrf_hash TEXT NOT NULL,
 organization_id TEXT NOT NULL, principal_id TEXT NOT NULL, identity_revision TEXT NOT NULL,
 provider_cipher TEXT NOT NULL, expires_at TEXT NOT NULL, absolute_expires_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','revoked')), revision TEXT NOT NULL,
 FOREIGN KEY(organization_id,principal_id) REFERENCES authority_human_identities(organization_id,principal_id)
);
CREATE TRIGGER authority_human_session_identity BEFORE INSERT ON authority_human_sessions
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM authority_human_identities i WHERE i.organization_id=NEW.organization_id
 AND i.principal_id=NEW.principal_id AND i.revision=NEW.identity_revision AND i.status='active' AND i.verified_at IS NOT NULL)
 THEN RAISE(ABORT,'authority_identity_conflict') END;
END;
CREATE TABLE authority_human_commit_guards (
 organization_id TEXT NOT NULL, request_id TEXT NOT NULL, session_id TEXT NOT NULL,
 session_revision TEXT NOT NULL, identity_revision TEXT NOT NULL, at TEXT NOT NULL,
 recipient_id TEXT, recipient_revision TEXT,
 PRIMARY KEY(organization_id,request_id),
 FOREIGN KEY(organization_id,request_id) REFERENCES authority_admin_requests(organization_id,request_id)
);
CREATE TRIGGER authority_human_commit_guard BEFORE INSERT ON authority_human_commit_guards
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM authority_human_sessions s JOIN authority_human_identities i
   ON i.organization_id=s.organization_id AND i.principal_id=s.principal_id
  JOIN authority_admin_requests r ON r.organization_id=s.organization_id AND r.actor_id=s.principal_id
  WHERE r.request_id=NEW.request_id AND s.organization_id=NEW.organization_id AND s.session_id=NEW.session_id
   AND s.revision=NEW.session_revision AND s.identity_revision=NEW.identity_revision
   AND i.revision=NEW.identity_revision AND i.status='active' AND i.verified_at IS NOT NULL
   AND s.status='active' AND julianday(s.expires_at)>julianday(NEW.at)
   AND julianday(s.absolute_expires_at)>julianday(NEW.at)
 ) THEN RAISE(ABORT,'authority_session_conflict') END;
 SELECT CASE WHEN NEW.recipient_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM authority_human_identities WHERE organization_id=NEW.organization_id
   AND principal_id=NEW.recipient_id AND revision=NEW.recipient_revision
   AND status='active' AND verified_at IS NOT NULL
 ) THEN RAISE(ABORT,'authority_identity_conflict') END;
END;
