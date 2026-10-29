import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import app from '../src/index';
import { verifyMandateDefinition, MANDATE_OFFER_DELIVERY_DOMAIN } from '../src/mandate-offers';
import { canonicalizeJson, digestWire, sha256HexBytes, signWithDomain, verifyWithDomain, base64ToBase64url } from '../src/authority/canonical';
import { provisionFixtureTrustManifestFromEnv } from '../src/authority/administration-route';
import { loadTrustManifest } from '../src/authority/trust-manifest';

// El vector lo genera installer/nucleus/internal/mandatedefinition/definition_test.go.
const vector = JSON.parse(readFileSync(new URL('../../installer/nucleus/internal/mandatedefinition/testdata/mandate-definition-v1.json', import.meta.url), 'utf8'));
const definitionBytes = new Uint8Array(Buffer.from(vector.definition_base64, 'base64'));
const publisherKey = { keyId: vector.key_id as string, publicKeyB64url: vector.public_key_base64url as string };
// PUBLIC TEST KEYS ONLY.
const pkcs8 = (seedHex: string) => Buffer.from('302e020100300506032b657004220420' + seedHex, 'hex');
const authorityDer = pkcs8('03'.repeat(32));
const authorityPublic = createPublicKey(createPrivateKey({ key: authorityDer, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32);
const installationDer = pkcs8('04'.repeat(32));
const installationPublic = createPublicKey(createPrivateKey({ key: installationDer, format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).subarray(-32);
// RFC 8032 test vector 1: la raíz de desarrollo fijada en Nucleus (development-rfc8032-root).
const rfc8032Root = pkcs8('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const publisherSeed = Buffer.from(vector.seed_base64, 'base64').toString('hex');

let mf: Miniflare, temp: string, db: D1Database, bucket: R2Bucket, r2Gets = 0;
const ORG = 'org-offers', OTHER = 'org-other', INSTALLATION = 'installation-offers', TOKEN = 'operator-test-token';

function env(overrides: Record<string, unknown> = {}): Env {
  const countingBucket = { get: async (k: string) => { r2Gets += 1; return bucket.get(k); }, put: (k: string, v: any) => bucket.put(k, v) };
  return { DB: db, MANDATES: countingBucket, AUTHORITY_SIGNING_KEY_PKCS8_B64: authorityDer.toString('base64'), AUTHORITY_SIGNING_KEY_ID: 'authority-test-key',
    AUTHORITY_ALLOW_TEST_FIXTURES: 'true', MANDATE_OFFER_OPERATOR_TOKEN: TOKEN,
    MANDATE_DEFINITION_KEY_ID: publisherKey.keyId, MANDATE_DEFINITION_PUBLIC_KEY_B64URL: publisherKey.publicKeyB64url,
    AUTHORITY_TEST_TRUST_ROOT_PKCS8_B64: rfc8032Root.toString('base64'), AUTHORITY_ISSUER: 'issuer-test',
    AUTHORITY_HUMAN_ORIGIN: 'https://authority.test', ...overrides } as unknown as Env;
}
async function signedHeaders(org: string, path: string) {
  const timestamp = new Date().toISOString();
  const payload = canonicalizeJson({ installation_id: INSTALLATION, organization_id: org, method: 'GET', path, timestamp });
  return { 'X-Bloom-Installation-Id': INSTALLATION, 'X-Bloom-Timestamp': timestamp,
    'X-Bloom-Signature': await signWithDomain('BLOOM-INSTALLATION-AUTH-v1', payload, new Uint8Array(installationDer).buffer) };
}
async function operator(path: string, body: unknown, token = TOKEN, e = env()) {
  return app.fetch(new Request('https://backend.test' + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e);
}
async function resign(mutate: (payload: any) => void): Promise<Uint8Array> {
  const parsed = JSON.parse(new TextDecoder().decode(definitionBytes));
  mutate(parsed.payload);
  const canonical = canonicalizeJson(parsed.payload);
  parsed.integrity.digest = await digestWire(parsed.payload);
  parsed.integrity.signature = base64ToBase64url(await signWithDomain('BLOOM-MANDATE-DEFINITION-v1', canonical, new Uint8Array(pkcs8(publisherSeed)).buffer));
  return new TextEncoder().encode(canonicalizeJson(parsed));
}
function migrate(file: string) {
  return readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8').replace(/--[^\r\n]*/g, '').trim()
    .split(/;\s*(?=(?:CREATE|ALTER)\b)/i).map(s => s.trim()).filter(Boolean);
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), 'mandate-offers-'));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: '127.0.0.1', cf: false, modules: true, script: 'export default {fetch(){return new Response("x")}}',
    compatibilityDate: '2026-08-29', d1Databases: { DB: 'offers' }, r2Buckets: { MANDATES: 'mandates' } }), resourcePersistencePath: temp });
  db = await mf.getD1Database('DB') as unknown as D1Database;
  bucket = await mf.getR2Bucket('MANDATES') as unknown as R2Bucket;
  await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY)').run();
  await db.prepare('CREATE TABLE installation_keys(installation_id TEXT, organization_id TEXT, public_key_raw TEXT, status TEXT, registered_at INTEGER)').run();
  for (const file of ['0007_authority_trust.sql', '0025_mandate_offers.sql']) for (const part of migrate(file)) await db.prepare(part).run();
  for (const id of [ORG, OTHER]) await db.prepare('INSERT INTO organizations VALUES(?)').bind(id).run();
  await db.prepare("INSERT INTO installation_keys VALUES(?,?,?,'active',0)").bind(INSTALLATION, ORG, Buffer.from(installationPublic).toString('base64')).run();
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); });

