import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {beginHumanLogin,finishHumanLogin,resolveHumanSession,renewHumanSession,revokeHumanSession,checkSessionCsrf,type HumanServices} from '../src/authority/human-session-store';
import {HumanIdentityError} from '../src/authority/human-identity';
let db:D1Database,mf:Miniflare,temp:string,n=0;
const now='2026-09-09T12:00:00Z';
const services:HumanServices={now:()=>now,encryptionKey:Buffer.alloc(32,7).toString('base64'),allowTestFixtures:true,provider:{source:'test-fixture',authorize:(state,challenge)=>`https://fixture.test/?state=${state}&challenge=${challenge}`,exchange:async()=>({token:'fixture-provider-token',expiresIn:28800}),identify:async()=>({subject:'123',handle:'human'})}};
beforeAll(async()=>{
 temp=mkdtempSync(join(tmpdir(),'authority-2b-sessions-'));
 mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',cf:false,modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:'2026-08-29',d1Databases:{DB:'human-sessions'}}),resourcePersistencePath:temp});
 db=await mf.getD1Database('DB') as unknown as D1Database;
 await db.prepare('CREATE TABLE organizations(id TEXT PRIMARY KEY)').run();
 await db.prepare('CREATE TABLE authority_admin_requests(organization_id TEXT,request_id TEXT,actor_id TEXT,PRIMARY KEY(organization_id,request_id))').run();
 const sql=readFileSync(new URL('../migrations/0006_authority_human_identity.sql',import.meta.url),'utf8').replace(/--[^\r\n]*/g,'').trim();
 for(const part of sql.split(/;\s*(?=CREATE\b)/i))await db.prepare(part).run();
},60000);
afterAll(async()=>{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});});
async function org(mapped=true){const id=`human-${++n}`;await db.prepare('INSERT INTO organizations VALUES(?)').bind(id).run();
 if(mapped)await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,'123','fixture:explicit','test-fixture','1','active',NULL,'')").bind(id,'human').run();return id;}
async function login(id:string,s=services){const f=await beginHumanLogin(db,id,s);return finishHumanLogin(db,{...f,code:'fixture-code'},s);}
describe('human sessions on temporary D1',()=>{
 it('requires explicit correspondence and admits no fixture fallback',async()=>{
  await expect(login(await org(false))).rejects.toThrow('correspondence_missing');
  await expect(login(await org(),{...services,allowTestFixtures:false})).rejects.toThrow('fixture_forbidden');
 });
 it('binds state to browser, consumes once and rejects expired flow',async()=>{
  const id=await org(),f=await beginHumanLogin(db,id,services);
  await expect(finishHumanLogin(db,{...f,browser:'other',code:'x'},services)).rejects.toThrow('flow_invalid');
  const both=await Promise.allSettled([finishHumanLogin(db,{...f,code:'x'},services),finishHumanLogin(db,{...f,code:'x'},services)]);
  expect(both.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const expired=await beginHumanLogin(db,id,services);
  await expect(finishHumanLogin(db,{...expired,code:'x'},{...services,now:()=> '2026-09-09T12:05:00Z'})).rejects.toThrow('flow_invalid');
 });
 it('stores hashed credentials, encrypted provider token and no roles',async()=>{
  const id=await org(),session=await login(id),row=await db.prepare('SELECT * FROM authority_human_sessions WHERE session_id=?').bind(session.sessionId).first();
  expect(JSON.stringify(row)).not.toContain(session.token);expect(JSON.stringify(row)).not.toContain(session.csrf);expect(JSON.stringify(row)).not.toContain('fixture-provider-token');expect(row).not.toHaveProperty('roles');
  expect(await resolveHumanSession(db,session.token,id,services)).toMatchObject({principalId:'human',source:'backend-session'});
  expect(await resolveHumanSession(db,session.token,await org(),services)).toBeNull();
  await expect(checkSessionCsrf(db,session.token,'wrong')).rejects.toThrow('csrf_invalid');
  await checkSessionCsrf(db,session.token,session.csrf);
 });
 it('rotates once under concurrent renewal, invalidates old token and bounds expiry',async()=>{
  const id=await org(),session=await login(id),results=await Promise.allSettled([renewHumanSession(db,session.token,id,services),renewHumanSession(db,session.token,id,services)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await resolveHumanSession(db,session.token,id,services)).toBeNull();
  const next=(results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof renewHumanSession>>>).value;
  expect(next.expiresAt).toBe('2026-09-09T12:15:00.000Z');await revokeHumanSession(db,next.token);expect(await resolveHumanSession(db,next.token,id,services)).toBeNull();
 });
 it('rejects expiration, changed identity revision and observed provider revocation',async()=>{
  const id=await org(),session=await login(id);
  expect(await resolveHumanSession(db,session.token,id,{...services,now:()=> '2026-09-09T12:15:00Z'})).toBeNull();
  const revoked={...services,provider:{...services.provider,identify:async()=>{throw new HumanIdentityError('provider_revoked');}}};
  expect(await resolveHumanSession(db,session.token,id,revoked)).toBeNull();
  expect(await resolveHumanSession(db,session.token,id,services)).toBeNull();
  const second=await login(id);await db.prepare("UPDATE authority_human_identities SET revision='2' WHERE organization_id=?").bind(id).run();
  expect(await resolveHumanSession(db,second.token,id,services)).toBeNull();
 });
 it('outage denies authentication without falsely recording revocation',async()=>{
  const id=await org(),session=await login(id);
  await expect(resolveHumanSession(db,session.token,id,{...services,provider:{...services.provider,identify:async()=>{throw new HumanIdentityError('provider_unavailable');}}})).rejects.toThrow('provider_unavailable');
  expect(await resolveHumanSession(db,session.token,id,services)).not.toBeNull();
 });
 it('prevents remapping or resurrecting a revoked external correspondence',async()=>{
  const id=await org();await expect(db.prepare("UPDATE authority_human_identities SET subject='other' WHERE organization_id=?").bind(id).run()).rejects.toThrow('identity_conflict');
  await db.prepare("UPDATE authority_human_identities SET status='revoked' WHERE organization_id=?").bind(id).run();
  await expect(db.prepare("UPDATE authority_human_identities SET status='active' WHERE organization_id=?").bind(id).run()).rejects.toThrow('identity_conflict');
 });
});
