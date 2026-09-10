CREATE TABLE authority_trust_manifests (
 organization_id TEXT NOT NULL REFERENCES organizations(id), manifest_version TEXT NOT NULL, base_manifest_version TEXT,
 issuer TEXT NOT NULL, manifest_id TEXT NOT NULL, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 digest TEXT NOT NULL, envelope_json TEXT NOT NULL, test_fixture INTEGER NOT NULL DEFAULT 0 CHECK(test_fixture IN(0,1)),
 PRIMARY KEY(organization_id,manifest_version), UNIQUE(organization_id,manifest_id)
);
CREATE TABLE authority_trust_heads (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id), manifest_version TEXT NOT NULL,
 FOREIGN KEY(organization_id,manifest_version) REFERENCES authority_trust_manifests(organization_id,manifest_version)
);
CREATE TRIGGER authority_trust_manifest_immutable_update BEFORE UPDATE ON authority_trust_manifests
BEGIN SELECT RAISE(ABORT,'authority_trust_immutable'); END;
CREATE TRIGGER authority_trust_manifest_immutable_delete BEFORE DELETE ON authority_trust_manifests
BEGIN SELECT RAISE(ABORT,'authority_trust_immutable'); END;
CREATE TRIGGER authority_trust_manifest_sequence BEFORE INSERT ON authority_trust_manifests
BEGIN
 SELECT CASE WHEN NEW.manifest_version GLOB '*[^0-9]*' OR NEW.manifest_version='' OR substr(NEW.manifest_version,1,1)='0'
  OR length(NEW.manifest_version)>20 THEN RAISE(ABORT,'authority_trust_version_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM authority_trust_heads h WHERE h.organization_id=NEW.organization_id)
  AND (NEW.base_manifest_version IS NULL OR NEW.base_manifest_version<>(SELECT manifest_version FROM authority_trust_heads WHERE organization_id=NEW.organization_id))
  THEN RAISE(ABORT,'authority_trust_version_conflict') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM authority_trust_heads h WHERE h.organization_id=NEW.organization_id)
  AND (NEW.base_manifest_version IS NOT NULL OR NEW.manifest_version<>'1') THEN RAISE(ABORT,'authority_trust_version_conflict') END;
END;
CREATE TRIGGER authority_trust_manifest_publish AFTER INSERT ON authority_trust_manifests
BEGIN
 INSERT INTO authority_trust_heads(organization_id,manifest_version) VALUES(NEW.organization_id,NEW.manifest_version)
 ON CONFLICT(organization_id) DO UPDATE SET manifest_version=NEW.manifest_version;
END;
CREATE TRIGGER authority_trust_head_no_rollback BEFORE UPDATE ON authority_trust_heads
WHEN length(NEW.manifest_version)<length(OLD.manifest_version)
 OR (length(NEW.manifest_version)=length(OLD.manifest_version) AND NEW.manifest_version<=OLD.manifest_version)
BEGIN SELECT RAISE(ABORT,'authority_trust_version_conflict'); END;
CREATE TRIGGER authority_trust_head_no_delete BEFORE DELETE ON authority_trust_heads
BEGIN SELECT RAISE(ABORT,'authority_trust_immutable'); END;
CREATE TABLE authority_actor_challenges (
 challenge_hash TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
 installation_id TEXT NOT NULL, actor_public_key_raw TEXT NOT NULL, audience TEXT NOT NULL,
 expires_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN('pending','approved')),
 approved_principal_id TEXT, approved_at TEXT, attestation_json TEXT
);
CREATE INDEX authority_actor_challenge_org ON authority_actor_challenges(organization_id,installation_id,status);
CREATE TRIGGER authority_actor_challenge_immutable BEFORE UPDATE ON authority_actor_challenges
WHEN OLD.status<>'pending' OR NEW.challenge_hash<>OLD.challenge_hash OR NEW.organization_id<>OLD.organization_id
 OR NEW.installation_id<>OLD.installation_id OR NEW.actor_public_key_raw<>OLD.actor_public_key_raw
 OR NEW.audience<>OLD.audience OR NEW.expires_at<>OLD.expires_at OR NEW.status<>'approved'
BEGIN SELECT RAISE(ABORT,'authority_actor_challenge_conflict'); END;
CREATE TRIGGER authority_actor_challenge_no_delete BEFORE DELETE ON authority_actor_challenges
BEGIN SELECT RAISE(ABORT,'authority_actor_challenge_immutable'); END;
