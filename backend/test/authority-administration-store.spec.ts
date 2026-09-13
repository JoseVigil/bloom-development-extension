import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { administerAuthority, type AdministrationRequest, type AdministrationServices } from "../src/authority/administration-store";
import { loadCurrentEmission, persistEmission } from "../src/authority/emission-store";
import type { AdministrationCommand } from "../src/authority/administration";
import { beginHumanLogin,finishHumanLogin,resolveHumanSession,revokeHumanSession,sessionCommitGuard,initialHumanIdentity,type HumanServices } from '../src/authority/human-session-store';

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const vector=JSON.parse(readFileSync(join(root,"docs/ROLES/fixtures/authority_interop_v1.json"),"utf8"));
const owner="p-😀",recipient="p-\uE000",now="2026-09-08T12:05:00Z";
const master=["authority.membership.manage","authority.role_definition.manage","authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign","mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate"];
const signer={privateKeyPkcs8:Uint8Array.from(Buffer.from(vector.private_key_pkcs8_base64,"base64")).buffer,keyId:vector.key_id,allowTestFixtures:true};
let mf:Miniflare,db:D1Database,temp:string,sequence=0;
const services:AdministrationServices={signer,now:()=>now,allowTestFixtures:true,verifyActor:async(proof,organizationId)=>{
  const principalId=proof==="owner"?owner:proof==="recipient"?recipient:null;
  return principalId?{principalId,organizationId,sessionId:`fixture-${proof}`,expiresAt:"2026-09-09T00:00:00Z",source:"test-fixture"}:null;
}};
async function initialize() {
  const org=`admin-test-${++sequence}`;await db.prepare("INSERT INTO organizations VALUES (?)").bind(org).run();
  const state=structuredClone(vector.base_state),metadata=structuredClone(vector.metadata.base);
  metadata.organization_id=org;metadata.audience.organization_id=org;metadata.issued_at=now;metadata.not_before=now;
  state.memberships[0].organization_id=org;
  state.principals[1].external_identities=[{provider:"github",subject:"recipient",display_handle:"recipient",status:"verified",verified_at:now}];
  state.memberships.push({...state.memberships[0],membership_id:"m-target",principal_id:recipient});
  state.role_definitions.push({role_id:"master",role_version:"1",role_origin:"builtin",display_name:"Master",status:"active",permissions:master},
    {role_id:"specialist",role_version:"1",role_origin:"builtin",display_name:"Specialist",status:"active",permissions:["intent.create"]});
  state.role_assignments.push({...state.role_assignments[0],assignment_id:"owner-master",role_id:"master",role_version:"1",scope:{type:"organization",id:org}});
  await persistEmission(db,{requestId:"fixture",expectedVersion:null,metadata,state,initialFixtureEvidence:{environment:"test",reference:"authority-admin"}},signer);
  return org;
}
const grant=(org:string):AdministrationCommand=>({kind:"propose_assignment",proposalId:"proposal",assignmentId:"target-grant",membershipId:"m-target",roleId:"specialist",roleVersion:"1",scope:{type:"organization",id:org},validFrom:now,validUntil:null});
async function request(org:string,id:string,command:AdministrationCommand,proof="owner"):Promise<AdministrationRequest>{
  const current=(await loadCurrentEmission(db,org))!;
  return {requestId:id,actorProof:proof,expectedVersion:current.metadata.authority_version,command,
    metadata:{...current.metadata,authority_version:String(BigInt(current.metadata.authority_version)+1n),snapshot_id:`admin-${id}`,issued_at:now,not_before:now}};
}
async function counts(org:string){
  return db.prepare(`SELECT (SELECT COUNT(*) FROM authority_emissions WHERE organization_id=?1) AS emissions,
    (SELECT COUNT(*) FROM authority_admin_requests WHERE organization_id=?1) AS requests,
    (SELECT COUNT(*) FROM authority_admin_audit WHERE organization_id=?1) AS audit,
    (SELECT COUNT(*) FROM authority_admin_outbox WHERE organization_id=?1) AS outbox,
    (SELECT authority_version FROM authority_emission_heads WHERE organization_id=?1) AS head`).bind(org).first();
}
// Real D1 transaction; inject a competing change immediately before its batch.
function interceptCommit(action:()=>Promise<void>):D1Database {
  return {withSession:(constraint:any)=>{
    const s=db.withSession(constraint);
    return {prepare:s.prepare.bind(s),batch:async(statements:D1PreparedStatement[])=>{await action();return s.batch(statements);},getBookmark:s.getBookmark.bind(s)};
  }} as unknown as D1Database;
}
beforeAll(async()=>{
  temp=mkdtempSync(join(tmpdir(),"authority-2a-store-"));
  mf=new Miniflare({...convertV4MiniflareOptions({host:"127.0.0.1",cf:false,modules:true,script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:"2026-08-29",d1Databases:{DB:"authority-2a"}}),resourcePersistencePath:temp});
  db=await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare("CREATE TABLE organizations (id TEXT PRIMARY KEY)").run();
  for(const file of ["0001_authority_snapshot.sql","0004_authority_emissions.sql","0005_authority_administration.sql","0006_authority_human_identity.sql"]){
    const sql=readFileSync(join(root,"backend/migrations",file),"utf8").replace(/--[^\r\n]*/g,"").trim();
    for(const statement of sql.split(/;\s*(?=CREATE\b)/i).filter(Boolean))await db.prepare(statement).run();
  }
},60000);
afterAll(async()=>{if(mf)await mf.dispose();if(temp)rmSync(temp,{recursive:true,force:true});},30000);

