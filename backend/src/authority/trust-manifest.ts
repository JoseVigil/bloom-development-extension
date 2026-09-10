import {base64ToBase64url,canonicalizeJson,digestWire,signWithDomain,verifyWithDomain} from './canonical';
import {normalizeWireTime,wireVersion} from './emission';
export const TRUST_DOMAIN='BLOOM-AUTHORITY-TRUST-MANIFEST-v1';
export const ACTOR_DOMAIN='BLOOM-AUTHORITY-ACTOR-PROOF-v1';
export class TrustError extends Error {constructor(readonly code:string){super(`authority_trust_${code}`);}}
export interface TrustKey {key_id:string;public_key:string;status:'active'|'retired';valid_from:string;valid_until:string|null;}
export interface TrustPayload {schema:'bloom.authority.trust-manifest';schema_version:'1.0';manifest_id:string;issuer:string;organization_id:string;manifest_version:string;issued_at:string;not_before:string;expires_at:string;root_key_id:string;keys:TrustKey[];}
export interface SignedArtifact<T> {payload:T;integrity:{canonicalization:'JCS-RFC8785';digest_algorithm:'SHA-256';digest:string;signature_algorithm:'Ed25519';key_id:string;signature:string;};}
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function b64urlBytes(value:string,length:number){if(!/^[A-Za-z0-9_-]+$/.test(value))throw new TrustError('key_invalid');let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{throw new TrustError('key_invalid');}if(bytes.length!==length)throw new TrustError('key_invalid');return bytes;}
export function normalizeTrustPayload(input:TrustPayload):TrustPayload {
 if(!exact(input,['schema','schema_version','manifest_id','issuer','organization_id','manifest_version','issued_at','not_before','expires_at','root_key_id','keys'])
  ||input.schema!=='bloom.authority.trust-manifest'||input.schema_version!=='1.0'||!input.manifest_id||!input.issuer||!input.organization_id||!input.root_key_id||!Array.isArray(input.keys)||!input.keys.length)throw new TrustError('manifest_invalid');
 wireVersion(input.manifest_version);const p=structuredClone(input);p.issued_at=normalizeWireTime(p.issued_at);p.not_before=normalizeWireTime(p.not_before);p.expires_at=normalizeWireTime(p.expires_at);
 if(Date.parse(p.issued_at)>Date.parse(p.not_before)||Date.parse(p.not_before)>=Date.parse(p.expires_at))throw new TrustError('manifest_invalid');
 const ids=new Set<string>();p.keys=p.keys.map(k=>{if(!exact(k,['key_id','public_key','status','valid_from','valid_until'])||!k.key_id||ids.has(k.key_id)||!['active','retired'].includes(k.status))throw new TrustError('key_invalid');ids.add(k.key_id);b64urlBytes(k.public_key,32);k.valid_from=normalizeWireTime(k.valid_from);if(k.valid_until!==null)k.valid_until=normalizeWireTime(k.valid_until);if(k.valid_until!==null&&Date.parse(k.valid_until)<=Date.parse(k.valid_from))throw new TrustError('key_invalid');return k;}).sort((a,b)=>a.key_id<b.key_id?-1:a.key_id>b.key_id?1:0);
 return p;
}
export async function signTrustManifest(input:TrustPayload,rootPkcs8:ArrayBuffer):Promise<SignedArtifact<TrustPayload>>{
 const payload=normalizeTrustPayload(input),canonical=canonicalizeJson(payload);return {payload,integrity:{canonicalization:'JCS-RFC8785',digest_algorithm:'SHA-256',digest:await digestWire(payload),signature_algorithm:'Ed25519',key_id:payload.root_key_id,signature:base64ToBase64url(await signWithDomain(TRUST_DOMAIN,canonical,rootPkcs8))}};
}
export async function verifyTrustManifest(envelope:SignedArtifact<TrustPayload>,rootKeyId:string,rootPublicKey:string,now:string){
 if(!exact(envelope,['payload','integrity'])||!exact(envelope.integrity,['canonicalization','digest_algorithm','digest','signature_algorithm','key_id','signature'])
  ||envelope.integrity.canonicalization!=='JCS-RFC8785'||envelope.integrity.digest_algorithm!=='SHA-256'||envelope.integrity.signature_algorithm!=='Ed25519'||envelope.integrity.key_id!==rootKeyId)throw new TrustError('integrity_invalid');
 const payload=normalizeTrustPayload(envelope.payload);if(payload.root_key_id!==rootKeyId||envelope.integrity.digest!==await digestWire(payload))throw new TrustError('integrity_invalid');
 const signature=envelope.integrity.signature.replace(/-/g,'+').replace(/_/g,'/'),root=new Uint8Array(b64urlBytes(rootPublicKey,32));if(!await verifyWithDomain(TRUST_DOMAIN,canonicalizeJson(payload),signature,root.buffer))throw new TrustError('signature_invalid');
 const at=Date.parse(normalizeWireTime(now));if(at<Date.parse(payload.not_before)||at>=Date.parse(payload.expires_at))throw new TrustError('manifest_expired');return payload;
}
export async function persistTrustManifest(db:D1Database,envelope:SignedArtifact<TrustPayload>,options:{allowTestFixtures?:boolean;expectedVersion?:string|null}={}){
 const p=envelope.payload;if(options.allowTestFixtures!==true)throw new TrustError('provisioning_unavailable');
 const expected=options.expectedVersion??null;if(wireVersion(p.manifest_version)!==(expected===null?1n:wireVersion(expected)+1n))throw new TrustError('version_conflict');
 const raw=canonicalizeJson(envelope);try{await db.prepare(`INSERT INTO authority_trust_manifests(organization_id,manifest_version,base_manifest_version,issuer,manifest_id,issued_at,expires_at,digest,envelope_json,test_fixture) VALUES(?,?,?,?,?,?,?,?,?,1)`).bind(p.organization_id,p.manifest_version,expected,p.issuer,p.manifest_id,p.issued_at,p.expires_at,envelope.integrity.digest,raw).run();}catch(e){throw new TrustError(String(e).includes('version_conflict')?'version_conflict':'storage_conflict');}return raw;
}
export async function loadTrustManifest(db:D1Database,org:string){const row=await db.prepare(`SELECT m.envelope_json FROM authority_trust_heads h JOIN authority_trust_manifests m ON m.organization_id=h.organization_id AND m.manifest_version=h.manifest_version WHERE h.organization_id=?`).bind(org).first<{envelope_json:string}>();if(row)return row.envelope_json;if(await db.prepare('SELECT manifest_version FROM authority_trust_manifests WHERE organization_id=? LIMIT 1').bind(org).first())throw new TrustError('recovery_required');return null;}
