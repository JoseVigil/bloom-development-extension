import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorityTenantSelfResponse } from '../src/authority/tenant-self-route';

// Sovereign Tenant Fase 5 (Nucleus) — Paso 3 / "Paso 0, bloqueante". Cubre sólo la
// lógica de negocio de authorityTenantSelfResponse (lectura de organizations.tenant_id).
// La autenticación S2S (verifyInstallationAuth) ya tiene su propia cobertura en
// identity.spec.ts y no se reabre acá — mismo reparto de responsabilidad que
// authority-evidence-route.spec.ts / authority-snapshot-route.spec.ts.
let db: D1Database, mf: Miniflare, temp: string;

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), 'authority-tenant-self-'));
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: '127.0.0.1',
      cf: false,
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: '2026-08-29',
      d1Databases: { DB: 'tenant-self' },
    }),
    resourcePersistencePath: temp,
  });
  db = (await mf.getD1Database('DB')) as unknown as D1Database;
  await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY, tenant_id TEXT)').run();
}, 60000);

afterAll(async () => {
  await mf?.dispose();
  if (temp) rmSync(temp, { recursive: true, force: true });
});

describe('authorityTenantSelfResponse', () => {
  it('returns the tenant_id already persisted for the organization', async () => {
    await db.prepare('INSERT INTO organizations(id, tenant_id) VALUES (?, ?)').bind('org-a', 'tenant-a').run();
    const res = await authorityTenantSelfResponse(db, { organizationId: 'org-a' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: 'tenant-a' });
  });

  it('returns tenantId null instead of failing when the column has not been backfilled yet', async () => {
    await db.prepare('INSERT INTO organizations(id, tenant_id) VALUES (?, NULL)').bind('org-b').run();
    const res = await authorityTenantSelfResponse(db, { organizationId: 'org-b' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: null });
  });

  it('returns 404 organization_not_found for an unknown organizationId', async () => {
    const res = await authorityTenantSelfResponse(db, { organizationId: 'does-not-exist' });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'organization_not_found' });
  });
});
