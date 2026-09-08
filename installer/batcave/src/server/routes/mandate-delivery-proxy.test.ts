import { it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createMandateDeliveryProxyRoutes } from './mandate-delivery-proxy.js';
const vector = JSON.parse(readFileSync(new URL('../../../../nucleus/internal/mandatedelivery/testdata/mandate-delivery-v1.json', import.meta.url), 'utf8'));
const app = () => createMandateDeliveryProxyRoutes({ backend: { base_url: 'http://backend.test' } } as any);
afterEach(() => { vi.unstubAllGlobals(); });
it.each(['valid_body_base64', 'wrong_domain_body_base64'])('preserves TypeScript vector %s exactly', async key => {
  const bytes = Buffer.from(vector[key], 'base64');
  const fetchMock = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'application/json' } }));vi.stubGlobal('fetch', fetchMock);
  const res = await app().request('/v1/mandate/bootstrap?org=a%20b&installation_id=i', { headers: { 'x-bloom-installation-id': 'i', 'x-bloom-timestamp': 'stamp', 'x-bloom-signature': 'signature' } });
  expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);expect(res.headers.get('content-type')).toBe('application/json');
  const [url, init] = fetchMock.mock.calls[0] as any;expect(url.toString()).toBe('http://backend.test/v1/mandate/bootstrap?org=a%20b&installation_id=i');
  expect(init.headers.get('x-bloom-signature')).toBe('signature');expect(init.headers.get('x-bloom-timestamp')).toBe('stamp');expect(init.headers.get('x-bloom-installation-id')).toBe('i');
});
it('preserves 404 and absent content type', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([255]), { status: 404 })));
  const response = await app().request('/v1/mandate/bootstrap');expect(response.status).toBe(404);expect(response.headers.has('content-type')).toBe(false);expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([255]));
});
it.each(['fetch', 'body'])('maps unreachable or incomplete backend %s to 502', async stage => {
  vi.stubGlobal('fetch', vi.fn(async () => { if (stage === 'fetch') throw Error('offline');return { arrayBuffer: async () => { throw Error('partial'); } }; }));
  expect((await app().request('/v1/mandate/bootstrap')).status).toBe(502);
});
