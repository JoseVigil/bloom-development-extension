import { canonicalizeJson, digestWire, verifyWithDomain } from './canonical';
import { isWithinReplayWindow } from './identity';

export const INSTALLATION_CAPABILITY_DOMAIN='BLOOM-AUTHORITY-INSTALLATION-CAPABILITY-v1';
export class InstallationCapabilityError extends Error { constructor(readonly code:string){super(`authority_installation_capability_${code}`);} }
const fail=(code:string):never=>{throw new InstallationCapabilityError(code);};
export interface InstallationCapabilityRequest { organizationId:string;installationId:string;requestId:string;expectedRevision:string;supportedAuthoritySchemaVersions:("1.0"|"1.1")[];timestamp:string;signature:string }
export interface InstallationCapabilityDeclaration { installationId:string;revision:string;supportedAuthoritySchemaVersions:("1.0"|"1.1")[];source:'registration'|'signed_update';declaredAt:string }

export async function loadInstallationCapabilities(db:D1Database,organizationId:string,installationId:string):Promise<InstallationCapabilityDeclaration|null>{
  const row=await db.prepare(`SELECT d.revision,d.supported_authority_schema_versions_json AS versions,d.source,d.declared_at
    FROM authority_installation_capability_heads h JOIN authority_installation_capability_declarations d
    ON d.organization_id=h.organization_id AND d.installation_id=h.installation_id AND d.revision=h.revision
    WHERE h.organization_id=? AND h.installation_id=?`).bind(organizationId,installationId)
    .first<{revision:string;versions:string;source:'registration'|'signed_update';declared_at:string}>();
  if(!row)return null;
  return {installationId,revision:row.revision,supportedAuthoritySchemaVersions:JSON.parse(row.versions),source:row.source,declaredAt:row.declared_at};
}

export async function installationSupports(db:D1Database,organizationId:string,installationId:string,version:"1.0"|"1.1"):Promise<boolean>{
  if(version==='1.0')return true;
  const row=await db.prepare(`SELECT d.supported_authority_schema_versions_json AS versions
    FROM authority_installation_capability_heads h JOIN authority_installation_capability_declarations d
    ON d.organization_id=h.organization_id AND d.installation_id=h.installation_id AND d.revision=h.revision
    WHERE h.organization_id=? AND h.installation_id=?`).bind(organizationId,installationId).first<{versions:string}>();
  if(!row)return false;
  try{return (JSON.parse(row.versions) as unknown[]).includes(version);}catch{return false;}
}

async function everSupported11(db:D1Database,org:string,installation:string):Promise<boolean>{
  const rows=await db.prepare(`SELECT supported_authority_schema_versions_json AS versions
    FROM authority_installation_capability_declarations WHERE organization_id=? AND installation_id=?`)
    .bind(org,installation).all<{versions:string}>();
  return rows.results.some(row=>{try{return (JSON.parse(row.versions) as unknown[]).includes('1.1');}catch{return false;}});
}

export async function updateInstallationCapabilities(db:D1Database,input:InstallationCapabilityRequest,now=new Date()):Promise<{installationId:string;revision:string;supportedAuthoritySchemaVersions:string[]}> {
  if(!input.organizationId||!input.installationId||!input.requestId||input.requestId.length>200||!/^(?:0|[1-9][0-9]*)$/.test(input.expectedRevision)
    ||!isWithinReplayWindow(input.timestamp,now)||!input.signature)fail('invalid_request');
  const versions=[...new Set(input.supportedAuthoritySchemaVersions)].sort();
  if(!versions.length||versions.some(v=>v!=='1.0'&&v!=='1.1'))fail('invalid_request');
  const payload={organization_id:input.organizationId,installation_id:input.installationId,request_id:input.requestId,
    expected_revision:input.expectedRevision,supported_authority_schema_versions:versions,timestamp:input.timestamp};
  const requestDigest=await digestWire(payload),session=db.withSession('first-primary');
  const retry=async()=>{
    const row=await session.prepare(`SELECT request_digest,revision,supported_authority_schema_versions_json AS versions
      FROM authority_installation_capability_declarations WHERE organization_id=? AND installation_id=? AND request_id=?`)
      .bind(input.organizationId,input.installationId,input.requestId).first<{request_digest:string;revision:string;versions:string}>();
    if(!row)return null;if(row.request_digest!==requestDigest)fail('idempotency_conflict');
    return {installationId:input.installationId,revision:row.revision,supportedAuthoritySchemaVersions:JSON.parse(row.versions)};
  };
  const replay=await retry();if(replay)return replay;
  const key=await session.prepare(`SELECT public_key_raw FROM installation_keys WHERE organization_id=? AND installation_id=? AND status='active'`)
    .bind(input.organizationId,input.installationId).first<{public_key_raw:string}>();
  if(!key)throw new InstallationCapabilityError('installation_unavailable');
  const raw=Uint8Array.from(atob(key.public_key_raw),c=>c.charCodeAt(0)).buffer;
  if(!await verifyWithDomain(INSTALLATION_CAPABILITY_DOMAIN,canonicalizeJson(payload),input.signature,raw))fail('invalid_signature');
  const head=await session.prepare(`SELECT revision FROM authority_installation_capability_heads WHERE organization_id=? AND installation_id=?`)
    .bind(input.organizationId,input.installationId).first<{revision:string}>();
  if((!head&&input.expectedRevision!=='0')||(head&&head.revision!==input.expectedRevision))fail('revision_conflict');
  if(!versions.includes('1.1')&&await everSupported11(db,input.organizationId,input.installationId))fail('downgrade_blocked');
  const revision=String(BigInt(input.expectedRevision)+1n);
  try{await session.prepare(`INSERT INTO authority_installation_capability_declarations
    (organization_id,installation_id,revision,request_id,request_digest,supported_authority_schema_versions_json,source,declared_at)
    VALUES (?,?,?,?,?,?,'signed_update',?)`).bind(input.organizationId,input.installationId,revision,input.requestId,requestDigest,canonicalizeJson(versions),now.toISOString()).run();}
  catch(error){const won=await retry();if(won)return won;if(String(error).includes('conflict')||String(error).includes('UNIQUE'))fail('revision_conflict');throw error;}
  return {installationId:input.installationId,revision,supportedAuthoritySchemaVersions:versions};
}
