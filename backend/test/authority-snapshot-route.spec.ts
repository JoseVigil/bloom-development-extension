import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { persistEmission } from "../src/authority/emission-store";
import { authoritySnapshotResponse } from "../src/authority/snapshot-route";
import { canonicalizeJson, verifyCanonicalSignature } from "../src/authority/canonical";
import { administerAuthority, type AdministrationServices } from "../src/authority/administration-store";
import type { AdministrationCommand } from "../src/authority/administration";

const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const fixture=JSON.parse(readFileSync(join(root,"docs/ROLES/fixtures/authority_interop_v1.json"),"utf8"));
const signer={privateKeyPkcs8:Uint8Array.from(Buffer.from(fixture.private_key_pkcs8_base64,"base64")).buffer,keyId:fixture.key_id,allowTestFixtures:true};
let mf:Miniflare,db:D1Database,temp:string;
const verified={organizationId:"org-fixture",installationId:"installation-a"};
const request=(query="org=org-fixture")=>new Request(`https://fixture.invalid/v1/authority/snapshot?${query}`);
async function publish(phase:"base"|"result"|"renewal") {
  return persistEmission(db,{requestId:phase,metadata:fixture.metadata[phase],state:phase==="base"?fixture.base_state:fixture.result_state,
    expectedVersion:phase==="base"?null:fixture.metadata[phase==="result"?"base":"result"].authority_version,
    ...(phase==="base"?{initialFixtureEvidence:{environment:"test" as const,reference:"authority_interop_v1"}}:{})},signer);
}
beforeAll(async()=>{
  temp=mkdtempSync(join(tmpdir(),"authority-1b-route-"));
  mf=new Miniflare({...convertV4MiniflareOptions({host:"127.0.0.1",cf:false,modules:true,script:'export default {fetch(){return new Response("test only")}}',compatibilityDate:"2026-08-29",d1Databases:{DB:"authority-1b-route"}}),resourcePersistencePath:temp});
  db=await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare("CREATE TABLE organizations (id TEXT PRIMARY KEY)").run();
  for(const file of ["0001_authority_snapshot.sql","0004_authority_emissions.sql","0005_authority_administration.sql"]){
    const sql=readFileSync(join(root,"backend/migrations",file),"utf8").replace(/--[^\r\n]*/g,"").trim();
    for(const statement of sql.split(/;\s*(?=CREATE\b)/i).filter(Boolean))await db.prepare(statement).run();
  }
  await db.prepare("INSERT INTO organizations VALUES ('org-fixture')").run();
},60000);
afterAll(async()=>{if(mf)await mf.dispose();if(temp)rmSync(temp,{recursive:true,force:true});},30000);