describe("administrative commit on temporary D1",()=>{
  it.each(['session','identity','recipient'])('aborts the complete administrative commit after a concurrent %s change',async changed=>{
    const org=await initialize();
    await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,'123456789','fixture:owner','test-fixture','1','active',NULL,'')").bind(org,owner).run();
    const hs:HumanServices={now:()=>now,encryptionKey:Buffer.alloc(32,9).toString('base64'),allowTestFixtures:true,provider:{source:'test-fixture',authorize:()=> 'https://fixture.test',exchange:async()=>({token:'fixture-provider',expiresIn:28800}),identify:async()=>({subject:'123456789',handle:'owner'})}};
    const flow=await beginHumanLogin(db,org,hs),login=await finishHumanLogin(db,{...flow,code:'fixture'},hs);
    await db.prepare("INSERT INTO authority_human_identities VALUES(?,'initial-human','987','fixture:recipient','test-fixture','1','active',?,'')").bind(org,now).run();
    const r=await request(org,'session-race',changed==='recipient'?{kind:'propose_membership',proposalId:'new-human',principalId:'initial-human',membershipId:'m-initial',validFrom:now,validUntil:null}:grant(org));r.actorProof=login.token;
    const before=await counts(org);
    const race=async()=>{if(changed==='session')await revokeHumanSession(db,login.token);else await db.prepare("UPDATE authority_human_identities SET revision='2' WHERE organization_id=? AND principal_id=?").bind(org,changed==='identity'?owner:'initial-human').run();};
    await expect(administerAuthority(interceptCommit(race),r,{...services,verifyActor:(proof,o)=>resolveHumanSession(db,proof,o,hs),initialIdentity:(o,id)=>initialHumanIdentity(db,o,id,hs),commitGuard:(a,id,at,p)=>sessionCommitGuard(db,a,id,at,p)})).rejects.toThrow(changed==='recipient'?'identity_conflict':'session_conflict');
    expect(await counts(org)).toEqual(before);
  });
  it('imports an initial verified recipient atomically without granting membership',async()=>{
    const org=await initialize();
    const principal={principal_id:'initial-human',principal_type:'human' as const,status:'active' as const,external_identities:[{provider:'github',subject:'initial-human',display_handle:'initial',status:'verified' as const,verified_at:now}]};
    const r=await request(org,'initial-human',{kind:'propose_membership',proposalId:'initial-human',principalId:'initial-human',membershipId:'m-initial-human',validFrom:now,validUntil:null});
    const result=await administerAuthority(db,r,{...services,initialIdentity:async()=>({organizationId:org,revision:'1',source:'test-fixture',principal})});
    expect(result.status).toBe('pending');const state=(await loadCurrentEmission(db,org))!.state;
    expect(state.principals).toContainEqual(principal);expect(state.memberships.some(m=>m.principal_id==='initial-human')).toBe(false);
  });
  it("commits proposal/acceptance, emission, audit and outbox together",async()=>{
    const org=await initialize();
    const proposed=await administerAuthority(db,await request(org,"propose",grant(org)),services);
    expect(proposed.status).toBe("pending");expect((await loadCurrentEmission(db,org))!.state.role_assignments.some(a=>a.assignment_id==="target-grant")).toBe(false);
    const accepted=await administerAuthority(db,await request(org,"accept",{kind:"accept",proposalId:"proposal"},"recipient"),services);
    expect(accepted.status).toBe("committed");
    expect((await loadCurrentEmission(db,org))!.state.role_assignments.find(a=>a.assignment_id==="target-grant")).toMatchObject({status:"active",accepted_at:now});
    expect(await counts(org)).toEqual({emissions:3,requests:2,audit:2,outbox:2,head:accepted.authorityVersion});
    expect((await db.prepare("SELECT status,accepted_version FROM authority_admin_proposals WHERE organization_id=?").bind(org).first())).toEqual({status:"accepted",accepted_version:accepted.authorityVersion});
  });
  it("revalidates a grantor whose authority was revoked before acceptance",async()=>{
    const org=await initialize();await administerAuthority(db,await request(org,"propose",grant(org)),services);
    await administerAuthority(db,await request(org,"revoke-owner",{kind:"revoke_assignment",assignmentId:"owner-master"}),services);
    const before=await counts(org);
    await expect(administerAuthority(db,await request(org,"accept",{kind:"accept",proposalId:"proposal"},"recipient"),services)).rejects.toThrow("permission_denied");
    expect(await counts(org)).toEqual(before);
    expect((await db.prepare("SELECT status FROM authority_admin_proposals WHERE organization_id=?").bind(org).first())?.status).toBe("pending");
  });
  it("returns the same terminal receipt without a second commit and rejects key reuse",async()=>{
    const org=await initialize(),r=await request(org,"propose",grant(org));
    const first=await administerAuthority(db,r,services);
    const again=await administerAuthority(db,r,{...services,signer:{...signer,privateKeyPkcs8:new ArrayBuffer(0)}});
    expect(again).toEqual(first);
    await expect(administerAuthority(db,{...r,command:{kind:"accept",proposalId:"proposal"}},services)).rejects.toThrow("idempotency_conflict");
    expect(await counts(org)).toEqual({emissions:2,requests:1,audit:1,outbox:1,head:first.authorityVersion});
  });
  it("converges concurrent identical administrative requests",async()=>{
    const org=await initialize(),r=await request(org,"propose",grant(org));
    const results=await Promise.all([administerAuthority(db,r,services),administerAuthority(db,r,services)]);
    expect(results[0]).toEqual(results[1]);expect((await counts(org))?.requests).toBe(1);
  });
  it("allows only one of two competing acceptances",async()=>{
    const org=await initialize();await administerAuthority(db,await request(org,"propose",grant(org)),services);
    const a=await request(org,"accept-a",{kind:"accept",proposalId:"proposal"},"recipient"),b={...a,requestId:"accept-b",metadata:{...a.metadata,snapshot_id:"accept-b"}};
    const results=await Promise.allSettled([administerAuthority(db,a,services),administerAuthority(db,b,services)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect((await counts(org))?.requests).toBe(2);
    expect((await loadCurrentEmission(db,org))!.state.role_assignments.filter(a=>a.assignment_id==="target-grant")).toHaveLength(1);
  });
  it.each(["authority_admin_audit","authority_admin_outbox"])("rolls back acceptance and emission if %s insertion fails",async table=>{
    const org=await initialize();await administerAuthority(db,await request(org,"propose",grant(org)),services);
    const before=await counts(org),r=await request(org,"accept",{kind:"accept",proposalId:"proposal"},"recipient");
    await db.prepare(`CREATE TRIGGER fail_admin_insert BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture_commit_failure'); END`).run();
    try {await expect(administerAuthority(db,r,services)).rejects.toThrow("fixture_commit_failure");}
    finally {await db.prepare("DROP TRIGGER fail_admin_insert").run();}
    expect(await counts(org)).toEqual(before);
    expect((await db.prepare("SELECT status FROM authority_admin_proposals WHERE organization_id=?").bind(org).first())?.status).toBe("pending");
    expect((await loadCurrentEmission(db,org))!.state.role_assignments.some(a=>a.assignment_id==="target-grant")).toBe(false);
    expect((await administerAuthority(db,r,services)).status).toBe("committed");
  });
  it("aborts the whole commit if canonical project evidence changes after validation",async()=>{
    const org=await initialize();await db.prepare(`INSERT INTO authority_project_scope_evidence VALUES (?, 'project-fixture', '1', 'fixture:project', 'test-fixture', 'active', '2026-09-09T00:00:00Z')`).bind(org).run();
    const c=grant(org);if(c.kind!=="propose_assignment")throw Error();c.scope={type:"project",id:"project-fixture"};
    const before=await counts(org),r=await request(org,"project",c);
    const raced=interceptCommit(async()=>{await db.prepare("UPDATE authority_project_scope_evidence SET revision='2' WHERE organization_id=?").bind(org).run();});
    await expect(administerAuthority(raced,r,services)).rejects.toThrow("scope_conflict");
    expect(await counts(org)).toEqual(before);
  });
  it("does not commit against authority revoked between validation and the batch",async()=>{
    const org=await initialize(),r=await request(org,"propose",grant(org));
    const raced=interceptCommit(async()=>{await administerAuthority(db,await request(org,"competing-revoke",{kind:"revoke_assignment",assignmentId:"owner-master"}),services);});
    await expect(administerAuthority(raced,r,services)).rejects.toThrow("version_conflict");
    expect((await counts(org))?.requests).toBe(1);
    expect((await db.prepare("SELECT * FROM authority_admin_proposals WHERE organization_id=?").bind(org).first())).toBeNull();
  });
  it("aborts if proposal preconditions fail rather than treating a zero-row update as success",async()=>{
    const org=await initialize();await administerAuthority(db,await request(org,"propose",grant(org)),services);
    const before=await counts(org),r=await request(org,"accept",{kind:"accept",proposalId:"proposal"},"recipient");
    const raced=interceptCommit(async()=>{await db.prepare("UPDATE authority_admin_proposals SET status='accepted', accepted_version=? WHERE organization_id=?").bind(r.expectedVersion,org).run();});
    await expect(administerAuthority(raced,r,services)).rejects.toThrow("proposal_conflict");
    expect(await counts(org)).toEqual(before);
  });
  it("rejects missing authentication, fixture fallback and deferred operations without writes",async()=>{
    const org=await initialize(),r=await request(org,"propose",grant(org)),before=await counts(org);
    await expect(administerAuthority(db,{...r,actorProof:"unverified"},services)).rejects.toThrow("actor_unverified");
    await expect(administerAuthority(db,r,{...services,allowTestFixtures:false})).rejects.toThrow("actor_unverified");
    await expect(administerAuthority(db,{...r,command:{kind:"recover_master"} as unknown as AdministrationCommand},services)).rejects.toThrow("operation_unavailable");
    expect(await counts(org)).toEqual(before);
  });
  it("checks actor expiry again after preparation",async()=>{
    const org=await initialize(),r=await request(org,"propose",grant(org)),before=await counts(org);let ticks=0;
    const expiring:AdministrationServices={...services,now:()=>++ticks<3?now:"2026-09-08T12:05:02Z",verifyActor:async(proof,org)=>{const actor=await services.verifyActor(proof,org);return actor?{...actor,expiresAt:"2026-09-08T12:05:01Z"}:null;}};
    await expect(administerAuthority(db,r,expiring)).rejects.toThrow("actor_unverified");expect(await counts(org)).toEqual(before);
  });
  it("accepts with an advancing clock while retaining the signed decision timestamp",async()=>{
    const org=await initialize();await administerAuthority(db,await request(org,"propose",grant(org)),services);let ticks=0;
    const r=await request(org,"accept",{kind:"accept",proposalId:"proposal"},"recipient");
    const advancing={...services,now:()=>++ticks<3?now:"2026-09-08T12:05:00.001Z"};
    await administerAuthority(db,r,advancing);
    expect((await loadCurrentEmission(db,org))!.state.role_assignments.find(a=>a.assignment_id==="target-grant")?.accepted_at).toBe(now);
  });
  it("records custom role definition without an implicit assignment",async()=>{
    const org=await initialize(),before=(await loadCurrentEmission(db,org))!.state.role_assignments;
    await administerAuthority(db,await request(org,"define",{kind:"define_role",role:{role_id:"new-role",role_version:"1",role_origin:"organization",display_name:"New",status:"active",permissions:["intent.create"]}}),services);
    expect((await loadCurrentEmission(db,org))!.state.role_assignments).toEqual(before);
    expect((await counts(org))?.outbox).toBe(1);
  });
});
