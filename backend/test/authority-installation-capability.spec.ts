import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {canonicalizeJson,signWithDomain} from '../src/authority/canonical';
import {INSTALLATION_CAPABILITY_DOMAIN,installationSupports,loadInstallationCapabilities,updateInstallationCapabilities} from '../src/authority/installation-capability';
import {readInstallationCapabilityResponse} from '../src/authority/installation-capability-route';
import {registerInstallationKey} from '../src/authority/identity';

let db:D1Database,mf:Miniflare,temp:string;
const org='cap-org',otherOrg='cap-other',now=new Date('2026-09-30T12:00:00Z');
const load=async(file:string)=>{const sql=readFileSync(join(process.cwd(),'migrations',file),'utf8').replace(/--[^\r\n]*/g,'').trim();for(const s of sql.split(/;\s*(?=(?:CREATE|INSERT)\b)/i).filter(Boolean))await db.prepare(s).run();};
const raw=Buffer.alloc(32,7).toString('base64');

async function keypair(){const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;return {privateKey:await crypto.subtle.exportKey('pkcs8',pair.privateKey) as ArrayBuffer,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('base64')};}
async function unheaded(installationId:string,organizationId=org){const pair=await keypair();await db.prepare("INSERT INTO installation_keys(installation_id,organization_id,public_key_raw,status,registered_at) VALUES(?,?,?,'active',0)").bind(installationId,organizationId,pair.publicKey).run();return pair.privateKey;}
async function request(privateKey:ArrayBuffer,installationId:string,organizationId:string,id:string,revision:string,versions:('1.0'|'1.1')[]){const timestamp=now.toISOString(),payload={organization_id:organizationId,installation_id:installationId,request_id:id,expected_revision:revision,supported_authority_schema_versions:[...versions].sort(),timestamp};return {organizationId,installationId,requestId:id,expectedRevision:revision,supportedAuthoritySchemaVersions:versions,timestamp,signature:await signWithDomain(INSTALLATION_CAPABILITY_DOMAIN,canonicalizeJson(payload),privateKey)};}

beforeAll(async()=>{temp=mkdtempSync(join(tmpdir(),'authority-capability-'));mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',cf:false,modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-29',d1Databases:{DB:'capability'}}),resourcePersistencePath:temp});db=await mf.getD1Database('DB') as unknown as D1Database;
 await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY)').run();await db.prepare('INSERT INTO organizations VALUES(?),(?)').bind(org,otherOrg).run();await load('0002_authority_security.sql');await load('0022_authority_intelligence_supply_grants.sql');
 await db.prepare("INSERT INTO installation_keys(installation_id,organization_id,public_key_raw,status,registered_at) VALUES('legacy-active',?,?, 'active',0),('legacy-revoked',?,?, 'revoked',0),('legacy-existing',?,?, 'active',0)").bind(org,raw,org,raw,org,raw).run();
 await db.prepare(`INSERT INTO authority_installation_capability_declarations(organization_id,installation_id,revision,request_id,request_digest,supported_authority_schema_versions_json,source,declared_at) VALUES (?,?,'1','existing','existing','["1.0","1.1"]','registration','2026-09-01T00:00:00Z')`).bind(org,'legacy-existing').run();
 await load('0023_authority_installation_capability_backfill.sql');await load('0023_authority_installation_capability_backfill.sql');
},60000);
afterAll(async()=>{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});});

