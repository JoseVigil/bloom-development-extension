// backend/test/authority.spec.ts
//
// SUPUESTO DE DISEÑO: no tengo `backend/test/manifest.spec.ts` en esta sesión, así que no
// puedo replicar literalmente "el mismo patrón" (harness exacto, helpers de setup de D1,
// convención de nombres). Asumo el harness estándar de Cloudflare Workers + vitest
// (`@cloudflare/vitest-pool-workers`, import de bindings desde `cloudflare:test`), que es
// lo esperable dado que `vitest.config.mts` existe en el árbol y el proyecto es un Worker
// con D1. Confirmar contra manifest.spec.ts real y ajustar imports/setup si el patrón
// existente es distinto (p. ej. si usa un mock de D1Database en vez de miniflare real).

import { describe, expect, it } from "vitest";
// @ts-expect-error -- provisto en runtime por @cloudflare/vitest-pool-workers; ajustar el
// import si manifest.spec.ts usa otro mecanismo de acceso a bindings de test.
import { env } from "cloudflare:test";

import { canonicalizeJson, digestCanonical, sha256Hex, signDigest, verifyDigestSignature } from "../src/authority/schema-canonical-shim";
import {
  resolveAuthoritySnapshot,
  type AuthoritySigningContext,
} from "../src/authority/snapshot";

// -----------------------------------------------------------------------------------
// Fixtures de firma para tests (Ed25519). NO son las claves reales del Worker — se
// generan en memoria sólo para que el test pueda firmar/verificar sin depender de
// `wrangler secret put`. `crypto.subtle.generateKey` corre igual bajo el pool de
// Workers de vitest.
// -----------------------------------------------------------------------------------

async function generateTestSigningContext(): Promise<{
  signing: AuthoritySigningContext;
  publicKeyRaw: ArrayBuffer;
}> {
  const keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return {
    signing: { signingKeyId: "test-key-1", signingKeyPkcs8: pkcs8 },
    publicKeyRaw,
  };
}

describe("canonicalizeJson / digestCanonical (RFC 8785)", () => {
  it("produce el mismo output sin importar el orden de inserción de claves", () => {
    const a = canonicalizeJson({ b: 1, a: 2, c: { z: 1, y: 2 } });
    const b = canonicalizeJson({ a: 2, c: { y: 2, z: 1 }, b: 1 });
    expect(a).toBe(b);
    // JCS ordena claves lexicográficamente por code point.
    expect(a).toBe('{"a":2,"b":1,"c":{"y":2,"z":1}}');
  });

  it("digestCanonical es determinístico para el mismo valor lógico", async () => {
    const first = await digestCanonical({ x: 1, y: [1, 2, 3] });
    const second = await digestCanonical({ y: [1, 2, 3], x: 1 });
    expect(first.digestHex).toBe(second.digestHex);
    expect(first.digestHex).toHaveLength(64); // sha256 hex
  });

  it("sha256Hex coincide con un vector conocido (cadena vacía)", async () => {
    // Vector estándar SHA-256("") — no depende de canonicalización, sólo valida el
    // wrapper de digest.
    const digest = await sha256Hex("");
    expect(digest).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".slice(0, 64));
  });

  // ---------------------------------------------------------------------------------
  // Vector de prueba cruzado Go (gowebpki/jcs, Nucleus) / JS (canonicalize, Backend) —
  // exigido explícitamente por §4 del encargo y por la Nota técnica de riesgos §3.
  //
  // ESTADO: NO VERIFICADO EN ESTA SESIÓN. No tengo acceso al binario/módulo Go de Nucleus
  // (`internal/authority`) desde este entorno de tests, así que no puedo generar el
  // digest de referencia real. Dejar este test como `.todo` es intencional: un test que
  // simplemente compara la salida de `canonicalizeJson` contra sí misma no prueba nada
  // (ya lo cubren los tests de arriba) y afirmar "cumple RFC 8785" sin el vector cruzado
  // real es exactamente el riesgo que la Nota técnica §3 pide no asumir.
  //
  // Acción pendiente antes de cerrar esta fase: correr el mismo payload lógico de abajo
  // por la implementación Go de Nucleus, pegar el digest resultante en
  // `EXPECTED_DIGEST_FROM_NUCLEUS_GO`, y promover este test de `.todo` a real.
  // ---------------------------------------------------------------------------------
  it.todo("digest cruzado Go(gowebpki/jcs)/JS(canonicalize) coincide byte a byte — pendiente de vector real de Nucleus");

  it("caso límite: orden de claves Unicode y escapes no rompe el canonicalizador", () => {
    const payload = { "\u00e9": 1, a: "line1\nline2\ttab\"quote", z: -0, n: 1e21 };
    const canonical = canonicalizeJson(payload);
    // No se afirma un output exacto acá (eso es justamente lo que el vector cruzado
    // pendiente de arriba debe validar contra Go) — sólo que no explota y que es
    // determinístico frente al mismo input.
    expect(canonicalizeJson(payload)).toBe(canonical);
    expect(() => JSON.parse(canonical)).not.toThrow();
  });
});

