import { Hono } from "hono";
import { manifestEtag, resolveIonManifest } from "./manifest";
import {
  loadInstallationIdentity,
  readInstallationAuthHeaders,
  registerInstallationIdentity,
  verifyInstallationRequest,
  verifyRegistrationRequest,
} from "./authority/identity";
import { resolveAuthoritySnapshot } from "./authority/snapshot";

// SUPUESTO: `AUTHORITY_SIGNING_KEY_PKCS8_B64` y `AUTHORITY_SIGNING_KEY_ID` en `Env` no
// están confirmados contra el `Env` real del proyecto (no tengo el
// `worker-configuration.d.ts` ni el `wrangler.jsonc` completo en esta sesión, sólo lo
// que menciona el comentario de `canonical.ts`: `AUTHORITY_SIGNING_KEY_PKCS8_B64` como
// secret). Confirmar el binding exacto y el nombre de `signing_key_id` antes de desplegar.

const app = new Hono<{ Bindings: Env }>();

app.get("/", (context) => context.json({ service: "bloom-backend", status: "ok" }));

app.get("/v1/manifest", async (context) => {
  const organizationId = context.req.query("org");
  if (!organizationId) {
    return context.json({ error: "missing_org", message: "Query parameter 'org' is required." }, 400);
  }

  const channel = context.req.query("channel") ?? "stable";
  const manifest = await resolveIonManifest(context.env.DB, organizationId, channel, context.req.url);
  const body = JSON.stringify(manifest);
  const etag = await manifestEtag(body);
  const headers = {
    "Cache-Control": "private, no-cache",
    "Content-Type": "application/json; charset=UTF-8",
    ETag: etag,
  };

  if (context.req.header("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
});

app.get("/v1/releases/:releaseId/download", async (context) => {
  const release = await context.env.DB.prepare("SELECT r2_key AS r2Key FROM releases WHERE id = ?")
    .bind(context.req.param("releaseId"))
    .first<{ r2Key: string }>();
  if (!release) return context.json({ error: "release_not_found" }, 404);

  const object = await context.env.RELEASES.get(release.r2Key);
  if (!object) return context.json({ error: "release_object_not_found" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
});

/**
 * Middleware de verificación S2S (§1.2 del encargo Fase 3: Nucleus firma cada request
 * saliente, Backend verifica). Se aplica sólo a rutas de `/v1/authority/*` que asumen
 * una identidad YA `BOUND` (ej. snapshot). El registro inicial
 * (`POST /v1/authority/identity/register`) NO pasa por este middleware: ahí la clave
 * pública todavía no está en `installation_identities` — viaja en el body de esa misma
 * request y se verifica con `verifyRegistrationRequest` dentro del handler.
 */
const verifyInstallationAuth = async (context: any, next: () => Promise<void>) => {
  const organizationId = context.req.query("org");
  if (!organizationId) {
    return context.json({ error: "missing_org", message: "Query parameter 'org' is required." }, 400);
  }

  const headers = readInstallationAuthHeaders(context.req.raw);
  if (!headers) {
    return context.json({ error: "missing_auth_headers" }, 401);
  }

  const identity = await loadInstallationIdentity(context.env.DB, headers.installationId);
  if (!identity) {
    return context.json({ error: "unknown_installation" }, 401);
  }

  const url = new URL(context.req.url);
  const verified = await verifyInstallationRequest({
    organizationId,
    method: context.req.method,
    path: url.pathname,
    headers,
    identity,
  });
  if (!verified) {
    return context.json({ error: "invalid_signature" }, 401);
  }

  await next();
};

app.post("/v1/authority/identity/register", async (context) => {
  const organizationId = context.req.query("org");
  if (!organizationId) {
    return context.json({ error: "missing_org", message: "Query parameter 'org' is required." }, 400);
  }

  const headers = readInstallationAuthHeaders(context.req.raw);
  if (!headers) {
    return context.json({ error: "missing_auth_headers" }, 401);
  }

  const body = await context.req.json<{ public_key?: string }>().catch(() => null);
  if (!body?.public_key) {
    return context.json({ error: "missing_public_key" }, 400);
  }

  const url = new URL(context.req.url);
  const proven = await verifyRegistrationRequest({
    organizationId,
    method: context.req.method,
    path: url.pathname,
    headers,
    publicKeyBase64: body.public_key,
  });
  if (!proven) {
    return context.json({ error: "invalid_signature" }, 401);
  }

  const result = await registerInstallationIdentity(context.env.DB, {
    installationId: headers.installationId,
    organizationId,
    publicKeyBase64: body.public_key,
  });
  if (!result.ok) {
    // Conflicto: installation_id ya registrado. El binding de Nucleus (binding.go) NO
    // debe avanzar a BOUND ante este código — es la contraparte exacta de
    // "Si el registro es rechazado ... el binding no avanza" del encargo Fase 3 §1.3.
    return context.json({ error: "installation_conflict" }, 409);
  }

  return context.json({ status: "registered" }, 201);
});

app.get("/v1/authority/snapshot", verifyInstallationAuth, async (context) => {
  const organizationId = context.req.query("org")!;
  const baseVersionParam = context.req.query("base_version");
  const baseVersion = baseVersionParam !== undefined ? Number(baseVersionParam) : null;
  if (baseVersionParam !== undefined && Number.isNaN(baseVersion)) {
    return context.json({ error: "invalid_base_version" }, 400);
  }

  const signingKeyPkcs8 = base64ToArrayBuffer(context.env.AUTHORITY_SIGNING_KEY_PKCS8_B64);
  const envelope = await resolveAuthoritySnapshot(
    context.env.DB,
    organizationId,
    baseVersion,
    signingKeyPkcs8,
    context.env.AUTHORITY_SIGNING_KEY_ID,
  );
  return context.json(envelope);
});

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default app;
