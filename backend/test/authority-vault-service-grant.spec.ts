import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { administerVaultServiceGrant, type GrantCommand } from '../src/authority/vault-service-grant';
import { loadCurrentEmission, persistEmission } from '../src/authority/emission-store';
import { withBuiltinCatalog } from '../src/authority/emission';
import { authorityHumanResponse } from '../src/authority/administration-route';
import { beginHumanLogin, finishHumanLogin, type HumanServices } from '../src/authority/human-session-store';
import type { WireFullContent } from '../src/authority/schema';

let db:D1Database,mf:Miniflare,temp:string,privateKey:ArrayBuffer;
const org='grant-org',installation='installation-1',now='2026-09-25T12:00:00Z';
const actor={organizationId:org,principalId:'human-master',sessionId:'session',expiresAt:'2026-09-25T13:00:00Z',source:'backend-session' as const};
const services=()=>({now:()=>now,issuer:'issuer',signer:{privateKeyPkcs8:privateKey,keyId:'key'},
  commitGuard:()=>db.prepare('SELECT 1')});

async function seed() {
  const state:WireFullContent=withBuiltinCatalog({principals:[{principal_id:'human-master',principal_type:'human',status:'active',
    external_identities:[{provider:'github',subject:'123',display_handle:'master',status:'verified',verified_at:now}]}],
    memberships:[{membership_id:'membership',principal_id:'human-master',organization_id:org,status:'active',valid_from:now,valid_until:null,accepted_at:now}],
    role_definitions:[],role_assignments:[{assignment_id:'assignment',membership_id:'membership',role_id:'master',role_version:'1',
      scope:{type:'organization',id:org},status:'active',valid_from:now,valid_until:null,accepted_at:now}],revocations:[]});
  for(const role of ['specialist','operator'] as const){
    state.principals.push({principal_id:`human-${role}`,principal_type:'human',status:'active',
      external_identities:[{provider:'github',subject:role,display_handle:role,status:'verified',verified_at:now}]});
    state.memberships.push({membership_id:`membership-${role}`,principal_id:`human-${role}`,organization_id:org,
      status:'active',valid_from:now,valid_until:null,accepted_at:now});
    state.role_assignments.push({assignment_id:`assignment-${role}`,membership_id:`membership-${role}`,role_id:role,role_version:'1',
      scope:{type:'organization',id:org},status:'active',valid_from:now,valid_until:null,accepted_at:now});
  }
  await persistEmission(db,{requestId:'initial',expectedVersion:null,metadata:{schema:'bloom.authority.snapshot',schema_version:'1.0',
    snapshot_id:'initial',issuer:'issuer',organization_id:org,authority_version:'1',issued_at:now,not_before:now,
    expires_at:'2026-09-25T12:04:00Z',audience:{organization_id:org,installation_ids:[installation]}},state,
    initialFixtureEvidence:{environment:'test',reference:'grant-fixture'}},{privateKeyPkcs8:privateKey,keyId:'key',allowTestFixtures:true});
}

beforeAll(async()=>{
  temp=mkdtempSync(join(tmpdir(),'authority-grant-'));
  mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',cf:false,modules:true,
    script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-29',d1Databases:{DB:'authority-grant'}}),resourcePersistencePath:temp});
  db=await mf.getD1Database('DB') as unknown as D1Database;
  await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY)').run();
  for(const name of ['0001_authority_snapshot.sql','0002_authority_security.sql','0004_authority_emissions.sql',
    '0005_authority_administration.sql','0006_authority_human_identity.sql','0020_authority_vault_service_grants.sql']){
    const sql=readFileSync(join(process.cwd(),'migrations',name),'utf8').replace(/--[^\r\n]*/g,'').trim();
    for(const statement of sql.split(/;\s*(?=(?:CREATE|ALTER)\b)/i).filter(Boolean))await db.prepare(statement).run();
  }
  await db.prepare('INSERT INTO organizations VALUES(?)').bind(org).run();
  await db.prepare("INSERT INTO installation_keys (installation_id,organization_id,public_key_raw,status,registered_at) VALUES (?,?,?,'active',0)")
    .bind(installation,org,'registered-key').run();
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
  privateKey=await crypto.subtle.exportKey('pkcs8',pair.privateKey) as ArrayBuffer;
  await seed();
},60000);
afterAll(async()=>{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});},30000);

