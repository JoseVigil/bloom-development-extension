-- Permanent project claims, with fail-closed validation of legacy evidence.
CREATE TABLE authority_project_claims_migration_guard(singleton INTEGER PRIMARY KEY CHECK(singleton=1),valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO authority_project_claims_migration_guard(singleton,valid)
SELECT 1,CASE WHEN EXISTS(
 SELECT 1 FROM authority_project_scope_evidence e
 LEFT JOIN organizations o ON o.id=e.organization_id
 LEFT JOIN tenants t ON t.id=o.tenant_id
 LEFT JOIN installation_keys i ON i.installation_id=substr(e.source_ref,length('installation:')+1)
 WHERE e.evidence_kind='canonical' AND (e.project_id IS NULL OR e.project_id='' OR e.organization_id IS NULL OR e.organization_id='' OR e.revision<>'1' OR e.source_ref NOT LIKE 'installation:%' OR length(e.source_ref)<=length('installation:') OR o.id IS NULL OR o.tenant_id IS NULL OR t.id IS NULL OR i.installation_id IS NULL OR i.status<>'active' OR i.organization_id<>e.organization_id OR (SELECT count(*) FROM authority_project_scope_evidence d WHERE d.evidence_kind='canonical' AND d.project_id=e.project_id)<>1)
) THEN 0 ELSE 1 END;
CREATE UNIQUE INDEX authority_project_scope_evidence_project_unique ON authority_project_scope_evidence(project_id);
-- CORRECCIÓN (Encargo_BACKEND_Correccion_Migracion0016_y_Typecheck_v1_0.md §1): la columna
-- `installation_id` de abajo declaraba `REFERENCES installation_keys(installation_id)`, pero
-- `installation_keys.installation_id` NUNCA tuvo un UNIQUE/PK real — sólo un índice único
-- PARCIAL (`idx_installation_keys_active_unique ... WHERE status='active'`, ver
-- 0002_authority_security.sql), porque esa tabla admite a propósito múltiples filas
-- históricas por installation_id (comentario de esa misma migración: "revocar y reemplazar"
-- es Fase 4). SQLite no acepta un FK contra una columna sin una UNIQUE/PK completa — de ahí
-- el "foreign key mismatch" al aplicar esta migración, que sólo se manifestaba en
-- `wrangler d1 migrations apply` (única corrida que ejecuta el `PRAGMA foreign_keys = ON` de
-- 0000_initial.sql en la misma sesión que este backfill), nunca en los tests unitarios
-- (que cargan un subconjunto de migraciones sin ese pragma). Se quita la referencia — no se
-- pierde ninguna validación real: `authorize()` en project-claim.ts ya exige, en código,
-- `installation_keys.status='active' AND organization_id=org` antes de insertar cualquier
-- fila en `authority_project_claims` (línea `authorize()`), y el propio guard de esta
-- migración (arriba) ya exige lo mismo para el backfill histórico. Mismo criterio que ya
-- usa este backend en otro lado para encadenamientos que un FK simple no puede expresar
-- (ver el comentario sobre `issuer_signing_keys.signed_by_key_id` en 0002_authority_security.sql).
--
-- NOTA RELACIONADA, fuera de alcance de esta corrección: `0008_authority_sync.sql` tiene el
-- mismo patrón (`authority_sync_challenges.installation_id REFERENCES
-- installation_keys(installation_id)`) — hoy inerte porque ninguna migración ni código de
-- runtime inserta ahí con foreign_keys activado, pero es el mismo defecto latente. Señalado,
-- no corregido acá: no estaba en el alcance de este encargo y esa tabla no bloquea nada hoy.
CREATE TABLE authority_project_claims(project_id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL REFERENCES organizations(id),tenant_id TEXT NOT NULL REFERENCES tenants(id),installation_id TEXT NOT NULL,revision TEXT NOT NULL CHECK(revision='1'),source_ref TEXT NOT NULL,evidence_kind TEXT NOT NULL CHECK(evidence_kind='canonical'),claimed_at TEXT NOT NULL,CHECK(source_ref='installation:'||installation_id));
INSERT INTO authority_project_claims(project_id,organization_id,tenant_id,installation_id,revision,source_ref,evidence_kind,claimed_at)
SELECT e.project_id,e.organization_id,o.tenant_id,substr(e.source_ref,length('installation:')+1),e.revision,e.source_ref,e.evidence_kind,datetime('now') FROM authority_project_scope_evidence e JOIN organizations o ON o.id=e.organization_id WHERE e.evidence_kind='canonical';
DROP TABLE authority_project_claims_migration_guard;
CREATE INDEX authority_project_claims_organization ON authority_project_claims(organization_id,project_id);
CREATE INDEX authority_project_claims_installation ON authority_project_claims(installation_id);
CREATE TRIGGER authority_project_claims_no_update BEFORE UPDATE ON authority_project_claims BEGIN SELECT RAISE(ABORT,'authority_project_claim_immutable'); END;
CREATE TRIGGER authority_project_claims_no_delete BEFORE DELETE ON authority_project_claims BEGIN SELECT RAISE(ABORT,'authority_project_claim_immutable'); END;
