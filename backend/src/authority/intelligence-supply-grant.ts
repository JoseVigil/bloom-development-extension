import {canonicalizeJson,digestWire} from './canonical';
import {authorityInstant,type VerifiedHumanActor} from './administration';
import {normalizeWireTime,wireVersion} from './emission';
import {AUTHORITY_EMISSION_TTL_MS,loadCurrentEmission,prepareEmission,type EmissionSigner} from './emission-store';
import {installationSupports} from './installation-capability';
import type {WireFullContent,WireIntelligenceSupplyGrant} from './schema';

export class IntelligenceSupplyGrantError extends Error{constructor(readonly code:string){super(`authority_intelligence_supply_grant_${code}`);}}
const deny=(code:string):never=>{throw new IntelligenceSupplyGrantError(code);};
type Destination={provider:string;backendId:string;models:string[]};
type Limits={maxTotalTokens:number;maxOutputTokensPerInference:number;maxInferences:number;maxUsd:string};
export type IntelligenceSupplyGrantCommand={kind:'issue';installationIds:string[];consumerId:string;actorPrincipalId:string;purpose:string;
 allowedCapabilities:string[];allowedPrivacy:('local'|'approved_cloud')[];allowedDestinations:Destination[];limits:Limits;validUntil:string;replacesGrantId:string|null}
 |{kind:'revoke';grantId:string};
export interface IntelligenceSupplyGrantRequest{organizationId:string;requestId:string;expectedVersion:string;command:IntelligenceSupplyGrantCommand}
export interface IntelligenceSupplyGrantServices{now:()=>string;signer:EmissionSigner;commitGuard:(actor:VerifiedHumanActor,requestId:string,at:string)=>D1PreparedStatement}
type Result={grantId:string;authorityVersion:string;stateDigest:string;status:'issued';validFrom:string;validUntil:string;replacesGrantId:string|null}
 |{grantId:string;revocationId:string;authorityVersion:string;stateDigest:string;status:'revoked';effectiveAt:string};

function masterActive(state:WireFullContent,actor:VerifiedHumanActor,at:string):boolean{
 const now=authorityInstant(at),principal=state.principals.find(p=>p.principal_id===actor.principalId);
 if(!principal||principal.principal_type!=='human'||principal.status!=='active'||!principal.external_identities.some(e=>e.status==='verified'&&authorityInstant(e.verified_at)<=now))return false;
 const revoked=(kind:string,id:string)=>state.revocations.some(r=>r.target_type===kind&&r.target_id===id&&authorityInstant(r.effective_at)<=now);
 const active=(x:{status:string;valid_from:string;valid_until:string|null;accepted_at:string})=>x.status==='active'&&authorityInstant(x.valid_from)<=now&&authorityInstant(x.accepted_at)<=now&&(x.valid_until===null||authorityInstant(x.valid_until)>now);
 return state.memberships.some(m=>m.principal_id===actor.principalId&&m.organization_id===actor.organizationId&&active(m)&&!revoked('membership',m.membership_id)
  &&state.role_assignments.some(a=>a.membership_id===m.membership_id&&a.role_id==='master'&&a.role_version==='1'&&a.scope.type==='organization'&&a.scope.id===actor.organizationId&&active(a)&&!revoked('role_assignment',a.assignment_id)))
  &&state.role_definitions.some(r=>r.role_id==='master'&&r.role_version==='1'&&r.role_origin==='builtin'&&r.status==='active'&&!revoked('role_definition',r.role_id));
}

