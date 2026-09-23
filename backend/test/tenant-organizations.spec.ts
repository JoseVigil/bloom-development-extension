// backend/test/tenant-organizations.spec.ts
//
// Sovereign Tenant — Fase 3: createOrganizationUnderTenant + listTenantOrganizations
// (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.3.2-§2.3.4, autorizada por Jose el
// 2026-09-16). Archivo nuevo, aislado.
//
// Setup calcado de initial-emission.spec.ts (mismo helper `createOrg`, misma lista de
// migraciones), con dos diferencias:
//   - `organizations` se crea con el schema completo (igual que authority-genesis.spec.ts),
//     no con la versión de una sola columna de initial-emission.spec.ts, porque
//     tenant-store.ts inserta por nombre las columnas name/master_github_username/
//     key_fingerprint/tenant_id.
//   - se agrega `0015_tenants.sql` a la lista de migraciones, con el loader local
//     extendido a CREATE|ALTER|INSERT|UPDATE (mismo motivo que en los archivos de
//     Fase 1/2: el backfill de 0015 tiene un UPDATE).
//
// La organización de origen se lleva hasta tener una emisión inicial real (misma
// llamada a createInitialAuthorityEmission que ya prueba initial-emission.spec.ts) para
// poder probar el criterio de autorización real: ser master, vía la emisión vigente —
// no un atajo ni un mock de esa verificación.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorityHumanResponse, type HumanRouteServices } from "../src/authority/administration-route";
import { createOrganizationUnderTenant, listTenantOrganizations, TenantStoreError } from "../src/authority/tenant-store";
import { createInitialAuthorityEmission, initialEmissionGuardStatement } from "../src/authority/initial-emission";
import { loadCurrentEmission } from "../src/authority/emission-store";
import { beginHumanLogin, finishHumanLogin, initialHumanIdentity, resolveHumanSession, type HumanServices } from "../src/authority/human-session-store";

let db: D1Database, mf: Miniflare, temp: string, sequence = 0, privateKey: ArrayBuffer;
const now = "2026-09-16T12:00:00Z";
const masterPermissions = ["authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage",
  "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote",
  "mandate.install", "intent.create", "intent.cor.merge", "agent.issuer.designate", "create_project"];
const human: HumanServices = { now: () => now, encryptionKey: Buffer.alloc(32, 7).toString("base64"),
  provider: { source: "github-app", authorize: () => "https://github.test", exchange: async (code: string) => ({ token: code, expiresIn: 28800 }),
    identify: async (token: string) => ({ subject: token, handle: `user-${token}` }) } };
const signer = () => ({ privateKeyPkcs8: privateKey, keyId: "issuer-key" });

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

/** Crea una organización nueva desde cero (sin tenant), con instalación activa e
 * identidad canónica de un fundador — igual que `createOrg` de initial-emission.spec.ts. */
async function seedOrg(id: string, subject: string) {
  await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, id, `user-${subject}`, "unassigned", 0).run();
  await db.prepare("INSERT INTO installation_keys(installation_id,organization_id,public_key_raw,status,registered_at) VALUES(?,?,?,'active',0)")
    .bind(`installation-${id}`, id, "key").run();
  await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)")
    .bind(id, "founder", subject, now, `user-${subject}`).run();
}

/** Organización de origen, YA con tenant propio y master real (emisión inicial
 * publicada) — el estado que necesita cualquier prueba de Fase 3. */
async function createOriginWithMaster() {
  const org = `tenant-org-origin-${++sequence}`, subject = `subj-${sequence}`, tenantId = `tenant-${sequence}`;
  await seedOrg(org, subject);
  await db.prepare("INSERT INTO tenants(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(tenantId, org, `user-${subject}`, "unassigned", 0).run();
  await db.prepare("UPDATE organizations SET tenant_id=? WHERE id=?").bind(tenantId, org).run();

  const flow = await beginHumanLogin(db, org, human), login = await finishHumanLogin(db, { ...flow, code: subject }, human);
  const actor = (await resolveHumanSession(db, login.token, org, human))!;
  const identity = (await initialHumanIdentity(db, org, "founder", human))!;
  await createInitialAuthorityEmission(db, org, "founder", { now: () => now, issuer: "issuer-test", signer: signer(),
    initialIdentity: async () => identity, commitGuard: (id, at, evidence) => initialEmissionGuardStatement(db, actor, id, at, evidence) });
  return { org, tenantId, subject, login, actor };
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "tenant-organizations-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "tenant-organizations" } }),
    resourcePersistencePath: temp });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await loadMigrations(["0001_authority_snapshot.sql", "0002_authority_security.sql", "0004_authority_emissions.sql",
    "0005_authority_administration.sql", "0006_authority_human_identity.sql", "0009_authority_role_definition_status.sql",
    "0010_authority_initial_emission_guard.sql", "0015_tenants.sql"]);
  await db.prepare(`INSERT INTO role_definitions(id,organization_id,key,version,definition,since_version,created_at,status)
    VALUES('master-1',NULL,'master',1,?,1,0,'active')`).bind(JSON.stringify({ display_name: "Master", permissions: masterPermissions })).run();
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  privateKey = await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer;
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

