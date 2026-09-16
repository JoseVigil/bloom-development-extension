import { Hono } from 'hono';
import type { Context } from 'hono';
import type { BatcaveConfig } from '../../config/loader.js';
import type { BatcaveLoggers } from '../logging.js';

/**
 * Los tres headers S2S fijos por el encargo de Backend. Este archivo no los
 * reinterpreta ni valida — sólo los reenvía si vinieron, tal cual llegaron.
 */
const S2S_HEADERS = [
  'x-bloom-installation-id',
  'x-bloom-timestamp',
  'x-bloom-signature'
] as const;

const REQUEST_METADATA_HEADERS = [
  'x-correlation-id', 'if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since'
] as const;
const HUMAN_PROOF_HEADERS = ['cookie', 'origin', 'x-authority-csrf'] as const;

const RESPONSE_METADATA_HEADERS = [
  'content-type', 'etag', 'last-modified', 'cache-control', 'expires', 'date',
  'age', 'vary', 'retry-after', 'x-correlation-id', 'www-authenticate'
] as const;

/** Espejo exacto de las rutas ya fijas del lado Backend. */
const AUTHORITY_PATHS = {
  register: '/v1/authority/installations/register',
  snapshot: '/v1/authority/snapshot',
  trustBundle: '/v1/authority/trust-bundle',
  trustManifest: '/v1/authority/trust-manifest',
  actorChallenge: '/v1/authority/actor/challenge',
  actorApprove: '/v1/authority/actor/approve',
  syncChallenge: '/v1/authority/sync/challenge',
  syncPull: '/v1/authority/sync/pull',
  syncNotice: '/v1/authority/sync/notice',
  evidence: '/v1/authority/evidence',
  // Fase 4 — Sovereign Tenant (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.4.4),
  // autorizada por Jose 2026-09-16. Mismo path que el Backend real — no se inventa un
  // esquema de URL distinto para Batcave, mismo criterio que el resto de esta tabla.
  tenantOrganizations: '/v1/authority/tenant/organizations',
  // Sovereign Tenant Fase 5 (Nucleus) — Paso 3 / "Paso 0, bloqueante" (relayed by Jose,
  // 2026-09-16). Autenticación S2S pura (firma de instalación), mismo grupo que snapshot/
  // trust-manifest/evidence — no lleva HUMAN_PROOF_HEADERS (no depende de sesión humana).
  tenantSelf: '/v1/authority/tenant/self'
} as const;

function headersPresence(headers: Headers): Record<string, boolean> {
  // Logueamos que el header existe, nunca su valor (nunca la firma).
  const presence: Record<string, boolean> = {};
  for (const name of S2S_HEADERS) {
    presence[name] = headers.has(name);
  }
  return presence;
}

/**
 * Reenvía la request entrante hacia `${config.backend.base_url}${backendPath}`
 * sin reinterpretarla: mismo método, mismos query params, los tres headers S2S
 * (sólo si vinieron — nunca se inventan ni se rellenan) y el body tal cual.
 * Batcave no verifica la firma, no la reconstruye, no la entiende (§11.6).
 */
