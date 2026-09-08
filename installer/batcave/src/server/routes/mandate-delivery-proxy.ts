import { Hono } from 'hono';
import type { BatcaveConfig } from '../../config/loader.js';

export function createMandateDeliveryProxyRoutes(config: BatcaveConfig): Hono {
  const app = new Hono();
  app.get('/v1/mandate/bootstrap', async c => {
    const incoming = new URL(c.req.url);
    const target = new URL(incoming.pathname, config.backend.base_url);
    target.search = incoming.search;
    const headers = new Headers();
    for (const name of ['x-bloom-installation-id', 'x-bloom-timestamp', 'x-bloom-signature']) {
      const value = c.req.header(name);
      if (value !== undefined) headers.set(name, value);
    }
    try {
      const response = await fetch(target, { headers, redirect: 'manual' });
      const bytes = await response.arrayBuffer();
      const outputHeaders = new Headers();
      for (const name of ['content-type', 'cache-control']) {
        const value = response.headers.get(name);
        if (value !== null) outputHeaders.set(name, value);
      }
      return new Response([204, 205, 304].includes(response.status) ? null : bytes, { status: response.status, headers: outputHeaders });
    } catch { return c.json({ error: 'backend_unreachable' }, 502); }
  });
  return app;
}
