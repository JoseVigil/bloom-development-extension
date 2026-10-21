-- Ofertas de Mandate publicadas por un publicador (no por una organización).
-- Una definición es portable: no conoce organización, proyecto ni instalación.
-- Una versión publicada es inmutable. Una organización tiene a lo sumo una
-- versión habilitada en este corte (clave primaria por organización).
CREATE TABLE mandate_definitions (
  id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  purpose TEXT NOT NULL,
  publisher_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE mandate_definition_versions (
  id TEXT PRIMARY KEY NOT NULL,
  definition_id TEXT NOT NULL REFERENCES mandate_definitions(id),
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  key_id TEXT NOT NULL,
  published_at TEXT NOT NULL,
  preparation_status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (definition_id, version)
);

CREATE TRIGGER mandate_definition_versions_immutable BEFORE UPDATE ON mandate_definition_versions
BEGIN
  SELECT RAISE(ABORT, 'mandate_definition_version_immutable');
END;

CREATE TRIGGER mandate_definition_versions_no_delete BEFORE DELETE ON mandate_definition_versions
BEGIN
  SELECT RAISE(ABORT, 'mandate_definition_version_immutable');
END;

CREATE TABLE organization_mandate_offers (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  definition_version_id TEXT NOT NULL REFERENCES mandate_definition_versions(id),
  enabled_at INTEGER NOT NULL
);
