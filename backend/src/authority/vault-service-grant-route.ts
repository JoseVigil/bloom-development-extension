import { initialHumanIdentity, resolveHumanSession, sessionCommitGuard, type HumanServices } from './human-session-store';
import { loadCurrentEmission } from './emission-store';
import { administerVaultServiceGrant, VaultServiceGrantError, type GrantRequest, type GrantServices } from './vault-service-grant';

export async function vaultServiceGrantResponse(db:D1Database, body:unknown, token:string,
  services:HumanServices & {signer:GrantServices['signer'];issuer:string}):Promise<Response> {
  const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({error:'invalid_request'},400);
  const input=body as Record<string,unknown>;
  if (Object.keys(input).sort().join(',') !== 'command,expectedVersion,organizationId,requestId'
    || typeof input.organizationId !== 'string' || typeof input.requestId !== 'string'
    || typeof input.expectedVersion !== 'string' || !input.command || typeof input.command !== 'object'
    || Array.isArray(input.command)) return reply({error:'invalid_request'},400);
  const command=input.command as Record<string,unknown>;
  if (command.kind==='issue') {
    if (Object.keys(command).sort().join(',')!=='installationId,keyId,kind,servicePublicKey,validUntil'
      || typeof command.installationId!=='string' || typeof command.keyId!=='string'
      || typeof command.servicePublicKey!=='string' || typeof command.validUntil!=='string') return reply({error:'invalid_request'},400);
  } else if (command.kind==='revoke') {
    if (Object.keys(command).sort().join(',')!=='grantId,kind' || typeof command.grantId!=='string') return reply({error:'invalid_request'},400);
  } else return reply({error:'invalid_request'},400);
  const org=input.organizationId;
  const actor=await resolveHumanSession(db,token,org,services);
  if (!actor) return reply({error:'authority_human_session_invalid'},401);
  const current=await loadCurrentEmission(db,org);
  const evidence=await initialHumanIdentity(db,org,actor.principalId,services);
  const principal=current?.state.principals.find(p=>p.principal_id===actor.principalId);
  if (!evidence || !principal?.external_identities.some(e=>e.provider==='github' && e.subject===evidence.principal.external_identities[0].subject && e.status==='verified'))
    return reply({error:'authority_human_correspondence_missing'},403);
  try {
    const result=await administerVaultServiceGrant(db,input as unknown as GrantRequest,actor,{now:services.now,issuer:services.issuer,
      signer:services.signer,commitGuard:(a,id,at)=>sessionCommitGuard(db,a,id,at)});
    return reply(result,command.kind==='issue'?201:200);
  } catch(error) {
    if (error instanceof VaultServiceGrantError) return reply({error:error.message},error.code==='invalid_request'?400:error.code.includes('conflict')?409:403);
    throw error;
  }
}
