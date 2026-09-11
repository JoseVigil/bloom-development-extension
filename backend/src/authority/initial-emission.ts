import { canonicalizeJson } from "./canonical";
import { AUTHORITY_EMISSION_TTL_MS, EmissionStoreError, loadCurrentEmission, prepareEmission, type EmissionSigner } from "./emission-store";
import { normalizeWireTime } from "./emission";
import type { InitialHumanIdentity } from "./administration";
import type { WireFullContent, WireRoleDefinition } from "./schema";

export type InitialAuthorityEmissionFailure = "already_exists" | "identity_not_ready" | "canonical_evidence_required"
  | "configuration_unavailable" | "master_role_unavailable";
export class InitialAuthorityEmissionError extends Error {
  constructor(readonly code: InitialAuthorityEmissionFailure) { super(`authority_initial_emission_${code}`); }
}
export interface InitialAuthorityEmissionServices {
  now: () => string;
  issuer: string;
  signer: EmissionSigner;
  initialIdentity: (organizationId: string, principalId: string) => Promise<InitialHumanIdentity | undefined>;
  commitGuard: (requestId: string, at: string, identity: InitialHumanIdentity) => D1PreparedStatement;
}
export interface InitialAuthorityEmissionResult { authorityVersion: string; stateDigest: string; status: "committed" }
interface RoleRow { version: number; definition: string; status: string }

function activeMaster(row: RoleRow | null): WireRoleDefinition {
  if (!row || row.status !== "active") throw new InitialAuthorityEmissionError("master_role_unavailable");
  let definition: unknown;
  try { definition = JSON.parse(row.definition); } catch { throw new InitialAuthorityEmissionError("master_role_unavailable"); }
  const value = definition as Partial<WireRoleDefinition>;
  if (!value || typeof value !== "object" || !Array.isArray(value.permissions))
    throw new InitialAuthorityEmissionError("master_role_unavailable");
  return { role_id: "master", role_version: String(row.version), role_origin: "builtin",
    display_name: typeof value.display_name === "string" ? value.display_name : "Master",
    status: "active", permissions: value.permissions };
}

export async function createInitialAuthorityEmission(db: D1Database, organizationId: string, principalId: string,
  services: InitialAuthorityEmissionServices): Promise<InitialAuthorityEmissionResult> {
  if (await loadCurrentEmission(db, organizationId)) throw new InitialAuthorityEmissionError("already_exists");
  const evidence = await services.initialIdentity(organizationId, principalId);
  if (!evidence) throw new InitialAuthorityEmissionError("identity_not_ready");
  if (evidence.source !== "canonical") throw new InitialAuthorityEmissionError("canonical_evidence_required");
  if (!services.issuer || !services.commitGuard) throw new InitialAuthorityEmissionError("configuration_unavailable");

  const session = db.withSession("first-primary");
  const role = activeMaster(await session.prepare(`SELECT version,definition,status FROM role_definitions
    WHERE organization_id IS NULL AND key='master' AND status='active' ORDER BY version DESC LIMIT 1`).first<RoleRow>());
  const installations = await session.prepare(`SELECT installation_id FROM installation_keys
    WHERE organization_id=? AND status='active' ORDER BY installation_id`).bind(organizationId).all<{installation_id:string}>();
  if (!installations.results.length) throw new InitialAuthorityEmissionError("configuration_unavailable");

  const now = normalizeWireTime(services.now()), membershipId = crypto.randomUUID(), assignmentId = crypto.randomUUID();
  const state: WireFullContent = { principals: [evidence.principal],
    memberships: [{ membership_id: membershipId, principal_id: principalId, organization_id: organizationId,
      status: "active", valid_from: now, valid_until: null, accepted_at: now }],
    role_definitions: [role],
    role_assignments: [{ assignment_id: assignmentId, membership_id: membershipId, role_id: role.role_id,
      role_version: role.role_version, scope: { type: "organization", id: organizationId }, status: "active",
      valid_from: now, valid_until: null, accepted_at: now }], revocations: [] };
  const requestId = `initial-authority-emission:${organizationId}`;
  try {
    const prepared = await prepareEmission(db, { requestId, expectedVersion: null,
      metadata: { schema: "bloom.authority.snapshot", schema_version: "1.0", snapshot_id: crypto.randomUUID(),
        issuer: services.issuer, organization_id: organizationId, authority_version: "1", issued_at: now,
        not_before: now, expires_at: new Date(Date.parse(now) + AUTHORITY_EMISSION_TTL_MS).toISOString(),
        audience: { organization_id: organizationId, installation_ids: installations.results.map(v => v.installation_id) } },
      state, initialEmissionEvidence: { kind: "canonical", identity: evidence } }, services.signer);
    if (!prepared.statement) throw new InitialAuthorityEmissionError("already_exists");
    await session.batch([prepared.statement, services.commitGuard(requestId, now, evidence)]);
    return { authorityVersion: "1", stateDigest: prepared.result.stateDigest, status: "committed" };
  } catch (error) {
    const conflict = error instanceof EmissionStoreError && ["cas_conflict","recovery_required","idempotency_conflict"].includes(error.code)
      || /authority_(cas_conflict|recovery_required|initial_emission_conflict)|UNIQUE constraint/.test(String(error));
    if (conflict && await loadCurrentEmission(db, organizationId)) throw new InitialAuthorityEmissionError("already_exists");
    if (/authority_(session|identity)_conflict/.test(String(error))) throw new InitialAuthorityEmissionError("identity_not_ready");
    throw error;
  }
}

export function initialEmissionGuardStatement(db: D1Database, actor: {organizationId:string;principalId:string;sessionId:string;sessionRevision?:string;identityRevision?:string},
  requestId: string, at: string, identity: InitialHumanIdentity): D1PreparedStatement {
  if (!actor.sessionRevision || !actor.identityRevision || actor.organizationId !== identity.organizationId
    || actor.principalId !== identity.principal.principal_id || identity.revision !== actor.identityRevision)
    throw new InitialAuthorityEmissionError("identity_not_ready");
  return db.prepare(`INSERT INTO authority_initial_emission_commits
    (organization_id,request_id,authority_version,principal_id,session_id,session_revision,identity_revision,committed_at,evidence_json)
    VALUES(?,?,'1',?,?,?,?,?,?)`).bind(actor.organizationId,requestId,actor.principalId,actor.sessionId,
      actor.sessionRevision,actor.identityRevision,at,canonicalizeJson({source:identity.source,revision:identity.revision}));
}
