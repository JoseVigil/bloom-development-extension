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

// DOMAIN_SEPARATOR — valor provisto explícitamente en la sesión de corrección
// ("BLOOM-AUTHORITY-SNAPSHOT-v1"). IMPORTANTE: este valor NO fue verificado contra el
// código fuente real de `internal/authority` (Go, Nucleus) en esta sesión — nadie en esta
// conversación tuvo ese archivo a la vista. Sigue siendo, estrictamente, una afirmación no
// confirmada, no un hecho verificado. Antes de firmar algo real: confirmar byte a byte
// contra la constante Go correspondiente y dejar registro en el reporte de cierre de dónde
// salió la confirmación (commit, línea, quién lo confirmó). Si no coincide, Nucleus
// rechaza toda firma que produzca este Worker.
const DOMAIN_SEPARATOR = "BLOOM-AUTHORITY-SNAPSHOT-v1";

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
 * `JSON.stringify` a mano) para cualquier digest que vaya a compararse contra uno
 * producido por Nucleus.
 *
 * NOTA (revisión de firma, §ver `signCanonicalPayload` más abajo): el `digestHex` que
 * devuelve esta función sigue siendo útil para comparar/loguear/indexar snapshots, pero
 * YA NO es lo que se firma — lo que se firma es `canonical` (el JSON canonicalizado
 * completo), porque así lo requiere Nucleus según lo confirmado explícitamente en esta
 * sesión de corrección.
 */
export async function digestCanonical(value: unknown): Promise<{ canonical: string; digestHex: string }> {
  const canonical = canonicalizeJson(value);
  const digestHex = await sha256Hex(canonical);
  return { canonical, digestHex };
}

/**
 * Construye el mensaje a firmar/verificar: bytes(DOMAIN_SEPARATOR) + 0x00 + bytes(payload).
 *
 * `payload` es, para el flujo nuevo (`signCanonicalPayload` / `verifyCanonicalSignature`),
 * el JSON canonicalizado completo (`canonical` que devuelve `digestCanonical`) — NO su
 * hash. Esto reemplaza el comportamiento anterior de esta función (que recibía
 * `digestHex`), a partir de la confirmación explícita provista en esta sesión de que
 * Nucleus firma sobre los bytes del JSON canonicalizado, no sobre su digest.
 *
 * Los wrappers retrocompatibles `signDigest` / `verifyDigestSignature` (más abajo) siguen
 * existiendo con la misma firma de función que antes para no romper call sites externos,
 * pero delegan en este mismo mecanismo — quien los use debe tener presente que el string
 * que le pasen es, literalmente, lo que termina dentro del mensaje firmado.
 */
function buildSignedMessage(payload: string): Uint8Array {
  const domainBytes = new TextEncoder().encode(DOMAIN_SEPARATOR);
  const payloadBytes = new TextEncoder().encode(payload);
  const message = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
  message.set(domainBytes, 0);
  message[domainBytes.length] = 0x00;
  message.set(payloadBytes, domainBytes.length + 1);
  return message;
}

/**
 * Firma Ed25519 con separador de dominio sobre el JSON canonicalizado completo
 * (`canonicalJson`, tal como lo devuelve `canonicalizeJson` / `digestCanonical().canonical`).
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
export async function signCanonicalPayload(canonicalJson: string, signingKeyPkcs8: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey("pkcs8", signingKeyPkcs8, { name: "Ed25519" }, false, ["sign"]);
  const message = buildSignedMessage(canonicalJson);
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, message);
  return arrayBufferToBase64(signature);
}

export async function verifyCanonicalSignature(
  canonicalJson: string,
  signatureBase64: string,
  publicKeyRaw: ArrayBuffer,
): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", publicKeyRaw, { name: "Ed25519" }, false, ["verify"]);
  const message = buildSignedMessage(canonicalJson);
  const signature = base64ToArrayBuffer(signatureBase64);
  return crypto.subtle.verify({ name: "Ed25519" }, key, signature, message);
}

/**
 * @deprecated Wrapper retrocompatible. Antes de esta revisión, `signDigest` firmaba sobre
 * `digestHex` (el hash SHA-256 del payload canonicalizado). Se mantiene con la misma firma
 * de función para no romper call sites existentes (p. ej. `resolveAuthoritySnapshot` o
 * cualquier código que ya la invoque pasándole `digestHex`), pero ahora comparte el mismo
 * `buildSignedMessage` que `signCanonicalPayload` — el string que se le pase acá es,
 * literalmente, lo que entra al mensaje firmado.
 *
 * Para snapshots nuevos que deban validar contra Nucleus, usar `signCanonicalPayload`
 * pasándole `digestCanonical(value).canonical`, no `digestHex`.
 */
export async function signDigest(digestHex: string, signingKeyPkcs8: ArrayBuffer): Promise<string> {
  return signCanonicalPayload(digestHex, signingKeyPkcs8);
}

/**
 * @deprecated Wrapper retrocompatible — ver nota en `signDigest`.
 */
export async function verifyDigestSignature(
  digestHex: string,
  signatureBase64: string,
  publicKeyRaw: ArrayBuffer,
): Promise<boolean> {
  return verifyCanonicalSignature(digestHex, signatureBase64, publicKeyRaw);
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