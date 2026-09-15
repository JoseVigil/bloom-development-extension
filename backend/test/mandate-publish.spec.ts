import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { publishMandate, PublishError, type PublishMandateBody } from "../src/mandate-publish";
import { canonicalizeJson, sha256HexBytes, signWithDomain } from "../src/authority/canonical";
import app from "../src/index";

let db: D1Database, mf: Miniflare, temp: string;

// PUBLIC TEST FIXTURE ONLY. Deterministic seed, never a production credential — mismo
// criterio que mandate-delivery.spec.ts.
const privateDer = Buffer.from("302e020100300506032b657004220420" + "02".repeat(32), "hex");
const privateKey = createPrivateKey({ key: privateDer, format: "der", type: "pkcs8" });
const publicRaw = createPublicKey(privateKey).export({ format: "der", type: "spki" }).subarray(-32);
function array(b: Uint8Array): ArrayBuffer { return new Uint8Array(b).buffer; }

// Fake R2 mínimo — mismo criterio que mandate-delivery.spec.ts (mockea env.MANDATES en
// vez de levantar un bucket Miniflare real; sólo se usan .put/.get acá).
function fakeBucket() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async put(key: string, value: Uint8Array) { store.set(key, new Uint8Array(value)); },
    async get(key: string) {
      const value = store.get(key);
      if (!value) return null;
      return { arrayBuffer: async () => array(value) };
    },
  };
}

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

async function env(): Promise<Env> {
  return { DB: db, MANDATES: fakeBucket() as any } as unknown as Env;
}

async function insertOrg(id: string) {
  await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, "Test Org", "owner-" + id, "unassigned", 0).run();
}

function bytesFor(seed: number): Uint8Array { return new Uint8Array([seed, seed + 1, seed + 2, 9, 0, 255]); }

async function body(overrides: Partial<PublishMandateBody> = {}, bytes: Uint8Array = bytesFor(1)): Promise<PublishMandateBody> {
  return {
    slug: "genesis-bootstrap",
    version: "1.0.0",
    visibility: "private",
    mandate_base64: Buffer.from(bytes).toString("base64"),
    sha256: await sha256HexBytes(bytes),
    bootstrap: true,
    ...overrides,
  };
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "mandate-publish-"));
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: "127.0.0.1", cf: false, modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-08-29", d1Databases: { DB: "mandate-publish" },
    }),
    resourcePersistencePath: temp,
  });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  // El schema se crea una sola vez acá — 0000_initial.sql también crea users/org_members/
  // releases/download_rules/mandate_adoptions, que un DROP+recreate por test tendría que
  // volver a tocar sin necesidad. Cada test arranca limpio vía DELETE FROM en beforeEach.
  await loadMigrations(["0000_initial.sql", "0002_authority_security.sql", "0003_organization_bootstrap_mandates.sql"]);
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

beforeEach(async () => {
  for (const table of ["organization_bootstrap_mandates", "mandate_versions", "mandates", "installation_keys", "organizations"])
    await db.prepare(`DELETE FROM ${table}`).run();
  await insertOrg("org-test");
});

