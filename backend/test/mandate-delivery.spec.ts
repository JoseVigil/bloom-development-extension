import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { resolveMandateDelivery, MANDATE_DELIVERY_DOMAIN } from '../src/mandate-delivery';
import { canonicalizeJson, sha256HexBytes, signWithDomain, verifyWithDomain } from '../src/authority/canonical';
import app from '../src/index';

const vectorPath = new URL('../../installer/nucleus/internal/mandatedelivery/testdata/mandate-delivery-v1.json', import.meta.url);
// PUBLIC TEST FIXTURE ONLY. Deterministic seed, never a production credential.
const privateDer = Buffer.from('302e020100300506032b657004220420' + '01'.repeat(32), 'hex');
const privateKey = createPrivateKey({ key: privateDer, format: 'der', type: 'pkcs8' });
const publicRaw = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32);
const bytes = new Uint8Array([0, 255, 128, 10, 13, 34, 123, 125, 195, 169]);
const now = new Date('2026-09-07T12:00:00.000Z');
function array(b: Uint8Array): ArrayBuffer { return new Uint8Array(b).buffer; }
async function fixture(overrides: Record<string, unknown> = {}) {
  const rows: Record<string, any> = {
    organization_bootstrap_mandates: { mandate_version_id: 'version-id' },
    mandate_versions: { mandate_id: 'mandate-test', version: '1.0', r2_key: 'test/object', sha256: await sha256HexBytes(bytes) },
    mandates: { origin_org_id: 'org-test' },
    installation_keys: { installation_id: 'installation-test', organization_id: 'org-test', public_key_raw: Buffer.from(publicRaw).toString('base64'), status: 'active' },
    ...overrides,
  };
  const DB = { prepare(sql: string) { return { bind(...params: unknown[]) { return { async first() {
    const table = /FROM (\w+)/.exec(sql)![1];
    expect(params[0]).toBe(({ organization_bootstrap_mandates: 'org-test', mandate_versions: 'version-id', mandates: 'mandate-test', installation_keys: 'installation-test' } as any)[table]);
    return rows[table];
  } }; } }; } };
  return { DB, MANDATES: { async get(key: string) { expect(key).toBe('test/object'); return { arrayBuffer: async () => array(bytes) }; } },
    AUTHORITY_SIGNING_KEY_PKCS8_B64: privateDer.toString('base64'), AUTHORITY_SIGNING_KEY_ID: 'public-test-key' } as unknown as Env;
}
async function requestHeaders(domain = 'BLOOM-INSTALLATION-AUTH-v1') {
  const timestamp = new Date().toISOString();
  const payload = canonicalizeJson({ installation_id: 'installation-test', organization_id: 'org-test', method: 'GET', path: '/v1/mandate/bootstrap', timestamp });
  return { 'X-Bloom-Installation-Id': 'installation-test', 'X-Bloom-Timestamp': timestamp, 'X-Bloom-Signature': await signWithDomain(domain, payload, array(privateDer)) };
}
describe('Mandate Delivery', () => {
  it('reproduces the versioned TypeScript contract vector byte for byte', async () => {
    const valid = await resolveMandateDelivery(await fixture(), 'org-test', 'installation-test', now);
    const { signature, signing_key_id, ...payload } = valid.envelope;
    const canonical = canonicalizeJson(payload);
    const wrong = { ...valid, envelope: { ...valid.envelope, signature: await signWithDomain('BLOOM-AUTHORITY-SNAPSHOT-v1', canonical, array(privateDer)) } };
    const vector = { format: 'mandate-delivery-v1', warning: 'PUBLIC TEST PRIVATE KEY - NEVER USE IN PRODUCTION',
      generator: 'backend/test/mandate-delivery.spec.ts', issuer: 'test-issuer', key_id: signing_key_id,
      test_private_pkcs8_base64: privateDer.toString('base64'), public_key_base64: Buffer.from(publicRaw).toString('base64'),
      now: now.toISOString(), artifact_base64: Buffer.from(bytes).toString('base64'), digest: payload.mandate_digest,
      canonical_base64: Buffer.from(canonical).toString('base64'),
      valid_body_base64: Buffer.from(JSON.stringify(valid)).toString('base64'),
      wrong_domain_body_base64: Buffer.from(JSON.stringify(wrong)).toString('base64') };
    if (process.env.MANDATE_DELIVERY_UPDATE_VECTOR === '1') writeFileSync(vectorPath, JSON.stringify(vector, null, 2) + '\n');
    expect(JSON.parse(readFileSync(vectorPath, 'utf8'))).toEqual(vector);
    expect(Buffer.from(valid.mandate_base64, 'base64')).toEqual(Buffer.from(bytes));
    expect(await verifyWithDomain(MANDATE_DELIVERY_DOMAIN, canonical, signature, array(publicRaw))).toBe(true);
    for (const domain of ['BLOOM-AUTHORITY-SNAPSHOT-v1', 'BLOOM-INSTALLATION-AUTH-v1', 'BLOOM-S2S-WRITE-v1'])
      expect(await verifyWithDomain(domain, canonical, signature, array(publicRaw))).toBe(false);
  });
  it('hashes only the selected byte view', async () => {
    expect(await sha256HexBytes(new Uint8Array([9, 0, 255, 9]).subarray(1, 3))).toBe(await sha256HexBytes(new Uint8Array([0, 255])));
  });
  it.each(['organization_bootstrap_mandates', 'mandate_versions'])('returns pending for absent %s', async table => {
    await expect(resolveMandateDelivery(await fixture({ [table]: null }), 'org-test', 'installation-test', now)).rejects.toMatchObject({ status: 404 });
  });
  it('returns pending for missing R2', async () => {
    const env = await fixture(); env.MANDATES = { get: async () => null } as any;
    await expect(resolveMandateDelivery(env, 'org-test', 'installation-test', now)).rejects.toMatchObject({ status: 404 });
  });
  it('rejects inconsistent digest and organization', async () => {
    const env = await fixture(); env.MANDATES = { get: async () => ({ arrayBuffer: async () => array(new Uint8Array([1])) }) } as any;
    await expect(resolveMandateDelivery(env, 'org-test', 'installation-test', now)).rejects.toMatchObject({ status: 409 });
    await expect(resolveMandateDelivery(await fixture({ mandates: { origin_org_id: 'other' } }), 'org-test', 'installation-test', now)).rejects.toMatchObject({ status: 409 });
  });
  it('rejects invalid signing configuration', async () => {
    const env = await fixture(); env.AUTHORITY_SIGNING_KEY_PKCS8_B64 = 'invalid';
    await expect(resolveMandateDelivery(env, 'org-test', 'installation-test', now)).rejects.toMatchObject({ status: 500 });
  });
  it('requires S2S, binds the query recipient and accepts an authenticated request', async () => {
    const env = await fixture(); const path = '/v1/mandate/bootstrap?org=org-test&installation_id=installation-test';
    expect((await app.request(path, {}, env)).status).toBe(401);
    expect((await app.request(path, { headers: await requestHeaders('BLOOM-S2S-WRITE-v1') }, env)).status).toBe(401);
    expect((await app.request(path.replace('installation_id=installation-test', 'installation_id=other'), { headers: await requestHeaders() }, env)).status).toBe(403);
    expect((await app.request(path, { headers: await requestHeaders() }, env)).status).toBe(200);
  });
});
