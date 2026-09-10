import {base64ToBase64url,canonicalizeJson,digestWire,sha256Hex,signWithDomain} from "./canonical";
import {loadCurrentEmission} from "./emission-store";
import {resolveWireAuthoritySnapshot} from "./snapshot";
import {acknowledgeAuthorityNotice,claimAuthorityNotices,materializeAuthorityOutbox,recordAuthorityPull,type ClaimedNotice} from "./sync-store";

export const CURRENT_CHECK_DOMAIN="BLOOM-AUTHORITY-CURRENT-PULL-v1";
export interface SyncInstallation {organizationId:string;installationId:string}
export interface SyncEnv {DB:D1Database;AUTHORITY_SYNC:DurableObjectNamespace;AUTHORITY_SIGNING_KEY_PKCS8_B64:string;AUTHORITY_SIGNING_KEY_ID:string;AUTHORITY_ISSUER?:string}
const headers={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const keyBytes=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0)).buffer;
const validBinding=(url:URL,i:SyncInstallation|null)=>!!i&&url.searchParams.getAll("org").length===1&&url.searchParams.get("org")===i.organizationId;

export async function authoritySyncResponse(env:SyncEnv,request:Request,installation:SyncInstallation|null,now=new Date()):Promise<Response>{
 try{
  const url=new URL(request.url);if(!validBinding(url,installation))return reply({error:"authority_sync_binding_invalid"},403);
  const bound=installation!;
  if(request.method==="POST"&&url.pathname==="/v1/authority/sync/challenge"){
   const challenge=base64ToBase64url(btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))));
   const issued=now.toISOString(),expires=new Date(now.getTime()+120000).toISOString();
   await env.DB.prepare("INSERT INTO authority_sync_challenges VALUES(?,?,?,?,?,NULL)")
    .bind(await sha256Hex(challenge),bound.organizationId,bound.installationId,issued,expires).run();
   return reply({challenge,organization_id:bound.organizationId,installation_id:bound.installationId,issued_at:issued,expires_at:expires},201);
  }
  if(request.method==="GET"&&url.pathname==="/v1/authority/sync/notice"){
   const stub=env.AUTHORITY_SYNC.get(env.AUTHORITY_SYNC.idFromName(bound.organizationId));
   return stub.fetch(`https://authority-sync/notice?installation_id=${encodeURIComponent(bound.installationId)}`);
  }
  if(request.method!=="GET"||url.pathname!=="/v1/authority/sync/pull")return reply({error:"authority_sync_invalid_request"},400);
  const challenge=url.searchParams.get("challenge"),base=url.searchParams.get("base_version");
  if(!challenge)return reply({error:"authority_sync_challenge_required"},400);
  const consumed=await env.DB.prepare(`UPDATE authority_sync_challenges SET consumed_at=? WHERE challenge_hash=? AND organization_id=? AND installation_id=?
   AND consumed_at IS NULL AND expires_at>? RETURNING challenge_hash`).bind(now.toISOString(),await sha256Hex(challenge),bound.organizationId,bound.installationId,now.toISOString()).first();
  if(!consumed)return reply({error:"authority_sync_challenge_invalid"},403);
  const current=await loadCurrentEmission(env.DB,bound.organizationId);if(!current)return reply({error:"authority_emission_unavailable"},503);
  const snapshotRaw=await resolveWireAuthoritySnapshot(env.DB,bound.organizationId,bound.installationId,base);
  await recordAuthorityPull(env.DB,bound.organizationId,bound.installationId,current.metadata.authority_version,now);
  const snapshot=JSON.parse(snapshotRaw),payload={schema:"bloom.authority.current-check",schema_version:"1.0",check_id:crypto.randomUUID(),
   issuer:env.AUTHORITY_ISSUER??current.metadata.issuer,organization_id:bound.organizationId,installation_id:bound.installationId,
   challenge_digest:await sha256Hex(challenge),authority_version:current.metadata.authority_version,state_digest:current.stateDigest,
   snapshot_digest:snapshot.integrity.digest,checked_at:now.toISOString()};
  const integrity={canonicalization:"JCS-RFC8785",digest_algorithm:"SHA-256",digest:await digestWire(payload),signature_algorithm:"Ed25519",
   key_id:env.AUTHORITY_SIGNING_KEY_ID,signature:base64ToBase64url(await signWithDomain(CURRENT_CHECK_DOMAIN,canonicalizeJson(payload),keyBytes(env.AUTHORITY_SIGNING_KEY_PKCS8_B64)))};
  return reply({snapshot,current_check:{payload,integrity}});
 }catch{return reply({error:"authority_sync_unavailable"},503);}
}

export async function relayAuthorityOutbox(env:SyncEnv,now=new Date()):Promise<{published:number;failed:number}>{
 await materializeAuthorityOutbox(env.DB);const claimed=await claimAuthorityNotices(env.DB,"authority-relay",now);let published=0,failed=0;
 for(const notice of claimed){
  try{const stub=env.AUTHORITY_SYNC.get(env.AUTHORITY_SYNC.idFromName(notice.organization_id));const response=await stub.fetch("https://authority-sync/notice",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(publicNotice(notice))});
   if(!response.ok||!await acknowledgeAuthorityNotice(env.DB,notice,now))throw new Error("notice not acknowledged");published++;
  }catch{failed++;}
 }
 return {published,failed};
}
function publicNotice(n:ClaimedNotice){return {organization_id:n.organization_id,event_id:n.event_id,installation_id:n.installation_id,
 authority_version:n.authority_version,correlation_id:n.correlation_id,urgency:n.urgency,committed_at:n.committed_at};}