describe("signDigest / verifyDigestSignature (Ed25519 + separador de dominio)", () => {
  it("una firma válida verifica correctamente", async () => {
    const { signing, publicKeyRaw } = await generateTestSigningContext();
    const { digestHex } = await digestCanonical({ hello: "world" });
    const signature = await signDigest(digestHex, signing.signingKeyPkcs8);
    const valid = await verifyDigestSignature(digestHex, signature, publicKeyRaw);
    expect(valid).toBe(true);
  });

  it("una firma no verifica contra un digest distinto (el separador de dominio no es opcional)", async () => {
    const { signing, publicKeyRaw } = await generateTestSigningContext();
    const { digestHex } = await digestCanonical({ hello: "world" });
    const signature = await signDigest(digestHex, signing.signingKeyPkcs8);
    const { digestHex: otherDigest } = await digestCanonical({ hello: "mundo" });
    const valid = await verifyDigestSignature(otherDigest, signature, publicKeyRaw);
    expect(valid).toBe(false);
  });
});

describe("authority_state — concurrencia optimista (Nota técnica de riesgos §1)", () => {
  const organizationId = "org-test-authority-state";

  it("dos requests concurrentes contra la misma organización convergen sin duplicar versión", async () => {
    // Requiere migración 0001_authority_snapshot.sql aplicada localmente
    // (`wrangler d1 migrations apply bloom-backend --local`) y al menos una organización
    // `org-test-authority-state` con datos mínimos, según §4 del encargo. Si el fixture de
    // seed real usa otro nombre de organización, ajustar acá.
    await env.DB.prepare("INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)")
      .bind(organizationId, "Org de test — authority_state")
      .run();

    const { signing } = await generateTestSigningContext();

    const [first, second] = await Promise.all([
      resolveAuthoritySnapshot({
        db: env.DB,
        organizationId,
        capability: "full",
        clientHighWaterMark: null,
        signing,
      }),
      resolveAuthoritySnapshot({
        db: env.DB,
        organizationId,
        capability: "full",
        clientHighWaterMark: null,
        signing,
      }),
    ]);

    // Ambos requests deben terminar reportando la misma versión consolidada — ninguno
    // debe haber "ganado" con una versión distinta a costa del otro (eso indicaría que el
    // `WHERE current_version = ?` no está funcionando como precondición real).
    expect(first.currentVersion).toBe(second.currentVersion);

    const state = await env.DB.prepare("SELECT current_version FROM authority_state WHERE organization_id = ?")
      .bind(organizationId)
      .first<{ current_version: number }>();
    expect(state?.current_version).toBe(first.currentVersion);
  });

  it("un high_water_mark igual a la versión actual responde 'no_newer_version', no un envelope", async () => {
    const { signing } = await generateTestSigningContext();
    const baseline = await resolveAuthoritySnapshot({
      db: env.DB,
      organizationId,
      capability: "full",
      clientHighWaterMark: null,
      signing,
    });

    const repeated = await resolveAuthoritySnapshot({
      db: env.DB,
      organizationId,
      capability: "full",
      clientHighWaterMark: baseline.currentVersion,
      signing,
    });

    expect(repeated.kind).toBe("no_newer_version");
  });
});
