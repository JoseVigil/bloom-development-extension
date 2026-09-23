import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginGenesis, finishGenesis } from "../src/authority/genesis-store";
import { beginHumanLogin, finishHumanLogin, initialHumanIdentity, resolveHumanSession, type HumanServices } from "../src/authority/human-session-store";
import { authorityHumanResponse, type HumanRouteServices } from "../src/authority/administration-route";
import { createInitialAuthorityEmission, initialEmissionGuardStatement } from "../src/authority/initial-emission";

let db: D1Database, mf: Miniflare, temp: string, privateKey: ArrayBuffer;
const now = "2026-09-13T12:00:00Z";
// exchange echoes `code` back as the provider token; identify derives a deterministic
// subject/handle from that token, so each test picks its own GitHub subject via `code`.
const services: HumanServices = {
  now: () => now, encryptionKey: Buffer.alloc(32, 11).toString("base64"), allowTestFixtures: true,
  provider: { source: "test-fixture", authorize: (state, challenge) => `https://fixture.test/?state=${state}&challenge=${challenge}`,
    exchange: async (code: string) => ({ token: code, expiresIn: 28800 }), identify: async (token: string) => ({ subject: token, handle: `user-${token}` }) },
};
const signer = () => ({ privateKeyPkcs8: privateKey, keyId: "issuer-key" });

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    // Sovereign Tenant Fase 2: se agregó UPDATE al lookahead porque 0015_tenants.sql
    // (necesario desde que finishGenesis inserta en `tenants`) tiene un backfill con
    // UPDATE, que CREATE|ALTER|INSERT solo no reconocía.
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}
async function genesisLogin(code: string, s: HumanServices = services) {
  const flow = await beginGenesis(db, s);
  return finishGenesis(db, { ...flow, code }, s);
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "authority-genesis-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "authority-genesis" } }),
    resourcePersistencePath: temp });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await loadMigrations(["0001_authority_snapshot.sql", "0002_authority_security.sql", "0004_authority_emissions.sql",
    "0005_authority_administration.sql", "0006_authority_human_identity.sql", "0009_authority_role_definition_status.sql",
    "0010_authority_initial_emission_guard.sql", "0013_authority_genesis.sql", "0015_tenants.sql", "0019_authority_master_create_project.sql"]);
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  privateKey = await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer;
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

