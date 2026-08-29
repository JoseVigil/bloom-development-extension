import { Hono } from "hono";
import { manifestEtag, resolveIonManifest } from "./manifest";

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

export default app;

