-- Génesis / Primer Registro: Organización Personal por Defecto
-- (Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md §2.1, §3).
--
-- Tres partes independientes, cada una explicada en el encargo:
--
-- 1) Seed del catálogo builtin `master`/`specialist` en `role_definitions`
--    (organization_id IS NULL). Dato puro, aditivo, mismo patrón que la migración 0011
--    (`operator`) — sin este INSERT, `createInitialAuthorityEmission` (ya implementado)
--    no puede emitir un `master` en ningún ambiente real. Permission sets copiados
--    carácter por carácter de la constante `master`/`specialist` de emission.ts (única
--    fuente de verdad de este repo para el catálogo builtin — ya verificados en sync con
--    installer/nucleus/internal/authority/roles.go en el cierre de
--    Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md).
--
-- 2) `authority_genesis_registry` — el ancla que garantiza "un GitHub subject = una
--    organización personal, una sola vez". `subject` es PK: un segundo intento de
--    génesis para el mismo subject nunca crea una segunda organización.
--
-- 3) `authority_genesis_flows` — paralela a `authority_human_flows` (0006), pero sin
--    `organization_id`: en génesis la organización todavía no existe cuando arranca el
--    redirect a GitHub. `authority_human_flows`/`beginHumanLogin`/`finishHumanLogin` no
--    se tocan.

INSERT INTO role_definitions (id, organization_id, key, version, definition, since_version, created_at, status)
VALUES (
  'master-1',
  NULL,
  'master',
  1,
  '{"display_name":"Master","permissions":["authority.membership.manage","authority.role_definition.manage","authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign","mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate"]}',
  1,
  unixepoch(),
  'active'
);

INSERT INTO role_definitions (id, organization_id, key, version, definition, since_version, created_at, status)
VALUES (
  'specialist-1',
  NULL,
  'specialist',
  1,
  '{"display_name":"Specialist","permissions":["intent.create"]}',
  1,
  unixepoch(),
  'active'
);

CREATE TABLE authority_genesis_registry (
  subject TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  principal_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE authority_genesis_flows (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1))
);
