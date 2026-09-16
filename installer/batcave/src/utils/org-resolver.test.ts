// installer/batcave/src/utils/org-resolver.test.ts
//
// Sovereign Tenant — Fase 4: discoverTenant() (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md
// §2.4.1, autorizada por Jose 2026-09-16). Archivo nuevo — no existía test para
// org-resolver.ts antes de esta fase.
//
// resolveOrganization()/discoverOrganization() usan `process.cwd()` (no `import.meta.url`,
// no un parámetro inyectable) para ubicar `.bloom/`, así que cada test arma un directorio
// temporal real y hace `process.chdir()` dentro de él — mismo patrón de mkdtempSync que ya
// usa `loader.test.ts`, extendido con el chdir que este módulo en particular necesita.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { discoverTenant, resolveOrganization, type OrganizationContext } from './org-resolver.js';

const originalCwd = process.cwd();
let tmpRoot: string;
let originalBloomOrgEnv: string | undefined;

function seedOrg(orgName: string, overrides: Record<string, unknown> = {}) {
  const dir = join(tmpRoot, '.bloom', `.nucleus-${orgName}`);
  mkdirSync(dir, { recursive: true });
  const ownership = {
    organization_fingerprint: `bloom:org:${orgName}`,
    organization_name: orgName,
    master_user: `user-${orgName}`,
    key_fingerprint: 'unassigned',
    created_at: 0,
    ...overrides
  };
  writeFileSync(join(dir, '.ownership.json'), JSON.stringify(ownership));
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'batcave-org-resolver-test-'));
  process.chdir(tmpRoot);
  originalBloomOrgEnv = process.env.BLOOM_ORGANIZATION;
  delete process.env.BLOOM_ORGANIZATION;
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmpRoot, { recursive: true, force: true });
  if (originalBloomOrgEnv !== undefined) process.env.BLOOM_ORGANIZATION = originalBloomOrgEnv;
  else delete process.env.BLOOM_ORGANIZATION;
});

describe('discoverTenant (Fase 4)', () => {
  it('devuelve organizations:[] y fingerprint:null cuando no existe .bloom', async () => {
    const result = await discoverTenant();
    expect(result).toEqual({ fingerprint: null, organizations: [] });
  });

  it('descubre una única organización sin tenant_fingerprint declarado', async () => {
    seedOrg('acme');
    const result = await discoverTenant();
    expect(result.fingerprint).toBeNull();
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]).toMatchObject({ name: 'acme', fingerprint: 'bloom:org:acme' });
  });

  it('descubre TODAS las organizaciones bajo el mismo .bloom, no sólo la primera', async () => {
    seedOrg('beta', { tenant_fingerprint: 'bloom:tenant:acme-group' });
    seedOrg('acme', { tenant_fingerprint: 'bloom:tenant:acme-group' });
    const result = await discoverTenant();
    expect(result.fingerprint).toBe('bloom:tenant:acme-group');
    // Orden determinístico alfabético, no orden de inserción/readdir.
    expect(result.organizations.map(o => o.name)).toEqual(['acme', 'beta']);
  });

  it('ignora una carpeta .nucleus-* sin .ownership.json (instalación a medio provisionar)', async () => {
    seedOrg('acme');
    mkdirSync(join(tmpRoot, '.bloom', '.nucleus-incomplete'), { recursive: true });
    const result = await discoverTenant();
    expect(result.organizations.map(o => o.name)).toEqual(['acme']);
  });

  it('propaga el error si un .ownership.json presente es inválido (mismo criterio que discoverOrganization)', async () => {
    seedOrg('acme');
    const brokenDir = join(tmpRoot, '.bloom', '.nucleus-broken');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(join(brokenDir, '.ownership.json'), JSON.stringify({ organization_fingerprint: 'not-a-valid-fingerprint' }));
    await expect(discoverTenant()).rejects.toThrow();
  });

  it('acepta un tenant_fingerprint ausente en algunas organizaciones y presente en otras (primero encontrado gana, sin cruzar validación)', async () => {
    seedOrg('acme'); // sin tenant_fingerprint — instalación legada
    seedOrg('beta', { tenant_fingerprint: 'bloom:tenant:beta-group' });
    const result = await discoverTenant();
    expect(result.fingerprint).toBe('bloom:tenant:beta-group');
    expect(result.organizations.map(o => o.name)).toEqual(['acme', 'beta']);
  });

  it('rechaza un tenant_fingerprint con formato inválido', async () => {
    seedOrg('acme', { tenant_fingerprint: 'not-a-tenant-fingerprint' });
    await expect(discoverTenant()).rejects.toThrow();
  });
});

describe('resolveOrganization / discoverOrganization — regresión (sin cambio de comportamiento)', () => {
  it('con 2+ .nucleus-* presentes, resolveOrganization() sigue devolviendo una única organización (la primera encontrada), como antes de Fase 4', async () => {
    seedOrg('acme');
    seedOrg('beta');
    const org: OrganizationContext = await resolveOrganization();
    // No se afirma CUÁL de las dos gana (discoverOrganization() no garantiza orden) —
    // sólo que sigue devolviendo una organización única, nunca una lista, exactamente el
    // mismo contrato que tenía antes de que existiera discoverTenant().
    expect(['acme', 'beta']).toContain(org.name);
    expect(org.fingerprint).toBe(`bloom:org:${org.name}`);
  });

  it('BLOOM_ORGANIZATION sigue teniendo prioridad sobre el discovery, sin tocar discoverTenant', async () => {
    seedOrg('acme');
    seedOrg('beta');
    process.env.BLOOM_ORGANIZATION = 'beta';
    const org = await resolveOrganization();
    expect(org.name).toBe('beta');
  });
});
