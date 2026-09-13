import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import app from "../src/index";
import { authorityHumanResponse } from "../src/authority/administration-route";
import { createInitialAuthorityEmission, initialEmissionGuardStatement } from "../src/authority/initial-emission";
import { loadCurrentEmission } from "../src/authority/emission-store";
import { beginHumanLogin, finishHumanLogin, initialHumanIdentity, resolveHumanSession, revokeHumanSession, type HumanServices } from "../src/authority/human-session-store";

let db:D1Database,mf:Miniflare,temp:string,sequence=0,privateKey:ArrayBuffer;
const now="2026-09-10T12:00:00Z",masterPermissions=["authority.membership.manage","authority.role_definition.manage",
  "authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign",
  "mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate"];
const human:HumanServices={now:()=>now,encryptionKey:Buffer.alloc(32,4).toString("base64"),provider:{source:"github-app",
  authorize:()=>"https://github.test",exchange:async()=>({token:"ghu_initial",expiresIn:28800}),identify:async()=>({subject:"123",handle:"founder"})}};
const signer=()=>({privateKeyPkcs8:privateKey,keyId:"issuer-key"});

async function createOrg(options:{installation?:boolean;evidence?:"canonical"|"test-fixture"}={}){
  const org=`initial-emission-${++sequence}`;await db.prepare("INSERT INTO organizations VALUES(?)").bind(org).run();
  if(options.installation!==false)await db.prepare("INSERT INTO installation_keys(installation_id,organization_id,public_key_raw,status,registered_at) VALUES(?,?,?,'active',0)").bind(`installation-${sequence}`,org,"key").run();
  const evidence=options.evidence??"canonical";
  await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,'123','canonical:github',?,'1','active',NULL,'')").bind(org,"founder",evidence).run();
  const hs=evidence==="canonical"?human:{...human,allowTestFixtures:true,provider:{...human.provider,source:"test-fixture" as const}};
  const flow=await beginHumanLogin(db,org,hs),login=await finishHumanLogin(db,{...flow,code:"code"},hs);
  const actor=(await resolveHumanSession(db,login.token,org,hs))!,identity=(await initialHumanIdentity(db,org,"founder",hs))!;
  return {org,hs,login,actor,identity};
}
function services(f:Awaited<ReturnType<typeof createOrg>>,database:D1Database=db){return {now:()=>now,issuer:"issuer-test",signer:signer(),
  initialIdentity:async()=>f.identity,commitGuard:(id:string,at:string,evidence:typeof f.identity)=>initialEmissionGuardStatement(database,f.actor,id,at,evidence)};}
function intercept(action:()=>Promise<void>):D1Database{return {withSession:(constraint:any)=>{const session=db.withSession(constraint);return {
  prepare:session.prepare.bind(session),getBookmark:session.getBookmark.bind(session),batch:async(statements:D1PreparedStatement[])=>{await action();return session.batch(statements);}};}} as unknown as D1Database;}
async function setMaster(status:"active"|"suspended"|"retired"){await db.prepare("UPDATE role_definitions SET status=? WHERE organization_id IS NULL AND key='master'").bind(status).run();}

beforeAll(async()=>{
  temp=mkdtempSync(join(tmpdir(),"initial-authority-emission-"));mf=new Miniflare({...convertV4MiniflareOptions({host:"127.0.0.1",cf:false,modules:true,
    script:'export default {fetch(){return new Response("fixture")}}',compatibilityDate:"2026-08-29",d1Databases:{DB:"initial-authority-emission"}}),resourcePersistencePath:temp});
  db=await mf.getD1Database("DB") as unknown as D1Database;await db.prepare("CREATE TABLE organizations(id TEXT PRIMARY KEY)").run();
  for(const file of ["0001_authority_snapshot.sql","0002_authority_security.sql","0004_authority_emissions.sql","0005_authority_administration.sql","0006_authority_human_identity.sql","0009_authority_role_definition_status.sql","0010_authority_initial_emission_guard.sql"]){
    const sql=readFileSync(join(process.cwd(),"migrations",file),"utf8").replace(/--[^\r\n]*/g,"").trim();
    for(const statement of sql.split(/;\s*(?=(?:CREATE|ALTER)\b)/i).filter(Boolean))await db.prepare(statement).run();
  }
  await db.prepare("INSERT INTO role_definitions(id,organization_id,key,version,definition,since_version,created_at,status) VALUES('master-1',NULL,'master',1,?,1,0,'active')").bind(JSON.stringify({display_name:"Master",permissions:masterPermissions})).run();
  const pair=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]) as CryptoKeyPair;privateKey=await crypto.subtle.exportKey("pkcs8",pair.privateKey) as ArrayBuffer;
},60000);
afterAll(async()=>{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});},30000);

