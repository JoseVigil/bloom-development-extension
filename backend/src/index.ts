import { Hono } from "hono";
import { manifestEtag, resolveIonManifest } from "./manifest";
import {
  readInstallationAuthHeaders,
  registerInstallationKey,
  verifyInstallationSignature,
} from "./authority/identity";
import { resolveAuthoritySnapshot, resolveTrustBundle } from "./authority/snapshot";

// SUPUESTO: `AUTHORITY_SIGNING_KEY_PKCS8_B64` y `AUTHORITY_SIGNING_KEY_ID` en `Env` no
// están confirmados contra el `Env` real del proyecto (no tengo el
// `worker-configuration.d.ts` ni el `wrangler.jsonc` completo en esta sesión). Confirmar
// el binding exacto antes de desplegar.
//
// SUPUESTO (§1.1 del encargo Fase 3): el registro de instalaciones se gatea con el
// mismo token de servicio estático provisorio que Fase 2 usaba para las rutas de
// snapshot/trust-bundle antes de esta fase. No tengo ese código de Fase 2 en esta
// sesión, así que asumo un secret `AUTHORITY_SERVICE_TOKEN` en `Env` chequeado contra
// un header `Authorization: Bearer <token>`. Si Fase 2 usó otro nombre de secret u otro
// header, ajustar únicamente `checkServiceToken` — nada más de este archivo depende de
// esa elección.

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
 * Chequeo del token de servicio estático provisorio (§1.1: "no se inventa un mecanismo
 * de autenticación nuevo para este endpoint en particular"). Reservado exclusivamente
 * para el registro de identidad — el encargo es explícito en que snapshot/trust-bundle
 * ya NO aceptan este token una vez que la instalación tiene clave registrada.
 */
function checkServiceToken(context: any): boolean {
  const authHeader = context.req.header("Authorization");
  const expected = context.env.AUTHORITY_SERVICE_TOKEN;
  return Boolean(expected) && authHeader === `Bearer ${expected}`;
}

/**
 * Middleware de verificación S2S (§1.1 del encargo Fase 3). Se aplica a las rutas de
 * `/v1/authority/*` que asumen una identidad YA registrada (snapshot, trust-bundle) —
 * reemplaza, no suma, el "sin autenticación estricta o token estático" que Fase 2 dejó
 * como opción provisoria para esas dos rutas específicamente.
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

  const url = new URL(context.req.url);
  const verified = await verifyInstallationSignature(context.env.DB, {
    organizationId,
    method: context.req.method,
    path: url.pathname,
    headers,
  });
  if (!verified) {
    return context.json({ error: "invalid_signature" }, 401);
  }

  await next();
};

app.post("/v1/authority/installations/register", async (context) => {
  if (!checkServiceToken(context)) {
    return context.json({ error: "invalid_service_token" }, 401);
  }

  const organizationId = context.req.query("org");
  if (!organizationId) {
    return context.json({ error: "missing_org", message: "Query parameter 'org' is required." }, 400);
  }

  const body = await context.req
    .json<{ installation_id?: string; public_key_raw?: string }>()
    .catch(() => null);
  if (!body?.installation_id || !body?.public_key_raw) {
    return context.json({ error: "missing_fields" }, 400);
  }

  const result = await registerInstallationKey(context.env.DB, {
    installationId: body.installation_id,
    organizationId,
    publicKeyRaw: body.public_key_raw,
  });
  if (!result.ok) {
    // installation_id ya tiene una fila `active` — conflicto, no se sobreescribe.
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

app.get("/v1/authority/trust-bundle", verifyInstallationAuth, async (context) => {
  const organizationId = context.req.query("org")!;
  const keys = await resolveTrustBundle(context.env.DB, organizationId);
  return context.json({
    organization_id: organizationId,
    keys: keys.map((key) => ({
      key_id: key.key_id,
      public_key_raw: key.public_key_raw,
      status: key.status,
      signed_by_key_id: key.signed_by_key_id,
      created_at: key.created_at,
      retired_at: key.retired_at,
    })),
  });
});

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export default app;
