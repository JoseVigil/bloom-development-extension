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

describe('authority-proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards method, S2S headers, query params and body on POST register', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'content-type': 'application/json' }
      })
    );

    const app = createAuthorityProxyRoutes(config, fakeLoggers());

    const res = await app.request(
      '/v1/authority/installations/register?foo=bar',
      {
        method: 'POST',
        headers: {
          'x-bloom-installation-id': 'inst-123',
          'x-bloom-timestamp': '1700000000',
          'x-bloom-signature': 'sig-abc',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      }
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://backend.test/v1/authority/installations/register?foo=bar');
    expect(calledInit.method).toBe('POST');

    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('x-bloom-installation-id')).toBe('inst-123');
    expect(forwardedHeaders.get('x-bloom-timestamp')).toBe('1700000000');
    expect(forwardedHeaders.get('x-bloom-signature')).toBe('sig-abc');

    const forwardedBody = await new Response(calledInit.body).text();
    expect(JSON.parse(forwardedBody)).toEqual({ hello: 'world' });
  });

  it('forwards query params and headers on GET snapshot', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ snapshot: 'data' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/snapshot?since=42', {
      method: 'GET',
      headers: {
        'x-bloom-installation-id': 'inst-123',
        'x-bloom-timestamp': '1700000000',
        'x-bloom-signature': 'sig-abc'
      }
    });

    expect(res.status).toBe(200);
    const [calledUrl] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe('https://backend.test/v1/authority/snapshot?since=42');
  });

  it('forwards GET trust-bundle', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ bundle: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    const res = await app.request('/v1/authority/trust-bundle', { method: 'GET' });

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe('https://backend.test/v1/authority/trust-bundle');
  });

  it('relays 502 with backend_unreachable when the backend is down', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const loggers = fakeLoggers();

    const app = createAuthorityProxyRoutes(config, loggers);
    const res = await app.request('/v1/authority/snapshot', { method: 'GET' });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'backend_unreachable' });
    expect(loggers.security.warn).toHaveBeenCalled();
  });

  it('never invents a missing S2S header on the forwarded request', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));

    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    // Sólo se manda installation-id; timestamp y signature quedan ausentes a propósito.
    await app.request('/v1/authority/snapshot', {
      method: 'GET',
      headers: { 'x-bloom-installation-id': 'inst-123' }
    });

    const [, calledInit] = fetchMock.mock.calls[0];
    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('x-bloom-installation-id')).toBe('inst-123');
    expect(forwardedHeaders.has('x-bloom-timestamp')).toBe(false);
    expect(forwardedHeaders.has('x-bloom-signature')).toBe(false);
  });

  it('does not verify, reconstruct or interpret the signature', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());

    await app.request('/v1/authority/snapshot', {
      method: 'GET',
      headers: { 'x-bloom-signature': 'this-is-not-a-real-signature' }
    });

    // La firma se reenvía tal cual, sin transformación.
    const [, calledInit] = fetchMock.mock.calls[0];
    const forwardedHeaders = calledInit.headers as Headers;
    expect(forwardedHeaders.get('x-bloom-signature')).toBe('this-is-not-a-real-signature');
  });
});
