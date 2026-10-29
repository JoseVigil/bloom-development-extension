// Oferta inicial de Mandate en Wisdom — catálogo sin bytes y entrega de la versión exacta.
//
// Contrato: docs ANALYSIS/WISDOM/Contrato_Oferta_Inicial_Wisdom_Mandate (v0.2).
// - La definición la firma el publicador (clave `mandate-definition` del trust manifest),
//   nunca la clave de Authority del Worker. El Backend sólo verifica y guarda.
// - El catálogo no lee R2: describe la oferta habilitada para la organización.
// - La entrega exige (definition_id, version, digest) y responde el envelope de
//   entrega existente (BLOOM-MANDATE-DELIVERY-v1) firmado por Authority para
//   (organización, instalación), con los bytes exactos de la definición.
// - Nada de este archivo crea, descarga ni instala por navegación: sólo responde.

import { canonicalizeJson, digestWire, sha256HexBytes, signWithDomain, verifyWithDomain } from './authority/canonical';

export const MANDATE_DEFINITION_DOMAIN = 'BLOOM-MANDATE-DEFINITION-v1';
export const MANDATE_OFFER_DELIVERY_DOMAIN = 'BLOOM-MANDATE-DELIVERY-v1';

export class OfferError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 500 | 503, message: string) { super(message); }
}

export interface MandateDefinitionKey { keyId: string; publicKeyB64url: string; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const HEX64 = /^[0-9a-f]{64}$/;
const WIRE_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/;
const exact = (v: unknown, keys: string[]) => !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v as object).length === keys.length && keys.every(k => Object.hasOwn(v as object, k));
const PAYLOAD_KEYS = ['schema', 'schema_version', 'definition_id', 'version', 'label', 'purpose', 'publisher', 'published_at',
  'plan', 'fulfillment', 'objective_template', 'intelligence_limits', 'policy', 'registry', 'requires', 'preparation'];

