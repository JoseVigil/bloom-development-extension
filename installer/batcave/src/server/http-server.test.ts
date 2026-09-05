import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { ServerType } from '@hono/node-server';
import { createHttpServer } from './http-server.js';
import { PathResolver } from '../config/paths.js';
import type { OrganizationContext } from '../utils/org-resolver.js';
import type { BatcaveConfig } from '../config/loader.js';

const BACKEND_BASE_URL = 'https://backend.test';

function makeOrgAndPaths(tmpRoot: string) {
  const org: OrganizationContext = {
    name: 'acme',
    fingerprint: 'bloom:org:acme',
    nucleusRoot: join(tmpRoot, '.nucleus-acme'),
    batcaveRoot: join(tmpRoot, '.nucleus-acme', '.batcave'),
    ownershipPath: join(tmpRoot, '.nucleus-acme', '.ownership.json'),
    alfredContractPath: join(tmpRoot, '.nucleus-acme', '.core', '.ai_bot.sovereign.bl'),
    configPath: join(tmpRoot, '.nucleus-acme', '.batcave', 'config', 'batcave.config.json')
  };
  return { org, paths: new PathResolver(org) };
}

function listen(server: ServerType): Promise<{ port: number }> {
  return new Promise((resolve) => {
    // createHttpServer ya resuelve el listen internamente vía el callback de
    // `serve`; acá sólo esperamos a que el socket tenga una dirección asignada.
    const check = () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve({ port: addr.port });
      } else {
        setImmediate(check);
      }
    };
    check();
  });
}

describe('http-server', () => {
  let tmpRoot: string;
  let server: ServerType | undefined;
  let realFetch: typeof fetch;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('responds 200 on a simple health route', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'batcave-http-server-test-'));
    const { org, paths } = makeOrgAndPaths(tmpRoot);
    const config: BatcaveConfig = {
      server: { port_rest: 0, port_wss: 0, host: '127.0.0.1' },
      backend: { base_url: BACKEND_BASE_URL }
    } as BatcaveConfig;

    server = createHttpServer(org, paths, config);
    const { port } = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('mounts the authority-proxy routes (without a real Backend)', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'batcave-http-server-test-'));
    const { org, paths } = makeOrgAndPaths(tmpRoot);
    const config: BatcaveConfig = {
      server: { port_rest: 0, port_wss: 0, host: '127.0.0.1' },
      backend: { base_url: BACKEND_BASE_URL }
    } as BatcaveConfig;

    // Interceptamos sólo las llamadas hacia el Backend; todo lo demás (incluida
    // nuestra propia request de test hacia el servidor local) usa el fetch real.
    realFetch = globalThis.fetch;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.startsWith(BACKEND_BASE_URL)) {
        return Promise.resolve(
          new Response(JSON.stringify({ bundle: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          })
        );
      }
      return realFetch(input, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    server = createHttpServer(org, paths, config);
    const { port } = await listen(server);

    const res = await fetch(`http://127.0.0.1:${port}/v1/authority/trust-bundle`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bundle: [] });
    expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_BASE_URL}/v1/authority/trust-bundle`, expect.anything());
  });
});
