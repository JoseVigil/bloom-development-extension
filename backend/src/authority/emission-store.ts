import { canonicalizeJson, digestWire } from "./canonical";
import { emitSnapshot, normalizeMetadata, normalizeState, wireVersion } from "./emission";
import type { WireEmissionMetadata, WireEnvelope, WireFullContent } from "./schema";

export type EmissionFailure = "cas_conflict" | "idempotency_conflict" | "recovery_required" | "initial_evidence_required" | "invalid_emission" | "emission_unavailable" | "version_ahead" | "audience_mismatch";
export class EmissionStoreError extends Error {
  constructor(readonly code: EmissionFailure) { super(`authority_${code}`); }
}
interface EmissionRow {
  organization_id: string; authority_version: string; base_version: string | null;
  request_id: string; request_digest: string; metadata_json: string; state_json: string;
  state_digest: string; full_json: string; delta_json: string | null; initial_evidence: string | null;
}
export interface StoredEmission {
  metadata: WireEmissionMetadata; state: WireFullContent; stateDigest: string;
  full: string; delta: string | null; baseVersion: string | null;
}
type Session = ReturnType<D1Database["withSession"]>;

async function decodeEmission(row: EmissionRow): Promise<StoredEmission> {
  try {
    const metadata = normalizeMetadata(JSON.parse(row.metadata_json));
    const state = normalizeState(JSON.parse(row.state_json), row.organization_id);
    if (metadata.organization_id !== row.organization_id || metadata.authority_version !== row.authority_version
      || canonicalizeJson(metadata) !== row.metadata_json || canonicalizeJson(state) !== row.state_json
      || await digestWire(state) !== row.state_digest) throw new Error("stored evidence mismatch");
    const full: WireEnvelope = JSON.parse(row.full_json);
    const expected = { ...metadata, kind: "full", base_authority_version: null, content: state };
    if (canonicalizeJson(full.payload) !== canonicalizeJson(expected)
      || full.integrity.digest !== await digestWire(full.payload)) throw new Error("stored full mismatch");
    if (row.delta_json !== null) {
      const delta: WireEnvelope = JSON.parse(row.delta_json);
      const { kind, base_authority_version, content, ...common } = delta.payload;
      if (kind !== "delta" || base_authority_version !== row.base_version || !row.base_version
        || wireVersion(row.base_version) >= wireVersion(metadata.authority_version)
        || canonicalizeJson(common) !== row.metadata_json
        || !("result_digest" in content) || content.result_digest !== row.state_digest
        || delta.integrity.digest !== await digestWire(delta.payload)) throw new Error("stored delta mismatch");
    } else if (row.base_version !== null) throw new Error("missing delta evidence");
    return { metadata, state, stateDigest: row.state_digest, full: row.full_json, delta: row.delta_json, baseVersion: row.base_version };
  } catch { throw new EmissionStoreError("recovery_required"); }
}