describe("publishMandate", () => {
  it("publicación exitosa crea las tres filas (mandates, mandate_versions, organization_bootstrap_mandates)", async () => {
    const e = await env();
    const result = await publishMandate(e, "org-test", await body());
    expect(result.bootstrap_assigned).toBe(true);

    const mandate = await db.prepare("SELECT * FROM mandates WHERE id = ?").bind(result.mandate_id).first<any>();
    expect(mandate).toMatchObject({ origin_org_id: "org-test", slug: "genesis-bootstrap", visibility: "private", latest_version: "1.0.0", pillar: null, origin_type: null });

    const version = await db.prepare("SELECT * FROM mandate_versions WHERE id = ?").bind(result.mandate_version_id).first<any>();
    expect(version).toMatchObject({ mandate_id: result.mandate_id, version: "1.0.0", r2_key: `mandates/org-test/genesis-bootstrap/1.0.0.json` });

    const bootstrap = await db.prepare("SELECT * FROM organization_bootstrap_mandates WHERE organization_id = ?").bind("org-test").first<any>();
    expect(bootstrap).toMatchObject({ mandate_version_id: result.mandate_version_id });
    expect(bootstrap.assigned_at).toBe(bootstrap.updated_at);
  });

  it("segunda llamada idéntica (mismo sha256) es idempotente y no duplica", async () => {
    const e = await env();
    const b = await body();
    const first = await publishMandate(e, "org-test", b);
    const second = await publishMandate(e, "org-test", b);
    expect(second.mandate_version_id).toBe(first.mandate_version_id);
    expect(second.mandate_id).toBe(first.mandate_id);

    const count = await db.prepare("SELECT COUNT(*) n FROM mandate_versions").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("segunda llamada con sha256 distinto para la misma versión devuelve 409", async () => {
    const e = await env();
    await publishMandate(e, "org-test", await body());
    await expect(publishMandate(e, "org-test", await body({}, bytesFor(50)))).rejects.toMatchObject({ status: 409 });

    // No duplica mandate_versions: sigue habiendo exactamente una fila.
    const count = await db.prepare("SELECT COUNT(*) n FROM mandate_versions").first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("bootstrap: false no toca organization_bootstrap_mandates", async () => {
    const e = await env();
    const result = await publishMandate(e, "org-test", await body({ bootstrap: false }));
    expect(result.bootstrap_assigned).toBe(false);
    const bootstrap = await db.prepare("SELECT * FROM organization_bootstrap_mandates WHERE organization_id = ?").bind("org-test").first();
    expect(bootstrap).toBeNull();
  });

  it("sha256 declarado no coincide con el recalculado — rechazo antes de tocar la base", async () => {
    const e = await env();
    const bytes = bytesFor(7);
    const wrong = await body({ sha256: await sha256HexBytes(bytesFor(99)) }, bytes);
    await expect(publishMandate(e, "org-test", wrong)).rejects.toMatchObject({ status: 400 });

    const mandates = await db.prepare("SELECT COUNT(*) n FROM mandates").first<{ n: number }>();
    const versions = await db.prepare("SELECT COUNT(*) n FROM mandate_versions").first<{ n: number }>();
    expect(mandates?.n).toBe(0);
    expect(versions?.n).toBe(0);
  });

  it("republicar un mandate existente con una versión nueva actualiza latest_version y agrega una segunda fila de versión", async () => {
    const e = await env();
    const first = await publishMandate(e, "org-test", await body());
    const second = await publishMandate(e, "org-test", await body({ version: "1.1.0" }, bytesFor(20)));
    expect(second.mandate_id).toBe(first.mandate_id);
    expect(second.mandate_version_id).not.toBe(first.mandate_version_id);

    const mandate = await db.prepare("SELECT latest_version FROM mandates WHERE id = ?").bind(first.mandate_id).first<{ latest_version: string }>();
    expect(mandate?.latest_version).toBe("1.1.0");
    const count = await db.prepare("SELECT COUNT(*) n FROM mandate_versions WHERE mandate_id = ?").bind(first.mandate_id).first<{ n: number }>();
    expect(count?.n).toBe(2);

    const bootstrap = await db.prepare("SELECT mandate_version_id FROM organization_bootstrap_mandates WHERE organization_id = ?").bind("org-test").first<{ mandate_version_id: string }>();
    expect(bootstrap?.mandate_version_id).toBe(second.mandate_version_id);
  });

  it("rechaza body inválido (campos obligatorios ausentes) sin tocar la base", async () => {
    const e = await env();
    await expect(publishMandate(e, "org-test", null)).rejects.toBeInstanceOf(PublishError);
    await expect(publishMandate(e, "org-test", { ...await body(), slug: "" })).rejects.toMatchObject({ status: 400 });
    await expect(publishMandate(e, "org-test", { ...await body(), visibility: "bogus" as any })).rejects.toMatchObject({ status: 400 });
  });
});

describe("POST /v1/mandate/publish", () => {
  async function registerInstallation() {
    await db.prepare(`INSERT INTO installation_keys (installation_id, organization_id, public_key_raw, status, registered_at)
      VALUES (?, ?, ?, 'active', ?)`).bind("installation-test", "org-test", Buffer.from(publicRaw).toString("base64"), Date.now()).run();
  }
  async function signedHeaders(path: string, domain = "BLOOM-INSTALLATION-AUTH-v1") {
    const timestamp = new Date().toISOString();
    const payload = canonicalizeJson({ installation_id: "installation-test", organization_id: "org-test", method: "POST", path, timestamp });
    return { "X-Bloom-Installation-Id": "installation-test", "X-Bloom-Timestamp": timestamp, "X-Bloom-Signature": await signWithDomain(domain, payload, array(privateDer)), "Content-Type": "application/json" };
  }

  it("requiere S2S y, autenticado, publica y devuelve 200", async () => {
    await registerInstallation();
    const e = await env();
    const path = "/v1/mandate/publish?org=org-test";
    const requestBody = JSON.stringify(await body());

    expect((await app.request(path, { method: "POST", body: requestBody, headers: { "Content-Type": "application/json" } }, e)).status).toBe(401);

    const response = await app.request(path, { method: "POST", body: requestBody, headers: await signedHeaders("/v1/mandate/publish") }, e);
    expect(response.status).toBe(200);
    const parsed = await response.json() as any;
    expect(parsed.bootstrap_assigned).toBe(true);

    const bootstrap = await db.prepare("SELECT * FROM organization_bootstrap_mandates WHERE organization_id = ?").bind("org-test").first();
    expect(bootstrap).not.toBeNull();
  });

  it("mapea PublishError a su status HTTP (409 en conflicto de versión)", async () => {
    await registerInstallation();
    const e = await env();
    const path = "/v1/mandate/publish?org=org-test";
    const headers = await signedHeaders("/v1/mandate/publish");
    await app.request(path, { method: "POST", body: JSON.stringify(await body()), headers }, e);
    const conflict = await app.request(path, { method: "POST", body: JSON.stringify(await body({}, bytesFor(80))), headers: await signedHeaders("/v1/mandate/publish") }, e);
    expect(conflict.status).toBe(409);
  });
});
