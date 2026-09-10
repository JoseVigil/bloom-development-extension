import {base64ToBase64url,canonicalizeJson,digestWire,signWithDomain,verifyWithDomain} from './canonical';
import {normalizeWireTime} from './emission';
import {githubAppProvider,hashSecret,randomSecret,HumanIdentityError} from './human-identity';
import {checkSessionCsrf,resolveHumanSession,type HumanServices} from './human-session-store';
import {ACTOR_DOMAIN,loadTrustManifest,TrustError,type SignedArtifact} from './trust-manifest';
export const ATTESTATION_DOMAIN='BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1';
export interface VerifiedInstallation {organizationId:string;installationId:string;}
export interface TrustRouteServices extends HumanServices {origin:string;issuer:string;attestationKeyId:string;attestationPrivateKeyPkcs8:ArrayBuffer;}
export interface TrustRouteEnv {DB:D1Database;AUTHORITY_HUMAN_ORIGIN?:string;AUTHORITY_GITHUB_APP_CLIENT_ID?:string;AUTHORITY_GITHUB_APP_CLIENT_SECRET?:string;AUTHORITY_HUMAN_SESSION_KEY_B64?:string;AUTHORITY_ISSUER?:string;AUTHORITY_SIGNING_KEY_ID?:string;AUTHORITY_SIGNING_KEY_PKCS8_B64?:string;}
export interface ActorAttestation {schema:'bloom.authority.actor-attestation';schema_version:'1.0';attestation_id:string;issuer:string;organization_id:string;installation_id:string;principal_id:string;actor_public_key:string;audience:string;challenge_digest:string;issued_at:string;expires_at:string;}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const decode=(value:string,length:number)=>{if(!/^[A-Za-z0-9_-]+$/.test(value))throw new TrustError('actor_key_invalid');let b:Uint8Array;try{b=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{throw new TrustError('actor_key_invalid');}if(b.length!==length)throw new TrustError('actor_key_invalid');return b;};
const cookie=(request:Request,name:string)=>{const values=(request.headers.get('Cookie')??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));return values.length===1?values[0].slice(name.length+1):'';};
async function signAttestation(payload:ActorAttestation,s:TrustRouteServices):Promise<SignedArtifact<ActorAttestation>>{return {payload,integrity:{canonicalization:'JCS-RFC8785',digest_algorithm:'SHA-256',digest:await digestWire(payload),signature_algorithm:'Ed25519',key_id:s.attestationKeyId,signature:base64ToBase64url(await signWithDomain(ATTESTATION_DOMAIN,canonicalizeJson(payload),s.attestationPrivateKeyPkcs8))}};}
export async function authorityTrustResponse(db:D1Database,request:Request,s:TrustRouteServices,installation:VerifiedInstallation|null):Promise<Response>{
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 try{
  const url=new URL(request.url),path=url.pathname;if(url.origin!==s.origin)throw new TrustError('origin_invalid');
  if(path==='/v1/authority/trust-manifest'&&request.method==='GET'){
   const org=url.searchParams.get('org');if(!installation||!org||org!==installation.organizationId)return reply({error:'authority_trust_installation_required'},401);
   const raw=await loadTrustManifest(db,org);return raw?new Response(raw,{status:200,headers}):reply({error:'authority_trust_manifest_unavailable'},503);
  }
  if(request.method!=='POST'||request.headers.get('Content-Type')?.split(';')[0]!=='application/json')return reply({error:'authority_trust_invalid_request'},400);
  if(path!=='/v1/authority/actor/challenge'&&request.headers.get('Origin')!==s.origin)throw new TrustError('origin_invalid');let body:any;try{body=await request.json();}catch{throw new TrustError('invalid_request');}
  if(path==='/v1/authority/actor/challenge'){
   if(!installation||!exact(body,['organizationId','actorPublicKey','audience'])||body.organizationId!==installation.organizationId||body.audience!=='bloom.authority.local-actor')throw new TrustError('binding_invalid');decode(body.actorPublicKey,32);
   const challenge=randomSecret(),expires=new Date(Date.parse(s.now())+120000).toISOString();
   await db.prepare("INSERT INTO authority_actor_challenges VALUES(?,?,?,?,?,?,'pending',NULL,NULL,NULL)").bind(await hashSecret(challenge),installation.organizationId,installation.installationId,body.actorPublicKey,body.audience,expires).run();
   return reply({challenge,organizationId:installation.organizationId,installationId:installation.installationId,actorPublicKey:body.actorPublicKey,audience:body.audience,expiresAt:expires},201);
  }
  if(path!=='/v1/authority/actor/approve'||!exact(body,['organizationId','installationId','actorPublicKey','audience','challenge','signature']))throw new TrustError('invalid_request');
  const token=cookie(request,'__Host-authority-session');await checkSessionCsrf(db,token,request.headers.get('X-Authority-CSRF')??'');
  const actor=await resolveHumanSession(db,token,body.organizationId,s);if(!actor)throw new HumanIdentityError('session_invalid');
  const manifestRaw=await loadTrustManifest(db,body.organizationId);if(!manifestRaw)throw new TrustError('manifest_unavailable');
  let manifest:any;try{manifest=JSON.parse(manifestRaw).payload;}catch{throw new TrustError('recovery_required');}
  const currentKey=manifest?.issuer===s.issuer&&Array.isArray(manifest.keys)?manifest.keys.find((k:any)=>k?.key_id===s.attestationKeyId&&k.status==='active'&&Date.parse(k.valid_from)<=Date.parse(s.now())&&(k.valid_until===null||Date.parse(s.now())<Date.parse(k.valid_until))):undefined;
  if(!currentKey)throw new TrustError('signing_key_unavailable');
  const challengeDigest=await hashSecret(body.challenge);const row=await db.prepare("SELECT * FROM authority_actor_challenges WHERE challenge_hash=? AND organization_id=? AND installation_id=? AND status='pending'").bind(challengeDigest,body.organizationId,body.installationId).first<{actor_public_key_raw:string;audience:string;expires_at:string}>();
  if(!row||row.actor_public_key_raw!==body.actorPublicKey||row.audience!==body.audience||Date.parse(row.expires_at)<=Date.parse(s.now()))throw new TrustError('challenge_invalid');
  const possession={challenge:body.challenge,organization_id:body.organizationId,installation_id:body.installationId,audience:body.audience};
  const actorKey=new Uint8Array(decode(body.actorPublicKey,32));if(!await verifyWithDomain(ACTOR_DOMAIN,canonicalizeJson(possession),body.signature.replace(/-/g,'+').replace(/_/g,'/'),actorKey.buffer))throw new TrustError('possession_invalid');
  const now=normalizeWireTime(s.now()),payload:ActorAttestation={schema:'bloom.authority.actor-attestation',schema_version:'1.0',attestation_id:crypto.randomUUID(),issuer:s.issuer,organization_id:body.organizationId,installation_id:body.installationId,principal_id:actor.principalId,actor_public_key:body.actorPublicKey,audience:body.audience,challenge_digest:challengeDigest,issued_at:now,expires_at:new Date(Date.parse(now)+120000).toISOString()};
  const envelope=await signAttestation(payload,s),raw=canonicalizeJson(envelope);
  const updated=await db.prepare("UPDATE authority_actor_challenges SET status='approved',approved_principal_id=?,approved_at=?,attestation_json=? WHERE challenge_hash=? AND status='pending' RETURNING challenge_hash").bind(actor.principalId,now,raw,challengeDigest).first();
  if(!updated)throw new TrustError('challenge_invalid');return new Response(raw,{status:200,headers});
 }catch(e){const code=e instanceof TrustError||e instanceof HumanIdentityError?e.message:'authority_trust_unavailable';const status=code.includes('configuration')||code.endsWith('unavailable')?503:code.includes('session')?401:403;return reply({error:code},status);}
}
export async function configuredAuthorityTrustResponse(env:TrustRouteEnv,request:Request,installation:VerifiedInstallation|null){
 try{
  if(!env.AUTHORITY_HUMAN_ORIGIN||!env.AUTHORITY_ISSUER||!env.AUTHORITY_SIGNING_KEY_ID||!env.AUTHORITY_SIGNING_KEY_PKCS8_B64||!env.AUTHORITY_HUMAN_SESSION_KEY_B64)throw new TrustError('configuration_missing');
  const provider=githubAppProvider({clientId:env.AUTHORITY_GITHUB_APP_CLIENT_ID??'',clientSecret:env.AUTHORITY_GITHUB_APP_CLIENT_SECRET??'',callbackUrl:env.AUTHORITY_HUMAN_ORIGIN+'/v1/authority/human/callback'});
  return authorityTrustResponse(env.DB,request,{provider,origin:env.AUTHORITY_HUMAN_ORIGIN,issuer:env.AUTHORITY_ISSUER,attestationKeyId:env.AUTHORITY_SIGNING_KEY_ID,encryptionKey:env.AUTHORITY_HUMAN_SESSION_KEY_B64,now:()=>new Date().toISOString(),attestationPrivateKeyPkcs8:Uint8Array.from(atob(env.AUTHORITY_SIGNING_KEY_PKCS8_B64),c=>c.charCodeAt(0)).buffer},installation);
 }catch{return new Response(JSON.stringify({error:'authority_trust_configuration_unavailable'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
}