async function headRow(db: Session, org: string): Promise<EmissionRow | null> {
  const row = await db.prepare(`SELECT e.*, EXISTS (SELECT 1 FROM authority_emissions newer
    WHERE newer.organization_id = e.organization_id AND
      (length(newer.authority_version) > length(e.authority_version) OR
       (length(newer.authority_version) = length(e.authority_version) AND newer.authority_version > e.authority_version))) AS head_is_stale
    FROM authority_emission_heads h
    JOIN authority_emissions e ON e.organization_id = h.organization_id AND e.authority_version = h.authority_version
    WHERE h.organization_id = ?`).bind(org).first<EmissionRow & { head_is_stale: number }>();
  if (row?.head_is_stale) throw new EmissionStoreError("recovery_required");
  return row;
}
async function hasEvidence(db: Session, org: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS present WHERE
    EXISTS (SELECT 1 FROM authority_emission_heads WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM authority_emissions WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM authority_state WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM memberships WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM role_assignments WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM role_definitions WHERE organization_id = ?1)
    OR EXISTS (SELECT 1 FROM revocations WHERE organization_id = ?1)`)
    .bind(org).first();
  return row !== null;
}

export async function loadCurrentEmission(db: D1Database, org: string): Promise<StoredEmission | null> {
  const session = db.withSession("first-primary");
  const row = await headRow(session, org);
  if (row) return decodeEmission(row);
  if (await hasEvidence(session, org)) throw new EmissionStoreError("recovery_required");
  return null;
}

export async function loadEmissionVersion(db: D1Database, org: string, version: string): Promise<StoredEmission | null> {
  wireVersion(version);
  const row = await db.withSession("first-primary").prepare(
    "SELECT * FROM authority_emissions WHERE organization_id = ? AND authority_version = ?")
    .bind(org, version).first<EmissionRow>();
  return row ? decodeEmission(row) : null;
}

export interface PersistEmissionInput {
  requestId: string;
  expectedVersion: string | null;
  metadata: WireEmissionMetadata;
  state: WireFullContent;
  // Only explicit temporary test databases may start in 1B. Real onboarding is unavailable.
  initialFixtureEvidence?: { environment: "test"; reference: string };
}

/** Internal library only, never a mutation endpoint. Future administration must
 * combine its preconditions/audit/outbox with emission publication in one transaction. */
export interface EmissionSigner { privateKeyPkcs8: ArrayBuffer; keyId: string; allowTestFixtures?: boolean }
export interface PreparedEmission {
  result: StoredEmission;
  statement: D1PreparedStatement | null;
  retry: () => Promise<StoredEmission | null>;
}

export async function prepareEmission(db: D1Database, input: PersistEmissionInput,
  signer: EmissionSigner): Promise<PreparedEmission> {
  if (!input.requestId || typeof input.requestId !== "string") throw new EmissionStoreError("invalid_emission");
  let metadata: WireEmissionMetadata, state: WireFullContent;
  try {
    metadata = normalizeMetadata(input.metadata); state = normalizeState(input.state, metadata.organization_id);
    if (input.expectedVersion !== null && wireVersion(metadata.authority_version) !== wireVersion(input.expectedVersion) + 1n) throw new Error("next version required");
  } catch { throw new EmissionStoreError("invalid_emission"); }
  if (input.expectedVersion === null) {
    if (signer.allowTestFixtures !== true || input.initialFixtureEvidence?.environment !== "test"
      || typeof input.initialFixtureEvidence.reference !== "string" || !input.initialFixtureEvidence.reference.length)
      throw new EmissionStoreError("initial_evidence_required");
  } else if (input.initialFixtureEvidence !== undefined) throw new EmissionStoreError("invalid_emission");

  const session = db.withSession("first-primary");
  const org = metadata.organization_id;
  const requestDigest = await digestWire({ metadata, state, expected_version: input.expectedVersion,
    key_id: signer.keyId, initial_evidence: input.initialFixtureEvidence ?? null });
  const retry = async (): Promise<StoredEmission | null> => {
    const row = await session.prepare("SELECT * FROM authority_emissions WHERE organization_id = ? AND request_id = ?")
      .bind(org, input.requestId).first<EmissionRow>();
    if (!row) return null;
    if (row.request_digest !== requestDigest) throw new EmissionStoreError("idempotency_conflict");
    return decodeEmission(row);
  };
  const replay = (result: StoredEmission): PreparedEmission => ({ result, statement: null, retry });
  const previousResult = await retry(); if (previousResult) return replay(previousResult);
  const previous = await headRow(session, org);
  if (!previous && await hasEvidence(session, org)) {
    const raced = await retry(); if (raced) return replay(raced);
    throw new EmissionStoreError("recovery_required");
  }
  if ((previous?.authority_version ?? null) !== input.expectedVersion) {
    const raced = await retry(); if (raced) return replay(raced);
    throw new EmissionStoreError("cas_conflict");
  }
  const base = previous ? await decodeEmission(previous) : null;
  if (base && base.metadata.issuer !== metadata.issuer) throw new EmissionStoreError("invalid_emission");
  let full: WireEnvelope, delta: WireEnvelope | null;
  try {
    full = await emitSnapshot({ metadata, state }, signer.privateKeyPkcs8, signer.keyId);
    delta = base ? await emitSnapshot({ metadata, state, base: { authority_version: base.metadata.authority_version, state: base.state } }, signer.privateKeyPkcs8, signer.keyId) : null;
  } catch { throw new EmissionStoreError("invalid_emission"); }
  const stateDigest = await digestWire(state);
  const fullJSON = canonicalizeJson(full), deltaJSON = delta ? canonicalizeJson(delta) : null;
  const statement = session.prepare(`INSERT INTO authority_emissions
      (organization_id, authority_version, base_version, request_id, request_digest,
       metadata_json, state_json, state_digest, full_json, delta_json, initial_evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(org, metadata.authority_version, input.expectedVersion, input.requestId, requestDigest,
        canonicalizeJson(metadata), canonicalizeJson(state), stateDigest, fullJSON, deltaJSON,
        input.initialFixtureEvidence ? canonicalizeJson(input.initialFixtureEvidence) : null);
  return { result: { metadata, state, stateDigest, full: fullJSON, delta: deltaJSON, baseVersion: input.expectedVersion }, statement, retry };
}

export async function persistEmission(db: D1Database, input: PersistEmissionInput,
  signer: EmissionSigner): Promise<StoredEmission> {
  const prepared = await prepareEmission(db, input, signer);
  if (!prepared.statement) return prepared.result;
  try {
    await prepared.statement.run();
  } catch (error) {
    const raced = await prepared.retry(); if (raced) return raced;
    const message = String(error);
    if (message.includes("authority_recovery_required")) throw new EmissionStoreError("recovery_required");
    if (message.includes("authority_cas_conflict") || message.includes("UNIQUE constraint")) throw new EmissionStoreError("cas_conflict");
    throw error;
  }
  return prepared.result;
}
