-- 0001_authority_snapshot.sql
-- Encargo — Implementación física de la autoridad remota, Fase 2 (Backend), §1.1
--
-- Tablas nuevas de fuente de verdad organizacional para el Authority Snapshot.
-- Se agregan junto a `organizations`/`org_members` ya existentes (0000_initial.sql).
--
-- SUPUESTO DE DISEÑO (documentar para revisión de Génesis): no tengo en esta sesión
-- `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md`, así que el detalle interno de cada
-- tabla (columnas exactas, además de las mencionadas explícitamente en el encargo) es mi
-- inferencia razonable, no una copia del diseño físico. En particular agrego una columna
-- `since_version` a `principals`, `memberships`, `role_definitions` y `role_assignments`
-- (paralela a `visible_from_version` que el encargo sí menciona para `revocations`) porque
-- sin ella no hay forma de calcular el contenido de un payload `delta` (§1.2: "soporta
-- delta cuando base_authority_version coincide con el high-water mark") — no está en la
-- lista literal de columnas del encargo, pero es necesaria para lo que el encargo pide que
-- el endpoint haga. Confirmar contra el diseño físico si ya existe un mecanismo distinto.

CREATE TABLE IF NOT EXISTS principals (
  id TEXT PRIMARY KEY,
  external_ids TEXT NOT NULL DEFAULT '{}', -- JSON: { [issuer]: external_subject_id }
  display_name TEXT,
  since_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'active', -- active | suspended | removed
  effective_from INTEGER NOT NULL,
  effective_until INTEGER,
  since_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_principal ON memberships(principal_id);

-- Catálogo versionado de roles (built-in "master"/"specialist" según §15 del diseño
-- físico, más roles custom por organización). `version` acá es la versión del catálogo de
-- ese rol puntual, NO el high-water mark de authority_state — son dos conceptos distintos.
CREATE TABLE IF NOT EXISTS role_definitions (
  id TEXT PRIMARY KEY,
  organization_id TEXT, -- NULL = built-in, no NULL = custom de una organización
  key TEXT NOT NULL,    -- 'master' | 'specialist' | clave custom
  version INTEGER NOT NULL,
  definition TEXT NOT NULL, -- JSON, opaco para Backend (contenido definido en diseño físico)
  since_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(organization_id, key, version)
);

CREATE TABLE IF NOT EXISTS role_assignments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  principal_id TEXT NOT NULL REFERENCES principals(id),
  membership_id TEXT NOT NULL REFERENCES memberships(id),
  role_definition_id TEXT NOT NULL REFERENCES role_definitions(id),
  scope TEXT, -- JSON opaco, descriptor de scope
  effective_from INTEGER NOT NULL,
  effective_until INTEGER,
  since_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_role_assignments_org ON role_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_principal ON role_assignments(principal_id);

CREATE TABLE IF NOT EXISTS revocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  target_type TEXT NOT NULL, -- 'principal' | 'membership' | 'role_assignment'
  target_id TEXT NOT NULL,
  visible_from_version INTEGER NOT NULL, -- versión desde la que se hace visible
  effective_until INTEGER,               -- punto desde el cual deja de ser vigente
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revocations_org ON revocations(organization_id);

-- High-water mark por organización (§16 del diseño físico: Backend nunca reutiliza una
-- versión para contenido distinto). Ver Nota técnica de riesgos §1 para el patrón de
-- escritura atómica (db.batch con UPDATE ... WHERE current_version = ? de concurrencia
-- optimista).
CREATE TABLE IF NOT EXISTS authority_state (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
  current_version INTEGER NOT NULL DEFAULT 0,
  current_digest TEXT,
  updated_at INTEGER NOT NULL
);
