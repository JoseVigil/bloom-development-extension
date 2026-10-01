import {initialHumanIdentity,resolveHumanSession,sessionCommitGuard,type HumanServices} from './human-session-store';
import {loadCurrentEmission} from './emission-store';
import {administerIntelligenceSupplyGrant,IntelligenceSupplyGrantError,type IntelligenceSupplyGrantRequest,type IntelligenceSupplyGrantServices} from './intelligence-supply-grant';
export async function intelligenceSupplyGrantResponse(db:D1Database,body:unknown,token:string,services:HumanServices&{signer:IntelligenceSupplyGrantServices['signer']}):Promise<Response>{
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'invalid_request'},400);const input=body as Record<string,unknown>;
 if(Object.keys(input).sort().join(',')!=='command,expectedVersion,organizationId,requestId'||typeof input.organizationId!=='string'||typeof input.requestId!=='string'||typeof input.expectedVersion!=='string'||!input.command||typeof input.command!=='object'||Array.isArray(input.command))return reply({error:'invalid_request'},400);
 const command=input.command as Record<string,unknown>;
 const issue='actorPrincipalId,allowedCapabilities,allowedDestinations,allowedPrivacy,consumerId,installationIds,kind,limits,purpose,replacesGrantId,validUntil';
 if(command.kind==='issue'&&(Object.keys(command).sort().join(',')!==issue||!Array.isArray(command.installationIds)||!Array.isArray(command.allowedCapabilities)||!Array.isArray(command.allowedPrivacy)||!Array.isArray(command.allowedDestinations)||!command.limits||typeof command.limits!=='object'))return reply({error:'invalid_request'},400);
 if(command.kind==='revoke'&&(Object.keys(command).sort().join(',')!=='grantId,kind'||typeof command.grantId!=='string'))return reply({error:'invalid_request'},400);
 if(command.kind!=='issue'&&command.kind!=='revoke')return reply({error:'invalid_request'},400);
 const org=input.organizationId,actor=await resolveHumanSession(db,token,org,services);if(!actor)return reply({error:'authority_human_session_invalid'},401);
 const current=await loadCurrentEmission(db,org),evidence=await initialHumanIdentity(db,org,actor.principalId,services),principal=current?.state.principals.find(p=>p.principal_id===actor.principalId);
 if(!evidence||!principal?.external_identities.some(e=>e.provider==='github'&&e.subject===evidence.principal.external_identities[0].subject&&e.status==='verified'))return reply({error:'authority_human_correspondence_missing'},403);
 try{const result=await administerIntelligenceSupplyGrant(db,input as unknown as IntelligenceSupplyGrantRequest,actor,{now:services.now,signer:services.signer,commitGuard:(a,id,at)=>sessionCommitGuard(db,a,id,at)});return reply(result,command.kind==='issue'?201:200);}
 catch(error){if(error instanceof IntelligenceSupplyGrantError)return reply({error:error.message},error.code.includes('conflict')?409:error.code.startsWith('invalid_')?400:403);throw error;}
}
