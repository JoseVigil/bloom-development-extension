// backend/test/identity.spec.ts
//
// Reescrito para usar el arnés Miniflare + D1 real (mismo patrón que
// mandate-publish.spec.ts / authority-genesis.spec.ts) en vez de `cloudflare:test`, que
// requiere `@cloudflare/vitest-pool-workers` — no instalado ni configurado en este
// proyecto (`vitest.config.mts` usa `defineConfig` de "vitest/config", no
// `defineWorkersConfig`), lo que hacía que este archivo nunca pudiera ejecutarse, en
// ninguna máquina, vía `npm test`. La lógica de cada test no cambió — sólo el
// setup/teardown y el reemplazo de `env.DB` por la variable `db` del módulo.
//
// SUPUESTO (sin cambios respecto a la versión anterior): el mensaje firmado se
// reconstruye acá de forma independiente de `canonical.ts` (dominio + 0x00 + JSON con
// claves en orden alfabético), para no encadenar la validez de estos tests a los
// detalles internos de esa implementación. Si `canonicalizeJson` no es equivalente a
// "JSON.stringify con claves ordenadas alfabéticamente" para este objeto plano de 5
// campos string, estos tests fallarán aun con una implementación correcta — en ese caso,
// reemplazar `canonicalPayload` de abajo por una llamada directa a `canonicalizeJson`
// importada de `../src/authority/canonical`.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INSTALLATION_AUTH_DOMAIN,
  readInstallationAuthHeaders,
  registerInstallationKey,
  verifyInstallationSignature,
  type InstallationAuthHeaders,
} from "../src/authority/identity";

let db: D1Database, mf: Miniflare, temp: string;

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

async function insertOrg(id: string) {
  await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, "Test Org", "owner-" + id, "unassigned", 0).run();
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "identity-"));
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: "127.0.0.1", cf: false, modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-08-29", d1Databases: { DB: "identity" },
    }),
    resourcePersistencePath: temp,
  });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  // 0000_initial.sql da `organizations` (FK de installation_keys); 0002 da
  // `installation_keys`. Cada test arranca limpio vía DELETE FROM en beforeEach.
  await loadMigrations(["0000_initial.sql", "0002_authority_security.sql"]);
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

beforeEach(async () => {
  for (const table of ["installation_keys", "organizations"]) await db.prepare(`DELETE FROM ${table}`).run();
  await insertOrg("org_test_identity_1");
  await insertOrg("org_test_identity_2");
});

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function generateInstallationKeypair() {
  const keypair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keypair.publicKey) as ArrayBuffer;
  return { privateKey: keypair.privateKey, publicKeyRawBase64: toBase64(publicKeyRaw) };
}

async function signInstallationRequest(
  privateKey: CryptoKey,
  payload: { installationId: string; organizationId: string; method: string; path: string; timestamp: string },
): Promise<InstallationAuthHeaders> {
  // Claves en orden alfabético: installation_id, method, organization_id, path, timestamp.
  const canonicalPayload = JSON.stringify({
    installation_id: payload.installationId,
    method: payload.method,
    organization_id: payload.organizationId,
    path: payload.path,
    timestamp: payload.timestamp,
  });
  const message = concatBytes(
    new TextEncoder().encode(INSTALLATION_AUTH_DOMAIN),
    new Uint8Array([0x00]),
    new TextEncoder().encode(canonicalPayload),
  );
  const signature = await crypto.subtle.sign("Ed25519", privateKey, message);
  return {
    installationId: payload.installationId,
    timestamp: payload.timestamp,
    signatureBase64: toBase64(signature),
  };
}

