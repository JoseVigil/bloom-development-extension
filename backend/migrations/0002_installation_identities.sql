-- 0002_installation_identities.sql
-- Encargo — Implementación física de la autoridad remota, Fase 3 (Backend — registro
-- de identidad S2S).
--
-- SUPUESTO DE DISEÑO: el encargo de Fase 3 (Nucleus, documento adjunto) menciona
-- explícitamente "El endpoint de registro de identidad del lado Backend (encargo aparte,
-- mismo día)" — ese encargo de Backend NO está presente en esta sesión. El schema de
-- esta tabla es inferencia razonable a partir de lo que Nucleus necesita enviar
-- (installation_id, organization_id, clave pública Ed25519) y lo que Backend necesita
-- para verificar firmas S2S en cada request posterior (identity.ts). Confirmar contra
-- el encargo real de Backend antes de considerar esto definitivo.
--
-- `installation_id` es la clave primaria (1 identidad por instalación, generada por
-- Nucleus en `identity.go`). `revoked_at` no tiene mecanismo de escritura en esta fase
-- (el camino de escritura es Fase 4, explícitamente fuera de alcance) — se agrega la
-- columna ahora para no requerir otra migración cuando exista revocación, pero ningún
-- código de esta fase la setea.

CREATE TABLE IF NOT EXISTS installation_identities (
  installation_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  public_key TEXT NOT NULL, -- base64 raw Ed25519 public key (32 bytes), mismo formato que AuthorityTrustBundleSigningKey.public_key en schema.ts
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_installation_identities_org ON installation_identities(organization_id);
