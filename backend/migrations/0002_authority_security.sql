-- backend/migrations/0002_authority_security.sql
--
-- Encargo — Implementación física de la autoridad remota, Fase 3 (Backend — §1.1 y
-- §1.3 de Encargo_Implementacion_Fisica_Fase3_Backend_v0_1.md, aprobado 2026-09-04).
--
-- Reemplaza cualquier migración previa de `installation_identities` de una sesión
-- anterior: esa tabla no corresponde al encargo real (nombre de columnas y semántica
-- distintos). Si `installation_identities` ya fue aplicada en algún entorno, requiere
-- su propia migración de baja — no incluida acá porque no fue pedida y tocar eso está
-- fuera de foco láser de esta fase.

-- §1.1 — identidad de instalación S2S.
--
-- Sólo se admite alta (INSERT). La baja (marcar una clave como `revoked`) es Fase 4
-- (§3 del encargo). Por eso la tabla ya tiene la columna `status` con ambos valores
-- posibles, pero ningún código de esta fase escribe `revoked`.
CREATE TABLE IF NOT EXISTS installation_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  installation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  public_key_raw TEXT NOT NULL, -- base64 de la clave pública Ed25519 raw (32 bytes)
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  registered_at INTEGER NOT NULL
);

-- Restricción central de §1.1: un `installation_id` no puede tener más de una fila
-- `active` a la vez. Un segundo intento de registro se rechaza (409), no sobreescribe.
-- Índice único parcial (soportado por SQLite/D1) en vez de UNIQUE simple sobre la
-- columna, porque la tabla sí admite múltiples filas históricas por installation_id
-- una vez que exista revocar-y-reemplazar en Fase 4.
CREATE UNIQUE INDEX IF NOT EXISTS idx_installation_keys_active_unique
  ON installation_keys(installation_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_installation_keys_org ON installation_keys(organization_id);

-- §1.3 — trust bundle del issuer, con cadena de confianza (§8.3 del diseño físico).
--
-- `signed_by_key_id` referencia otra fila de esta misma tabla. La regla de
-- encadenamiento ("una clave nueva sólo es confiable si viene firmada por una clave ya
-- `active`, salvo que sea la primera clave de la organización") se aplica en código
-- (`registerIssuerSigningKey` en snapshot.ts), no acá: un CHECK/FK simple no puede
-- expresar "activa en el momento del insert" ni la excepción de primera clave.
CREATE TABLE IF NOT EXISTS issuer_signing_keys (
  key_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  public_key_raw TEXT NOT NULL, -- base64 de la clave pública Ed25519 raw (32 bytes)
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')) DEFAULT 'active',
  signed_by_key_id TEXT REFERENCES issuer_signing_keys(key_id),
  created_at INTEGER NOT NULL,
  retired_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_issuer_signing_keys_org ON issuer_signing_keys(organization_id);