describe("registerInstallationKey / verifyInstallationSignature (§1.1)", () => {
  const organizationId = "org_test_identity_1";
  const otherOrganizationId = "org_test_identity_2";

  it("roundtrip: una instalación registrada puede firmar y verificar un request", async () => {
    const { privateKey, publicKeyRawBase64 } = await generateInstallationKeypair();
    const installationId = "inst_roundtrip";

    const registerResult = await registerInstallationKey(db, {
      installationId,
      organizationId,
      publicKeyRaw: publicKeyRawBase64,
    });
    expect(registerResult.ok).toBe(true);

    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: new Date().toISOString(),
    });

    const verified = await verifyInstallationSignature(db, {
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
    });
    expect(verified).toBe(true);
  });

  it("rechaza si no hay clave activa registrada para ese installation_id", async () => {
    const { privateKey } = await generateInstallationKeypair();
    const headers = await signInstallationRequest(privateKey, {
      installationId: "inst_never_registered",
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: new Date().toISOString(),
    });

    const verified = await verifyInstallationSignature(db, {
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
    });
    expect(verified).toBe(false);
  });

  it("rechaza cuando la organización del request no coincide con la de la clave registrada", async () => {
    const { privateKey, publicKeyRawBase64 } = await generateInstallationKeypair();
    const installationId = "inst_cross_org";
    await registerInstallationKey(db, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

    // La instalación está registrada para `organizationId`, pero el request se firma y
    // se verifica declarando `otherOrganizationId`.
    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId: otherOrganizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: new Date().toISOString(),
    });

    const verified = await verifyInstallationSignature(db, {
      organizationId: otherOrganizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
    });
    expect(verified).toBe(false);
  });

  it("rechaza si la firma fue alterada", async () => {
    const { privateKey, publicKeyRawBase64 } = await generateInstallationKeypair();
    const installationId = "inst_tampered";
    await registerInstallationKey(db, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: new Date().toISOString(),
    });
    const tamperedHeaders: InstallationAuthHeaders = {
      ...headers,
      signatureBase64: headers.signatureBase64.slice(0, -4) + (headers.signatureBase64.slice(-4) === "AAAA" ? "BBBB" : "AAAA"),
    };

    const verified = await verifyInstallationSignature(db, {
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      headers: tamperedHeaders,
    });
    expect(verified).toBe(false);
  });

  it("rechaza si el timestamp está fuera de la ventana de ±120s", async () => {
    const { privateKey, publicKeyRawBase64 } = await generateInstallationKeypair();
    const installationId = "inst_stale_timestamp";
    await registerInstallationKey(db, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutos atrás
    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: staleTimestamp,
    });

    const verified = await verifyInstallationSignature(db, {
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
    });
    expect(verified).toBe(false);
  });

  it("rechaza un segundo registro sobre un installation_id ya activo", async () => {
    const first = await generateInstallationKeypair();
    const second = await generateInstallationKeypair();
    const installationId = "inst_double_register";

    const firstResult = await registerInstallationKey(db, {
      installationId,
      organizationId,
      publicKeyRaw: first.publicKeyRawBase64,
    });
    expect(firstResult.ok).toBe(true);

    const secondResult = await registerInstallationKey(db, {
      installationId,
      organizationId,
      publicKeyRaw: second.publicKeyRawBase64,
    });
    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.reason).toBe("conflict");
    }
  });
});

describe("readInstallationAuthHeaders", () => {
  it("devuelve null si falta cualquiera de los 3 headers requeridos", () => {
    const request = new Request("https://example.test/v1/authority/snapshot", {
      headers: { "X-Bloom-Installation-Id": "inst_1" },
    });
    expect(readInstallationAuthHeaders(request)).toBeNull();
  });

  it("lee los 3 headers cuando están presentes", () => {
    const request = new Request("https://example.test/v1/authority/snapshot", {
      headers: {
        "X-Bloom-Installation-Id": "inst_1",
        "X-Bloom-Timestamp": "2026-09-04T12:00:00.000Z",
        "X-Bloom-Signature": "c2lnbmF0dXJl",
      },
    });
    expect(readInstallationAuthHeaders(request)).toEqual({
      installationId: "inst_1",
      timestamp: "2026-09-04T12:00:00.000Z",
      signatureBase64: "c2lnbmF0dXJl",
    });
  });
});
