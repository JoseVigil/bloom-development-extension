import { canonicalizeJson, sha256HexBytes, signWithDomain } from './authority/canonical';

export const MANDATE_DELIVERY_DOMAIN = 'BLOOM-MANDATE-DELIVERY-v1';
export class DeliveryError extends Error {
  constructor(public status: 404 | 409 | 500, message: string) { super(message); }
}
export async function resolveMandateDelivery(env: Env, organizationId: string, installationId: string, now = new Date()) {
  const assignment = await env.DB.prepare('SELECT mandate_version_id FROM organization_bootstrap_mandates WHERE organization_id = ?')
    .bind(organizationId).first<{ mandate_version_id: string }>();
  if (!assignment) throw new DeliveryError(404, 'mandate_pending');
  const version = await env.DB.prepare('SELECT mandate_id, version, r2_key, sha256 FROM mandate_versions WHERE id = ?')
    .bind(assignment.mandate_version_id).first<{ mandate_id: string; version: string; r2_key: string; sha256: string }>();
  if (!version) throw new DeliveryError(404, 'version_pending');
  const mandate = await env.DB.prepare('SELECT origin_org_id FROM mandates WHERE id = ?')
    .bind(version.mandate_id).first<{ origin_org_id: string }>();
  if (!mandate || mandate.origin_org_id !== organizationId || !version.mandate_id || !version.version || !version.r2_key || !/^[a-fA-F0-9]{64}$/.test(version.sha256))
    throw new DeliveryError(409, 'contradictory_metadata');
  const object = await env.MANDATES.get(version.r2_key);
  if (!object) throw new DeliveryError(404, 'artifact_pending');
  const bytes = await object.arrayBuffer();
  const digest = await sha256HexBytes(bytes);
  if (digest !== version.sha256.toLowerCase()) throw new DeliveryError(409, 'artifact_digest_mismatch');
  const payload = { mandate_id: version.mandate_id, organization_id: organizationId, installation_id: installationId,
    mandate_version: version.version, mandate_digest: digest, issued_at: now.toISOString() };
  let signature: string;
  try {
    if (!env.AUTHORITY_SIGNING_KEY_ID) throw new Error('missing_key_id');
    const key = Uint8Array.from(atob(env.AUTHORITY_SIGNING_KEY_PKCS8_B64), c => c.charCodeAt(0));
    signature = await signWithDomain(MANDATE_DELIVERY_DOMAIN, canonicalizeJson(payload), key.buffer);
  } catch { throw new DeliveryError(500, 'invalid_signing_configuration'); }
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return { envelope: { ...payload, signature, signing_key_id: env.AUTHORITY_SIGNING_KEY_ID }, mandate_base64: btoa(binary) };
}