export async function administerIntelligenceSupplyGrant(db:D1Database,request:IntelligenceSupplyGrantRequest,actor:VerifiedHumanActor,services:IntelligenceSupplyGrantServices):Promise<Result>{
 const {organizationId:org,requestId,expectedVersion,command}=request;
 if(!org||!requestId||requestId.length>200||!actor||actor.organizationId!==org||actor.source!=='backend-session'||authorityInstant(actor.expiresAt)<=authorityInstant(services.now()))deny('actor_unverified');
 wireVersion(expectedVersion);const requestDigest=await digestWire({organization_id:org,actor_id:actor.principalId,expected_version:expectedVersion,command});
 const session=db.withSession('first-primary');
 const retry=async()=>{const row=await session.prepare('SELECT request_digest,actor_id,result_json FROM authority_intelligence_supply_grant_requests WHERE organization_id=? AND request_id=?')
  .bind(org,requestId).first<{request_digest:string;actor_id:string;result_json:string}>();if(!row)return null;if(row.actor_id!==actor.principalId||row.request_digest!==requestDigest)deny('idempotency_conflict');return JSON.parse(row.result_json) as Result;};
 const replay=await retry();if(replay)return replay;
 const current=await loadCurrentEmission(db,org);if(!current)throw new IntelligenceSupplyGrantError('version_conflict');if(current.metadata.authority_version!==expectedVersion)deny('version_conflict');
 const now=normalizeWireTime(services.now());if(authorityInstant(current.metadata.not_before)>authorityInstant(now)||authorityInstant(current.metadata.expires_at)<=authorityInstant(now)||!masterActive(current.state,actor,now))deny('master_required');
 for(const installation of current.metadata.audience.installation_ids)if(!await installationSupports(db,org,installation,'1.1'))deny('installation_schema_incompatible');
 const state=structuredClone(current.state);state.intelligence_supply_grants??=[];
 const version=String(wireVersion(expectedVersion)+1n);let grantId='',revocationId='',validUntil='',replacesGrantId:string|null=null;
 if(command.kind==='issue'){
  const unique=(v:string[])=>v.length>0&&new Set(v).size===v.length;
  if(!unique(command.installationIds)||!unique(command.allowedCapabilities)||!unique(command.allowedPrivacy)||!command.consumerId||!command.actorPrincipalId||!command.purpose
   ||!Array.isArray(command.allowedDestinations)||!command.allowedDestinations.length||command.allowedPrivacy.some(v=>v!=='local'&&v!=='approved_cloud'))deny('invalid_request');
  if(!state.principals.some(p=>p.principal_id===command.actorPrincipalId&&p.principal_type==='human'))deny('actor_principal_unavailable');
  for(const id of command.installationIds){if(!current.metadata.audience.installation_ids.includes(id)||!await installationSupports(db,org,id,'1.1'))deny('installation_schema_incompatible');
   const active=await session.prepare("SELECT 1 AS present FROM installation_keys WHERE organization_id=? AND installation_id=? AND status='active'").bind(org,id).first();if(!active)deny('installation_unavailable');}
  validUntil=normalizeWireTime(command.validUntil);if(authorityInstant(validUntil)<=authorityInstant(now))deny('invalid_validity');
  if(!command.limits||!Number.isSafeInteger(command.limits.maxTotalTokens)||command.limits.maxTotalTokens<1||!Number.isSafeInteger(command.limits.maxOutputTokensPerInference)||command.limits.maxOutputTokensPerInference<1||command.limits.maxOutputTokensPerInference>command.limits.maxTotalTokens||!Number.isSafeInteger(command.limits.maxInferences)||command.limits.maxInferences<1||!/^(0|[1-9][0-9]*\.[0-9]{6})$/.test(command.limits.maxUsd))deny('invalid_limits');
  for(const d of command.allowedDestinations)if(!d.provider||!d.backendId||!unique(d.models))deny('invalid_destination');
  replacesGrantId=command.replacesGrantId;
  if(replacesGrantId!==null){const prior=state.intelligence_supply_grants.find(g=>g.grant_id===replacesGrantId);if(!prior||state.revocations.some(r=>r.target_type==='intelligence_supply_grant'&&r.target_id===replacesGrantId))deny('replacement_unavailable');
   revocationId=crypto.randomUUID();state.revocations.push({revocation_id:revocationId,target_type:'intelligence_supply_grant',target_id:replacesGrantId,effective_at:now,recorded_in_authority_version:version,reason_code:'grant_replaced'});}
  grantId=crypto.randomUUID();const grant:WireIntelligenceSupplyGrant={grant_id:grantId,organization_id:org,installation_ids:command.installationIds,consumer_id:command.consumerId,actor_principal_id:command.actorPrincipalId,purpose:command.purpose,
   allowed_capabilities:command.allowedCapabilities,allowed_privacy:command.allowedPrivacy,allowed_destinations:command.allowedDestinations.map(d=>({provider:d.provider,backend_id:d.backendId,models:d.models})),limits:{max_total_tokens:command.limits.maxTotalTokens,max_output_tokens_per_inference:command.limits.maxOutputTokensPerInference,max_inferences:command.limits.maxInferences,max_usd:command.limits.maxUsd},
   issued_by_principal_id:actor.principalId,valid_from:now,valid_until:validUntil,replaces_grant_id:replacesGrantId};state.intelligence_supply_grants.push(grant);
 }else if(command.kind==='revoke'){grantId=command.grantId;if(!grantId||!state.intelligence_supply_grants.some(g=>g.grant_id===grantId)||state.revocations.some(r=>r.target_type==='intelligence_supply_grant'&&r.target_id===grantId))deny('grant_unavailable');
  revocationId=crypto.randomUUID();state.revocations.push({revocation_id:revocationId,target_type:'intelligence_supply_grant',target_id:grantId,effective_at:now,recorded_in_authority_version:version,reason_code:'master_revocation'});
 }else deny('invalid_request');
 const metadata={...current.metadata,schema_version:'1.1' as const,authority_version:version,snapshot_id:crypto.randomUUID(),issued_at:now,not_before:now,expires_at:new Date(Date.parse(now)+AUTHORITY_EMISSION_TTL_MS).toISOString()};
 const prepared=await prepareEmission(db,{requestId:`intelligence-supply-grant:${requestId}`,expectedVersion,metadata,state},services.signer);if(!prepared.statement)throw new IntelligenceSupplyGrantError('incomplete_commit');const emissionStatement=prepared.statement;
 const result:Result=command.kind==='issue'?{grantId,authorityVersion:version,stateDigest:prepared.result.stateDigest,status:'issued',validFrom:now,validUntil,replacesGrantId}
  :{grantId,revocationId,authorityVersion:version,stateDigest:prepared.result.stateDigest,status:'revoked',effectiveAt:now};
 const commitTime=normalizeWireTime(services.now());if(authorityInstant(actor.expiresAt)<=authorityInstant(commitTime)||!masterActive(current.state,actor,commitTime)||authorityInstant(current.metadata.expires_at)<=authorityInstant(commitTime))deny('master_required');
 try{const eventId=`intelligence-supply-grant:${requestId}`;await session.batch([emissionStatement,
  session.prepare('INSERT INTO authority_intelligence_supply_grant_requests (organization_id,request_id,request_digest,actor_id,grant_id,operation,authority_version,result_json,decided_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(org,requestId,requestDigest,actor.principalId,grantId,command.kind,version,canonicalizeJson(result),commitTime),
  session.prepare(`INSERT INTO authority_admin_requests (organization_id,request_id,request_digest,actor_id,operation,base_version,authority_version,decided_at,command_json,result_json,proposal_id,consumed_proposal_id,project_checks_json) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,'[]')`).bind(org,eventId,requestDigest,actor.principalId,`intelligence_supply_grant_${command.kind}`,expectedVersion,version,commitTime,canonicalizeJson(command),canonicalizeJson(result)),
  session.prepare('INSERT INTO authority_admin_audit (organization_id,request_id,actor_id,operation,before_version,after_version,at,details_json) VALUES (?,?,?,?,?,?,?,?)').bind(org,eventId,actor.principalId,`intelligence_supply_grant_${command.kind}`,expectedVersion,version,commitTime,canonicalizeJson({grant_id:grantId,revocation_id:revocationId||null,replaces_grant_id:replacesGrantId})),
  session.prepare('INSERT INTO authority_admin_outbox (organization_id,event_id,authority_version,payload_json,created_at,delivered_at) VALUES (?,?,?,?,?,NULL)').bind(org,eventId,version,canonicalizeJson({organization_id:org,authority_version:version,state_digest:result.stateDigest,urgency:command.kind==='revoke'||replacesGrantId?'revocation':'routine',correlation_id:eventId}),commitTime),services.commitGuard(actor,eventId,commitTime)]);}
 catch(error){const won=await retry();if(won)return won;if(String(error).includes('conflict')||String(error).includes('UNIQUE'))deny('version_conflict');throw error;}return result;
}
