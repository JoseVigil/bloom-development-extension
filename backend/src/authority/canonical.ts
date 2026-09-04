// backend/src/authority/canonical.ts
//
// Canonicalización JCS (RFC 8785), digest SHA-256 y firma Ed25519 con separador de
// dominio (§3, §8.1 del diseño físico). Es la única dependencia nueva de esta fase
// (§1.2 del encargo) — no hay canonicalización ni firma Ed25519 en el Worker hoy.
//
// LIBRERÍA ELEGIDA: `canonicalize` (npm). Es una de las implementaciones listadas
// explícitamente como compatibles con JCS en el Apéndice G de RFC 8785
// (https://www.rfc-editor.org/rfc/rfc8785#appendix-G), lo que la hace la elección menos
// arriesgada frente al riesgo #3 de la nota técnica ("cumplir el mismo RFC en dos
// lenguajes no garantiza compatibilidad byte a byte") — al menos parte de una
// implementación que el propio RFC identifica como conforme, en vez de una arbitraria.
// Agregar a package.json: `"canonicalize": "^2.0.0"`.
//
// npm install canonicalize --save

import canonicalize from "canonicalize";

// SUPUESTO DE DISEÑO: el separador de dominio exacto usado por Nucleus
// (`internal/authority` en Go) no está disponible en esta sesión — no tengo el §8.1 del
// diseño físico. El valor de abajo es un placeholder explícito. Antes de firmar nada real,
// hay que confirmarlo contra la implementación Go y reemplazarlo por el valor exacto (y
// documentar de dónde salió) — si no coincide byte a byte, Nucleus va a rechazar toda
// firma que produzca este Worker.
const DOMAIN_SEPARATOR = "bloom-authority-snapshot-v1"; // TODO: confirmar contra Nucleus internal/authority (Go)

/**
 * Canonicaliza un valor JSON según RFC 8785 (JCS).
 */
export function canonicalizeJson(value: unknown): string {
  const result = canonicalize(value);
  if (result === undefined) {
    // `canonicalize` devuelve undefined si el valor no es serializable en JSON
    // (undefined de nivel superior, funciones, etc.) — nunca debería pasar acá porque el
    // contenido del snapshot son datos planos, pero falla explícito en vez de firmar "undefined".
    throw new Error("authority_canonicalize_failed: value is not JSON-serializable");
  }
  return result;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Canonicaliza y hashea un valor en un solo paso. Usar siempre esta función (y no
 * `JSON.stringify` a mano) para cualquier digest que vaya a firmarse o compararse contra
 * uno producido por Nucleus.
 */
export async function digestCanonical(value: unknown): Promise<{ canonical: string; digestHex: string }> {
  const canonical = canonicalizeJson(value);
  const digestHex = await sha256Hex(canonical);
  return { canonical, digestHex };
}

/**
 * Firma Ed25519 con separador de dominio sobre el digest hex del contenido canonicalizado.
 *
 * `signingKeyPkcs8` es la clave privada en formato PKCS#8 (DER), inyectada desde un
 * Workers secret binding (`wrangler secret put AUTHORITY_SIGNING_KEY_PKCS8_B64`, guardada
 * como base64 y decodificada antes de llamar a esta función) — nunca hardcodeada.
 *
 * VERIFICACIÓN PENDIENTE (documentar en el reporte de cierre, §1.2 del encargo): esta
 * implementación asume que el runtime de Workers soporta `{ name: "Ed25519" }` de forma
 * nativa vía SubtleCrypto. Cloudflare lo fue habilitando de forma progresiva; hay que
 * confirmar contra el `compatibility_date` real de `wrangler.jsonc` de este proyecto antes
 * de dar esto por andando. Si no está soportado en ese compatibility_date, el fallback es
 * sumar una librería pura JS (p. ej. `@noble/ed25519`) con la misma firma de función, sin
 * tocar el resto de este archivo.
 */
export async function signDigest(digestHex: string, signingKeyPkcs8: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", signingKeyPkcs8, { name: "Ed25519" }, false, ["sign"]);
  const message = new TextEncoder().encode(`${DOMAIN_SEPARATOR}:${digestHex}`);
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, message);
  return arrayBufferToBase64(signature);
}

export async function verifyDigestSignature(
  digestHex: string,
  signatureBase64: string,
  publicKeyRaw: ArrayBuffer,
): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
  const message = new TextEncoder().encode(`${DOMAIN_SEPARATOR}:${digestHex}`);
  const signature = base64ToArrayBuffer(signatureBase64);
  return crypto.subtle.verify({ name: "Ed25519" }, key, signature, message);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
