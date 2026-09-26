import { canonicalizeJson, digestWire } from './canonical';
import { authorityInstant, type VerifiedHumanActor } from './administration';
import { normalizeWireTime, wireVersion } from './emission';
import { AUTHORITY_EMISSION_TTL_MS, loadCurrentEmission, prepareEmission, type EmissionSigner } from './emission-store';
import type { WireFullContent, WireVaultServiceGrant } from './schema';

export class VaultServiceGrantError extends Error {
  constructor(readonly code: string) { super(`authority_vault_service_grant_${code}`); }
}
const deny = (code: string): never => { throw new VaultServiceGrantError(code); };
export type GrantCommand = { kind: 'issue'; installationId: string; servicePublicKey: string; keyId: 'anthropic-key:default'; validUntil: string }
  | { kind: 'revoke'; grantId: string };
export interface GrantRequest { organizationId: string; requestId: string; expectedVersion: string; command: GrantCommand }
export interface GrantServices { now: () => string; issuer: string; signer: EmissionSigner; commitGuard: (actor: VerifiedHumanActor, requestId: string, at: string) => D1PreparedStatement }

function masterActive(state: WireFullContent, actor: VerifiedHumanActor, at: string): boolean {
  const now = authorityInstant(at);
  const principal = state.principals.find(p => p.principal_id === actor.principalId);
  if (!principal || principal.principal_type !== 'human' || principal.status !== 'active'
    || !principal.external_identities.some(e => e.status === 'verified' && authorityInstant(e.verified_at) <= now)) return false;
  const revoked = (kind: string, id: string) => state.revocations.some(r => r.target_type === kind && r.target_id === id && authorityInstant(r.effective_at) <= now);
  const active = (x: {status:string;valid_from:string;valid_until:string|null;accepted_at:string}) => x.status === 'active'
    && authorityInstant(x.valid_from) <= now && authorityInstant(x.accepted_at) <= now
    && (x.valid_until === null || authorityInstant(x.valid_until) > now);
  return state.memberships.some(m => m.principal_id === actor.principalId && m.organization_id === actor.organizationId && active(m)
    && !revoked('membership', m.membership_id) && state.role_assignments.some(a => a.membership_id === m.membership_id
      && a.role_id === 'master' && a.role_version === '1' && a.scope.type === 'organization' && a.scope.id === actor.organizationId
      && active(a) && !revoked('role_assignment', a.assignment_id)))
    && state.role_definitions.some(r => r.role_id === 'master' && r.role_version === '1' && r.role_origin === 'builtin'
      && r.status === 'active' && !revoked('role_definition', r.role_id));
}

