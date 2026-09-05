// backend/src/authority/identity.ts
//
// Identidad de instalación S2S — Fase 3, §1.1 del encargo
// (Encargo_Implementacion_Fisica_Fase3_Backend_v0_1.md, aprobado 2026-09-04).
//
// Esta versión reemplaza una implementación de sesión anterior que asumía un encargo de
// Nucleus no disponible en ese momento. Diferencias que importan respecto a esa versión
// anterior (no reabrir, ya corregidas acá):
//   - Tabla `installation_keys` (no `installation_identities`), columnas
//     `public_key_raw`/`status`/`registered_at` en vez de `public_key`/`revoked_at`.
//   - Ventana de replay ±120s (no 5 minutos) — §2 del documento de decisión.
//   - El registro (`registerInstallationKey`) NO verifica firma/prueba de posesión.
//     Está gateado exclusivamente por el token de servicio estático provisorio de
//     Fase 2, chequeado en `index.ts` antes de llamar a esta función — el encargo es
//     explícito: "no se inventa un mecanismo de autenticación nuevo para este endpoint
//     en particular".
//
// COMPATIBILIDAD DE FIRMA: reusa `canonicalizeJson` y `verifyWithDomain` de
// `canonical.ts` para que el mensaje reconstruido acá sea byte a byte el mismo que firma
// Nucleus (mismo dominio `BLOOM-INSTALLATION-AUTH-v1`, mismo separador 0x00, misma
// canonicalización JCS) — mismo riesgo que el bug de firma de Fase 2 si se reimplementa
// el ensamblado de bytes en dos lugares distintos.
//
// Mensaje firmado (igual de ambos lados, no se decide de nuevo acá — encargo Nucleus
// §1.2):
//   BLOOM-INSTALLATION-AUTH-v1 + 0x00 + canonical_JSON({installation_id, organization_id, method, path, timestamp})
//
// SUPUESTO: no tengo `canonical.ts` en esta sesión, sólo su interfaz tal como la usaba
// la versión anterior de este archivo (`canonicalizeJson(obj): string`,
// `verifyWithDomain(domain, canonicalPayload, signatureBase64, publicKeyRaw): Promise<boolean>`).
// Si esa interfaz cambió, ajustar las dos llamadas de abajo.

import { canonicalizeJson, verifyWithDomain } from "./canonical";

export const INSTALLATION_AUTH_DOMAIN = "BLOOM-INSTALLATION-AUTH-v1";

// §1.1 del encargo / §2 del documento de decisión: única defensa de replay en esta
// fase, sin caché de nonce. ±120 segundos respecto de la hora del Worker.
const REPLAY_WINDOW_MS = 120 * 1000;

export interface InstallationAuthHeaders {
  installationId: string;
  timestamp: string; // RFC3339 UTC, emitido por Nucleus
  signatureBase64: string;
}

export interface InstallationKeyRow {
  installation_id: string;
  organization_id: string;
  public_key_raw: string; // base64 raw Ed25519 (32 bytes)
  status: "active" | "revoked";
  registered_at: number;
}

export function readInstallationAuthHeaders(request: Request): InstallationAuthHeaders | null {
  const installationId = request.headers.get("X-Bloom-Installation-Id");
  const timestamp = request.headers.get("X-Bloom-Timestamp");
  const signatureBase64 = request.headers.get("X-Bloom-Signature");
  if (!installationId || !timestamp || !signatureBase64) return null;
  return { installationId, timestamp, signatureBase64 };
}

export function isWithinReplayWindow(timestamp: string, now: Date = new Date()): boolean {
  const signedAt = Date.parse(timestamp);
  if (Number.isNaN(signedAt)) return false;
  return Math.abs(now.getTime() - signedAt) <= REPLAY_WINDOW_MS;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Reconstruye el payload canónico exactamente como lo arma Nucleus antes de firmar. El
 * orden de propiedades acá no importa (JCS lo normaliza), pero los NOMBRES sí deben
 * coincidir byte a byte con el lado firmante.
 */
function buildAuthPayload(params: {
  installationId: string;
  organizationId: string;
  method: string;
  path: string;
  timestamp: string;
}): string {
  return canonicalizeJson({
    installation_id: params.installationId,
    organization_id: params.organizationId,
    method: params.method,
    path: params.path,
    timestamp: params.timestamp,
  });
}

/**
 * Registra la clave pública de una instalación nueva (§1.1). NO verifica firma ni
 * prueba de posesión — el registro está gateado exclusivamente por el token de
 * servicio estático provisorio, chequeado por el caller (`index.ts`) antes de invocar
 * esta función. Rechaza (`conflict`) si ya existe una fila `active` para ese
 * `installation_id` — no sobreescribe en silencio; revocar-y-reemplazar es Fase 4.
 */
export async function registerInstallationKey(
  db: D1Database,
  params: { installationId: string; organizationId: string; publicKeyRaw: string },
): Promise<{ ok: true } | { ok: false; reason: "conflict" }> {
  const existing = await db
    .prepare("SELECT installation_id FROM installation_keys WHERE installation_id = ? AND status = 'active'")
    .bind(params.installationId)
    .first<{ installation_id: string }>();
  if (existing) return { ok: false, reason: "conflict" };

  await db
    .prepare(
      `INSERT INTO installation_keys (installation_id, organization_id, public_key_raw, status, registered_at)
       VALUES (?, ?, ?, 'active', ?)`,
    )
    .bind(params.installationId, params.organizationId, params.publicKeyRaw, Date.now())
    .run();
  return { ok: true };
}

/**
 * Verifica la firma S2S de un request contra la clave `active` registrada para
 * `headers.installationId` (§1.1). Hace ella misma el lookup en `installation_keys` —
 * el criterio de "hay una clave activa para esa organización" es parte de lo que hay
 * que verificar, no un dato ya resuelto por el caller.
 *
 * Rechaza (retorna `false`) si:
 *   - no hay clave `active` registrada para `headers.installationId`,
 *   - la organización de esa clave no coincide con `params.organizationId`,
 *   - `headers.timestamp` está fuera de la ventana de ±120s,
 *   - la firma no verifica contra la clave.
 */
export async function verifyInstallationSignature(
  db: D1Database,
  params: {
    organizationId: string;
    method: string;
    path: string;
    headers: InstallationAuthHeaders;
  },
): Promise<boolean> {
  if (!isWithinReplayWindow(params.headers.timestamp)) return false;

  const key = await db
    .prepare(
      `SELECT installation_id, organization_id, public_key_raw, status, registered_at
       FROM installation_keys WHERE installation_id = ? AND status = 'active'`,
    )
    .bind(params.headers.installationId)
    .first<InstallationKeyRow>();
  if (!key) return false;
  if (key.organization_id !== params.organizationId) return false;

  const payload = buildAuthPayload({
    installationId: params.headers.installationId,
    organizationId: params.organizationId,
    method: params.method,
    path: params.path,
    timestamp: params.headers.timestamp,
  });
  const publicKeyRaw = base64ToArrayBuffer(key.public_key_raw);
  return verifyWithDomain(INSTALLATION_AUTH_DOMAIN, payload, params.headers.signatureBase64, publicKeyRaw);
}
