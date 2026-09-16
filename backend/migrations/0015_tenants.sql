-- 0015_tenants.sql
-- Sovereign Tenant — Fase 1: schema inerte
-- (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.2, §4 — Fase 1, confirmada por Jose
-- el 2026-09-16: Opción A, Tenant como agrupador sin autoridad propia).
--
-- Introduce `tenants` como agrupador de organizaciones. NINGÚN código de runtime lee
-- `tenant_id` todavía después de esta migración — es un cambio de schema puro, sin
-- efecto observable. El límite real de autoridad/firma/aislamiento sigue siendo
-- `organization_id`, exactamente como hoy (canonical.ts, snapshot.ts, emission-store.ts,
-- mandate-publish.ts, mandate-delivery.ts, identity.ts: ninguno se toca en esta fase).
--
-- Backfill: cada organización que ya exista al momento de correr esta migración se
-- convierte en tenant de sí misma, reusando el mismo id (tenant.id = organization.id) —
-- no se inventa un UUID nuevo ni una tabla de traducción para el caso legado. Los
-- tenants creados desde Fase 2 en adelante (vía finishGenesis) van a recibir su propio
-- UUID, independiente del id de su primera organización — ver genesis-store.ts cuando
-- esa fase se autorice.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  master_github_username TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE organizations ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
CREATE INDEX idx_organizations_tenant ON organizations(tenant_id);

INSERT INTO tenants (id, name, master_github_username, key_fingerprint, created_at)
  SELECT id, name, master_github_username, 'bloom:tenant:' || id, created_at FROM organizations;

UPDATE organizations SET tenant_id = id WHERE tenant_id IS NULL;
