import { base64ToBase64url, canonicalizeJson, digestWire, signCanonicalPayload } from "./canonical";
import type { WireDeltaOperation, WireEmissionMetadata, WireEnvelope, WireFullContent, WireSnapshotPayload } from "./schema";

const collections = ["principals", "memberships", "role_definitions", "role_assignments", "revocations"] as const;
const master = ["authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage", "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote", "mandate.install", "intent.create", "intent.cor.merge"];
const permissions = new Set([...master, "vault.key.read", "vault.key.write", "vault.key.delete", "executor.command.execute", "executor.filesystem.write", "executor.network.access", "executor.change.promote"]);
const statuses = ["pending", "active", "suspended", "expired", "revoked"];
const scopes = ["organization", "project", "mandate", "intent", "resource", "environment"];
const fail = (message: string): never => { throw new Error(`authority_wire: ${message}`); };
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0; // UTF-16 code units, never localeCompare.

function text(value: unknown, label: string, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && !value.length) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail(label);
}
function object(value: unknown, fields: string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("object required");
  const keys = Object.keys(value as object);
  if (keys.length !== fields.length || fields.some(k => !Object.prototype.hasOwnProperty.call(value, k))) fail("missing or unknown property");
}
function array(value: unknown): asserts value is unknown[] { if (!Array.isArray(value)) fail("array required"); }
function one(value: unknown, choices: string[]) { if (!choices.includes(value as string)) fail("invalid enum"); }
export function wireVersion(value: string): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) fail("invalid version");
  const n = BigInt(value);
  if (n > 18446744073709551615n) fail("version exceeds uint64");
  return n;
}
export function normalizeWireTime(value: string): string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$/.test(value)) fail("UTC timestamp required");
  const seconds = value.slice(0, 19);
  const date = new Date(seconds + "Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== seconds || value.startsWith("0000")) fail("invalid date");
  const fraction = value.slice(19, -1).replace(/0+$/, "").replace(/\.$/, "");
  return seconds + fraction + "Z";
}
const instant = (value: string) => BigInt(new Date(value.slice(0, 19) + "Z").getTime()) * 1000000n + BigInt((value.slice(19, -1).replace(".", "") + "000000000").slice(0, 9));
function unique(values: string[], label: string) { if (new Set(values).size !== values.length) fail(`duplicate ${label}`); }
function validity(v: { valid_from: string; valid_until: string | null; accepted_at: string }) {
  v.valid_from = normalizeWireTime(v.valid_from); v.accepted_at = normalizeWireTime(v.accepted_at);
  if (v.valid_until !== null) {
    v.valid_until = normalizeWireTime(v.valid_until);
    if (instant(v.valid_until) <= instant(v.valid_from)) fail("invalid entity validity");
  }
}
const roleKey = (r: { role_id: string; role_version: string }) => JSON.stringify([r.role_id, r.role_version]);