describe('installation Authority schema capability bootstrap',()=>{
 it('backfills only active installations without a head and is repeatable',async()=>{expect(await loadInstallationCapabilities(db,org,'legacy-active')).toMatchObject({revision:'1',supportedAuthoritySchemaVersions:['1.0'],source:'registration'});expect(await loadInstallationCapabilities(db,org,'legacy-revoked')).toBeNull();expect(await loadInstallationCapabilities(db,org,'legacy-existing')).toMatchObject({revision:'1',supportedAuthoritySchemaVersions:['1.0','1.1']});expect((await db.prepare("SELECT COUNT(*) n FROM authority_installation_capability_declarations WHERE installation_id='legacy-active'").first<{n:number}>())?.n).toBe(1);});

 it('bootstraps revision 1 with a signed expectedRevision 0 and replays idempotently',async()=>{const id='bootstrap-one',privateKey=await unheaded(id),input=await request(privateKey,id,org,'bootstrap','0',['1.0','1.1']);const first=await updateInstallationCapabilities(db,input,now);expect(first).toEqual({installationId:id,revision:'1',supportedAuthoritySchemaVersions:['1.0','1.1']});expect(await updateInstallationCapabilities(db,input,now)).toEqual(first);});

 it('converges concurrent identical bootstrap requests',async()=>{const id='bootstrap-race',privateKey=await unheaded(id),input=await request(privateKey,id,org,'race','0',['1.0']);const [a,b]=await Promise.all([updateInstallationCapabilities(db,input,now),updateInstallationCapabilities(db,input,now)]);expect(a).toEqual(b);expect((await db.prepare('SELECT COUNT(*) n FROM authority_installation_capability_declarations WHERE installation_id=?').bind(id).first<{n:number}>())?.n).toBe(1);});

 it('rejects conflicting bootstrap replay and revision 0 after a head exists',async()=>{const id='bootstrap-conflict',privateKey=await unheaded(id),first=await request(privateKey,id,org,'same','0',['1.0']);await updateInstallationCapabilities(db,first,now);await expect(updateInstallationCapabilities(db,await request(privateKey,id,org,'same','0',['1.0','1.1']),now)).rejects.toThrow('idempotency_conflict');await expect(updateInstallationCapabilities(db,await request(privateKey,id,org,'another','0',['1.0']),now)).rejects.toThrow('revision_conflict');});

 it('reads only the authenticated installation and exposes revision recovery',async()=>{const id='read-own',privateKey=await unheaded(id);let response=await readInstallationCapabilityResponse(db,new Request(`https://backend.test/v1/authority/installations/capabilities?org=${org}`),{organizationId:org,installationId:id});expect(response.status).toBe(404);expect(await response.json()).toEqual({error:'authority_installation_capability_unavailable',bootstrapExpectedRevision:'0'});await updateInstallationCapabilities(db,await request(privateKey,id,org,'read-bootstrap','0',['1.0']),now);response=await readInstallationCapabilityResponse(db,new Request(`https://backend.test/v1/authority/installations/capabilities?org=${org}`),{organizationId:org,installationId:id});expect(await response.json()).toMatchObject({organizationId:org,installationId:id,revision:'1',supportedAuthoritySchemaVersions:['1.0'],source:'signed_update'});expect((await readInstallationCapabilityResponse(db,new Request(`https://backend.test/v1/authority/installations/capabilities?org=${org}&installation_id=other`),{organizationId:org,installationId:id})).status).toBe(403);});

 it('recovers the remote revision and performs a correct CAS while rejecting stale and cross-organization updates',async()=>{const id='cas-installation',privateKey=await unheaded(id);await updateInstallationCapabilities(db,await request(privateKey,id,org,'cas-bootstrap','0',['1.0']),now);const remote=(await loadInstallationCapabilities(db,org,id))!;expect(remote.revision).toBe('1');expect(await updateInstallationCapabilities(db,await request(privateKey,id,org,'cas-upgrade',remote.revision,['1.0','1.1']),now)).toMatchObject({revision:'2'});await expect(updateInstallationCapabilities(db,await request(privateKey,id,org,'cas-stale','1',['1.0','1.1']),now)).rejects.toThrow('revision_conflict');await expect(updateInstallationCapabilities(db,await request(privateKey,id,otherOrg,'cross-org','0',['1.0']),now)).rejects.toThrow('installation_unavailable');});

 it('permanently rejects removing 1.1 after it was accepted',async()=>{const id='no-downgrade',privateKey=await unheaded(id);await updateInstallationCapabilities(db,await request(privateKey,id,org,'accept-11','0',['1.0','1.1']),now);await expect(updateInstallationCapabilities(db,await request(privateKey,id,org,'drop-11','1',['1.0']),now)).rejects.toThrow('downgrade_blocked');expect(await installationSupports(db,org,id,'1.1')).toBe(true);});

 it('new registration always creates a head, defaulting to 1.0 when omitted',async()=>{for(const [id,versions,expected] of [['new-default',undefined,['1.0']],['new-explicit',['1.0','1.1'],['1.0','1.1']]] as const){const pair=await keypair();expect((await registerInstallationKey(db,{installationId:id,organizationId:org,publicKeyRaw:pair.publicKey,...(versions?{supportedAuthoritySchemaVersions:[...versions]}:{})})).ok).toBe(true);expect((await loadInstallationCapabilities(db,org,id))?.supportedAuthoritySchemaVersions).toEqual(expected);}});

 it('keeps declaration history immutable',async()=>{await expect(db.prepare('DELETE FROM authority_installation_capability_declarations').run()).rejects.toThrow('history_immutable');});
});

