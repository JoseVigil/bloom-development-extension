// backend/src/authority/identity.ts
//
// Verificación de identidad de instalación S2S — lado Backend del encargo de Fase 3
// (el encargo adjunto es el de Nucleus/Go; el endpoint de registro de Backend se
// menciona ahí como "encargo aparte, mismo día" pero no está presente en esta sesión.
// Este archivo es la implementación razonable de esa contraparte, para que
// `request_signing.go` tenga algo real que verificar).
//
// COMPATIBILIDAD DE FIRMA: reusa `canonicalizeJson` y el mecanismo genérico de dominio
// (`verifyWithDomain`) agregados en canonical.ts, en vez de reimplementar el ensamblado
// `domain + 0x00 + payload` acá. Esto es lo que garantiza que un mensaje firmado por
// Nucleus con `BLOOM-INSTALLATION-AUTH-v1` sea byte a byte el mismo que arma este
// archivo para verificar — misma canonicalización JCS, mismo separador de dominio,
// mismo layout de bytes.
//
// Mensaje firmado (igual a lo que exige el encargo de Nucleus §1.2):
//   BLOOM-INSTALLATION-AUTH-v1 + 0x00 + canonical_JSON({installation_id, organization_id, method, path, timestamp})

import { canonicalizeJson, verifyWithDomain } from "./canonical";

export const INSTALLATION_AUTH_DOMAIN = "BLOOM-INSTALLATION-AUTH-v1";

export interface InstallationAuthHeaders {
  installationId: string;
  timestamp: string; // RFC3339 UTC, tal como lo emite Nucleus
  signatureBase64: string;
}

export interface InstallationIdentityRow {
  installation_id: string;
  organization_id: string;
  public_key: string; // base64 raw Ed25519 (32 bytes)
  created_at: number;
  revoked_at: number | null;
}

// SUPUESTO: 5 minutos. El encargo de Nucleus es explícito en que la ventana de repetición
// es responsabilidad de Backend ("no es responsabilidad de Nucleus imponer la ventana,
// sólo firmar con la hora actual en UTC") pero no fija un valor — no hay ningún documento
// disponible en esta sesión que lo especifique. Confirmar contra el diseño físico o el
// encargo real de Backend antes de producción.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

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
 * coincidir byte a byte con `request_signing.go`.
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
 * Verifica la firma de un request contra una identidad YA REGISTRADA (clave pública
 * conocida en `installation_identities`). No usar para el registro inicial: ahí la
 * clave pública todavía no existe en la base de datos, viaja en el body de la request
 * (ver `verifyRegistrationRequest`).
 */
export async function verifyInstallationRequest(params: {
  organizationId: string;
  method: string;
  path: string;
  headers: InstallationAuthHeaders;
  identity: InstallationIdentityRow;
}): Promise<boolean> {
  if (params.identity.revoked_at !== null) return false;
  if (params.identity.organization_id !== params.organizationId) return false;
  if (!isWithinReplayWindow(params.headers.timestamp)) return false;

  const payload = buildAuthPayload({
    installationId: params.headers.installationId,
    organizationId: params.organizationId,
    method: params.method,
    path: params.path,
    timestamp: params.headers.timestamp,
  });
  const publicKeyRaw = base64ToArrayBuffer(params.identity.public_key);
  return verifyWithDomain(INSTALLATION_AUTH_DOMAIN, payload, params.headers.signatureBase64, publicKeyRaw);
}

/**
 * Verifica el request de registro inicial: la clave pública viene en el body (primer
 * uso — todavía no hay fila en `installation_identities`), y la firma prueba posesión
 * de la clave privada correspondiente antes de persistir nada. La comprobación de
 * conflicto (installation_id ya registrado) es responsabilidad de
 * `registerInstallationIdentity`, no de esta función — así el binding de Nucleus puede
 * distinguir "firma inválida" (401) de "conflicto" (409) tal como exige
 * `binding_test.go` del lado Nucleus.
 */
export async function verifyRegistrationRequest(params: {
  organizationId: string;
  method: string;
  path: string;
  headers: InstallationAuthHeaders;
  publicKeyBase64: string;
}): Promise<boolean> {
  if (!isWithinReplayWindow(params.headers.timestamp)) return false;
  const payload = buildAuthPayload({
    installationId: params.headers.installationId,
    organizationId: params.organizationId,
    method: params.method,
    path: params.path,
    timestamp: params.headers.timestamp,
  });
  const publicKeyRaw = base64ToArrayBuffer(params.publicKeyBase64);
  return verifyWithDomain(INSTALLATION_AUTH_DOMAIN, payload, params.headers.signatureBase64, publicKeyRaw);
}

export async function registerInstallationIdentity(
  db: D1Database,
  params: { installationId: string; organizationId: string; publicKeyBase64: string },
): Promise<{ ok: true } | { ok: false; reason: "conflict" }> {
  const existing = await db
    .prepare("SELECT installation_id FROM installation_identities WHERE installation_id = ?")
    .bind(params.installationId)
    .first<{ installation_id: string }>();
  if (existing) return { ok: false, reason: "conflict" };

  await db
    .prepare(
      "INSERT INTO installation_identities (installation_id, organization_id, public_key, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
    )
    .bind(params.installationId, params.organizationId, params.publicKeyBase64, Date.now())
    .run();
  return { ok: true };
}

export async function loadInstallationIdentity(
  db: D1Database,
  installationId: string,
): Promise<InstallationIdentityRow | null> {
  const row = await db
    .prepare(
      "SELECT installation_id, organization_id, public_key, created_at, revoked_at FROM installation_identities WHERE installation_id = ?",
    )
    .bind(installationId)
    .first<InstallationIdentityRow>();
  return row ?? null;
}
