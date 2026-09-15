import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, createPublicKey } from "node:crypto";
import { publishMandate, PublishError, type PublishMandateBody } from "../src/mandate-publish";
import { resolveMandateDelivery, MANDATE_DELIVERY_DOMAIN } from "../src/mandate-delivery";
import { canonicalizeJson, sha256HexBytes, signWithDomain, verifyWithDomain } from "../src/authority/canonical";
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

// §3 del Encargo de Implementación — Auto-Encadenamiento sync → install y Validación
// Cruzada del Contrato con Backend (v1.0): hasta este encargo, publishMandate() (probado
// acá con Miniflare D1 real) y resolveMandateDelivery() (probado en
// mandate-delivery.spec.ts con una fila de DB inventada a mano) nunca se encadenaban —
// ninguna prueba confirmaba que lo que escribe publishMandate sea, byte a byte, lo que
// resolveMandateDelivery entrega. Este describe cierra ese hueco reutilizando el mismo
// env (mismo D1, mismo bucket fake) entre ambas llamadas, sin recrear nada entre medio.
//
// NO se levanta Batcave acá: no existe ningún proxy de Batcave para POST
// /v1/mandate/publish (confirmado leyendo installer/batcave/src/server/http-server.ts —
// createApp sólo monta createAuthorityProxyRoutes y createMandateDeliveryProxyRoutes, y
// esta última sólo cubre el bootstrap GET), y Batcave nunca "se comunica con Nucleus": es
// Nucleus quien lo llama a él, nunca al revés, y Backend no llama a Nucleus en ninguna
// dirección. app.request() contra la instancia real de Hono (`../src/index`) ya ejercita
// las dos rutas HTTP reales de Backend — la superficie de contrato que este encargo pide
// validar. El pass-through de Batcave tiene su propia suite aislada
// (installer/batcave/src/server/routes/mandate-delivery-proxy.test.ts) y no se duplica acá.
describe("publish → resolveMandateDelivery round trip", () => {
  // PUBLIC TEST FIXTURE ONLY. Deterministic seed, never a production credential — mismo
  // criterio que mandate-delivery.spec.ts. Semilla distinta (0x03) para no confundir este
  // vector con el de mandate-delivery.spec.ts si ambos conviven en testdata/.
  const roundtripPrivateDer = Buffer.from("302e020100300506032b657004220420" + "03".repeat(32), "hex");
  const roundtripPrivateKey = createPrivateKey({ key: roundtripPrivateDer, format: "der", type: "pkcs8" });
  const roundtripPublicRaw = createPublicKey(roundtripPrivateKey).export({ format: "der", type: "spki" }).subarray(-32);
  const roundtripVectorPath = new URL(
    "../../installer/nucleus/internal/mandatedelivery/testdata/mandate-publish-then-bootstrap-v1.json",
    import.meta.url,
  );

  // Extiende env() sólo para este describe — no se toca el env() que ya usan los tests de
  // arriba. AUTHORITY_SIGNING_KEY_* es lo único que resolveMandateDelivery necesita además
  // de DB/MANDATES.
  async function envWithSigning(): Promise<Env> {
    const base = await env();
    return {
      ...base,
      AUTHORITY_SIGNING_KEY_PKCS8_B64: roundtripPrivateDer.toString("base64"),
      AUTHORITY_SIGNING_KEY_ID: "roundtrip-test-key",
    } as unknown as Env;
  }

  async function registerInstallation(e: Env) {
    await e.DB.prepare(`INSERT INTO installation_keys (installation_id, organization_id, public_key_raw, status, registered_at)
      VALUES (?, ?, ?, 'active', ?)`).bind("installation-test", "org-test", Buffer.from(roundtripPublicRaw).toString("base64"), Date.now()).run();
  }
  async function signedHeaders(method: string, path: string, domain = "BLOOM-INSTALLATION-AUTH-v1") {
    const timestamp = new Date().toISOString();
    const payload = canonicalizeJson({ installation_id: "installation-test", organization_id: "org-test", method, path, timestamp });
    return { "X-Bloom-Installation-Id": "installation-test", "X-Bloom-Timestamp": timestamp, "X-Bloom-Signature": await signWithDomain(domain, payload, array(roundtripPrivateDer)) };
  }

  it("§3.2 — lo que publishMandate escribe es exactamente lo que resolveMandateDelivery entrega, sin recrear nada entre medio", async () => {
    const e = await envWithSigning();
    const bytes = bytesFor(30);
    const published = await publishMandate(e, "org-test", await body({}, bytes));

    const delivery = await resolveMandateDelivery(e, "org-test", "installation-test", new Date());

    // El artefacto vuelve byte a byte idéntico al publicado.
    expect(Buffer.from(delivery.mandate_base64, "base64")).toEqual(Buffer.from(bytes));
    // mandate_id y digest del envelope son, literalmente, lo que devolvió publishMandate.
    expect(delivery.envelope.mandate_id).toBe(published.mandate_id);
    expect(delivery.envelope.mandate_digest).toBe(await sha256HexBytes(bytes));
    // La firma del envelope verifica contra la clave pública de test. resolveMandateDelivery
    // firma sólo `payload` (sin signing_key_id — ver mandate-delivery.ts), así que hay que
    // excluir también signing_key_id acá, no sólo signature, o el canonical recalculado no
    // coincide con lo que realmente se firmó.
    const { signature, signing_key_id, ...payload } = delivery.envelope;
    const canonical = canonicalizeJson(payload);
    expect(await verifyWithDomain(MANDATE_DELIVERY_DOMAIN, canonical, signature, array(roundtripPublicRaw))).toBe(true);
  });

  it("§3.2 (negativo) — bootstrap: false nunca queda disponible para bootstrap (404 mandate_pending)", async () => {
    const e = await envWithSigning();
    await publishMandate(e, "org-test", await body({ bootstrap: false }, bytesFor(31)));
    await expect(resolveMandateDelivery(e, "org-test", "installation-test", new Date())).rejects.toMatchObject({ status: 404 });
  });

  it("§3.3 — HTTP de punta a punta: POST /v1/mandate/publish firmado seguido de GET /v1/mandate/bootstrap firmado, mismo env", async () => {
    const e = await envWithSigning();
    await registerInstallation(e);
    const bytes = bytesFor(32);

    // El path que se firma es SIEMPRE el pathname sin query string — verifyInstallationAuth
    // (index.ts) verifica contra `new URL(context.req.url).pathname`, nunca contra la URL
    // completa. El path pasado a app.request() sí lleva la query (?org=...) porque eso es
    // lo que Hono necesita para rutear; son dos valores distintos a propósito.
    const publishPath = "/v1/mandate/publish?org=org-test";
    const publishResponse = await app.request(publishPath, {
      method: "POST",
      body: JSON.stringify(await body({}, bytes)),
      headers: { ...(await signedHeaders("POST", "/v1/mandate/publish")), "Content-Type": "application/json" },
    }, e);
    expect(publishResponse.status).toBe(200);
    const publishParsed = await publishResponse.json() as any;
    expect(publishParsed.bootstrap_assigned).toBe(true);

    const bootstrapPath = "/v1/mandate/bootstrap?org=org-test&installation_id=installation-test";
    const bootstrapResponse = await app.request(bootstrapPath, { headers: await signedHeaders("GET", "/v1/mandate/bootstrap") }, e);
    expect(bootstrapResponse.status).toBe(200);
    const bootstrapParsed = await bootstrapResponse.json() as any;

    expect(Buffer.from(bootstrapParsed.mandate_base64, "base64")).toEqual(Buffer.from(bytes));
    expect(bootstrapParsed.envelope.mandate_id).toBe(publishParsed.mandate_id);
    const { signature, signing_key_id, ...payload } = bootstrapParsed.envelope;
    const canonical = canonicalizeJson(payload);
    expect(await verifyWithDomain(MANDATE_DELIVERY_DOMAIN, canonical, signature, array(roundtripPublicRaw))).toBe(true);
  });

  // §3.4 (opcional pero recomendado) — mismo mecanismo que MANDATE_DELIVERY_UPDATE_VECTOR
  // en mandate-delivery.spec.ts: gateado detrás de una env var explícita, nunca silencioso.
  // Bootstrap inicial: correr una vez con MANDATE_ROUNDTRIP_UPDATE_VECTOR=1 para generar
  // installer/nucleus/internal/mandatedelivery/testdata/mandate-publish-then-bootstrap-v1.json
  // (no existe todavía en el repo — este test falla con ENOENT hasta esa corrida inicial).
  it("§3.4 — reproduce el vector de interoperabilidad publish→bootstrap byte a byte", async () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const e = await envWithSigning();
    const bytes = bytesFor(90);
    // publishMandate() asigna `mandate_id` con crypto.randomUUID() cuando el mandate es
    // nuevo (mandate-publish.ts línea ~90) — no hay forma de inyectarlo desde afuera, ni
    // debería haberla, no es parte del contrato público. Para que el vector sea
    // reproducible byte a byte entre corridas (el punto entero de este mecanismo), se
    // pre-siembra la fila de `mandates` para (org-test, roundtrip-vector) con un id fijo:
    // publishMandate encuentra `existingMandate` y reutiliza ese id — el mismo camino que
    // ya usa la función para cualquier republicación — en vez de generar uno al azar.
    const fixedMandateId = "mandate-roundtrip-vector-fixture";
    await db.prepare(
      `INSERT INTO mandates (id, origin_org_id, slug, description, visibility, latest_version, pillar, origin_type, created_at)
       VALUES (?, 'org-test', 'roundtrip-vector', '', 'private', '0.0.0', NULL, NULL, 0)`,
    ).bind(fixedMandateId).run();

    const published = await publishMandate(e, "org-test", await body({ slug: "roundtrip-vector", version: "1.0.0" }, bytes));
    expect(published.mandate_id).toBe(fixedMandateId);
    const delivery = await resolveMandateDelivery(e, "org-test", "installation-test", now);

    const { signature, signing_key_id, ...payload } = delivery.envelope;
    const canonical = canonicalizeJson(payload);
    const wrong = { ...delivery, envelope: { ...delivery.envelope, signature: await signWithDomain("BLOOM-AUTHORITY-SNAPSHOT-v1", canonical, array(roundtripPrivateDer)) } };
    const vector = {
      format: "mandate-publish-then-bootstrap-v1",
      warning: "PUBLIC TEST PRIVATE KEY - NEVER USE IN PRODUCTION",
      generator: "backend/test/mandate-publish.spec.ts",
      issuer: "test-issuer",
      key_id: signing_key_id,
      test_private_pkcs8_base64: roundtripPrivateDer.toString("base64"),
      public_key_base64: Buffer.from(roundtripPublicRaw).toString("base64"),
      now: now.toISOString(),
      mandate_id: published.mandate_id,
      artifact_base64: Buffer.from(bytes).toString("base64"),
      digest: payload.mandate_digest,
      canonical_base64: Buffer.from(canonical).toString("base64"),
      valid_body_base64: Buffer.from(JSON.stringify(delivery)).toString("base64"),
      wrong_domain_body_base64: Buffer.from(JSON.stringify(wrong)).toString("base64"),
    };
    if (process.env.MANDATE_ROUNDTRIP_UPDATE_VECTOR === "1") writeFileSync(roundtripVectorPath, JSON.stringify(vector, null, 2) + "\n");
    expect(JSON.parse(readFileSync(roundtripVectorPath, "utf8"))).toEqual(vector);
  });
});