/** Produces a detached normal form; missing fields and ambiguous entities never get defaults. */
export function normalizeState(input: WireFullContent, organizationId: string): WireFullContent {
  object(input, [...collections]); text(organizationId, "organization required");
  const f = structuredClone(input);
  for (const c of collections) array(f[c]);
  const identities: string[] = [];
  for (const p of f.principals) {
    object(p, ["principal_id", "principal_type", "status", "external_identities"]);
    text(p.principal_id, "principal ID"); one(p.principal_type, ["human", "service"]); one(p.status, ["active", "suspended", "retired"]); array(p.external_identities);
    for (const e of p.external_identities) {
      object(e, ["provider", "subject", "display_handle", "status", "verified_at"]);
      text(e.provider, "provider"); text(e.subject, "subject"); text(e.display_handle, "display handle", true); one(e.status, ["verified", "revoked"]);
      e.verified_at = normalizeWireTime(e.verified_at);
      if (e.status === "verified") identities.push(JSON.stringify([e.provider, e.subject]));
    }
    unique(p.external_identities.map(e => JSON.stringify([e.provider, e.subject])), "external identity");
    p.external_identities.sort((a, b) => cmp(a.provider, b.provider) || cmp(a.subject, b.subject));
  }
  unique(identities, "active identity binding");
  unique(f.principals.map(p => p.principal_id), "principal");
  for (const m of f.memberships) {
    object(m, ["membership_id", "principal_id", "organization_id", "status", "valid_from", "valid_until", "accepted_at"]);
    text(m.membership_id, "membership ID"); one(m.status, statuses); validity(m);
    if (m.organization_id !== organizationId || !f.principals.some(p => p.principal_id === m.principal_id)) fail("membership reference");
  }
  unique(f.memberships.map(m => m.membership_id), "membership");
  for (const r of f.role_definitions) {
    object(r, ["role_id", "role_version", "role_origin", "display_name", "status", "permissions"]);
    text(r.role_id, "role ID"); text(r.display_name, "display name", true); wireVersion(r.role_version);
    one(r.role_origin, ["builtin", "organization"]); one(r.status, ["active", "suspended", "retired"]); array(r.permissions);
    if (r.role_id.toLowerCase() === "architect") fail("architect forbidden");
    for (const p of r.permissions) if (!permissions.has(p)) fail("unknown permission or wildcard");
    unique(r.permissions, "permission"); r.permissions.sort(cmp);
    if (r.role_origin === "builtin") {
      const expected = r.role_id === "master" ? master : r.role_id === "specialist" ? ["intent.create"] : null;
      if (!expected || r.role_version !== "1" || expected.length !== r.permissions.length || expected.some(p => !r.permissions.includes(p))) fail("builtin contradiction");
    } else if (["master", "specialist"].includes(r.role_id)) fail("reserved role");
  }
  unique(f.role_definitions.map(roleKey), "role version");
  for (const a of f.role_assignments) {
    object(a, ["assignment_id", "membership_id", "role_id", "role_version", "scope", "status", "valid_from", "valid_until", "accepted_at"]);
    text(a.assignment_id, "assignment ID"); one(a.status, statuses); validity(a);
    object(a.scope, ["type", "id"]); one(a.scope.type, scopes); text(a.scope.id, "scope ID");
    if (a.scope.type === "organization" && a.scope.id !== organizationId) fail("organization scope mismatch");
    if (!f.memberships.some(m => m.membership_id === a.membership_id) || !f.role_definitions.some(r => roleKey(r) === roleKey(a))) fail("assignment reference");
  }
  unique(f.role_assignments.map(a => a.assignment_id), "assignment");
  for (const r of f.revocations) {
    object(r, ["revocation_id", "target_type", "target_id", "effective_at", "recorded_in_authority_version", "reason_code"]);
    text(r.revocation_id, "revocation ID"); text(r.target_id, "revocation target"); text(r.reason_code, "reason code");
    one(r.target_type, ["external_identity", "membership", "role_definition", "role_assignment"]);
    wireVersion(r.recorded_in_authority_version); r.effective_at = normalizeWireTime(r.effective_at);
  }
  unique(f.revocations.map(r => r.revocation_id), "revocation");
  f.principals.sort((a, b) => cmp(a.principal_id, b.principal_id));
  f.memberships.sort((a, b) => cmp(a.membership_id, b.membership_id));
  f.role_definitions.sort((a, b) => cmp(a.role_id, b.role_id) || (wireVersion(a.role_version) < wireVersion(b.role_version) ? -1 : wireVersion(a.role_version) > wireVersion(b.role_version) ? 1 : 0));
  f.role_assignments.sort((a, b) => cmp(a.assignment_id, b.assignment_id));
  f.revocations.sort((a, b) => cmp(a.revocation_id, b.revocation_id));
  return f;
}
export async function stateDigest(state: WireFullContent, organizationId: string): Promise<string> {
  return digestWire(normalizeState(state, organizationId));
}
export function normalizeMetadata(input: WireEmissionMetadata): WireEmissionMetadata {
  object(input, ["schema", "schema_version", "snapshot_id", "issuer", "organization_id", "authority_version", "issued_at", "not_before", "expires_at", "audience"]);
  const m = structuredClone(input);
  if (m.schema !== "bloom.authority.snapshot" || m.schema_version !== "1.0") fail("schema");
  text(m.snapshot_id, "snapshot ID"); text(m.issuer, "issuer"); text(m.organization_id, "organization"); wireVersion(m.authority_version);
  m.issued_at = normalizeWireTime(m.issued_at); m.not_before = normalizeWireTime(m.not_before); m.expires_at = normalizeWireTime(m.expires_at);
  const ttl = instant(m.expires_at) - instant(m.issued_at);
  if (ttl <= 0 || ttl > 86400000000000n || instant(m.not_before) > instant(m.expires_at)) fail("emission validity");
  object(m.audience, ["organization_id", "installation_ids"]); array(m.audience.installation_ids);
  if (m.audience.organization_id !== m.organization_id || !m.audience.installation_ids.length) fail("audience");
  for (const id of m.audience.installation_ids) text(id, "installation ID");
  unique(m.audience.installation_ids, "installation"); m.audience.installation_ids.sort(cmp);
  return m;
}

