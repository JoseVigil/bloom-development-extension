// installer/batcave/src/server/routes/tenant-organizations-proxy.test.ts
//
// Sovereign Tenant — Fase 4: proxy de /v1/authority/tenant/organizations
// (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.4.4, autorizada por Jose 2026-09-16).
//
// Archivo nuevo, aislado — no toca authority-proxy.test.ts. Ejercita exactamente las
// mismas rutas (createAuthorityProxyRoutes ya las monta todas juntas), pero sólo agrega
// casos para el par GET/POST nuevo; el resto de las rutas ya existentes quedan cubiertas
// por su propio archivo de test, sin modificar.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuthorityProxyRoutes } from './authority-proxy.js';
import type { BatcaveConfig } from '../../config/loader.js';
import type { BatcaveLoggers } from '../logging.js';

function fakeLoggers(): BatcaveLoggers {
  return {
    governance: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    security: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    relay: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
  };
}

const config: BatcaveConfig = {
  backend: { base_url: 'https://backend.test' }
} as BatcaveConfig;

describe('authority-proxy — /v1/authority/tenant/organizations (Fase 4)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET reenvía organizationId por query string y la cookie de sesión, sin exigir CSRF', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ organizations: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/tenant/organizations?organizationId=org-1', {
      headers: { cookie: '__Host-authority-session=session-token' }
    });
    expect(res.status).toBe(200);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://backend.test/v1/authority/tenant/organizations?organizationId=org-1');
    expect(calledInit.method).toBe('GET');
    expect((calledInit.headers as Headers).get('cookie')).toBe('__Host-authority-session=session-token');
  });

  it('POST reenvía cookie, origin, X-Authority-CSRF y el body exacto', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ organizationId: 'org-2', tenantId: 'tenant-1' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/tenant/organizations', {
      method: 'POST',
      headers: {
        cookie: '__Host-authority-session=session-token',
        origin: 'https://human.test',
        'x-authority-csrf': 'csrf-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ organizationId: 'org-1', name: 'Sibling Org' })
    });
    expect(res.status).toBe(201);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://backend.test/v1/authority/tenant/organizations');
    expect(calledInit.method).toBe('POST');
    const forwarded = calledInit.headers as Headers;
    expect(forwarded.get('cookie')).toBe('__Host-authority-session=session-token');
    expect(forwarded.get('origin')).toBe('https://human.test');
    expect(forwarded.get('x-authority-csrf')).toBe('csrf-token');
    const forwardedBody = await new Response(calledInit.body).text();
    expect(JSON.parse(forwardedBody)).toEqual({ organizationId: 'org-1', name: 'Sibling Org' });
  });

  it('nunca loguea la cookie de sesión ni el CSRF, en ninguno de los dos verbos', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const loggers = fakeLoggers();
    const app = createAuthorityProxyRoutes(config, loggers);
    await app.request('/v1/authority/tenant/organizations?organizationId=org-1', { headers: { cookie: '__Host-authority-session=secret-cookie' } });
    await app.request('/v1/authority/tenant/organizations', {
      method: 'POST',
      headers: { cookie: '__Host-authority-session=secret-cookie', 'x-authority-csrf': 'secret-csrf', 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1', name: 'X' })
    });
    const logs = JSON.stringify([(loggers.relay.info as any).mock.calls, (loggers.security.warn as any).mock.calls]);
    expect(logs).not.toContain('secret-cookie');
    expect(logs).not.toContain('secret-csrf');
  });

  it('propaga el status y el cuerpo de rechazo del Backend (403 not_authorized) tal cual', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'authority_tenant_not_authorized' }), { status: 403, headers: { 'content-type': 'application/json' } }));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/tenant/organizations', {
      method: 'POST',
      headers: { cookie: '__Host-authority-session=session-token', 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: 'org-1', name: 'X' })
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'authority_tenant_not_authorized' });
  });

  it('relaya 502 backend_unreachable igual que el resto de las rutas de este proxy', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/tenant/organizations?organizationId=org-1', { headers: { cookie: '__Host-authority-session=session-token' } });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'backend_unreachable' });
  });

  it('no reenvía cookie/origin/csrf hacia rutas no relacionadas (regresión: el gate sigue acotado a actorApprove y tenantOrganizations)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    await app.request('/v1/authority/snapshot', { headers: { cookie: '__Host-authority-session=should-not-forward' } });
    const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
    expect(forwarded.has('cookie')).toBe(false);
  });
});
