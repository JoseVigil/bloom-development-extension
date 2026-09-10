import { githubAppProvider, HumanIdentityError } from './human-identity';
import { beginHumanLogin, finishHumanLogin, resolveHumanSession, checkSessionCsrf, renewHumanSession, revokeHumanSession, initialHumanIdentity, sessionCommitGuard, type HumanServices } from './human-session-store';
import { administerAuthority } from './administration-store';
import { AdministrationError, type AdministrationCommand } from './administration';
import { loadCurrentEmission, loadEmissionVersion, type EmissionSigner } from './emission-store';
import { wireVersion } from './emission';
export interface HumanRouteServices extends HumanServices {origin:string;signer:EmissionSigner;}
export interface HumanRouteEnv {
 DB:D1Database;AUTHORITY_HUMAN_ORIGIN?:string;AUTHORITY_GITHUB_APP_CLIENT_ID?:string;
 AUTHORITY_GITHUB_APP_CLIENT_SECRET?:string;AUTHORITY_HUMAN_SESSION_KEY_B64?:string;
 AUTHORITY_SIGNING_KEY_PKCS8_B64:string;AUTHORITY_SIGNING_KEY_ID:string;
}
const sessionCookie='__Host-authority-session',flowCookie='__Host-authority-flow';
function cookie(request:Request,name:string){const matches=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):'';}
function setCookie(name:string,value:string,seconds:number){return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export async function authorityHumanResponse(db:D1Database,request:Request,s:HumanRouteServices):Promise<Response>{
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const url=new URL(request.url),path=url.pathname;
  if(url.origin!==s.origin)throw new HumanIdentityError('origin_invalid');
  if(request.method!=='GET'&&request.headers.get('Origin')!==s.origin)throw new HumanIdentityError('csrf_invalid');
  if(path==='/v1/authority/human/callback'&&request.method==='GET'){
   if(url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length!==1)throw new HumanIdentityError('flow_invalid');
   const result=await finishHumanLogin(db,{state:url.searchParams.get('state')!,code:url.searchParams.get('code')!,browser:cookie(request,flowCookie)},s);
   headers.append('Set-Cookie',setCookie(flowCookie,'',0));headers.append('Set-Cookie',setCookie(sessionCookie,result.token,900));
   return reply({organizationId:result.organizationId,principalId:result.principalId,csrf:result.csrf,expiresAt:result.expiresAt});
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply({error:'invalid_content_type'},400);
  const raw=await request.text();if(raw.length>65536)return reply({error:'request_too_large'},413);
  let body:any;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
  if(typeof body?.organizationId!=='string'||!body.organizationId)return reply({error:'invalid_org'},400);
  const org=body.organizationId;
  if(path==='/v1/authority/human/login'){
   if(!exact(body,['organizationId']))return reply({error:'invalid_request'},400);
   const flow=await beginHumanLogin(db,org,s);headers.append('Set-Cookie',setCookie(flowCookie,flow.browser,300));return reply({authorizationUrl:flow.url});
  }
  const token=cookie(request,sessionCookie);await checkSessionCsrf(db,token,request.headers.get('X-Authority-CSRF')??'');
  if(path==='/v1/authority/human/renew'||path==='/v1/authority/human/logout'){
   if(!exact(body,['organizationId']))return reply({error:'invalid_request'},400);
   if(path.endsWith('/logout')){
    // Logout needs possession and CSRF, not a working external provider.
    await revokeHumanSession(db,token);headers.append('Set-Cookie',setCookie(sessionCookie,'',0));return reply({revoked:true});
   }
   const result=await renewHumanSession(db,token,org,s);headers.append('Set-Cookie',setCookie(sessionCookie,result.token,900));
   return reply({organizationId:org,principalId:result.principalId,csrf:result.csrf,expiresAt:result.expiresAt});
  }
  if(path!=='/v1/authority/administration')return reply({error:'not_found'},404);
  if(!exact(body,['organizationId','requestId','expectedVersion','command'])||typeof body.requestId!=='string'||!body.requestId||body.requestId.length>200)return reply({error:'invalid_request'},400);
  try{wireVersion(body.expectedVersion);}catch{return reply({error:'invalid_version'},400);}
  const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
  const current=await loadCurrentEmission(db,org);if(!current)return reply({error:'authority_admin_onboarding_unavailable'},409);
  const evidence=await initialHumanIdentity(db,org,actor.principalId,s);
  const principal=current.state.principals.find(p=>p.principal_id===actor.principalId);
  if(!evidence||!principal?.external_identities.some(e=>e.provider==='github'&&e.subject===evidence.principal.external_identities[0].subject&&e.status==='verified'))return reply({error:'authority_human_correspondence_missing'},403);
  const receipt=await db.prepare('SELECT authority_version,actor_id FROM authority_admin_requests WHERE organization_id=? AND request_id=?').bind(org,body.requestId).first<{authority_version:string;actor_id:string}>();
  if(receipt&&receipt.actor_id!==actor.principalId)throw new AdministrationError('idempotency_conflict');
  const original=receipt?await loadEmissionVersion(db,org,receipt.authority_version):null;
  const now=s.now();
  const metadata=original?.metadata??{...current.metadata,authority_version:String(wireVersion(body.expectedVersion)+1n),snapshot_id:crypto.randomUUID(),issued_at:now,not_before:now,expires_at:new Date(Date.parse(now)+240000).toISOString()};
  const adminServices={now:s.now,signer:s.signer,allowTestFixtures:s.allowTestFixtures,verifyActor:async()=>actor,
    initialIdentity:(o:string,id:string)=>initialHumanIdentity(db,o,id,s),commitGuard:(a:Parameters<typeof sessionCommitGuard>[1],id:string,at:string,recipient?:Parameters<typeof sessionCommitGuard>[4])=>sessionCommitGuard(db,a,id,at,recipient)};
  const input={requestId:body.requestId,actorProof:token,expectedVersion:body.expectedVersion,metadata,command:body.command as AdministrationCommand};
  let result;
  try{result=await administerAuthority(db,input,adminServices);}catch(e){
   if(!(e instanceof AdministrationError)||!['idempotency_conflict','version_conflict'].includes(e.code))throw e;
   // A concurrent identical request may have won with its server-generated metadata.
   // The store still compares actor, command and expected version before returning it.
   const won=await db.prepare('SELECT authority_version FROM authority_admin_requests WHERE organization_id=? AND request_id=?').bind(org,body.requestId).first<{authority_version:string}>();
   const emission=won?await loadEmissionVersion(db,org,won.authority_version):null;
   if(!emission)throw e;result=await administerAuthority(db,{...input,metadata:emission.metadata},adminServices);
  }
  return reply(result);
 }catch(error){
  if(error instanceof HumanIdentityError)return reply({error:error.message},error.code.startsWith('configuration')||error.code==='provider_unavailable'?503:error.code==='csrf_invalid'||error.code==='origin_invalid'?403:401);
  if(error instanceof AdministrationError)return reply({error:error.message},error.code.includes('conflict')?409:403);
  return reply({error:'authority_human_request_unavailable'},503);
 }
}
export async function configuredAuthorityHumanResponse(env:HumanRouteEnv,request:Request){
 try{
  if(!env.AUTHORITY_HUMAN_ORIGIN||new URL(env.AUTHORITY_HUMAN_ORIGIN).origin!==env.AUTHORITY_HUMAN_ORIGIN||!env.AUTHORITY_HUMAN_SESSION_KEY_B64)throw new HumanIdentityError('configuration_missing');
  const provider=githubAppProvider({clientId:env.AUTHORITY_GITHUB_APP_CLIENT_ID??'',clientSecret:env.AUTHORITY_GITHUB_APP_CLIENT_SECRET??'',callbackUrl:env.AUTHORITY_HUMAN_ORIGIN+'/v1/authority/human/callback'});
  if(!env.AUTHORITY_SIGNING_KEY_PKCS8_B64||!env.AUTHORITY_SIGNING_KEY_ID)throw new HumanIdentityError('configuration_missing');
  return authorityHumanResponse(env.DB,request,{provider,origin:env.AUTHORITY_HUMAN_ORIGIN,encryptionKey:env.AUTHORITY_HUMAN_SESSION_KEY_B64,now:()=>new Date().toISOString(),
   signer:{keyId:env.AUTHORITY_SIGNING_KEY_ID,privateKeyPkcs8:Uint8Array.from(atob(env.AUTHORITY_SIGNING_KEY_PKCS8_B64),c=>c.charCodeAt(0)).buffer}});
 }catch{return new Response(JSON.stringify({error:'authority_human_configuration_unavailable'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}