describe("createOrganizationUnderTenant / listTenantOrganizations (Fase 3)", () => {
  it("(a) un master de la organización de origen crea una hermana con el mismo tenantId", async () => {
    const origin = await createOriginWithMaster();
    const result = await createOrganizationUnderTenant(db, origin.org, origin.actor, "Sibling Org", { now: () => now });
    expect(result.tenantId).toBe(origin.tenantId);

    const org = await db.prepare("SELECT * FROM organizations WHERE id=?").bind(result.organizationId).first<any>();
    expect(org).toMatchObject({ name: "Sibling Org", tenant_id: origin.tenantId, key_fingerprint: "unassigned" });

    const identity = await db.prepare("SELECT * FROM authority_human_identities WHERE organization_id=?").bind(result.organizationId).first<any>();
    expect(identity).toMatchObject({ subject: origin.subject, evidence_kind: "canonical", status: "active" });
    expect(identity.principal_id).not.toBe("founder"); // principal_id propio de la organización nueva, no reusado
    expect(identity.verified_at).not.toBeNull();
  });

  it("(b) rechaza a un actor que no es master de ninguna organización del tenant", async () => {
    const origin = await createOriginWithMaster();
    // Segunda identidad en la misma organización de origen, sin ningún rol asignado.
    await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)")
      .bind(origin.org, "outsider", "outsider-subject", now, "user-outsider-subject").run();
    const outsiderHuman: HumanServices = { ...human, provider: { ...human.provider, identify: async () => ({ subject: "outsider-subject", handle: "user-outsider-subject" }) } };
    const flow = await beginHumanLogin(db, origin.org, outsiderHuman);
    const login = await finishHumanLogin(db, { ...flow, code: "outsider-subject" }, outsiderHuman);
    const outsiderActor = (await resolveHumanSession(db, login.token, origin.org, outsiderHuman))!;
    await expect(createOrganizationUnderTenant(db, origin.org, outsiderActor, "Should Not Exist", { now: () => now }))
      .rejects.toThrow("authority_tenant_not_authorized");
  });

  it("(c) rechaza una organización de origen sin tenant asignado", async () => {
    const org = `no-tenant-${++sequence}`, subject = `subj-${sequence}`;
    await seedOrg(org, subject); // sin tenant_id: nunca pasó por Fase 1/2
    const flow = await beginHumanLogin(db, org, human), login = await finishHumanLogin(db, { ...flow, code: subject }, human);
    const actor = (await resolveHumanSession(db, login.token, org, human))!;
    await expect(createOrganizationUnderTenant(db, org, actor, "Should Not Exist", { now: () => now }))
      .rejects.toThrow("authority_tenant_tenant_unavailable");
  });

  it("(d) rechaza un nombre vacío sin tocar la base", async () => {
    const origin = await createOriginWithMaster();
    const before = await db.prepare("SELECT COUNT(*) n FROM organizations").first<{ n: number }>();
    await expect(createOrganizationUnderTenant(db, origin.org, origin.actor, "   ", { now: () => now }))
      .rejects.toThrow("authority_tenant_invalid_request");
    const after = await db.prepare("SELECT COUNT(*) n FROM organizations").first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it("(e) listTenantOrganizations devuelve todas las organizaciones del tenant, ordenadas por antigüedad", async () => {
    const origin = await createOriginWithMaster();
    const sibling = await createOrganizationUnderTenant(db, origin.org, origin.actor, "Sibling For Listing", { now: () => now });
    const organizations = await listTenantOrganizations(db, origin.org);
    expect(organizations.map(o => o.id)).toEqual([origin.org, sibling.organizationId]);
  });

  it("(f) HTTP de punta a punta: POST crea la hermana, GET la lista junto a la organización de origen", async () => {
    const origin = await createOriginWithMaster(), routeOrigin = "https://authority.test";
    const services: HumanRouteServices = { ...human, origin: routeOrigin, issuer: "issuer-test", signer: signer() };
    const post = await authorityHumanResponse(db, new Request(routeOrigin + "/v1/authority/tenant/organizations", {
      method: "POST", headers: { Origin: routeOrigin, "Content-Type": "application/json", "X-Authority-CSRF": origin.login.csrf,
        Cookie: `__Host-authority-session=${origin.login.token}` },
      body: JSON.stringify({ organizationId: origin.org, name: "HTTP Sibling" }),
    }), services);
    expect(post.status).toBe(201);
    const created = await post.json() as any;
    expect(created.tenantId).toBe(origin.tenantId);

    const get = await authorityHumanResponse(db, new Request(
      routeOrigin + `/v1/authority/tenant/organizations?organizationId=${origin.org}`,
      { headers: { Cookie: `__Host-authority-session=${origin.login.token}` } },
    ), services);
    expect(get.status).toBe(200);
    const { organizations } = await get.json() as any;
    expect(organizations.map((o: any) => o.id).sort()).toEqual([origin.org, created.organizationId].sort());
  });

  it("(g) GET sin sesión válida rechaza con 401, sin exponer la lista", async () => {
    const origin = await createOriginWithMaster(), routeOrigin = "https://authority.test";
    const services: HumanRouteServices = { ...human, origin: routeOrigin, issuer: "issuer-test", signer: signer() };
    const get = await authorityHumanResponse(db, new Request(
      routeOrigin + `/v1/authority/tenant/organizations?organizationId=${origin.org}`,
      { headers: { Cookie: "__Host-authority-session=invalid-token" } },
    ), services);
    expect(get.status).toBe(401);
  });
});
