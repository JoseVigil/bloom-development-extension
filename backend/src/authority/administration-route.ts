import { githubAppProvider, testFixtureProvider, HumanIdentityError } from './human-identity';
import { beginHumanLogin, finishHumanLogin, resolveHumanSession, checkSessionCsrf, renewHumanSession, revokeHumanSession, initialHumanIdentity, sessionCommitGuard, type HumanServices } from './human-session-store';
import { beginGenesis, finishGenesis, pollGenesisResult } from './genesis-store';
import { administerAuthority } from './administration-store';
import { AdministrationError, type AdministrationCommand } from './administration';
import { AUTHORITY_EMISSION_TTL_MS, loadCurrentEmission, loadEmissionVersion, type EmissionSigner } from './emission-store';
import { wireVersion } from './emission';
import { createInitialAuthorityEmission, InitialAuthorityEmissionError, initialEmissionGuardStatement } from './initial-emission';
import { createOrganizationUnderTenant, listTenantOrganizations, TenantStoreError } from './tenant-store';
import { createInvitation, listInvitations, revokeInvitation, InvitationStoreError, type InvitationStoreFailure } from './invitation-store';
export interface HumanRouteServices extends HumanServices {origin:string;issuer?:string;signer:EmissionSigner;}
// Invitaciones a organización ajena, Fase B (Propuesta_Diseno_Invitaciones_Organizacion_v0_2.md
// §2/§4, aprobada por Jose 2026-09-22). Mismo esquema de mapeo a status HTTP que ya usan
// TenantStoreError/InitialAuthorityEmissionError en este archivo (ternarias inline) —
// como acá son 4 códigos en vez de 2, se extrae a una función para no repetirla en las
// tres rutas nuevas.
function invitationStatus(code:InvitationStoreFailure):number{
 if(code==='invalid_request')return 400;
 if(code==='invitation_unavailable')return 404;
 if(code==='organization_unavailable')return 409;
 return 403; // not_authorized | role_unavailable | scope_unverifiable
}
export interface HumanRouteEnv {
 DB:D1Database;AUTHORITY_HUMAN_ORIGIN?:string;AUTHORITY_GITHUB_APP_CLIENT_ID?:string;
 AUTHORITY_GITHUB_APP_CLIENT_SECRET?:string;AUTHORITY_HUMAN_SESSION_KEY_B64?:string;
  AUTHORITY_SIGNING_KEY_PKCS8_B64:string;AUTHORITY_SIGNING_KEY_ID:string;
 AUTHORITY_ISSUER?:string;
 // Sólo development: nunca debe llegar a un despliegue real. Ver .dev.vars.example
 // y README.md § Modo fixture. Comparación estricta contra 'true' en
 // configuredAuthorityHumanResponse — cualquier otro valor falla cerrado.
 AUTHORITY_ALLOW_TEST_FIXTURES?:string;
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
   const input={state:url.searchParams.get('state')!,code:url.searchParams.get('code')!,browser:cookie(request,flowCookie)};
   // Login real de hoy no cambia en nada: finishHumanLogin sigue resolviendo en el
   // primer intento, siempre. Sólo cuando falla específicamente con flow_invalid (no hay
   // fila viva en authority_human_flows para este state/browser — ya validado como no
   // siendo un error de input arriba) se intenta finishGenesis contra
   // authority_genesis_flows (§2.3.3 del encargo de Génesis).
   let result:{token:string;csrf:string;organizationId:string;principalId:string;expiresAt:string;created?:boolean};
   try{result=await finishHumanLogin(db,input,s);}
   catch(error){if(!(error instanceof HumanIdentityError)||error.code!=='flow_invalid')throw error;result=await finishGenesis(db,input,s);}
   headers.append('Set-Cookie',setCookie(flowCookie,'',0));headers.append('Set-Cookie',setCookie(sessionCookie,result.token,900));
   return reply(result.created===undefined?{organizationId:result.organizationId,principalId:result.principalId,csrf:result.csrf,expiresAt:result.expiresAt}
    :{organizationId:result.organizationId,principalId:result.principalId,csrf:result.csrf,expiresAt:result.expiresAt,created:result.created});
  }
  if(path==='/v1/authority/administration/history'&&request.method==='GET'){
   // Encargo_Implementacion_Recuperacion_Estado_Anterior_Autoridad_v1_0.md §2.2: sólo lectura de una
   // versión histórica ya existente (loadEmissionVersion), mismo gate de sesión que la ruta de
   // administración. Sin chequeo de CSRF adicional — es GET, igual que el callback de arriba.
   const org=url.searchParams.get('organizationId')??'';
   const version=url.searchParams.get('version')??'';
   if(!org)return reply({error:'invalid_org'},400);
   try{wireVersion(version);}catch{return reply({error:'invalid_version'},400);}
   const token=cookie(request,sessionCookie);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   const historical=await loadEmissionVersion(db,org,version);
   if(!historical)return reply({error:'not_found'},404);
   return reply({authorityVersion:version,state:historical.state});
  }
  if(path==='/v1/authority/genesis/login'&&request.method==='GET'){
   // Encargo_Implementacion_Nucleus_Genesis_Bootstrap_v1_0.md §2.1: variante navegable
   // del mismo beginGenesis que ya usa el POST de abajo — un navegador puede seguir
   // este link directamente (302 + Location) en vez de hacer un fetch() y navegar a
   // mano. Mismo flujo, misma fila en authority_genesis_flows, sin tocar beginGenesis.
   const flow=await beginGenesis(db,s);headers.append('Set-Cookie',setCookie(flowCookie,flow.browser,300));
   headers.set('Location',flow.url);return new Response(null,{status:302,headers});
  }
  if(path==='/v1/authority/genesis/result'&&request.method==='GET'){
   // Diseño P (Propuesta_Diseno_Retorno_Genesis_y_Hallazgo_Invitaciones_v0_1.md §3.3,
   // autorizada por Jose 2026-09-22): el secreto `browser` (mismo que ya devuelve
   // beginGenesis, tanto vía el POST como vía el GET navegable de abajo) ES la prueba de
   // posesión — no hace falta sesión ni CSRF, mismo criterio que finishGenesis ya aplica.
   // 202 "pending" cubre por igual "todavía no terminó", "no existe" y "expiró" — nunca
   // se distingue cuál, mismo criterio anti-enumeración que el resto de
   // authority_genesis_flows. 200 entrega el GenesisResult completo, una única vez.
   const browser=url.searchParams.get('browser')??'';
   const result=await pollGenesisResult(db,browser,s.now);
   if(!result)return reply({status:'pending'},202);
   return reply(result,200);
  }
  if(path==='/v1/authority/tenant/organizations'&&request.method==='GET'){
   // Sovereign Tenant Fase 3 (§2.3.4 de la propuesta): lista las organizaciones
   // hermanas de `organizationId` (la organización de origen ya autenticada por
   // sesión). Sólo requiere sesión activa — no rol master: enumerar hermanas es de
   // lectura, no una acción administrativa. Sin chequeo de CSRF, igual que el resto de
   // las rutas GET de este archivo.
   const org=url.searchParams.get('organizationId')??'';
   if(!org)return reply({error:'invalid_org'},400);
   const token=cookie(request,sessionCookie);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   const organizations=await listTenantOrganizations(db,org);
   return reply({organizations});
  }
  if(path==='/v1/authority/tenant/invitations'&&request.method==='GET'){
   // Invitaciones a organización ajena, Fase B (§4 del diseño): a diferencia del listado
   // de tenant/organizations de arriba, esto NO es de lectura abierta a cualquier
   // miembro — mismo gate de autorización que crear una invitación (invitation-store.ts:
   // canInvite), desviación deliberada señalada explícitamente en el diseño (§4, nota).
   const org=url.searchParams.get('organizationId')??'';
   if(!org)return reply({error:'invalid_org'},400);
   const token=cookie(request,sessionCookie);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   try{const invitations=await listInvitations(db,org,actor,s);return reply({invitations});}
   catch(e){if(e instanceof InvitationStoreError)return reply({error:e.message},invitationStatus(e.code));throw e;}
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply({error:'invalid_content_type'},400);
  const raw=await request.text();if(raw.length>65536)return reply({error:'request_too_large'},413);
  let body:any;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_json'},400);}
  if(path==='/v1/authority/genesis/login'){
   // Sin organizationId en el body: la organización todavía no existe (§2.3.3).
   if(!exact(body,[]))return reply({error:'invalid_request'},400);
   const flow=await beginGenesis(db,s);headers.append('Set-Cookie',setCookie(flowCookie,flow.browser,300));return reply({authorizationUrl:flow.url});
  }
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
  if(path==='/v1/authority/initial-emission'){
   if(!exact(body,['organizationId']))return reply({error:'invalid_request'},400);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   try{return reply(await createInitialAuthorityEmission(db,org,actor.principalId,{now:s.now,issuer:s.issuer??'',signer:s.signer,
    initialIdentity:(o,id)=>initialHumanIdentity(db,o,id,s),commitGuard:(id,at,evidence)=>initialEmissionGuardStatement(db,actor,id,at,evidence)}));}catch(e){
    if(e instanceof InitialAuthorityEmissionError)return reply({error:e.message},e.code==='already_exists'?409:e.code==='identity_not_ready'||e.code==='canonical_evidence_required'?403:503);throw e;
   }
  }
  if(path==='/v1/authority/tenant/organizations'){
   // Sovereign Tenant Fase 3 (§2.3.2-2.3.3 de la propuesta): crea una organización
   // hermana dentro del mismo tenant que `organizationId` (la organización de origen,
   // ya autenticada por sesión). El chequeo de rol master vive en tenant-store.ts
   // (loadCurrentEmission + isActiveMaster) — no acá, mismo reparto de responsabilidad
   // que initial-emission de arriba.
   if(!exact(body,['organizationId','name']))return reply({error:'invalid_request'},400);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   try{return reply(await createOrganizationUnderTenant(db,org,actor,body.name,s),201);}catch(e){
    if(e instanceof TenantStoreError)return reply({error:e.message},e.code==='not_authorized'?403:e.code==='invalid_request'?400:409);
    if(e instanceof InitialAuthorityEmissionError)return reply({error:e.message},e.code==='already_exists'?409:e.code==='identity_not_ready'||e.code==='canonical_evidence_required'?403:503);
    throw e;
   }
  }
  if(path==='/v1/authority/tenant/invitations'){
   // Invitaciones a organización ajena, Fase B (§2/§4 del diseño). Todos los campos
   // opcionales del diseño (scopeId/invitedSubject/validUntil/expiresInSeconds) se piden
   // igual, nulleables — mismo criterio "presente siempre, null cuando no aplica" que ya
   // usa el resto del wire schema de este backend (ver WireRoleAssignment.valid_until en
   // schema.ts) en vez de claves opcionales, que `exact()` no soporta y que este
   // dispatcher no usa en ningún otro lado.
   if(!exact(body,['organizationId','roleId','roleVersion','scopeType','scopeId','invitedSubject','validUntil','expiresInSeconds']))return reply({error:'invalid_request'},400);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   try{const created=await createInvitation(db,org,actor,{roleId:body.roleId,roleVersion:body.roleVersion,scopeType:body.scopeType,
    scopeId:body.scopeId??undefined,invitedSubject:body.invitedSubject??undefined,validUntil:body.validUntil??undefined,
    expiresInSeconds:body.expiresInSeconds??undefined},{now:s.now,origin:s.origin});
    return reply(created,201);
   }catch(e){if(e instanceof InvitationStoreError)return reply({error:e.message},invitationStatus(e.code));throw e;}
  }
  if(path==='/v1/authority/tenant/invitations/revoke'){
   // Sin segmento de path dinámico a propósito (`:id`): este dispatcher entero no usa
   // parámetros de path en ningún lado (todo va por query en GET o por body en POST,
   // ver tenant/organizations arriba) — mismo criterio acá, `invitationId` va en el body.
   // Evita además inventar soporte de segmento dinámico en el proxy de Batcave (Fase D),
   // que hoy tampoco lo tiene para ninguna ruta.
   if(!exact(body,['organizationId','invitationId'])||typeof body.invitationId!=='string'||!body.invitationId)return reply({error:'invalid_request'},400);
   const actor=await resolveHumanSession(db,token,org,s);if(!actor)return reply({error:'authority_human_session_invalid'},401);
   try{return reply(await revokeInvitation(db,org,actor,body.invitationId,s));}
   catch(e){if(e instanceof InvitationStoreError)return reply({error:e.message},invitationStatus(e.code));throw e;}
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
  const metadata=original?.metadata??{...current.metadata,authority_version:String(wireVersion(body.expectedVersion)+1n),snapshot_id:crypto.randomUUID(),issued_at:now,not_before:now,expires_at:new Date(Date.parse(now)+AUTHORITY_EMISSION_TTL_MS).toISOString()};
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
  if(error instanceof TenantStoreError)return reply({error:error.message},error.code==='not_authorized'?403:error.code==='invalid_request'?400:409);
  if(error instanceof InvitationStoreError)return reply({error:error.message},invitationStatus(error.code));
  return reply({error:'authority_human_request_unavailable'},503);
 }
}
export async function configuredAuthorityHumanResponse(env:HumanRouteEnv,request:Request){
 try{
  if(!env.AUTHORITY_HUMAN_ORIGIN||new URL(env.AUTHORITY_HUMAN_ORIGIN).origin!==env.AUTHORITY_HUMAN_ORIGIN||!env.AUTHORITY_HUMAN_SESSION_KEY_B64)throw new HumanIdentityError('configuration_missing');
  // Comparación estricta: sólo el string exacto 'true' activa el modo fixture. Cualquier
  // otro valor (incluyendo '1', 'TRUE', undefined en producción real) deja el gate cerrado
  // y usa siempre el provider real de GitHub. Ver AUTHORITY_BOUNDARY.md §1 — este flag
  // existe exclusivamente para reemplazar la navegación real a github.com por una
  // inyección de estado interna, nunca para sortear el boundary en un entorno real.
  const fixtureMode=env.AUTHORITY_ALLOW_TEST_FIXTURES==='true';
  const provider=fixtureMode?testFixtureProvider():githubAppProvider({clientId:env.AUTHORITY_GITHUB_APP_CLIENT_ID??'',clientSecret:env.AUTHORITY_GITHUB_APP_CLIENT_SECRET??'',callbackUrl:env.AUTHORITY_HUMAN_ORIGIN+'/v1/authority/human/callback'});
  if(!env.AUTHORITY_SIGNING_KEY_PKCS8_B64||!env.AUTHORITY_SIGNING_KEY_ID)throw new HumanIdentityError('configuration_missing');
  if(fixtureMode)console.warn('[authority] AUTHORITY_ALLOW_TEST_FIXTURES activo: login de GitHub simulado por inyección de estado, sin tocar github.com. NUNCA debe estar activo en un despliegue real.');
  return authorityHumanResponse(env.DB,request,{provider,origin:env.AUTHORITY_HUMAN_ORIGIN,issuer:env.AUTHORITY_ISSUER,encryptionKey:env.AUTHORITY_HUMAN_SESSION_KEY_B64,now:()=>new Date().toISOString(),allowTestFixtures:fixtureMode,
   signer:{keyId:env.AUTHORITY_SIGNING_KEY_ID,privateKeyPkcs8:Uint8Array.from(atob(env.AUTHORITY_SIGNING_KEY_PKCS8_B64),c=>c.charCodeAt(0)).buffer}});
 }catch{return new Response(JSON.stringify({error:'authority_human_configuration_unavailable'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}
