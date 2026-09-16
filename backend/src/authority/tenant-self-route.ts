// backend/src/authority/tenant-self-route.ts
//
// Sovereign Tenant, Fase 5 (Nucleus) — Paso 3 / "Paso 0, bloqueante" (relayed by Jose,
// 2026-09-16, citing a finding from Génesis Control): GET /v1/authority/tenant/self.
//
// Sin este endpoint, Nucleus's ReconcileCanonicalOrganization (installer/nucleus/
// internal/governance/ownership_reconciliation.go, fetchOrganizationTenantID) siempre
// recibe tenantID=nil en cada sync — y, una vez que ownershipcontract.Validate() se
// endurezca para exigir TenantID en documentos BOUND/REMOTE_LOCKED (encargo separado,
// todavía no ejecutado), ninguna instalación nueva podría llegar a BOUND. No es un
// detalle de migración: es una dependencia funcional permanente de acá en adelante.
//
// Separado en su propio archivo, no inline en index.ts, siguiendo el mismo patrón que
// snapshot-route.ts / evidence-route.ts / trust-route.ts / sync-route.ts: la lógica de
// negocio vive en authority/*.ts, index.ts sólo resuelve middleware + query params y
// despacha. `organizations.tenant_id` ya existe (migración 0015_tenants.sql, Fase 1
// "schema inerte" del Sovereign Tenant, autorizada por Jose 2026-09-16) y ya tiene un
// lector precedente en tenant-store.ts (resolveTenantId) — este archivo no inventa
// columna ni tabla nueva, sólo expone esa misma columna por un endpoint S2S distinto.
//
// SUPUESTO: `tenant_id` es NULLABLE en el schema (ALTER TABLE ... ADD COLUMN tenant_id
// TEXT REFERENCES tenants(id), sin NOT NULL) y el backfill de la migración 0015 lo llena
// para toda fila preexistente, pero no hay una garantía de invariante a nivel de base que
// impida un NULL futuro. Por eso esta respuesta devuelve `tenantId: null` en vez de
// fallar — Nucleus (fetchOrganizationTenantID) ya trata un tenantID nil como "no
// disponible todavía" sin romper Validate() en la fase actual (Fase 5 §3.2: tenant es
// puramente informativo hasta que el encargo de endurecimiento separado se autorice y
// ejecute). Sólo `organization_not_found` (organizationId inexistente) es un error real.

export interface TenantSelfResult {
  tenantId: string | null;
}

/**
 * Resuelve el `tenant_id` plano de `organizationId` contra la tabla `organizations`.
 * No requiere rol `master` ni ninguna otra autorización de negocio adicional — la
 * autenticación S2S (verifyInstallationAuth, ya aplicada por el caller en index.ts)
 * es la única puerta: una instalación ya vinculada a esa organización puede leer el
 * tenant de su propia organización, igual criterio que snapshot/trust-manifest.
 */
export async function authorityTenantSelfResponse(
  db: D1Database,
  params: { organizationId: string },
): Promise<Response> {
  const org = await db
    .prepare('SELECT tenant_id FROM organizations WHERE id = ?')
    .bind(params.organizationId)
    .first<{ tenant_id: string | null }>();

  if (!org) {
    return Response.json({ error: 'organization_not_found' }, { status: 404 });
  }

  const result: TenantSelfResult = { tenantId: org.tenant_id };
  return Response.json(result, { status: 200 });
}