describe('initial Mandate offer — Backend contract', () => {
  it('verifies the publisher signature on exactly the bytes produced by Nucleus', async () => {
    const d = await verifyMandateDefinition(definitionBytes, publisherKey);
    expect(d.digest).toBe(vector.digest);
    expect(d.preparationStatus).toBe('not_defined');
    await expect(verifyMandateDefinition(new Uint8Array(Buffer.from(vector.tampered_base64, 'base64')), publisherKey)).rejects.toThrow('definition_digest_mismatch');
    await expect(verifyMandateDefinition(definitionBytes, { ...publisherKey, keyId: 'authority-test-key' })).rejects.toThrow('definition_key_untrusted');
    const defined = await resign(p => { p.preparation = { status: 'defined' }; });
    await expect(verifyMandateDefinition(defined, publisherKey)).rejects.toThrow('definition_preparation_invalid');
    const preparable = await resign(p => {
      p.schema_version = '1.1'; p.version = '1.1.0';
      p.preparation = { status: 'defined', domain_rule: 'project_identity',
        input_requirements: { source: 'project_files', min_files: 1 } };
    });
    expect((await verifyMandateDefinition(preparable, publisherKey)).preparationStatus).toBe('defined');
    const noFiles = await resign(p => {
      p.schema_version = '1.1'; p.version = '1.1.0';
      p.preparation = { status: 'defined', domain_rule: 'project_identity',
        input_requirements: { source: 'project_files', min_files: 0 } };
    });
    await expect(verifyMandateDefinition(noFiles, publisherKey)).rejects.toThrow('definition_preparation_invalid');
  });

  it('publishes only through the operator, only in fixture mode, and keeps versions immutable', async () => {
    const body = { definition_base64: vector.definition_base64 };
    expect((await operator('/v1/mandate/offers/publish', body, 'wrong')).status).toBe(401);
    expect((await operator('/v1/mandate/offers/publish', body, TOKEN, env({ AUTHORITY_ALLOW_TEST_FIXTURES: 'false' }))).status).toBe(401);
    expect((await operator('/v1/mandate/offers/publish', { definition_base64: vector.tampered_base64 })).status).toBe(400);
    const first = await operator('/v1/mandate/offers/publish', body);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ digest: vector.digest, created: true });
    expect(await (await operator('/v1/mandate/offers/publish', body)).json()).toMatchObject({ created: false });
    const sameVersionOtherBytes = await resign(p => { p.purpose = p.purpose + ' (otro texto)'; });
    expect((await operator('/v1/mandate/offers/publish', { definition_base64: Buffer.from(sameVersionOtherBytes).toString('base64') })).status).toBe(409);
    await expect(db.prepare("UPDATE mandate_definition_versions SET sha256='x'").run()).rejects.toThrow('immutable');
  });

  it('lists the enabled offer without bytes and without reading R2', async () => {
    const payload = JSON.parse(new TextDecoder().decode(definitionBytes)).payload;
    const list = async (org: string) => app.fetch(new Request(`https://backend.test/v1/mandate/offers?org=${org}`, { headers: await signedHeaders(org, '/v1/mandate/offers') }), env());
    r2Gets = 0;
    expect(await (await list(ORG)).json()).toMatchObject({ offers: [] });
    const enable = await operator('/v1/mandate/offers/enable', { organization_id: ORG, definition_id: payload.definition_id, version: payload.version, digest: vector.digest });
    expect(enable.status).toBe(200);
    const listed = await (await list(ORG)).json() as any;
    expect(listed.offers).toHaveLength(1);
    expect(listed.offers[0]).toEqual({ definition_id: payload.definition_id, version: '1.0.0', digest: vector.digest, label: 'Genesis', purpose: payload.purpose,
      publisher: { publisher_id: 'bloom', key_id: publisherKey.keyId }, published_at: payload.published_at, size_bytes: definitionBytes.length,
      requires: { contract_version: 4, project: true }, preparation: { status: 'not_defined' } });
    expect(JSON.stringify(listed)).not.toContain('base64');
    expect(r2Gets).toBe(0);
    // La instalación de ORG no puede leer el catálogo de otra organización.
    expect((await app.fetch(new Request(`https://backend.test/v1/mandate/offers?org=${OTHER}`, { headers: await signedHeaders(OTHER, '/v1/mandate/offers') }), env())).status).toBe(401);
  });

  it('enabling the offer reissues the fixture trust manifest with a mandate-definition key', async () => {
    const manifest = JSON.parse((await loadTrustManifest(db, ORG))!);
    expect(manifest.payload.schema_version).toBe('1.1');
    expect(manifest.payload.keys.map((k: any) => [k.key_id, k.purpose]).sort()).toEqual([['authority-test-key', 'authority'], [publisherKey.keyId, 'mandate-definition']]);
    const before = manifest.payload.manifest_version;
    await provisionFixtureTrustManifestFromEnv(env() as any, ORG);
    expect(JSON.parse((await loadTrustManifest(db, ORG))!).payload.manifest_version).toBe(before);
  });

  it('delivers exactly the selected (definition, version, digest) signed for the installation', async () => {
    const payload = JSON.parse(new TextDecoder().decode(definitionBytes)).payload;
    const path = `/v1/mandate/offers/${payload.definition_id}/versions/1.0.0`;
    const deliver = async (digest: string, version = '1.0.0') => {
      const p = `/v1/mandate/offers/${payload.definition_id}/versions/${version}`;
      return app.fetch(new Request(`https://backend.test${p}?org=${ORG}&installation_id=${INSTALLATION}&digest=${digest}`, { headers: await signedHeaders(ORG, p) }), env());
    };
    expect((await deliver('0'.repeat(64))).status).toBe(409);
    expect((await deliver(vector.digest, '2.0.0')).status).toBe(404);
    const ok = await deliver(vector.digest);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
    const body = await ok.json() as any;
    const bytes = new Uint8Array(Buffer.from(body.mandate_base64, 'base64'));
    expect(Buffer.from(bytes).equals(Buffer.from(definitionBytes))).toBe(true);
    expect(await sha256HexBytes(bytes)).toBe(vector.digest);
    const { signature, signing_key_id, ...signed } = body.envelope;
    expect(signed).toMatchObject({ mandate_id: payload.definition_id, organization_id: ORG, installation_id: INSTALLATION, mandate_version: '1.0.0', mandate_digest: vector.digest });
    expect(signing_key_id).toBe('authority-test-key');
    expect(await verifyWithDomain(MANDATE_OFFER_DELIVERY_DOMAIN, canonicalizeJson(signed), signature, new Uint8Array(authorityPublic).buffer)).toBe(true);
    // Vector para Nucleus: el cliente Go consume exactamente esta respuesta del Backend.
    const deliveryVector = { format: 'mandate-offer-delivery-v1', warning: 'PUBLIC TEST KEYS - NEVER USE IN PRODUCTION',
      generator: 'backend/test/mandate-offers.spec.ts', organization_id: ORG, installation_id: INSTALLATION, issuer: 'issuer-test',
      authority_key_id: 'authority-test-key', authority_public_key_base64: Buffer.from(authorityPublic).toString('base64'),
      definition_id: payload.definition_id, version: '1.0.0', digest: vector.digest,
      response_base64: Buffer.from(JSON.stringify(body)).toString('base64') };
    const deliveryVectorPath = new URL('../../installer/nucleus/internal/mandateoffer/testdata/mandate-offer-delivery-v1.json', import.meta.url);
    if (process.env.MANDATE_OFFER_UPDATE_VECTOR === '1') writeFileSync(deliveryVectorPath, JSON.stringify(deliveryVector, null, 2) + '\n');
    const stored = JSON.parse(readFileSync(deliveryVectorPath, 'utf8'));
    expect({ ...stored, response_base64: undefined }).toEqual({ ...deliveryVector, response_base64: undefined });
    // Otra organización sin oferta habilitada: no hay entrega.
    expect((await app.fetch(new Request(`https://backend.test${path}?org=${OTHER}&installation_id=${INSTALLATION}&digest=${vector.digest}`, { headers: await signedHeaders(OTHER, path) }), env())).status).toBe(401);
  });
});
