-- Existing active installations predate capability declarations. Give only those
-- without a head the conservative baseline Authority 1.0. The deterministic
-- request identity makes this migration safe to execute again.
INSERT INTO authority_installation_capability_declarations (
  organization_id,
  installation_id,
  revision,
  request_id,
  request_digest,
  supported_authority_schema_versions_json,
  source,
  declared_at
)
SELECT
  k.organization_id,
  k.installation_id,
  '1',
  'migration:0023:' || k.installation_id,
  'migration:0023:' || k.organization_id || ':' || k.installation_id || ':authority-1.0',
  '["1.0"]',
  'registration',
  strftime('%Y-%m-%dT%H:%M:%fZ', k.registered_at / 1000.0, 'unixepoch')
FROM installation_keys k
WHERE k.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM authority_installation_capability_heads h
    WHERE h.organization_id = k.organization_id
      AND h.installation_id = k.installation_id
  );
