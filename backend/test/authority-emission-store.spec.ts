import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "../src/authority/canonical";
import { persistEmission, prepareEmission, loadCurrentEmission, type PersistEmissionInput } from "../src/authority/emission-store";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixture = JSON.parse(readFileSync(join(root, "docs/ROLES/fixtures/authority_interop_v1.json"), "utf8"));
const signer = { privateKeyPkcs8: Uint8Array.from(Buffer.from(fixture.private_key_pkcs8_base64, "base64")).buffer,
  keyId: fixture.key_id, allowTestFixtures: true };
let mf: Miniflare, db: D1Database, temp: string, sequence = 0;
function runtime() {
  return new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default { fetch() { return new Response("test only"); } }',
    compatibilityDate: "2026-08-29", d1Databases: { DB: "authority-1b-store" } }), resourcePersistencePath: temp });
}
const statements = (file: string) => readFileSync(join(root, "backend/migrations", file), "utf8")
  .replace(/--[^\r\n]*/g, "").trim().split(/;\s*(?=CREATE\b)/i).filter(Boolean);
async function organization() {
  const org = `store-test-${++sequence}`;
  await db.prepare("INSERT INTO organizations (id) VALUES (?)").bind(org).run(); return org;
}
function input(org: string, phase: "base" | "result" | "renewal" = "base"): PersistEmissionInput {
  const metadata = structuredClone(fixture.metadata[phase]);
  metadata.organization_id = org; metadata.audience.organization_id = org;
  const state = structuredClone(phase === "base" ? fixture.base_state : fixture.result_state);
  for (const m of state.memberships) m.organization_id = org;
  return { requestId: phase, metadata, state, expectedVersion: phase === "base" ? null : fixture.metadata[phase === "result" ? "base" : "result"].authority_version,
    ...(phase === "base" ? { initialFixtureEvidence: { environment: "test" as const, reference: "authority_interop_v1" } } : {}) };
}
async function counts(org: string) {
  return db.prepare(`SELECT (SELECT COUNT(*) FROM authority_emissions WHERE organization_id=?1) AS emissions,
    (SELECT authority_version FROM authority_emission_heads WHERE organization_id=?1) AS head`).bind(org).first();
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "authority-1b-store-"));
  mf = runtime();
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare("CREATE TABLE organizations (id TEXT PRIMARY KEY)").run();
  for (const file of ["0001_authority_snapshot.sql", "0004_authority_emissions.sql"])
    for (const sql of statements(file)) await db.prepare(sql).run();
}, 60000);
afterAll(async () => {
  if (mf) await mf.dispose();
  if (temp) rmSync(temp, { recursive: true, force: true }); // Exact mkdtemp result only.
}, 30000);

