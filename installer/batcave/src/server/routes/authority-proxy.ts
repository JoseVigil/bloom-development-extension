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

/** Espejo exacto de las tres rutas ya fijas del lado Backend. */
const AUTHORITY_PATHS = {
  register: '/v1/authority/installations/register',
  snapshot: '/v1/authority/snapshot',
  trustBundle: '/v1/authority/trust-bundle'
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
    for (const name of S2S_HEADERS) {
      const value = c.req.header(name);
      if (value !== undefined) {
        forwardHeaders.set(name, value);
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

    const responseBody = await backendResponse.arrayBuffer();
    const responseContentType = backendResponse.headers.get('content-type') ?? 'application/json';

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
      headers: { 'content-type': responseContentType }
    });
  };
}

/**
 * Monta las tres rutas de autoridad como proxy transparente hacia Backend.
 * No inventa un esquema de rutas nuevo — son namespaced exactamente igual a
 * como ya existen en Backend, para montar debajo del mismo router que usa el
 * resto de Batcave.
 */
export function createAuthorityProxyRoutes(config: BatcaveConfig, loggers: BatcaveLoggers): Hono {
  const app = new Hono();

  app.post(AUTHORITY_PATHS.register, proxyHandler('POST', AUTHORITY_PATHS.register, config, loggers));
  app.get(AUTHORITY_PATHS.snapshot, proxyHandler('GET', AUTHORITY_PATHS.snapshot, config, loggers));
  app.get(AUTHORITY_PATHS.trustBundle, proxyHandler('GET', AUTHORITY_PATHS.trustBundle, config, loggers));

  return app;
}
