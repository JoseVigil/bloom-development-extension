import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {authorityHumanResponse,configuredAuthorityHumanResponse,type HumanRouteServices} from '../src/authority/administration-route';
import {persistEmission,loadCurrentEmission} from '../src/authority/emission-store';
const vector=JSON.parse(readFileSync(new URL('../../docs/ROLES/fixtures/authority_interop_v1.json',import.meta.url),'utf8'));
const origin='https://authority.test',now='2026-09-08T12:05:00Z',owner='p-😀';
const master=['authority.membership.manage','authority.role_definition.manage','authority.assignment.manage','authority.binding.approve','authority.cutover.approve','mandate.create','mandate.sign','mandate.promote','mandate.install','intent.create','intent.cor.merge'];
let db:D1Database,mf:Miniflare,temp:string,n=0;
const services:HumanRouteServices={origin,now:()=>now,encryptionKey:Buffer.alloc(32,4).toString('base64'),allowTestFixtures:true,
 signer:{privateKeyPkcs8:Uint8Array.from(Buffer.from(vector.private_key_pkcs8_base64,'base64')).buffer,keyId:vector.key_id,allowTestFixtures:true},
 provider:{source:'test-fixture',authorize:(state,challenge)=>`https://fixture.test/?state=${state}&challenge=${challenge}`,exchange:async code=>({token:code,expiresIn:28800}),identify:async token=>({subject:token==='owner'?'123456789':'987',handle:token})}};