function b64urlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new OfferError(400, 'invalid_base64url');
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + pad), c => c.charCodeAt(0));
}
function bytesToBase64(bytes: Uint8Array): string { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function base64ToBytes(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export interface VerifiedDefinition {
  definitionId: string; version: string; label: string; purpose: string; publisherId: string; keyId: string;
  publishedAt: string; preparationStatus: string; digest: string; bytes: Uint8Array;
}

/**
 * Verifica bytes exactos de una definición: forma canónica, digest JCS del payload,
 * firma del publicador con la clave `mandate-definition` configurada e identidad mínima.
 * La validación completa del plan la hace Nucleus antes de escribir.
 */
export async function verifyMandateDefinition(bytes: Uint8Array, key: MandateDefinitionKey): Promise<VerifiedDefinition> {
  if (bytes.length === 0 || bytes.length > 1 << 20) throw new OfferError(400, 'definition_size_invalid');
  let text: string; let parsed: any;
  try { text = new TextDecoder().decode(bytes); if (new TextEncoder().encode(text).length !== bytes.length) throw new Error('utf8'); parsed = JSON.parse(text); } catch { throw new OfferError(400, 'definition_not_json'); }
  if (canonicalizeJson(parsed) !== text) throw new OfferError(400, 'definition_not_canonical');
  if (!exact(parsed, ['payload', 'integrity']) ||
      !exact(parsed.integrity, ['canonicalization', 'digest_algorithm', 'digest', 'signature_algorithm', 'key_id', 'signature']))
    throw new OfferError(400, 'definition_envelope_invalid');
  const { payload, integrity } = parsed;
  if (integrity.canonicalization !== 'JCS-RFC8785' || integrity.digest_algorithm !== 'SHA-256' || integrity.signature_algorithm !== 'Ed25519')
    throw new OfferError(400, 'definition_integrity_invalid');
  if (integrity.key_id !== key.keyId) throw new OfferError(400, 'definition_key_untrusted');
  const canonicalPayload = canonicalizeJson(payload);
  if (integrity.digest !== await digestWire(payload)) throw new OfferError(400, 'definition_digest_mismatch');
  const signature = integrity.signature.replace(/-/g, '+').replace(/_/g, '/');
  const publicKey = b64urlToBytes(key.publicKeyB64url);
  if (publicKey.length !== 32 || !await verifyWithDomain(MANDATE_DEFINITION_DOMAIN, canonicalPayload, signature, new Uint8Array(publicKey).buffer))
    throw new OfferError(400, 'definition_signature_invalid');
  if (!exact(payload, PAYLOAD_KEYS) || payload.schema !== 'bloom.mandate-definition' ||
      !['1.0', '1.1'].includes(payload.schema_version) ||
      !UUID.test(payload.definition_id ?? '') || !SEMVER.test(payload.version ?? '') ||
      typeof payload.label !== 'string' || !payload.label || typeof payload.purpose !== 'string' || !payload.purpose ||
      !exact(payload.publisher, ['publisher_id', 'key_id']) || !payload.publisher.publisher_id || payload.publisher.key_id !== key.keyId ||
      typeof payload.published_at !== 'string' || !WIRE_TIME.test(payload.published_at) ||
      !exact(payload.requires, ['contract_version', 'project']) || payload.requires.contract_version !== 4 || payload.requires.project !== true)
    throw new OfferError(400, 'definition_payload_invalid');
  // La versión 1.0 permanece inmutable y sin preparación. La 1.1 firma la
  // derivación del dominio y el mínimo de archivos del proyecto elegido.
  const legacyPreparation = payload.schema_version === '1.0' &&
    exact(payload.preparation, ['status']) && payload.preparation.status === 'not_defined';
  const definedPreparation = payload.schema_version === '1.1' &&
    exact(payload.preparation, ['status', 'domain_rule', 'input_requirements']) &&
    payload.preparation.status === 'defined' && payload.preparation.domain_rule === 'project_identity' &&
    exact(payload.preparation.input_requirements, ['source', 'min_files']) &&
    payload.preparation.input_requirements.source === 'project_files' &&
    payload.preparation.input_requirements.min_files === 1;
  if (!legacyPreparation && !definedPreparation)
    throw new OfferError(400, 'definition_preparation_invalid');
  return {
    definitionId: payload.definition_id, version: payload.version, label: payload.label, purpose: payload.purpose,
    publisherId: payload.publisher.publisher_id, keyId: integrity.key_id, publishedAt: payload.published_at,
    preparationStatus: payload.preparation.status, digest: await sha256HexBytes(bytes), bytes,
  };
}

export function configuredDefinitionKey(env: Env): MandateDefinitionKey | null {
  if (!env.MANDATE_DEFINITION_KEY_ID || !env.MANDATE_DEFINITION_PUBLIC_KEY_B64URL) return null;
  return { keyId: env.MANDATE_DEFINITION_KEY_ID, publicKeyB64url: env.MANDATE_DEFINITION_PUBLIC_KEY_B64URL };
}

/** Publica (idempotente) una versión. Misma versión con otros bytes → 409. */
export async function publishMandateDefinition(env: Env, key: MandateDefinitionKey, bytes: Uint8Array, now = Date.now()) {
  const d = await verifyMandateDefinition(bytes, key);
  const existing = await env.DB.prepare('SELECT id, sha256 FROM mandate_definition_versions WHERE definition_id = ? AND version = ?')
    .bind(d.definitionId, d.version).first<{ id: string; sha256: string }>();
  if (existing) {
    if (existing.sha256 !== d.digest) throw new OfferError(409, 'definition_version_immutable');
    return { definition_id: d.definitionId, version: d.version, digest: d.digest, created: false };
  }
  const r2Key = `mandate-definitions/${d.definitionId}/${d.version}/${d.digest}.json`;
  await env.MANDATES.put(r2Key, d.bytes);
  const definition = await env.DB.prepare('SELECT id FROM mandate_definitions WHERE id = ?').bind(d.definitionId).first();
  const statements = [];
  if (!definition) statements.push(env.DB.prepare('INSERT INTO mandate_definitions (id, label, purpose, publisher_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(d.definitionId, d.label, d.purpose, d.publisherId, now));
  statements.push(env.DB.prepare(`INSERT INTO mandate_definition_versions
      (id, definition_id, version, sha256, r2_key, size_bytes, key_id, published_at, preparation_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), d.definitionId, d.version, d.digest, r2Key, d.bytes.length, d.keyId, d.publishedAt, d.preparationStatus, now));
  await env.DB.batch(statements);
  return { definition_id: d.definitionId, version: d.version, digest: d.digest, created: true };
}

/** Habilita exactamente una versión para una organización (reemplaza la anterior). */
export async function enableMandateOffer(env: Env, organizationId: string, definitionId: string, version: string, digest: string, now = Date.now()) {
  if (!organizationId || !UUID.test(definitionId) || !SEMVER.test(version) || !HEX64.test(digest)) throw new OfferError(400, 'invalid_offer_selection');
  const org = await env.DB.prepare('SELECT id FROM organizations WHERE id = ?').bind(organizationId).first();
  if (!org) throw new OfferError(404, 'organization_unavailable');
  const row = await env.DB.prepare('SELECT id, sha256 FROM mandate_definition_versions WHERE definition_id = ? AND version = ?')
    .bind(definitionId, version).first<{ id: string; sha256: string }>();
  if (!row) throw new OfferError(404, 'offer_version_unavailable');
  if (row.sha256 !== digest) throw new OfferError(409, 'offer_digest_mismatch');
  await env.DB.prepare(`INSERT INTO organization_mandate_offers (organization_id, definition_version_id, enabled_at) VALUES (?, ?, ?)
      ON CONFLICT(organization_id) DO UPDATE SET definition_version_id = excluded.definition_version_id, enabled_at = excluded.enabled_at`)
    .bind(organizationId, row.id, now).run();
  return { organization_id: organizationId, definition_id: definitionId, version, digest };
}

interface OfferRow {
  definition_id: string; label: string; purpose: string; publisher_id: string; version: string; sha256: string;
  size_bytes: number; key_id: string; published_at: string; preparation_status: string; r2_key: string;
}
const OFFER_SELECT = `SELECT v.definition_id, d.label, d.purpose, d.publisher_id, v.version, v.sha256, v.size_bytes, v.key_id,
    v.published_at, v.preparation_status, v.r2_key
  FROM organization_mandate_offers o
  JOIN mandate_definition_versions v ON v.id = o.definition_version_id
  JOIN mandate_definitions d ON d.id = v.definition_id
  WHERE o.organization_id = ?`;

/** Catálogo sin bytes: nunca lee R2. */
export async function listMandateOffers(env: Env, organizationId: string) {
  const row = await env.DB.prepare(OFFER_SELECT).bind(organizationId).first<OfferRow>();
  return {
    schema: 'bloom.mandate-offers', schema_version: '1.0', organization_id: organizationId,
    offers: row ? [{
      definition_id: row.definition_id, version: row.version, digest: row.sha256, label: row.label, purpose: row.purpose,
      publisher: { publisher_id: row.publisher_id, key_id: row.key_id }, published_at: row.published_at, size_bytes: row.size_bytes,
      requires: { contract_version: 4, project: true }, preparation: { status: row.preparation_status },
    }] : [],
  };
}

/** Entrega de la versión exacta seleccionada. */
export async function deliverMandateOffer(env: Env, organizationId: string, installationId: string,
  definitionId: string, version: string, digest: string, now = new Date()) {
  if (!UUID.test(definitionId) || !SEMVER.test(version) || !HEX64.test(digest)) throw new OfferError(400, 'invalid_offer_selection');
  const row = await env.DB.prepare(OFFER_SELECT).bind(organizationId).first<OfferRow>();
  if (!row || row.definition_id !== definitionId || row.version !== version) throw new OfferError(404, 'offer_not_enabled');
  if (row.sha256 !== digest) throw new OfferError(409, 'offer_digest_mismatch');
  const object = await env.MANDATES.get(row.r2_key);
  if (!object) throw new OfferError(404, 'offer_artifact_pending');
  const bytes = new Uint8Array(await object.arrayBuffer());
  const actual = await sha256HexBytes(bytes);
  if (actual !== row.sha256) throw new OfferError(409, 'offer_artifact_digest_mismatch');
  const payload = { mandate_id: definitionId, organization_id: organizationId, installation_id: installationId,
    mandate_version: version, mandate_digest: actual, issued_at: now.toISOString() };
  let signature: string;
  try {
    if (!env.AUTHORITY_SIGNING_KEY_ID) throw new Error('missing_key_id');
    signature = await signWithDomain(MANDATE_OFFER_DELIVERY_DOMAIN, canonicalizeJson(payload), base64ToBytes(env.AUTHORITY_SIGNING_KEY_PKCS8_B64).buffer as ArrayBuffer);
  } catch { throw new OfferError(500, 'invalid_signing_configuration'); }
  return { envelope: { ...payload, signature, signing_key_id: env.AUTHORITY_SIGNING_KEY_ID }, mandate_base64: bytesToBase64(bytes) };
}

/** Rutas de operador: sólo en modo fixture local y con token de operador configurado. */
export function operatorAuthorized(env: Env, request: Request): boolean {
  if (env.AUTHORITY_ALLOW_TEST_FIXTURES !== 'true' || !env.MANDATE_OFFER_OPERATOR_TOKEN) return false;
  const header = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${env.MANDATE_OFFER_OPERATOR_TOKEN}`;
  if (header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i += 1) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