describe("isolated persisted snapshot handler",()=>{
  it("delivers an administrative membership/grant/revocation journey to Go",async()=>{
    const org="org-admin-interop",now="2026-09-08T12:05:00Z",owner="p-😀",recipient="p-\uE000";
    await db.prepare("INSERT INTO organizations VALUES (?)").bind(org).run();
    const metadata=structuredClone(fixture.metadata.base),state=structuredClone(fixture.base_state);
    metadata.organization_id=org;metadata.audience.organization_id=org;metadata.issued_at=now;metadata.not_before=now;state.memberships[0].organization_id=org;
    state.principals[1].external_identities=[{provider:"github",subject:"recipient",display_handle:"recipient",status:"verified",verified_at:now}];
    state.role_definitions.push({role_id:"master",role_version:"1",role_origin:"builtin",display_name:"Master",status:"active",permissions:["authority.membership.manage","authority.role_definition.manage","authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign","mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate","create_project"]},
      {role_id:"specialist",role_version:"1",role_origin:"builtin",display_name:"Specialist",status:"active",permissions:["intent.create"]});
    state.role_assignments.push({...state.role_assignments[0],assignment_id:"owner-master",role_id:"master",role_version:"1",scope:{type:"organization",id:org}});
    const first=await persistEmission(db,{requestId:"fixture",expectedVersion:null,metadata,state,initialFixtureEvidence:{environment:"test",reference:"admin-journey"}},signer);
    await db.prepare("INSERT INTO authority_project_scope_evidence VALUES (?, 'project-fixture', '1', 'fixture:project', 'test-fixture', 'active', '2026-09-09T00:00:00Z')").bind(org).run();
    const services:AdministrationServices={signer,now:()=>now,allowTestFixtures:true,verifyActor:async(proof,organizationId)=>
      proof==="owner"||proof==="recipient"?{organizationId,principalId:proof==="owner"?owner:recipient,sessionId:`fixture-${proof}`,expiresAt:"2026-09-09T00:00:00Z",source:"test-fixture"}:null};
    const read=async(base:string|null)=>authoritySnapshotResponse(db,request(`org=${org}${base?`&base_version=${base}`:""}`),{organizationId:org,installationId:"installation-a"});
    const envelopes:unknown[]=[await (await read(null)).json()],stateDigests=[first.stateDigest];let version=first.metadata.authority_version;
    const steps:{proof:string;command:AdministrationCommand}[]=[
      {proof:"owner",command:{kind:"propose_membership",proposalId:"member-proposal",membershipId:"m-admin-target",principalId:recipient,validFrom:now,validUntil:null}},
      {proof:"recipient",command:{kind:"accept",proposalId:"member-proposal"}},
      {proof:"owner",command:{kind:"propose_assignment",proposalId:"assignment-proposal",assignmentId:"admin-target",membershipId:"m-admin-target",roleId:"specialist",roleVersion:"1",scope:{type:"project",id:"project-fixture"},validFrom:now,validUntil:null}},
      {proof:"recipient",command:{kind:"accept",proposalId:"assignment-proposal"}},
      {proof:"owner",command:{kind:"revoke_assignment",assignmentId:"admin-target"}},
    ];
    for(const [i,step] of steps.entries()) {
      const result=await administerAuthority(db,{requestId:`journey-${i}`,actorProof:step.proof,expectedVersion:version,command:step.command,
        metadata:{...metadata,authority_version:String(BigInt(version)+1n),snapshot_id:`journey-${i}`,issued_at:now,not_before:now}},services);
      const response=await read(version);expect(response.status).toBe(200);envelopes.push(await response.json());stateDigests.push(result.stateDigest);version=result.authorityVersion;
    }
    const path=join(temp,"administration-artifacts.json");writeFileSync(path,JSON.stringify({envelopes,state_digests:stateDigests,final_full:await (await read(null)).json()}));
    const output=execFileSync("go",["test","./internal/authority","-run","^TestAdministrationInteropBackendArtifacts$","-count=1","-v"],{
      cwd:join(root,"installer/nucleus"),encoding:"utf8",timeout:150000,
      env:{...process.env,AUTHORITY_ADMIN_ARTIFACT:path,GOCACHE:join(tmpdir(),"bloom-authority-go-cache"),GOPROXY:"off"}});
    expect(output).toContain("--- PASS: TestAdministrationInteropBackendArtifacts");
    const receipt=JSON.parse(readFileSync(path+".receipt.json","utf8"));expect(receipt).toEqual({state_digest:stateDigests[5],authority_version:version,acceptances:6,revoked_assignment:"admin-target"});
    expect((await db.prepare("SELECT COUNT(*) AS n FROM authority_admin_outbox WHERE organization_id=?").bind(org).first())?.n).toBe(5);
  },180000);
  it("requires the explicit verified-installation precondition",async()=>{
    expect((await authoritySnapshotResponse(db,request(),null)).status).toBe(401);
    expect((await authoritySnapshotResponse(db,request(),{...verified,organizationId:"other"})).status).toBe(403);
  });
  it.each(["0","01","%2B1","1.5","1e3","18446744073709551616",""])("rejects invalid base %s",async base=>{
    expect((await authoritySnapshotResponse(db,request(`org=org-fixture&base_version=${base}`),verified)).status).toBe(400);
  });
  it("rejects ambiguous query parameters",async()=>{
    for(const query of ["org=org-fixture&org=other","org=org-fixture&base_version=1&base_version=2",""])
      expect((await authoritySnapshotResponse(db,request(query),verified)).status).toBe(400);
  });
  it("returns explicit unavailable without creating an emission on read",async()=>{
    const response=await authoritySnapshotResponse(db,request("org=absent"),{...verified,organizationId:"absent"});
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"authority_emission_unavailable"});
  });
  it("serves persisted full/delta/replay/renewal bytes that Go independently accepts",async()=>{
    const artifacts:Record<string,unknown>={};
    await publish("base");
    const first=await authoritySnapshotResponse(db,request(),verified);
    expect(first.status).toBe(200);expect(first.headers.get("Cache-Control")).toBe("no-store");
    artifacts.full1=await first.json();
    await publish("result");
    const delta=await authoritySnapshotResponse(db,request(`org=org-fixture&base_version=${fixture.metadata.base.authority_version}`),verified);
    expect(delta.status).toBe(200);artifacts.delta2=await delta.json();
    const full=await authoritySnapshotResponse(db,request(),verified);artifacts.full2=await full.json();
    const replay=await authoritySnapshotResponse(db,request(`org=org-fixture&base_version=${fixture.metadata.result.authority_version}`),verified);
    expect(await replay.text()).toBe(canonicalizeJson(artifacts.full2));
    const unavailableBase=await authoritySnapshotResponse(db,request("org=org-fixture&base_version=1"),verified);
    expect(await unavailableBase.text()).toBe(canonicalizeJson(artifacts.full2));
    const ahead=await authoritySnapshotResponse(db,request("org=org-fixture&base_version=18446744073709551615"),verified);
    expect(ahead.status).toBe(409);
    const otherInstallation=await authoritySnapshotResponse(db,request(),{...verified,installationId:"not-in-audience"});
    expect(otherInstallation.status).toBe(403);
    await publish("renewal");artifacts.renewal3=await (await authoritySnapshotResponse(db,request(),verified)).json();
    for(const name of ["full1","full2","delta2","renewal3"])expect(canonicalizeJson(artifacts[name])).toBe(canonicalizeJson(fixture.envelopes[name]));
    const path=join(temp,"route-artifacts.json");writeFileSync(path,JSON.stringify(artifacts));
    const output=execFileSync("go",["test","./internal/authority","-run","^TestAuthorityInteropBackendArtifacts$","-count=1","-v"],{
      cwd:join(root,"installer/nucleus"),encoding:"utf8",timeout:150000,
      env:{...process.env,AUTHORITY_INTEROP_ARTIFACT:path,GOCACHE:join(tmpdir(),"bloom-authority-go-cache"),GOPROXY:"off"},
    });
    expect(output).toContain("--- PASS: TestAuthorityInteropBackendArtifacts");
    const receipt=JSON.parse(readFileSync(path+".receipt.json","utf8"));
    expect(receipt.state_digest).toBe(fixture.expected.state_digest);expect(receipt.journal_entries).toBe(3);
    expect(canonicalizeJson(receipt.go_envelope)).toBe(canonicalizeJson(artifacts.full2));
    expect(await verifyCanonicalSignature(canonicalizeJson(receipt.go_envelope.payload),Buffer.from(receipt.go_envelope.integrity.signature,"base64url").toString("base64"),Uint8Array.from(Buffer.from(fixture.public_key_base64url,"base64url")).buffer)).toBe(true);
    const count=await db.prepare("SELECT COUNT(*) AS n FROM authority_emissions WHERE organization_id='org-fixture'").first();expect(count?.n).toBe(3);
  },180000);
  it("reports recovery required for legacy evidence, without converting it",async()=>{
    await db.prepare("INSERT INTO organizations VALUES ('legacy')").run();
    await db.prepare("INSERT INTO authority_state (organization_id,current_version,updated_at) VALUES ('legacy',7,0)").run();
    const response=await authoritySnapshotResponse(db,request("org=legacy"),{...verified,organizationId:"legacy"});
    expect(response.status).toBe(503);expect(await response.json()).toEqual({error:"authority_recovery_required"});
    expect((await db.prepare("SELECT current_version FROM authority_state WHERE organization_id='legacy'").first())?.current_version).toBe(7);
  });
  it("falls back to the current full when the historical delta base fails validation",async()=>{
    // Only corrupt the isolated temporary database, never a stored production artifact.
    await publish("base");await publish("result");await publish("renewal");
    await db.prepare("DROP TRIGGER authority_emission_immutable_update").run();
    try {
      await db.prepare("UPDATE authority_emissions SET state_digest='corrupt-fixture' WHERE organization_id=? AND authority_version=?")
        .bind("org-fixture",fixture.metadata.result.authority_version).run();
      const response=await authoritySnapshotResponse(db,request(`org=org-fixture&base_version=${fixture.metadata.result.authority_version}`),verified);
      expect(response.status).toBe(200);expect(await response.text()).toBe(canonicalizeJson(fixture.envelopes.renewal3));
    } finally {
      await db.prepare("UPDATE authority_emissions SET state_digest=? WHERE organization_id=? AND authority_version=?")
        .bind(fixture.expected.state_digest,"org-fixture",fixture.metadata.result.authority_version).run();
      await db.prepare("CREATE TRIGGER authority_emission_immutable_update BEFORE UPDATE ON authority_emissions BEGIN SELECT RAISE(ABORT, 'authority_emission_immutable'); END").run();
    }
  });
});
