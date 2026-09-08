CREATE TABLE organization_bootstrap_mandates (
  organization_id TEXT NOT NULL PRIMARY KEY REFERENCES organizations(id),
  mandate_version_id TEXT NOT NULL REFERENCES mandate_versions(id),
  assigned_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_organization_bootstrap_mandates_version
  ON organization_bootstrap_mandates(mandate_version_id);