export async function administerVaultServiceGrant(db: D1Database, request: GrantRequest, actor: VerifiedHumanActor,
  services: GrantServices): Promise<{grantId:string;authorityVersion:string;stateDigest:string;status:'issued'|'revoked'}> {
  const {organizationId: org, requestId, expectedVersion, command} = request;
  if (!org || !requestId || requestId.length > 200 || !actor || actor.organizationId !== org
    || actor.source !== 'backend-session' || authorityInstant(actor.expiresAt) <= authorityInstant(services.now())) deny('actor_unverified');
  wireVersion(expectedVersion);
  const requestDigest = await digestWire({organization_id:org, actor_id:actor.principalId, expected_version:expectedVersion, command});
  const session = db.withSession('first-primary');
  const retry = async () => {
    const row = await session.prepare('SELECT request_digest,actor_id,result_json FROM authority_vault_service_grant_requests WHERE organization_id=? AND request_id=?')
      .bind(org,requestId).first<{request_digest:string;actor_id:string;result_json:string}>();
    if (!row) return null;
    if (row.actor_id !== actor.principalId || row.request_digest !== requestDigest) deny('idempotency_conflict');
    return JSON.parse(row.result_json) as {grantId:string;authorityVersion:string;stateDigest:string;status:'issued'|'revoked'};
  };
  const replay = await retry(); if (replay) return replay;
  const current = await loadCurrentEmission(db, org);
  if (!current || current.metadata.authority_version !== expectedVersion) throw new VaultServiceGrantError('version_conflict');
  const now = normalizeWireTime(services.now());
  if (authorityInstant(current.metadata.not_before) > authorityInstant(now) || authorityInstant(current.metadata.expires_at) <= authorityInstant(now)
    || !masterActive(current.state, actor, now)) deny('master_required');
  const state = structuredClone(current.state);
  state.vault_service_grants ??= [];
  const version = String(wireVersion(expectedVersion) + 1n);
  let grantId = '';
  if (command.kind === 'issue') {
    if (command.keyId !== 'anthropic-key:default' || !/^[A-Za-z0-9_-]{43}$/.test(command.servicePublicKey)
      || !command.installationId) deny('invalid_request');
    const key = Uint8Array.from(atob(command.servicePublicKey.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const canonicalKey=btoa(String.fromCharCode(...key)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    if (key.length !== 32 || canonicalKey !== command.servicePublicKey) deny('invalid_request');
    const installation = await session.prepare("SELECT installation_id FROM installation_keys WHERE installation_id=? AND organization_id=? AND status='active'")
      .bind(command.installationId,org).first();
    if (!installation || !current.metadata.audience.installation_ids.includes(command.installationId)) deny('installation_unavailable');
    const validUntil = normalizeWireTime(command.validUntil);
    if (authorityInstant(validUntil) <= authorityInstant(now) || authorityInstant(validUntil) > authorityInstant(new Date(Date.parse(now)+24*60*60*1000).toISOString())) deny('invalid_validity');
    grantId = crypto.randomUUID();
    const grant: WireVaultServiceGrant = {grant_id:grantId,organization_id:org,installation_id:command.installationId,
      consumer:'aitap',permission:'vault.key.read',key_id:command.keyId,purpose:'mandate_genesis_intelligence',
      service_public_key:command.servicePublicKey,issued_by_principal_id:actor.principalId,valid_from:now,valid_until:validUntil};
    state.vault_service_grants.push(grant);
  } else if (command.kind === 'revoke') {
    grantId = command.grantId;
    if (!grantId || !state.vault_service_grants.some(g => g.grant_id === grantId)
      || state.revocations.some(r => r.target_type === 'vault_service_grant' && r.target_id === grantId)) deny('grant_unavailable');
    state.revocations.push({revocation_id:crypto.randomUUID(),target_type:'vault_service_grant',target_id:grantId,
      effective_at:now,recorded_in_authority_version:version,reason_code:'master_revocation'});
  } else deny('invalid_request');
  const metadata = {...current.metadata,authority_version:version,snapshot_id:crypto.randomUUID(),issued_at:now,not_before:now,
    expires_at:new Date(Date.parse(now)+AUTHORITY_EMISSION_TTL_MS).toISOString()};
  const prepared = await prepareEmission(db,{requestId:`vault-service-grant:${requestId}`,expectedVersion,metadata,state},services.signer);
  if (!prepared.statement) throw new VaultServiceGrantError('incomplete_commit');
  const result = {grantId,authorityVersion:version,stateDigest:prepared.result.stateDigest,status:command.kind === 'issue' ? 'issued' as const : 'revoked' as const};
  const commitTime = normalizeWireTime(services.now());
  if (authorityInstant(actor.expiresAt) <= authorityInstant(commitTime) || !masterActive(current.state,actor,commitTime)
    || authorityInstant(current.metadata.expires_at) <= authorityInstant(commitTime)) deny('master_required');
  try {
    const eventId=`vault-service-grant:${requestId}`;
    await session.batch([prepared.statement,
      session.prepare('INSERT INTO authority_vault_service_grant_requests (organization_id,request_id,request_digest,actor_id,grant_id,operation,authority_version,result_json,decided_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(org,requestId,requestDigest,actor.principalId,grantId,command.kind,version,canonicalizeJson(result),commitTime),
      session.prepare(`INSERT INTO authority_admin_requests
        (organization_id,request_id,request_digest,actor_id,operation,base_version,authority_version,decided_at,command_json,result_json,proposal_id,consumed_proposal_id,project_checks_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,'[]')`)
        .bind(org,eventId,requestDigest,actor.principalId,`vault_service_grant_${command.kind}`,expectedVersion,version,commitTime,canonicalizeJson(command),canonicalizeJson(result)),
      session.prepare('INSERT INTO authority_admin_audit (organization_id,request_id,actor_id,operation,before_version,after_version,at,details_json) VALUES (?,?,?,?,?,?,?,?)')
        .bind(org,eventId,actor.principalId,`vault_service_grant_${command.kind}`,expectedVersion,version,commitTime,canonicalizeJson({grant_id:grantId,consumer:'aitap',key_id:'anthropic-key:default'})),
      session.prepare('INSERT INTO authority_admin_outbox (organization_id,event_id,authority_version,payload_json,created_at,delivered_at) VALUES (?,?,?,?,?,NULL)')
        .bind(org,eventId,version,canonicalizeJson({organization_id:org,authority_version:version,state_digest:result.stateDigest,urgency:command.kind==='revoke'?'revocation':'routine',correlation_id:eventId}),commitTime),
      services.commitGuard(actor,eventId,commitTime)]);
  } catch (error) {
    const won = await retry(); if (won) return won;
    if (String(error).includes('conflict') || String(error).includes('UNIQUE')) deny('version_conflict');
    throw error;
  }
  return result;
}