describe('Vault service grant',()=>{
  const issue:GrantCommand={kind:'issue',installationId:installation,keyId:'anthropic-key:default',
    servicePublicKey:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',validUntil:'2026-09-25T12:30:00Z'};
  it('requires a current human Master and registered installation',async()=>{
    for(const role of ['specialist','operator'] as const)
      await expect(administerVaultServiceGrant(db,{organizationId:org,requestId:`wrong-${role}`,expectedVersion:'1',command:issue},
        {...actor,principalId:`human-${role}`},services())).rejects.toThrow('master_required');
    await expect(administerVaultServiceGrant(db,{organizationId:org,requestId:'installation-alone',expectedVersion:'1',command:issue},
      null as never,services())).rejects.toThrow('actor_unverified');
    await expect(administerVaultServiceGrant(db,{organizationId:org,requestId:'wrong-installation',expectedVersion:'1',
      command:{...issue,installationId:'other'}},actor,services())).rejects.toThrow('installation_unavailable');
    await expect(administerVaultServiceGrant(db,{organizationId:org,requestId:'wrong-key',expectedVersion:'1',
      command:{...issue,keyId:'other' as 'anthropic-key:default'}},actor,services())).rejects.toThrow('invalid_request');
    expect((await loadCurrentEmission(db,org))?.metadata.authority_version).toBe('1');
  });
  it('emits, replays and revokes without changing the immutable grant',async()=>{
    const input={organizationId:org,requestId:'issue-1',expectedVersion:'1',command:issue};
    const issued=await administerVaultServiceGrant(db,input,actor,services());
    expect(issued.status).toBe('issued');
    expect(await administerVaultServiceGrant(db,input,actor,services())).toEqual(issued);
    const state=(await loadCurrentEmission(db,org))!.state;
    expect(state.vault_service_grants).toHaveLength(1);
    expect(state.vault_service_grants![0].grant_id).toBe(issued.grantId);
    expect(JSON.stringify(issued)).not.toContain('secret');
    const revoked=await administerVaultServiceGrant(db,{organizationId:org,requestId:'revoke-1',expectedVersion:'2',
      command:{kind:'revoke',grantId:issued.grantId}},actor,services());
    expect(revoked.status).toBe('revoked');
    const final=(await loadCurrentEmission(db,org))!.state;
    expect(final.vault_service_grants).toEqual(state.vault_service_grants);
    expect(final.revocations.some(r=>r.target_type==='vault_service_grant' && r.target_id===issued.grantId)).toBe(true);
  });
  it('requires the human session and CSRF on the HTTP route',async()=>{
    await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,'123','canonical:github','canonical','1','active',NULL,'')")
      .bind(org,actor.principalId).run();
    const human:HumanServices={now:()=>now,encryptionKey:Buffer.alloc(32,4).toString('base64'),provider:{source:'github-app',
      authorize:()=> 'https://github.test',exchange:async()=>({token:'ghu',expiresIn:28800}),identify:async()=>({subject:'123',handle:'master'})}};
    const flow=await beginHumanLogin(db,org,human);
    const login=await finishHumanLogin(db,{...flow,code:'code'},human);
    const origin='https://authority.test';
    const body=JSON.stringify({organizationId:org,requestId:'http-issue',expectedVersion:'3',command:issue});
    const make=(csrf:string)=>new Request(origin+'/v1/authority/vault-service-grant',{method:'POST',headers:{Origin:origin,
      'Content-Type':'application/json','X-Authority-CSRF':csrf,Cookie:`__Host-authority-session=${login.token}`},body});
    const routeServices={...human,origin,issuer:'issuer',signer:{privateKeyPkcs8:privateKey,keyId:'key'}};
    expect((await authorityHumanResponse(db,make('wrong'),routeServices)).status).toBe(403);
    const anonymous=new Request(origin+'/v1/authority/vault-service-grant',{method:'POST',headers:{Origin:origin,
      'Content-Type':'application/json','X-Authority-CSRF':login.csrf},body});
    expect((await authorityHumanResponse(db,anonymous,routeServices)).status).toBe(403);
    const forged=new Request(origin+'/v1/authority/vault-service-grant',{method:'POST',headers:{Origin:origin,
      'Content-Type':'application/json','X-Authority-CSRF':login.csrf,Cookie:`__Host-authority-session=${login.token}`},
      body:JSON.stringify({organizationId:org,requestId:'forged-role',expectedVersion:'3',command:{...issue,role:'master'}})});
    expect((await authorityHumanResponse(db,forged,routeServices)).status).toBe(400);
    const response=await authorityHumanResponse(db,make(login.csrf),routeServices);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({status:'issued',authorityVersion:'4'});
  });
  it('rejects issuance after the Master assignment is revoked',async()=>{
    const current=(await loadCurrentEmission(db,org))!;
    const state=structuredClone(current.state);
    state.revocations.push({revocation_id:'revoke-master',target_type:'role_assignment',target_id:'assignment',
      effective_at:now,recorded_in_authority_version:'5',reason_code:'master_revocation'});
    await persistEmission(db,{requestId:'revoke-master',expectedVersion:'4',metadata:{...current.metadata,authority_version:'5',
      snapshot_id:'revoke-master',issued_at:now,not_before:now,expires_at:'2026-09-25T12:04:00Z'},state},services().signer);
    await expect(administerVaultServiceGrant(db,{organizationId:org,requestId:'after-master-revoked',expectedVersion:'5',command:issue},
      actor,services())).rejects.toThrow('master_required');
  });
});
