CREATE TABLE IF NOT EXISTS authority_vault_service_grant_requests (
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('issue', 'revoke')),
  authority_version TEXT NOT NULL,
  result_json TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, request_id)
);
CREATE INDEX IF NOT EXISTS authority_vault_service_grant_by_grant
  ON authority_vault_service_grant_requests(organization_id, grant_id);

CREATE TRIGGER authority_vault_service_grant_request_no_update
BEFORE UPDATE ON authority_vault_service_grant_requests
BEGIN SELECT RAISE(ABORT, 'authority_vault_service_grant_history_immutable'); END;

CREATE TRIGGER authority_vault_service_grant_request_no_delete
BEFORE DELETE ON authority_vault_service_grant_requests
BEGIN SELECT RAISE(ABORT, 'authority_vault_service_grant_history_immutable'); END;