describe("Initial Authority Emission",()=>{
  it("rejects identity not ready and test-fixture evidence",async()=>{
    const f=await createOrg();await expect(createInitialAuthorityEmission(db,f.org,"founder",{...services(f),initialIdentity:async()=>undefined})).rejects.toThrow("authority_initial_emission_identity_not_ready");
    const fixture=await createOrg({evidence:"test-fixture"});await expect(createInitialAuthorityEmission(db,fixture.org,"founder",services(fixture))).rejects.toThrow("authority_initial_emission_canonical_evidence_required");
  });
  it("rejects an invalid session before publication",async()=>{
    const f=await createOrg();await revokeHumanSession(db,f.login.token);const invalid=await resolveHumanSession(db,f.login.token,f.org,f.hs);expect(invalid).toBeNull();
    const response=await authorityHumanResponse(db,new Request("https://authority.test/v1/authority/initial-emission",{method:"POST",headers:{Origin:"https://authority.test","Content-Type":"application/json","X-Authority-CSRF":f.login.csrf,Cookie:`__Host-authority-session=${f.login.token}`},body:JSON.stringify({organizationId:f.org})}),
      {...f.hs,origin:"https://authority.test",issuer:"issuer-test",signer:signer()});expect(response.status).toBe(403);expect(await loadCurrentEmission(db,f.org)).toBeNull();
  });
  it.each(["session","identity"] as const)("rolls back when %s changes immediately before commit",async changed=>{
    const f=await createOrg(),race=intercept(async()=>{if(changed==="session")await revokeHumanSession(db,f.login.token);else await db.prepare("UPDATE authority_human_identities SET revision='2' WHERE organization_id=?").bind(f.org).run();});
    await expect(createInitialAuthorityEmission(race,f.org,"founder",services(f,db))).rejects.toThrow("authority_initial_emission_identity_not_ready");expect(await loadCurrentEmission(db,f.org)).toBeNull();
  });
  it("rejects identity evidence whose revision differs from the authenticated actor",async()=>{const f=await createOrg(),mismatch={...f.identity,revision:"2"};await expect(createInitialAuthorityEmission(db,f.org,"founder",{...services(f),initialIdentity:async()=>mismatch,commitGuard:(id,at,evidence)=>initialEmissionGuardStatement(db,f.actor,id,at,evidence)})).rejects.toThrow("authority_initial_emission_identity_not_ready");expect(await loadCurrentEmission(db,f.org)).toBeNull();});
  it("rejects an absent, suspended or retired master",async()=>{
    const absent=await createOrg();await db.prepare("DELETE FROM role_definitions WHERE key='master'").run();await expect(createInitialAuthorityEmission(db,absent.org,"founder",services(absent))).rejects.toThrow("authority_initial_emission_master_role_unavailable");
    await db.prepare("INSERT INTO role_definitions(id,organization_id,key,version,definition,since_version,created_at,status) VALUES('master-1',NULL,'master',1,?,1,0,'suspended')").bind(JSON.stringify({display_name:"Master",permissions:masterPermissions})).run();
    for(const status of ["suspended","retired"] as const){await setMaster(status);const f=await createOrg();await expect(createInitialAuthorityEmission(db,f.org,"founder",services(f))).rejects.toThrow("authority_initial_emission_master_role_unavailable");}await setMaster("active");
  },20000);
  it("rejects an organization without an active installation",async()=>{const f=await createOrg({installation:false});await expect(createInitialAuthorityEmission(db,f.org,"founder",services(f))).rejects.toThrow("authority_initial_emission_configuration_unavailable");});
  it("publishes the exact v1 projection once",async()=>{const f=await createOrg();const result=await createInitialAuthorityEmission(db,f.org,"founder",services(f));expect(result).toMatchObject({authorityVersion:"1",status:"committed"});const emission=(await loadCurrentEmission(db,f.org))!;
    expect(emission.state).toMatchObject({principals:[{principal_id:"founder",principal_type:"human",status:"active"}],memberships:[{principal_id:"founder",organization_id:f.org,status:"active"}],role_definitions:[{role_id:"master",role_version:"1",role_origin:"builtin",status:"active"}],role_assignments:[{role_id:"master",role_version:"1",scope:{type:"organization",id:f.org},status:"active"}],revocations:[]});
    expect(emission.metadata.expires_at).toBe("2026-09-10T12:04:00Z");expect((await db.prepare("SELECT COUNT(*) n FROM authority_initial_emission_commits WHERE organization_id=?").bind(f.org).first<{n:number}>())?.n).toBe(1);
    await expect(createInitialAuthorityEmission(db,f.org,"founder",services(f))).rejects.toThrow("authority_initial_emission_already_exists");});
  it("publishes v1 through the complete authenticated HTTP path",async()=>{const f=await createOrg(),origin="https://authority.test";const response=await authorityHumanResponse(db,new Request(origin+"/v1/authority/initial-emission",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","X-Authority-CSRF":f.login.csrf,Cookie:`__Host-authority-session=${f.login.token}`},body:JSON.stringify({organizationId:f.org})}),{...f.hs,origin,issuer:"issuer-test",signer:signer()});expect(response.status).toBe(200);expect(await response.json()).toMatchObject({authorityVersion:"1",status:"committed"});expect((await loadCurrentEmission(db,f.org))?.metadata.authority_version).toBe("1");});
  it("does not require an issuer for unrelated human routes",async()=>{const f=await createOrg(),origin="https://authority.test";const response=await authorityHumanResponse(db,new Request(origin+"/v1/authority/human/renew",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","X-Authority-CSRF":f.login.csrf,Cookie:`__Host-authority-session=${f.login.token}`},body:JSON.stringify({organizationId:f.org})}),{...f.hs,origin,signer:signer()});expect(response.status).toBe(200);});
  it("allows exactly one concurrent publisher and never creates v2",async()=>{const f=await createOrg(),outcomes=await Promise.allSettled([createInitialAuthorityEmission(db,f.org,"founder",services(f)),createInitialAuthorityEmission(db,f.org,"founder",services(f))]);expect(outcomes.filter(v=>v.status==="fulfilled")).toHaveLength(1);expect(String((outcomes.find(v=>v.status==="rejected") as PromiseRejectedResult).reason)).toContain("authority_initial_emission_already_exists");expect((await db.prepare("SELECT group_concat(authority_version) versions FROM authority_emissions WHERE organization_id=?").bind(f.org).first())?.versions).toBe("1");});
  it("registers only the normative endpoint",async()=>{const env={} as Env,ctx={waitUntil(){},passThroughOnException(){},props:{}} as unknown as ExecutionContext;const init=await app.fetch(new Request("https://worker.test/v1/authority/initial-emission",{method:"POST"}),env,ctx);expect(init.status).toBe(503);const old=await app.fetch(new Request("https://worker.test/v1/authority/"+"gene"+"sis",{method:"POST"}),env,ctx);expect(old.status).toBe(404);});
  it("has no functional dependency on unrelated domains",()=>{const source=readFileSync(join(process.cwd(),"src/authority/initial-emission.ts"),"utf8");expect(source).not.toMatch(/from ["'][^"']*(mandate|intent|wisdom|gravity)/i);});
});