function proxyHandler(method: 'GET' | 'POST', backendPath: string, config: BatcaveConfig, loggers: BatcaveLoggers) {
  return async (c: Context) => {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(backendPath, config.backend.base_url);
    targetUrl.search = incomingUrl.search;

    const forwardHeaders = new Headers();
    for (const name of [...S2S_HEADERS, ...REQUEST_METADATA_HEADERS]) {
      const value = c.req.header(name);
      if (value !== undefined) {
        forwardHeaders.set(name, value);
      }
    }

    if (backendPath === AUTHORITY_PATHS.register) {
      const authorization = c.req.header('authorization');
      if (authorization !== undefined) forwardHeaders.set('authorization', authorization);
    }
    // actorApprove: prueba de posesión de sesión humana + CSRF, exigidos por el POST del
    // Backend. tenantOrganizations: mismo motivo — tanto el GET (lista, requiere sesión
    // activa) como el POST (crea hermana, requiere sesión + CSRF) del Backend dependen de
    // la cookie de sesión humana; reenviarla también en el GET no relaja nada (el Backend
    // igual exige sesión válida) y evita una rama de proxy distinta por verbo.
    if (backendPath === AUTHORITY_PATHS.actorApprove || backendPath === AUTHORITY_PATHS.tenantOrganizations) {
      for (const name of HUMAN_PROOF_HEADERS) {
        const value = c.req.header(name);
        if (value !== undefined) forwardHeaders.set(name, value);
      }
    }

    let body: ArrayBuffer | undefined;
    if (method === 'POST') {
      const contentType = c.req.header('content-type');
      if (contentType !== undefined) {
        forwardHeaders.set('content-type', contentType);
      }
      body = await c.req.arrayBuffer();
    }

    let backendResponse: Response;
    try {
      backendResponse = await fetch(targetUrl.toString(), {
        method,
        headers: forwardHeaders,
        body
      });
    } catch {
      loggers.relay.info(
        { method, path: backendPath, status: 502, headers_present: headersPresence(forwardHeaders) },
        'authority_proxy_backend_unreachable'
      );
      loggers.security.warn(
        { method, path: backendPath },
        'authority_proxy_backend_unreachable'
      );
      return c.json({ error: 'backend_unreachable' }, 502);
    }

    const responseBody = [204, 205, 304].includes(backendResponse.status) ? null : backendResponse.body;
    const responseHeaders = new Headers();
    for (const name of RESPONSE_METADATA_HEADERS) {
      const value = backendResponse.headers.get(name);
      if (value !== null) responseHeaders.set(name, value);
    }

    loggers.relay.info(
      {
        method,
        path: backendPath,
        status: backendResponse.status,
        headers_present: headersPresence(forwardHeaders)
      },
      'authority_proxy_relay'
    );
    if (backendResponse.status >= 500) {
      loggers.security.warn(
        { method, path: backendPath, status: backendResponse.status },
        'authority_proxy_backend_error'
      );
    }

    return new Response(responseBody, {
      status: backendResponse.status,
      headers: responseHeaders
    });
  };
}

/**
 * Monta las rutas de autoridad como proxy transparente hacia Backend.
 * No inventa un esquema de rutas nuevo — son namespaced exactamente igual a
 * como ya existen en Backend, para montar debajo del mismo router que usa el
 * resto de Batcave.
 */
export function createAuthorityProxyRoutes(config: BatcaveConfig, loggers: BatcaveLoggers): Hono {
  const app = new Hono();

  app.post(AUTHORITY_PATHS.register, proxyHandler('POST', AUTHORITY_PATHS.register, config, loggers));
  app.get(AUTHORITY_PATHS.snapshot, proxyHandler('GET', AUTHORITY_PATHS.snapshot, config, loggers));
  app.get(AUTHORITY_PATHS.trustBundle, proxyHandler('GET', AUTHORITY_PATHS.trustBundle, config, loggers));
  app.get(AUTHORITY_PATHS.trustManifest, proxyHandler('GET', AUTHORITY_PATHS.trustManifest, config, loggers));
  app.post(AUTHORITY_PATHS.actorChallenge, proxyHandler('POST', AUTHORITY_PATHS.actorChallenge, config, loggers));
  app.post(AUTHORITY_PATHS.actorApprove, proxyHandler('POST', AUTHORITY_PATHS.actorApprove, config, loggers));
  app.post(AUTHORITY_PATHS.syncChallenge, proxyHandler('POST', AUTHORITY_PATHS.syncChallenge, config, loggers));
  app.get(AUTHORITY_PATHS.syncPull, proxyHandler('GET', AUTHORITY_PATHS.syncPull, config, loggers));
  app.get(AUTHORITY_PATHS.syncNotice, proxyHandler('GET', AUTHORITY_PATHS.syncNotice, config, loggers));
  app.get(AUTHORITY_PATHS.evidence, proxyHandler('GET', AUTHORITY_PATHS.evidence, config, loggers));
  app.get(AUTHORITY_PATHS.tenantOrganizations, proxyHandler('GET', AUTHORITY_PATHS.tenantOrganizations, config, loggers));
  app.post(AUTHORITY_PATHS.tenantOrganizations, proxyHandler('POST', AUTHORITY_PATHS.tenantOrganizations, config, loggers));
  app.get(AUTHORITY_PATHS.tenantSelf, proxyHandler('GET', AUTHORITY_PATHS.tenantSelf, config, loggers));

  return app;
}
