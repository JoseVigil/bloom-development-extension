import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {Miniflare,convertV4MiniflareOptions} from "miniflare";
import {mkdtempSync,rmSync,writeFileSync} from "node:fs";import {tmpdir} from "node:os";import {join,resolve} from "node:path";import {fileURLToPath} from "node:url";import {execFileSync} from "node:child_process";
import {authorityEvidenceResponse} from "../src/authority/evidence-route";
import {digestWire} from "../src/authority/canonical";

let mf:Miniflare,db:D1Database,temp:string;const org="org-evidence",installation="installation-evidence";
const root=resolve(fileURLToPath(new URL("../..",import.meta.url)));
beforeAll(async()=>{temp=mkdtempSync(join(tmpdir(),"authority-evidence-"));mf=new Miniflare({...convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:"2026-08-29",d1Databases:{DB:"evidence"}}),resourcePersistencePath:temp});db=await mf.getD1Database("DB") as unknown as D1Database;
 for(const sql of [
  "CREATE TABLE authority_emissions(organization_id TEXT,authority_version TEXT,request_id TEXT,metadata_json TEXT,state_json TEXT,state_digest TEXT,full_json TEXT,PRIMARY KEY(organization_id,authority_version))",
  "CREATE TABLE authority_admin_audit(organization_id TEXT,request_id TEXT,actor_id TEXT,operation TEXT,before_version TEXT,after_version TEXT,at TEXT,details_json TEXT,PRIMARY KEY(organization_id,request_id))",
  "CREATE TABLE authority_admin_outbox(organization_id TEXT,event_id TEXT,authority_version TEXT,payload_json TEXT,created_at TEXT,delivered_at TEXT,PRIMARY KEY(organization_id,event_id))",
  "CREATE TABLE authority_sync_deliveries(organization_id TEXT,event_id TEXT,installation_id TEXT,authority_version TEXT,correlation_id TEXT,urgency TEXT,committed_at TEXT,status TEXT,lease_id TEXT,lease_expires_at TEXT,attempts INTEGER,noticed_at TEXT,acknowledged_at TEXT,PRIMARY KEY(organization_id,event_id,installation_id))",
  "CREATE TABLE authority_sync_measurements(organization_id TEXT,event_id TEXT,installation_id TEXT,authority_version TEXT,urgency TEXT,committed_at TEXT,noticed_at TEXT,pull_started_at TEXT,accepted_at TEXT,hypothetical_restriction_at TEXT,PRIMARY KEY(organization_id,event_id,installation_id))"])await db.prepare(sql).run();
 const at="2026-09-10T10:00:00.000Z",accepted="2026-09-10T10:00:12.000Z",hyp="2026-09-10T10:00:50.000Z";
 await db.prepare("INSERT INTO authority_emissions VALUES(?,?,?,?,?,?,?)").bind(org,"2","admin:req",JSON.stringify({issued_at:at,signature:"must-not-leak"}),'{"secret":"state"}',"state-digest",'{"signature":"must-not-leak"}').run();
 await db.prepare("INSERT INTO authority_admin_audit VALUES(?,?,?,?,?,?,?,?)").bind(org,"req","person","revoke_assignment","1","2",at,JSON.stringify({session_id:"must-not-leak"})).run();
 await db.prepare("INSERT INTO authority_admin_outbox VALUES(?,?,?,?,?,NULL)").bind(org,"req","2",JSON.stringify({token:"must-not-leak"}),at).run();
 await db.prepare("INSERT INTO authority_sync_deliveries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(org,"req",installation,"2","correlation","standard",at,"acknowledged","must-not-leak",accepted,2,at,accepted).run();
 await db.prepare("INSERT INTO authority_sync_measurements VALUES(?,?,?,?,?,?,?,?,?,?)").bind(org,"req",installation,"2","standard",at,at,at,accepted,hyp).run();
},60000);
afterAll(async()=>{await mf.dispose();rmSync(temp,{recursive:true,force:true});});

describe("authority evidence route",()=>{
 it("binds recipient and validates request errors",async()=>{
  expect((await authorityEvidenceResponse(db,new Request("https://x/v1/authority/evidence"),{organizationId:org,installationId:installation})).status).toBe(400);
  expect((await authorityEvidenceResponse(db,new Request("https://x/v1/authority/evidence?org=other"),{organizationId:org,installationId:installation})).status).toBe(403);
  expect((await authorityEvidenceResponse(db,new Request(`https://x/v1/authority/evidence?org=${org}&limit=0`),{organizationId:org,installationId:installation})).status).toBe(400);
  expect((await authorityEvidenceResponse(db,new Request(`https://x/v1/authority/evidence?org=${org}&cursor=bad`),{organizationId:org,installationId:installation})).status).toBe(400);
 });
 it("paginates stable minimized evidence with explicit integrity",async()=>{
  const binding={organizationId:org,installationId:installation},now=new Date("2026-09-10T10:01:00Z");let cursor:string|undefined;const ids:string[]=[];
  do{const response=await authorityEvidenceResponse(db,new Request(`https://x/v1/authority/evidence?org=${org}&limit=2${cursor?`&cursor=${encodeURIComponent(cursor)}`:""}`),binding,now);expect(response.status).toBe(200);const body:any=await response.json();
   const {integrity,...unsigned}=body;expect(integrity).toEqual({algorithm:"SHA-256",digest:await digestWire(unsigned)});expect(response.headers.get("cache-control")).toBe("private, no-store");
   ids.push(...body.items.map((x:any)=>x.evidence_id));cursor=body.next_cursor??undefined;
   expect(JSON.stringify(body)).not.toContain("must-not-leak");
  }while(cursor);
  expect(new Set(ids).size).toBe(ids.length);expect(ids).toHaveLength(5);
  const measurement=(await authorityEvidenceResponse(db,new Request(`https://x/v1/authority/evidence?org=${org}`),binding,now).then(r=>r.json()) as any).items.find((x:any)=>x.kind==="measurement");
  expect(measurement.commit_to_acceptance_ms).toBeGreaterThanOrEqual(11999);expect(measurement.commit_to_hypothetical_restriction_ms).toBeGreaterThanOrEqual(49999);
 });
 it("exchanges the integrated Backend evidence with the Nucleus end-to-end test",async()=>{const response=await authorityEvidenceResponse(db,new Request(`https://x/v1/authority/evidence?org=${org}`),{organizationId:org,installationId:installation},new Date("2026-09-10T10:01:00Z"));const path=join(temp,"lot6-evidence.json");writeFileSync(path,await response.text());const output=execFileSync("go",["test","./internal/authority","-run","^TestAuthorityEndToEndBackendEvidence$","-count=1","-v"],{cwd:join(root,"installer/nucleus"),encoding:"utf8",timeout:150000,env:{...process.env,AUTHORITY_E2E_EVIDENCE:path,GOCACHE:join(tmpdir(),"bloom-authority-go-cache"),GOPROXY:"off"}});expect(output).toContain("--- PASS: TestAuthorityEndToEndBackendEvidence");},180000);
 it("fails closed when evidence storage is unavailable",async()=>{const bad=await authorityEvidenceResponse({withSession:()=>({prepare:()=>({bind:()=>({all:()=>Promise.reject(new Error("down"))})})})} as any,new Request(`https://x/v1/authority/evidence?org=${org}`),{organizationId:org,installationId:installation});expect(bad.status).toBe(503);});
});