describe("persisted authority emissions on temporary D1", () => {
  it("prepares without publishing and participates in a caller's atomic batch", async () => {
    const org=await organization();const prepared=await prepareEmission(db,input(org),signer);
    expect(prepared.statement).not.toBeNull();expect(await counts(org)).toEqual({emissions:0,head:null});
    await db.prepare("CREATE TABLE prepared_probe (id TEXT PRIMARY KEY)").run();
    await db.prepare("INSERT INTO prepared_probe VALUES ('existing')").run();
    await expect(db.batch([prepared.statement!,db.prepare("INSERT INTO prepared_probe VALUES ('existing')")])).rejects.toThrow();
    expect(await counts(org)).toEqual({emissions:0,head:null});
    await db.batch([prepared.statement!,db.prepare("INSERT INTO prepared_probe VALUES ('committed')")]);
    expect((await loadCurrentEmission(db,org))?.full).toBe(prepared.result.full);
    expect((await prepareEmission(db,input(org),signer)).statement).toBeNull();
  });
  it("publishes full, delta and renewal with decimal TEXT versions and immutable bytes", async () => {
    const org = await organization();
    const first = await persistEmission(db, input(org), signer);
    expect(first.delta).toBeNull();
    const next = await persistEmission(db, input(org,"result"), signer);
    const renewed = await persistEmission(db, input(org,"renewal"), signer);
    expect(next.stateDigest).toBe(renewed.stateDigest);
    expect(next.full).not.toBe(renewed.full);
    expect(JSON.parse(next.delta!).payload.content.result_digest).toBe(next.stateDigest);
    expect(await counts(org)).toEqual({ emissions: 3, head: fixture.metadata.renewal.authority_version });
    expect((await db.prepare("SELECT typeof(authority_version) AS type FROM authority_emissions WHERE organization_id=? LIMIT 1").bind(org).first())?.type).toBe("text");
    expect((await loadCurrentEmission(db,org))?.full).toBe(renewed.full);
  });
  it("returns the original idempotent result after head advances without signing again", async () => {
    const org = await organization(); const request = input(org);
    const first = await persistEmission(db,request,signer);
    await persistEmission(db,input(org,"result"),signer);
    const replay = await persistEmission(db,request,{ ...signer, privateKeyPkcs8: new ArrayBuffer(0) });
    expect(replay.full).toBe(first.full);
    expect(await counts(org)).toEqual({ emissions: 2, head: fixture.metadata.result.authority_version });
  });
  it("rejects conflicting idempotency keys without changing committed state", async () => {
    const org=await organization();const request=input(org);await persistEmission(db,request,signer);
    request.metadata.snapshot_id="conflict";
    await expect(persistEmission(db,request,signer)).rejects.toMatchObject({code:"idempotency_conflict"});
    expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
  });
  it("serializes two concurrent candidates for the same head", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    const a=input(org,"result"),b=input(org,"result");b.requestId="competing";b.metadata.snapshot_id="competing";
    const results=await Promise.allSettled([persistEmission(db,a,signer),persistEmission(db,b,signer)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
    expect(await counts(org)).toEqual({emissions:2,head:fixture.metadata.result.authority_version});
  });
  it("converges concurrent identical retries to the same bytes", async () => {
    const org=await organization();const request=input(org);
    const [a,b]=await Promise.all([persistEmission(db,request,signer),persistEmission(db,request,signer)]);
    expect(a.full).toBe(b.full);expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
  });
  it("rolls back the whole D1 batch when the database CAS rejects, including earlier statements", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    await db.prepare("CREATE TABLE cas_probe (id TEXT PRIMARY KEY)").run();
    await expect(db.batch([
      db.prepare("INSERT INTO cas_probe VALUES (?)").bind(org),
      db.prepare(`INSERT INTO authority_emissions SELECT organization_id, '9007199254740994', NULL, 'bad-cas',
        request_digest, metadata_json, state_json, state_digest, full_json, NULL, initial_evidence
        FROM authority_emissions WHERE organization_id=?`).bind(org),
    ])).rejects.toThrow("authority_cas_conflict");
    expect(await db.prepare("SELECT * FROM cas_probe WHERE id=?").bind(org).first()).toBeNull();
    expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
  });
  it("does not publish an emission or idempotency record when head publication fails", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    await db.prepare(`CREATE TRIGGER fail_head BEFORE UPDATE ON authority_emission_heads BEGIN SELECT RAISE(ABORT, 'fixture_head_failure'); END`).run();
    try {await expect(persistEmission(db,input(org,"result"),signer)).rejects.toThrow("fixture_head_failure");}
    finally {await db.prepare("DROP TRIGGER fail_head").run();}
    expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
    expect((await persistEmission(db,input(org,"result"),signer)).metadata.authority_version).toBe(fixture.metadata.result.authority_version);
  });
  it("rejects initial writes without explicit test-only evidence", async () => {
    const org=await organization();
    await expect(persistEmission(db,input(org),{...signer,allowTestFixtures:false})).rejects.toMatchObject({code:"initial_evidence_required"});
    const request=input(org);delete request.initialFixtureEvidence;
    await expect(persistEmission(db,request,signer)).rejects.toMatchObject({code:"initial_evidence_required"});
    expect(await counts(org)).toEqual({emissions:0,head:null});
  });
  it("rejects even a zero-valued legacy head as evidence requiring recovery", async () => {
    const org=await organization();await db.prepare("INSERT INTO authority_state (organization_id,current_version,updated_at) VALUES (?,0,0)").bind(org).run();
    await expect(persistEmission(db,input(org),signer)).rejects.toMatchObject({code:"recovery_required"});
    await expect(loadCurrentEmission(db,org)).rejects.toMatchObject({code:"recovery_required"});
    expect(await counts(org)).toEqual({emissions:0,head:null});
  });
  it("does not treat a missing head with retained emissions as a new organization", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    await db.prepare("DELETE FROM authority_emission_heads WHERE organization_id=?").bind(org).run();
    await expect(loadCurrentEmission(db,org)).rejects.toMatchObject({code:"recovery_required"});
    const candidate=input(org);candidate.requestId="new-initial";
    await expect(persistEmission(db,candidate,signer)).rejects.toMatchObject({code:"recovery_required"});
  });
  it("protects history from UPDATE and DELETE", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    await expect(db.prepare("UPDATE authority_emissions SET request_id='other' WHERE organization_id=?").bind(org).run()).rejects.toThrow("authority_emission_immutable");
    await expect(db.prepare("DELETE FROM authority_emissions WHERE organization_id=?").bind(org).run()).rejects.toThrow("authority_emission_immutable");
  });
  it("detects a head restored below retained emissions", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);await persistEmission(db,input(org,"result"),signer);
    await db.prepare("UPDATE authority_emission_heads SET authority_version=? WHERE organization_id=?").bind(fixture.metadata.base.authority_version,org).run();
    await expect(loadCurrentEmission(db,org)).rejects.toMatchObject({code:"recovery_required"});
    const next=input(org,"result");next.requestId="after-restore";
    await expect(persistEmission(db,next,signer)).rejects.toMatchObject({code:"recovery_required"});
  });
  it("rejects invalid progression, invalid continuity and unknown organizations", async () => {
    const org=await organization();await persistEmission(db,input(org),signer);
    const gap=input(org,"result");gap.metadata.authority_version="18446744073709551615";
    await expect(persistEmission(db,gap,signer)).rejects.toMatchObject({code:"invalid_emission"});
    const bad=input(org,"result");bad.state.revocations=[];
    await expect(persistEmission(db,bad,signer)).rejects.toMatchObject({code:"invalid_emission"});
    await expect(persistEmission(db,input("unknown-org"),signer)).rejects.toThrow();
    expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
  });
  it("keeps the fixed vector normal form when persisted", async () => {
    const org="org-fixture";await db.prepare("INSERT INTO organizations VALUES (?)").bind(org).run();
    const result=await persistEmission(db,input(org),signer);
    expect(result.full).toBe(canonicalizeJson(fixture.envelopes.full1));
  });
  it("reopens the same temporary D1 storage and preserves head, bytes and idempotency", async () => {
    const org=await organization();const request=input(org);const first=await persistEmission(db,request,signer);
    await mf.dispose();mf=runtime();db=await mf.getD1Database("DB") as unknown as D1Database;
    expect((await loadCurrentEmission(db,org))?.full).toBe(first.full);
    expect((await persistEmission(db,request,{...signer,privateKeyPkcs8:new ArrayBuffer(0)})).full).toBe(first.full);
    expect(await counts(org)).toEqual({emissions:1,head:fixture.metadata.base.authority_version});
  },60000);
});