describe("Génesis / Primer Registro", () => {
  it("(a) creates organization + canonical identity + registry anchor for a new subject", async () => {
    const result = await genesisLogin("alice");
    expect(result.created).toBe(true);
    const org = await db.prepare("SELECT * FROM organizations WHERE id=?").bind(result.organizationId).first<any>();
    expect(org).toMatchObject({ master_github_username: "user-alice", key_fingerprint: "unassigned" });
    const identity = await db.prepare("SELECT * FROM authority_human_identities WHERE organization_id=? AND principal_id=?")
      .bind(result.organizationId, result.principalId).first<any>();
    expect(identity).toMatchObject({ subject: "alice", evidence_kind: "canonical", status: "active", display_handle: "user-alice" });
    expect(identity.verified_at).not.toBeNull();
    const registry = await db.prepare("SELECT * FROM authority_genesis_registry WHERE subject=?").bind("alice").first<any>();
    expect(registry).toMatchObject({ organization_id: result.organizationId, principal_id: result.principalId });
    expect(await resolveHumanSession(db, result.token, result.organizationId, services)).toMatchObject({ organizationId: result.organizationId, principalId: result.principalId });
  });

  it("(b) the same subject twice never creates a second organization; created:false on return", async () => {
    const first = await genesisLogin("bob");
    const second = await genesisLogin("bob");
    expect(second.created).toBe(false);
    expect(second.organizationId).toBe(first.organizationId);
    expect(second.principalId).toBe(first.principalId);
    const count = await db.prepare("SELECT COUNT(*) n FROM organizations WHERE master_github_username=?").bind("user-bob").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("(c) a concurrent race for the same new subject resolves to exactly one winner, no duplicate", async () => {
    const flows = await Promise.all([beginGenesis(db, services), beginGenesis(db, services)]);
    const outcomes = await Promise.all(flows.map(f => finishGenesis(db, { ...f, code: "carol" }, services)));
    expect(new Set(outcomes.map(o => o.organizationId)).size).toBe(1);
    expect(outcomes.filter(o => o.created).length).toBe(1);
    expect(outcomes.filter(o => !o.created).length).toBe(1);
    const count = await db.prepare("SELECT COUNT(*) n FROM organizations WHERE master_github_username=?").bind("user-carol").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("(d) a callback bound to authority_human_flows keeps resolving as ordinary login, untouched by genesis", async () => {
    const org = "genesis-normal-1";
    await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
      .bind(org, "Normal Org", "normal-owner", "unassigned", 0).run();
    await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,'123','canonical:github','canonical','1','active',NULL,'')").bind(org, "founder").run();
    const before = (await db.prepare("SELECT COUNT(*) n FROM authority_genesis_flows").first<{ n: number }>())!.n;
    const human: HumanServices = { ...services, provider: { ...services.provider, identify: async () => ({ subject: "123", handle: "founder" }) } };
    const flow = await beginHumanLogin(db, org, human);
    const login = await finishHumanLogin(db, { ...flow, code: "123" }, human);
    expect(login).not.toHaveProperty("created");
    const after = (await db.prepare("SELECT COUNT(*) n FROM authority_genesis_flows").first<{ n: number }>())!.n;
    expect(after).toBe(before);
  });

  it("(e) an organization born via genesis, with no registered installation, still rejects with configuration_unavailable", async () => {
    const result = await genesisLogin("erin");
    const actor = (await resolveHumanSession(db, result.token, result.organizationId, services))!;
    await expect(createInitialAuthorityEmission(db, result.organizationId, result.principalId, {
      now: () => now, issuer: "issuer-test", signer: signer(),
      initialIdentity: (o, id) => initialHumanIdentity(db, o, id, services),
      commitGuard: (id, at, evidence) => initialEmissionGuardStatement(db, actor, id, at, evidence),
    })).rejects.toThrow("authority_initial_emission_configuration_unavailable");
  });

  it("completes the full HTTP journey: POST /v1/authority/genesis/login then GET /v1/authority/human/callback", async () => {
    const origin = "https://authority.test";
    const routeServices: HumanRouteServices = { ...services, origin, issuer: "issuer-test", signer: signer() };
    const start = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/login",
      { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({}) }), routeServices);
    expect(start.status).toBe(200);
    const { authorizationUrl } = await start.json() as any;
    const state = new URL(authorizationUrl).searchParams.get("state");
    const flowCookie = start.headers.get("Set-Cookie")!.split(";")[0];
    const callback = await authorityHumanResponse(db, new Request(origin + `/v1/authority/human/callback?state=${state}&code=frank`,
      { headers: { Cookie: flowCookie } }), routeServices);
    expect(callback.status).toBe(200);
    const body = await callback.json() as any;
    expect(body).toMatchObject({ created: true });
    expect(body).not.toHaveProperty("token");
    const cookies = callback.headers.getSetCookie();
    expect(cookies.some(c => c.startsWith("__Host-authority-session="))).toBe(true);
    // Returning through the same route a second time reuses the organization.
    const secondStart = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/login",
      { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({}) }), routeServices);
    const secondState = new URL((await secondStart.json() as any).authorizationUrl).searchParams.get("state");
    const secondFlowCookie = secondStart.headers.get("Set-Cookie")!.split(";")[0];
    const secondCallback = await authorityHumanResponse(db, new Request(origin + `/v1/authority/human/callback?state=${secondState}&code=frank`,
      { headers: { Cookie: secondFlowCookie } }), routeServices);
    const secondBody = await secondCallback.json() as any;
    expect(secondBody).toMatchObject({ created: false, organizationId: body.organizationId });
  });

  it("GET /v1/authority/genesis/login redirects the browser straight into the same flow as the POST", async () => {
    // Encargo_Implementacion_Nucleus_Genesis_Bootstrap_v1_0.md §2.1: la CLI no puede
    // completar este login por su cuenta (cookie atada al navegador que lo inició), así
    // que abre el navegador directamente en esta variante GET. Mismo beginGenesis, mismo
    // provider fixture, sólo cambia la forma de la respuesta (302 + Location en vez de
    // JSON) para que un navegador la pueda seguir sin un fetch() intermedio.
    const origin = "https://authority.test";
    const routeServices: HumanRouteServices = { ...services, origin, issuer: "issuer-test", signer: signer() };
    const start = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/login",
      { method: "GET", headers: { Origin: origin } }), routeServices);
    expect(start.status).toBe(302);
    const location = start.headers.get("Location")!;
    expect(location).toContain("https://fixture.test/?state=");
    const flowCookie = start.headers.get("Set-Cookie")!.split(";")[0];
    expect(flowCookie.startsWith("__Host-authority-flow=")).toBe(true);

    const state = new URL(location).searchParams.get("state");
    const callback = await authorityHumanResponse(db, new Request(origin + `/v1/authority/human/callback?state=${state}&code=grace`,
      { headers: { Cookie: flowCookie } }), routeServices);
    expect(callback.status).toBe(200);
    const body = await callback.json() as any;
    expect(body).toMatchObject({ created: true });
    expect(body).not.toHaveProperty("token");
  });

  it("POST /v1/authority/genesis/login still returns JSON (200), untouched by the new GET branch", async () => {
    const origin = "https://authority.test";
    const routeServices: HumanRouteServices = { ...services, origin, issuer: "issuer-test", signer: signer() };
    const start = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/login",
      { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({}) }), routeServices);
    expect(start.status).toBe(200);
    const { authorizationUrl } = await start.json() as any;
    expect(typeof authorizationUrl).toBe("string");
  });
});