beforeAll(async()=>{
 temp=mkdtempSync(join(tmpdir(),'authority-2b-route-'));
 mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',cf:false,modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-29',d1Databases:{DB:'human-route'}}),resourcePersistencePath:temp});db=await mf.getD1Database('DB') as unknown as D1Database;
 await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY)').run();
 for(const file of ['0001_authority_snapshot.sql','0004_authority_emissions.sql','0005_authority_administration.sql','0006_authority_human_identity.sql']){
  const sql=readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').replace(/--[^\r\n]*/g,'').trim();for(const part of sql.split(/;\s*(?=CREATE\b)/i))await db.prepare(part).run();
 }
},60000);
afterAll(async()=>{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});});
async function initialize(){
 const org=`route-${++n}`;await db.prepare('INSERT INTO organizations VALUES(?)').bind(org).run();
 const state=structuredClone(vector.base_state),metadata=structuredClone(vector.metadata.base);
 state.memberships[0].organization_id=org;metadata.organization_id=org;metadata.audience.organization_id=org;metadata.issued_at=now;metadata.not_before=now;
 state.role_definitions.push({role_id:'master',role_version:'1',role_origin:'builtin',display_name:'Master',status:'active',permissions:master});
 state.role_assignments.push({...state.role_assignments[0],assignment_id:'owner-master',role_id:'master',role_version:'1',scope:{type:'organization',id:org}});
 await persistEmission(db,{requestId:'fixture',expectedVersion:null,metadata,state,initialFixtureEvidence:{environment:'test',reference:'route'}},services.signer);
 for(const [id,subject] of [[owner,'123456789'],['new-human','987']])await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,?,'fixture:mapping','test-fixture','1','active',NULL,'')").bind(org,id,subject).run();
 return org;
}
function post(path:string,body:unknown,session?:{cookie:string;csrf:string},extra:Record<string,string>={}){
 return authorityHumanResponse(db,new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-Authority-CSRF':session.csrf}:{}),...extra},body:JSON.stringify(body)}),services);
}
async function login(org:string,who='owner'){
 const start=await post('/v1/authority/human/login',{organizationId:org});expect(start.status).toBe(200);
 const data=await start.json() as any,state=new URL(data.authorizationUrl).searchParams.get('state');
 const response=await authorityHumanResponse(db,new Request(origin+`/v1/authority/human/callback?state=${state}&code=${who}`,{headers:{Cookie:start.headers.get('Set-Cookie')!.split(';')[0]}}),services);
 expect(response.status).toBe(200);const body=await response.json() as any;
 expect(body).not.toHaveProperty('token');const cookies=response.headers.getSetCookie();
 return {cookie:cookies.find(c=>c.startsWith('__Host-authority-session='))!.split(';')[0],csrf:body.csrf};
}
describe('isolated human/admin HTTP journey on temporary D1',()=>{
 it('authenticates, imports initial human, accepts membership and preserves idempotent receipt after clock advances',async()=>{
  const org=await initialize(),admin=await login(org),recipient=await login(org,'recipient');
  const before=(await loadCurrentEmission(db,org))!;
  const body={organizationId:org,requestId:'proposal',expectedVersion:before.metadata.authority_version,command:{kind:'propose_membership',proposalId:'new',membershipId:'m-new',principalId:'new-human',validFrom:now,validUntil:null}};
  const proposed=await post('/v1/authority/administration',body,admin);expect(await proposed.clone().json()).not.toHaveProperty('error');expect(proposed.status).toBe(200);
  const receipt=await proposed.json() as any;
  expect((await loadCurrentEmission(db,org))!.state.memberships.some(m=>m.membership_id==='m-new')).toBe(false);
  const accepted=await post('/v1/authority/administration',{organizationId:org,requestId:'accept',expectedVersion:receipt.authorityVersion,command:{kind:'accept',proposalId:'new'}},recipient);expect(await accepted.clone().json()).not.toHaveProperty('error');expect(accepted.status).toBe(200);
  expect((await loadCurrentEmission(db,org))!.state.memberships.find(m=>m.membership_id==='m-new')).toMatchObject({status:'active',principal_id:'new-human'});
  const retry=await authorityHumanResponse(db,new Request(origin+'/v1/authority/administration',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:admin.cookie,'X-Authority-CSRF':admin.csrf},body:JSON.stringify(body)}),{...services,now:()=> '2026-09-08T12:06:00Z'});
  expect(retry.status).toBe(200);expect(await retry.json()).toEqual(receipt);
  expect((await db.prepare('SELECT COUNT(*) AS n FROM authority_human_commit_guards WHERE organization_id=?').bind(org).first())?.n).toBe(2);
  const conflict=await post('/v1/authority/administration',{...body,command:{kind:'accept',proposalId:'new'}},admin);expect(conflict.status).toBe(409);
 },30000);
 it('converges simultaneous HTTP retries despite independent server metadata',async()=>{
  const org=await initialize(),admin=await login(org);
  const body={organizationId:org,requestId:'concurrent',expectedVersion:vector.metadata.base.authority_version,command:{kind:'suspend_assignment',assignmentId:'owner-master'}};
  const responses=await Promise.all([post('/v1/authority/administration',body,admin),post('/v1/authority/administration',body,admin)]);
  expect(responses.map(r=>r.status)).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());
  expect((await db.prepare('SELECT COUNT(*) AS n FROM authority_admin_requests WHERE organization_id=?').bind(org).first())?.n).toBe(1);
 },30000);
 it('rejects CSRF, declared actor, wrong organization and unauthenticated callers',async()=>{
  const org=await initialize(),session=await login(org),body={organizationId:org,requestId:'x',expectedVersion:vector.metadata.base.authority_version,command:{kind:'revoke_assignment',assignmentId:'owner-master'}};
  expect((await post('/v1/authority/administration',body,session,{Origin:'https://evil.test'})).status).toBe(403);
  expect((await post('/v1/authority/administration',body,session,{'X-Authority-CSRF':'wrong'})).status).toBe(403);
  expect((await post('/v1/authority/administration',{...body,actorId:owner},session)).status).toBe(400);
  expect((await post('/v1/authority/administration',body)).status).toBe(403);
  expect((await post('/v1/authority/administration',{...body,organizationId:await initialize()},session)).status).toBe(401);
  expect((await loadCurrentEmission(db,org))!.metadata.authority_version).toBe(body.expectedVersion);
 });
 it('login grants no organizational permissions and logout makes the session unusable',async()=>{
  const org=await initialize(),session=await login(org,'recipient');
  const response=await post('/v1/authority/administration',{organizationId:org,requestId:'self',expectedVersion:vector.metadata.base.authority_version,command:{kind:'revoke_assignment',assignmentId:'owner-master'}},session);
  expect(response.status).toBe(403);
  expect((await post('/v1/authority/human/logout',{organizationId:org},session)).status).toBe(200);
  expect((await post('/v1/authority/human/renew',{organizationId:org},session)).status).toBe(403);
 });
 it('configured production entry fails closed without config and never enables fixtures',async()=>{
  const r=await configuredAuthorityHumanResponse({DB:db,AUTHORITY_SIGNING_KEY_ID:'',AUTHORITY_SIGNING_KEY_PKCS8_B64:''},new Request(origin+'/v1/authority/human/login'));
  expect(r.status).toBe(503);expect(await r.text()).not.toContain('test-fixture');
 });
});
