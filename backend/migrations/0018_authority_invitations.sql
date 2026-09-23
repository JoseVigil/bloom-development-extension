-- Invitaciones a organización ajena — Fase A del encargo de invitaciones
-- (Propuesta_Diseno_Invitaciones_Organizacion_v0_2.md §1, aprobada por Jose 2026-09-22).
-- Aditivo, mismo patrón que authority_genesis_flows (migración 0013): inerte hasta que
-- invitation-store.ts (Fase B) empiece a usarla. No toca ninguna tabla existente.
--
-- Único agregado respecto del §1 literal del diseño: el CHECK de consistencia
-- scope_type/scope_id de más abajo. Es una validación puramente defensiva a nivel de DB
-- (si scope_type='organization', scope_id debe ser NULL; si 'project', scope_id es
-- obligatorio) — no cambia el modelo de datos que describe el diseño, sólo lo hace más
-- difícil de violar por error. Señalado explícitamente, no una desviación silenciosa.
CREATE TABLE authority_organization_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  invited_by_principal_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_version TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'organization' CHECK (scope_type IN ('organization','project')),
  scope_id TEXT,
  valid_until TEXT,
  invited_subject TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_principal_id TEXT,
  CHECK ((scope_type='organization' AND scope_id IS NULL) OR (scope_type='project' AND scope_id IS NOT NULL))
);
CREATE UNIQUE INDEX idx_invitations_token ON authority_organization_invitations(token_hash);
CREATE INDEX idx_invitations_org ON authority_organization_invitations(organization_id);

-- Fase C (redención) todavía no autorizada — esta tabla queda creada ahora (mismo
-- criterio que 0013 creó authority_genesis_flows antes de que existiera finishGenesis)
-- pero sin ningún código que la use todavía.
CREATE TABLE authority_invitation_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES authority_organization_invitations(id),
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1)),
  result_json TEXT
);
