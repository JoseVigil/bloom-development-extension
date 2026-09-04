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

import {
  canonicalizeJson,
  digestCanonical,
  sha256Hex,
  signCanonicalPayload,
  signDigest,
  verifyCanonicalSignature,
  verifyDigestSignature,
} from "../src/authority/canonical";
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
  // Vectores normativos RFC 8785 (cruzados contra la implementación Go gowebpki/jcs de
  // Nucleus) — reemplazan el it.todo anterior.
  //
  // NOTA HONESTA sobre su alcance: estos tres vectores validan formateo de números y
  // escapes de string dentro de `canonicalizeJson`. NO validan, por sí solos, que este
  // Worker produzca el mismo digest byte a byte que un binario Go real corriendo — eso
  // requeriría correr el mismo payload por el binario/módulo Go de Nucleus y comparar el
  // digest resultante, cosa que no se puede hacer desde este entorno de test JS. Lo que
  // sí prueban es que `canonicalize` (la librería JS elegida) implementa las reglas de
  // formato de RFC 8785 de la misma forma que gowebpki/jcs para estos casos puntuales
  // (números en notación ES6, escapes de control/Unicode). Es evidencia parcial, no un
  // reemplazo completo del vector cruzado real pendiente.
  // ---------------------------------------------------------------------------------
  const RFC8785_VECTORS: Array<{ name: string; input: string; want: string }> = [
    {
      name: "números: notación científica ES6, ceros de más y exponentes negativos",
      input: '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001]}',
      want: '{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}',
    },
    {
      name: "string: control char (Shift In), salto de línea, tab, comilla simple/doble y barra escapados",
      input: '{"string":"\u20ac$\u000f \n A\'B \\"\\\\\\" / "}',
      want: '{"string":"\u20ac$\u000f \n A\'B \\"\\\\\\" / "}',
    },
    {
      name: "orden de claves Unicode (control chars, dígito, emoji, hebreo con nequdot)",
      input:
        '{"\u20ac":"Euro Sign","\\r":"Carriage Return","\u05d3\u05bc":"Hebrew Letter Dalet With Dagesh","1":"One","\ud83d\ude00":"Emoji: Grinning Face","\u20ac":"Control","\u00f6":"Latin Small Letter O With Diaeresis"}',
      want:
        '{"\\r":"Carriage Return","1":"One","\u20ac":"Control","\u00f6":"Latin Small Letter O With Diaeresis","\u20ac":"Euro Sign","\ud83d\ude00":"Emoji: Grinning Face","\u05d3\u05bc":"Hebrew Letter Dalet With Dagesh"}',
    },
  ];

  it.each(RFC8785_VECTORS)("vector RFC 8785 — $name", ({ input, want }) => {
    // ADVERTENCIA explícita sobre este caso en particular: el vector de "orden de claves
    // Unicode" de arriba tiene, en su texto de origen, DOS apariciones de una clave que
    // se ve como "€" con valores distintos ("Euro Sign" y "Control"). Eso sólo es posible
    // si en el JSON real son dos code points Unicode *distintos* que se renderizan casi
    // igual (ej. EURO SIGN U+20AC vs EURO-CURRENCY SIGN U+20A0) — la prueba de RFC 8785
    // depende de ordenar por code point exacto, no por apariencia visual.
    //
    // No pude confirmar en esta sesión que los caracteres tal como quedaron pegados en
    // este archivo conserven esos dos code points distintos (un copy/paste puede
    // normalizarlos al mismo glifo). Si eso pasó, `JSON.parse` va a colapsar la clave
    // duplicada (se queda con la última, "Control") y este `it.each` va a fallar de forma
    // obvia — lo cual, al menos, hace visible el problema en vez de pasar en falso.
    // Antes de confiar en este vector: abrir este archivo en un editor que muestre code
    // points Unicode (o correr algo como `[...input].map(c => c.codePointAt(0))`) y
    // confirmar contra la fuente original del vector que son dos caracteres distintos.
    const parsed = JSON.parse(input);
    const canonical = canonicalizeJson(parsed);
    expect(canonical).toBe(want);
  });

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

describe("signCanonicalPayload / verifyCanonicalSignature (Ed25519 + separador de dominio)", () => {
  it("una firma válida sobre el payload canónico verifica correctamente", async () => {
    const { signing, publicKeyRaw } = await generateTestSigningContext();
    const { canonical } = await digestCanonical({ hello: "world" });
    const signature = await signCanonicalPayload(canonical, signing.signingKeyPkcs8);
    const valid = await verifyCanonicalSignature(canonical, signature, publicKeyRaw);
    expect(valid).toBe(true);
  });

  it("una firma no verifica si el payload canónico cambia (el separador de dominio no es opcional)", async () => {
    const { signing, publicKeyRaw } = await generateTestSigningContext();
    const { canonical } = await digestCanonical({ hello: "world" });
    const signature = await signCanonicalPayload(canonical, signing.signingKeyPkcs8);
    const { canonical: otherCanonical } = await digestCanonical({ hello: "mundo" });
    const valid = await verifyCanonicalSignature(otherCanonical, signature, publicKeyRaw);
    expect(valid).toBe(false);
  });

  it("una firma no verifica contra una clave pública distinta", async () => {
    const { signing } = await generateTestSigningContext();
    const { publicKeyRaw: otherPublicKeyRaw } = await generateTestSigningContext();
    const { canonical } = await digestCanonical({ hello: "world" });
    const signature = await signCanonicalPayload(canonical, signing.signingKeyPkcs8);
    const valid = await verifyCanonicalSignature(canonical, signature, otherPublicKeyRaw);
    expect(valid).toBe(false);
  });

  it("retrocompatibilidad: signDigest / verifyDigestSignature siguen operando correctamente sobre el string que reciben", async () => {
    // `signDigest` / `verifyDigestSignature` son wrappers retrocompatibles: delegan en el
    // mismo `buildSignedMessage` que `signCanonicalPayload`. Este test sólo confirma que
    // el wrapper sigue siendo funcionalmente consistente (firma/verifica round-trip),
    // no que `digestHex` sea lo que Nucleus espera firmar (ver nota en canonical.ts).
    const { signing, publicKeyRaw } = await generateTestSigningContext();
    const { digestHex } = await digestCanonical({ hello: "world" });
    const signature = await signDigest(digestHex, signing.signingKeyPkcs8);
    const valid = await verifyDigestSignature(digestHex, signature, publicKeyRaw);
    expect(valid).toBe(true);
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