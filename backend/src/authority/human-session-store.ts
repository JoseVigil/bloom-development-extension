import { HumanIdentityError, hashSecret, randomSecret, base64url, type HumanProvider } from './human-identity';
import type { VerifiedHumanActor, InitialHumanIdentity } from './administration';
export interface HumanServices {provider:HumanProvider;encryptionKey:string;now:()=>string;allowTestFixtures?:boolean;}
export interface Identity {organization_id:string;principal_id:string;subject:string;source_ref:string;evidence_kind:'canonical'|'test-fixture';revision:string;status:string;verified_at:string|null;display_handle:string;}
interface Session {session_id:string;token_hash:string;csrf_hash:string;organization_id:string;principal_id:string;identity_revision:string;provider_cipher:string;expires_at:string;absolute_expires_at:string;status:string;revision:string;}
export interface SessionActor extends VerifiedHumanActor {sessionRevision:string;identityRevision:string;}
export function timestamp(s:HumanServices){const n=Date.parse(s.now());if(!Number.isFinite(n))throw new HumanIdentityError('clock_invalid');return n;}
export function permitted(s:HumanServices,i?:Identity){if((s.provider.source==='test-fixture'||i?.evidence_kind==='test-fixture')&&!s.allowTestFixtures)throw new HumanIdentityError('fixture_forbidden');}
export async function cipherKey(s:HumanServices){
 let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(s.encryptionKey),c=>c.charCodeAt(0));}catch{throw new HumanIdentityError('configuration_invalid');}
 if(bytes.length!==32)throw new HumanIdentityError('configuration_missing');
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(s:HumanServices,value:string,aad:string){const iv=crypto.getRandomValues(new Uint8Array(12));return base64url(iv)+'.'+base64url(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},await cipherKey(s),new TextEncoder().encode(value))));}
export async function open(s:HumanServices,value:string,aad:string){
 const decode=(v:string)=>Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 try{const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(aad)},await cipherKey(s),decode(data)));}catch{throw new HumanIdentityError('session_invalid');}
}
export async function beginHumanLogin(db:D1Database,org:string,s:HumanServices){
 permitted(s);await cipherKey(s);
 if(!await db.prepare('SELECT id FROM organizations WHERE id=?').bind(org).first())throw new HumanIdentityError('organization_unavailable');
 const state=randomSecret(),browser=randomSecret(),verifier=randomSecret();
 await db.prepare('INSERT INTO authority_human_flows(state_hash,browser_hash,organization_id,verifier,expires_at) VALUES(?,?,?,?,?)')
  .bind(await hashSecret(state),await hashSecret(browser),org,await seal(s,verifier,state),new Date(timestamp(s)+300000).toISOString()).run();
 return {state,browser,url:s.provider.authorize(state,await hashSecret(verifier))};
}
export async function finishHumanLogin(db:D1Database,input:{state:string;browser:string;code:string},s:HumanServices){
 permitted(s);if(!input.state||!input.browser||!input.code)throw new HumanIdentityError('flow_invalid');
 const flow=await db.prepare(`UPDATE authority_human_flows SET consumed=1 WHERE state_hash=? AND browser_hash=? AND consumed=0
  AND julianday(expires_at)>julianday(?) RETURNING organization_id,verifier`).bind(await hashSecret(input.state),await hashSecret(input.browser),s.now()).first<{organization_id:string;verifier:string}>();
 if(!flow)throw new HumanIdentityError('flow_invalid');
 const grant=await s.provider.exchange(input.code,await open(s,flow.verifier,input.state));
 const human=await s.provider.identify(grant.token);
 const identity=await db.prepare('SELECT * FROM authority_human_identities WHERE organization_id=? AND subject=?').bind(flow.organization_id,human.subject).first<Identity>();
 if(!identity||identity.status!=='active')throw new HumanIdentityError('correspondence_missing');permitted(s,identity);
 const verified=s.now();
 await db.prepare(`UPDATE authority_human_identities SET verified_at=COALESCE(verified_at,?),display_handle=?
  WHERE organization_id=? AND principal_id=? AND revision=? AND status='active'`).bind(verified,human.handle,identity.organization_id,identity.principal_id,identity.revision).run();
 const latest=await db.prepare('SELECT * FROM authority_human_identities WHERE organization_id=? AND principal_id=?').bind(identity.organization_id,identity.principal_id).first<Identity>();
 if(!latest||latest.status!=='active'||latest.revision!==identity.revision||!latest.verified_at)throw new HumanIdentityError('identity_conflict');
 return issueSession(db,latest,grant.token,new Date(timestamp(s)+Math.min(grant.expiresIn,28800)*1000).toISOString(),s);
}
export async function issueSession(db:D1Database,i:Identity,providerToken:string,absolute:string,s:HumanServices){
 const token=randomSecret(),csrf=randomSecret(),sessionId=crypto.randomUUID();
 const expiresAt=new Date(Math.min(timestamp(s)+900000,Date.parse(absolute))).toISOString();
 if(Date.parse(expiresAt)<=timestamp(s))throw new HumanIdentityError('session_expired');
 await db.prepare(`INSERT INTO authority_human_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(sessionId,await hashSecret(token),await hashSecret(csrf),i.organization_id,i.principal_id,i.revision,
  await seal(s,providerToken,sessionId),expiresAt,absolute,'active','1').run();
 return {token,csrf,sessionId,organizationId:i.organization_id,principalId:i.principal_id,expiresAt};
}
export async function resolveHumanSession(db:D1Database,token:string,org:string,s:HumanServices):Promise<SessionActor|null>{
 permitted(s);if(!token)return null;
 const row=await db.prepare('SELECT * FROM authority_human_sessions WHERE token_hash=? AND organization_id=?').bind(await hashSecret(token),org).first<Session>();
 if(!row||row.status!=='active'||Date.parse(row.expires_at)<=timestamp(s)||Date.parse(row.absolute_expires_at)<=timestamp(s))return null;
 const i=await db.prepare('SELECT * FROM authority_human_identities WHERE organization_id=? AND principal_id=?').bind(org,row.principal_id).first<Identity>();
 if(!i||i.status!=='active'||!i.verified_at||i.revision!==row.identity_revision)return null;permitted(s,i);
 try{const human=await s.provider.identify(await open(s,row.provider_cipher,row.session_id));if(human.subject!==i.subject)throw new HumanIdentityError('provider_revoked');}
 catch(e){if(e instanceof HumanIdentityError&&e.code==='provider_revoked'){
  await db.prepare("UPDATE authority_human_sessions SET status='revoked',revision=CAST(CAST(revision AS INTEGER)+1 AS TEXT) WHERE session_id=?").bind(row.session_id).run();return null;
 }throw e;}
 return {organizationId:org,principalId:i.principal_id,sessionId:row.session_id,expiresAt:row.expires_at,source:'backend-session',sessionRevision:row.revision,identityRevision:i.revision};
}
export async function checkSessionCsrf(db:D1Database,token:string,csrf:string){
 if(!csrf||!await db.prepare("SELECT session_id FROM authority_human_sessions WHERE token_hash=? AND csrf_hash=? AND status='active'").bind(await hashSecret(token),await hashSecret(csrf)).first())throw new HumanIdentityError('csrf_invalid');
}
export async function revokeHumanSession(db:D1Database,token:string){await db.prepare("UPDATE authority_human_sessions SET status='revoked',revision=CAST(CAST(revision AS INTEGER)+1 AS TEXT) WHERE token_hash=? AND status='active'").bind(await hashSecret(token)).run();}
export async function renewHumanSession(db:D1Database,token:string,org:string,s:HumanServices){
 const actor=await resolveHumanSession(db,token,org,s);if(!actor)throw new HumanIdentityError('session_invalid');
 const row=await db.prepare('SELECT * FROM authority_human_sessions WHERE session_id=?').bind(actor.sessionId).first<Session>();
 const next=randomSecret(),csrf=randomSecret(),expiresAt=new Date(Math.min(timestamp(s)+900000,Date.parse(row!.absolute_expires_at))).toISOString();
 const result=await db.prepare(`UPDATE authority_human_sessions SET token_hash=?,csrf_hash=?,expires_at=?,revision=CAST(CAST(revision AS INTEGER)+1 AS TEXT)
 WHERE session_id=? AND revision=? AND status='active' AND julianday(expires_at)>julianday(?)
 AND EXISTS(SELECT 1 FROM authority_human_identities i WHERE i.organization_id=authority_human_sessions.organization_id
 AND i.principal_id=authority_human_sessions.principal_id AND i.status='active' AND i.revision=authority_human_sessions.identity_revision)
 RETURNING session_id`).bind(await hashSecret(next),await hashSecret(csrf),expiresAt,actor.sessionId,actor.sessionRevision,s.now()).first();
 if(!result)throw new HumanIdentityError('session_conflict');
 return {token:next,csrf,sessionId:actor.sessionId,organizationId:org,principalId:actor.principalId,expiresAt};
}
export async function initialHumanIdentity(db:D1Database,org:string,id:string,s:HumanServices):Promise<InitialHumanIdentity|undefined>{
 const i=await db.prepare('SELECT * FROM authority_human_identities WHERE organization_id=? AND principal_id=?').bind(org,id).first<Identity>();
 if(!i||i.status!=='active'||!i.verified_at)return undefined;permitted(s,i);
 return {organizationId:org,revision:i.revision,source:i.evidence_kind,principal:{principal_id:id,principal_type:'human',status:'active',
 external_identities:[{provider:'github',subject:i.subject,display_handle:i.display_handle,status:'verified',verified_at:i.verified_at}]}};
}
export function sessionCommitGuard(db:D1Database,actor:VerifiedHumanActor,requestId:string,at:string,recipient?:InitialHumanIdentity){
 const a=actor as SessionActor;
 if(a.source!=='backend-session'||!a.sessionRevision||!a.identityRevision)throw new HumanIdentityError('session_invalid');
 return db.prepare('INSERT INTO authority_human_commit_guards VALUES(?,?,?,?,?,?,?,?)').bind(a.organizationId,requestId,a.sessionId,a.sessionRevision,a.identityRevision,at,recipient?.principal.principal_id??null,recipient?.revision??null);
}
