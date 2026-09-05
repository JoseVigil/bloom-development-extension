// backend/test/identity.spec.ts
//
// SUPUESTO: no tengo visibilidad en esta sesión del harness de test real del proyecto
// (`backend/test/authority.spec.ts` original, `vitest.config.ts`, `wrangler.jsonc`).
// Asumo `@cloudflare/vitest-pool-workers` con un binding `env.DB` (D1) igual al que usa
// el resto del proyecto, y que las migraciones 0001 + 0002 ya fueron aplicadas
// localmente antes de `npm test` (§4 del encargo: `wrangler d1 migrations apply
// bloom-backend --local`). También asumo que existe una fila en `organizations` para
// los ids usados acá — si el proyecto tiene un helper de setup para crear una
// organización de test, usarlo en vez de los literales de abajo.
//
// SUPUESTO adicional: el mensaje firmado se reconstruye acá de forma independiente de
// `canonical.ts` (dominio + 0x00 + JSON con claves en orden alfabético), para no
// encadenar la validez de estos tests a los detalles internos de esa implementación.
// Si `canonicalizeJson` no es equivalente a "JSON.stringify con claves ordenadas
// alfabéticamente" para este objeto plano de 5 campos string, estos tests fallarán aun
// con una implementación correcta — en ese caso, reemplazar `canonicalPayload` de abajo
// por una llamada directa a `canonicalizeJson` importada de `../src/authority/canonical`.

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  INSTALLATION_AUTH_DOMAIN,
  readInstallationAuthHeaders,
  registerInstallationKey,
  verifyInstallationSignature,
  type InstallationAuthHeaders,
} from "../src/authority/identity";

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
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keypair.publicKey);
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

    const registerResult = await registerInstallationKey(env.DB, {
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

    const verified = await verifyInstallationSignature(env.DB, {
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

    const verified = await verifyInstallationSignature(env.DB, {
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
    await registerInstallationKey(env.DB, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

    // La instalación está registrada para `organizationId`, pero el request se firma y
    // se verifica declarando `otherOrganizationId`.
    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId: otherOrganizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: new Date().toISOString(),
    });

    const verified = await verifyInstallationSignature(env.DB, {
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
    await registerInstallationKey(env.DB, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

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

    const verified = await verifyInstallationSignature(env.DB, {
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
    await registerInstallationKey(env.DB, { installationId, organizationId, publicKeyRaw: publicKeyRawBase64 });

    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutos atrás
    const headers = await signInstallationRequest(privateKey, {
      installationId,
      organizationId,
      method: "GET",
      path: "/v1/authority/snapshot",
      timestamp: staleTimestamp,
    });

    const verified = await verifyInstallationSignature(env.DB, {
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

    const firstResult = await registerInstallationKey(env.DB, {
      installationId,
      organizationId,
      publicKeyRaw: first.publicKeyRawBase64,
    });
    expect(firstResult.ok).toBe(true);

    const secondResult = await registerInstallationKey(env.DB, {
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
