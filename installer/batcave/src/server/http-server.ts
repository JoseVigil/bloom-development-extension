import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import type { OrganizationContext } from '../utils/org-resolver.js';
import type { PathResolver } from '../config/paths.js';
import type { BatcaveConfig } from '../config/loader.js';
import { createBatcaveLoggers, type BatcaveLoggers } from './logging.js';
import { createAuthorityProxyRoutes } from './routes/authority-proxy.js';
import { createMandateDeliveryProxyRoutes } from './routes/mandate-delivery-proxy.js';

/**
 * Arma la app Hono: una ruta de salud simple + las rutas del proxy S2S de
 * §1.2, montadas bajo el mismo router. Separado de `startServer` para poder
 * testear el árbol de rutas (y arrancarlo en un puerto efímero) sin duplicar
 * la lógica de arranque.
 */
export function createApp(config: BatcaveConfig, loggers: BatcaveLoggers): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.route('/', createAuthorityProxyRoutes(config, loggers));
  app.route('/', createMandateDeliveryProxyRoutes(config));

  return app;
}

/**
 * Arranca el servidor HTTP real en `config.server.host`/`config.server.port_rest`
 * con `@hono/node-server`, y devuelve el `http.Server` subyacente (útil para
 * tests y para poder cerrarlo explícitamente). `startServer` (más abajo) es el
 * punto de entrada que consume `main.ts` y sólo espera a que quede escuchando.
 */
export function createHttpServer(
  org: OrganizationContext,
  paths: PathResolver,
  config: BatcaveConfig,
  onListen?: (info: { address: string; port: number }) => void
): ServerType {
  const loggers = createBatcaveLoggers(org, paths);
  const app = createApp(config, loggers);

  const host = config.server?.host ?? '0.0.0.0';
  const port = config.server?.port_rest ?? 48215;

  const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    loggers.governance.info(
      { host: info.address, port: info.port },
      'http_server_started'
    );
    onListen?.(info);
  });
  // Notice streams are disposable hints. Bound idle sockets so reconnect/pull can
  // recover after a relay or client restart instead of retaining a dead channel.
  if ('keepAliveTimeout' in server) (server as any).keepAliveTimeout = 25_000;
  return server;
}

/**
 * Misma firma ya comentada en `main.ts`
 * (`await startServer(org, paths, config)`): conectarlo es descomentar una
 * línea, no rediseñar `main.ts`.
 */
export async function startServer(
  org: OrganizationContext,
  paths: PathResolver,
  config: BatcaveConfig
): Promise<void> {
  await new Promise<void>((resolve) => {
    createHttpServer(org, paths, config, () => resolve());
  });
}
