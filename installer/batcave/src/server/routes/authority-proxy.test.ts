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

  it('preserves registration credentials and exact bytes without logging secrets', async () => {
    const bytes = new Uint8Array([0, 255, 13, 10, 32, 123, 125]);
    fetchMock.mockResolvedValue(new Response(bytes, { status: 201 }));
    const loggers = fakeLoggers();
    const res = await createAuthorityProxyRoutes(config, loggers).request('/v1/authority/installations/register?org=opaque', {
      method: 'POST', headers: { authorization: 'Bearer secret-value', 'content-type': 'application/octet-stream', 'x-correlation-id': 'c1' }, body: bytes
    });
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer secret-value');
    expect(headers.get('x-correlation-id')).toBe('c1');
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(new Uint8Array(fetchMock.mock.calls[0][1].body)).toEqual(bytes);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(res.headers.has('content-type')).toBe(false);
    expect(JSON.stringify((loggers.relay.info as any).mock.calls)).not.toContain('secret-value');
  });

  it.each([204, 205, 304])('preserves conditional metadata on bodyless status %s', async (status) => {
    const metadata = { etag: '"v42"', 'last-modified': 'Tue, 08 Sep 2026 00:00:00 GMT', 'cache-control': 'private, no-cache', 'retry-after': '10', 'x-correlation-id': 'c42', vary: 'Accept' };
    fetchMock.mockResolvedValue(new Response(null, { status, headers: metadata }));
    const res = await createAuthorityProxyRoutes(config, fakeLoggers()).request('/v1/authority/snapshot?org=opaque&base_version=42', {
      headers: { 'if-none-match': '"v42"', 'if-modified-since': metadata['last-modified'], 'if-match': '"v41"', 'if-unmodified-since': metadata['last-modified'], 'x-correlation-id': 'c42' }
    });
    expect(res.status).toBe(status);
    expect(await res.text()).toBe('');
    for (const [key, value] of Object.entries(metadata)) expect(res.headers.get(key)).toBe(value);
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('if-none-match')).toBe('"v42"');
    expect(headers.get('if-match')).toBe('"v41"');
    expect(headers.get('if-modified-since')).toBe(metadata['last-modified']);
    expect(headers.get('if-unmodified-since')).toBe(metadata['last-modified']);
    expect(headers.get('x-correlation-id')).toBe('c42');
  });

  it('preserves backend error status, bytes and retry metadata', async () => {
    const body = '  unavailable\r\n';
    fetchMock.mockResolvedValue(new Response(body, { status: 503, headers: { 'retry-after': '30', 'x-correlation-id': 'failure' } }));
    const res = await createAuthorityProxyRoutes(config, fakeLoggers()).request('/v1/authority/trust-bundle');
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(body);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('x-correlation-id')).toBe('failure');
  });

  it('does not fabricate registration authentication or relay it to S2S reads', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    const app = createAuthorityProxyRoutes(config, fakeLoggers());
    await app.request('/v1/authority/installations/register', { method: 'POST' });
    expect(fetchMock.mock.calls[0][1].headers.has('authorization')).toBe(false);
    for (const path of ['snapshot', 'trust-bundle']) {
      await app.request(`/v1/authority/${path}`, { headers: { authorization: 'Bearer registration-only' } });
      expect(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].headers.has('authorization')).toBe(false);
    }
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