/** No clock, version allocator, database or implicit identity source. */
export async function emitSnapshot(input: {
  metadata: WireEmissionMetadata; state: WireFullContent;
  base?: { authority_version: string; state: WireFullContent };
}, signingKeyPkcs8: ArrayBuffer, keyId: string): Promise<WireEnvelope> {
  object(input, input.base === undefined ? ["metadata", "state"] : ["metadata", "state", "base"]);
  text(keyId, "key ID");
  const metadata = normalizeMetadata(input.metadata);
  const state = normalizeState(input.state, metadata.organization_id);
  if (state.revocations.some(r => wireVersion(r.recorded_in_authority_version) > wireVersion(metadata.authority_version))) fail("future revocation version");
  let payload: WireSnapshotPayload;
  if (input.base === undefined) payload = { ...metadata, kind: "full", base_authority_version: null, content: state };
  else {
    object(input.base, ["authority_version", "state"]);
    if (wireVersion(input.base.authority_version) >= wireVersion(metadata.authority_version)) fail("delta version order");
    const base = normalizeState(input.base.state, metadata.organization_id);
    const operations: WireDeltaOperation[] = [];
    const entityID = (c: keyof WireFullContent, v: any): string => c === "principals" ? v.principal_id : c === "memberships" ? v.membership_id : c === "role_definitions" ? v.role_id : c === "role_assignments" ? v.assignment_id : v.revocation_id;
    const key = (c: keyof WireFullContent, v: any) => c === "role_definitions" ? roleKey(v) : entityID(c, v);
    for (const c of collections) {
      for (const old of base[c]) {
        const current = (state[c] as any[]).find(v => key(c, v) === key(c, old));
        if (c === "revocations" && (!current || canonicalizeJson(current) !== canonicalizeJson(old))) fail("revocation history cannot change");
        if (c === "role_definitions" && current) {
          const prior = old as WireFullContent["role_definitions"][number];
          if (prior.role_origin !== current.role_origin || canonicalizeJson(prior.permissions) !== canonicalizeJson(current.permissions)) fail("role permissions or origin change requires a new role version");
        }
        if (!current) {
          if (c === "role_definitions") fail("historical role removal forbidden");
          if (c === "principals") fail("principal removal deferred");
          const type = c === "memberships" ? "membership" : "role_assignment";
          if (!state.revocations.some(r => r.target_type === type && r.target_id === entityID(c, old))) fail("removal requires revocation");
          operations.push({ sequence: String(operations.length + 1), operation: "remove", collection: c, entity_id: entityID(c, old), value: null });
        }
      }
      for (const value of state[c]) {
        const old = (base[c] as any[]).find(v => key(c, v) === key(c, value));
        if (!old || canonicalizeJson(old) !== canonicalizeJson(value)) operations.push({ sequence: String(operations.length + 1), operation: "upsert", collection: c, entity_id: entityID(c, value), value });
      }
    }
    payload = { ...metadata, kind: "delta", base_authority_version: input.base.authority_version, content: { result_digest: await digestWire(state), operations } };
  }
  const envelope: WireEnvelope = { payload, integrity: { canonicalization: "JCS-RFC8785", digest_algorithm: "SHA-256", digest: await digestWire(payload), signature_algorithm: "Ed25519", key_id: keyId, signature: base64ToBase64url(await signCanonicalPayload(canonicalizeJson(payload), signingKeyPkcs8)) } };
  if (new TextEncoder().encode(JSON.stringify(envelope)).length > 16 * 1024 * 1024) fail("envelope exceeds size limit");
  return envelope;
}
