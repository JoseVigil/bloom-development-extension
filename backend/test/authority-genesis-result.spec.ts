import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginGenesis, finishGenesis, pollGenesisResult } from "../src/authority/genesis-store";
import { type HumanServices } from "../src/authority/human-session-store";
import { authorityHumanResponse, type HumanRouteServices } from "../src/authority/administration-route";

// Diseño P (Propuesta_Diseno_Retorno_Genesis_y_Hallazgo_Invitaciones_v0_1.md §3),
// autorizada por Jose 2026-09-22: mecanismo de retorno de génesis por poll, usando el
// secreto `browser` que beginGenesis ya devuelve. No reabre authority-genesis.spec.ts —
// ese archivo cubre la resolución de identidad/Tenant/Organización, que no cambia acá;
// éste cubre exclusivamente el contrato nuevo de persistencia + poll.
let db: D1Database, mf: Miniflare, temp: string;
let clockNow = "2026-09-22T12:00:00Z";
const now = () => clockNow;
const services: HumanServices = {
  now, encryptionKey: Buffer.alloc(32, 11).toString("base64"), allowTestFixtures: true,
  provider: { source: "test-fixture", authorize: (state, challenge) => `https://fixture.test/?state=${state}&challenge=${challenge}`,
    exchange: async (code: string) => ({ token: code, expiresIn: 28800 }), identify: async (token: string) => ({ subject: token, handle: `user-${token}` }) },
};

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "authority-genesis-result-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "authority-genesis-result" } }),
    resourcePersistencePath: temp });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await loadMigrations(["0001_authority_snapshot.sql", "0002_authority_security.sql", "0004_authority_emissions.sql",
    "0005_authority_administration.sql", "0006_authority_human_identity.sql", "0009_authority_role_definition_status.sql",
    "0010_authority_initial_emission_guard.sql", "0013_authority_genesis.sql", "0015_tenants.sql",
    "0017_authority_genesis_result.sql"]);
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

describe("Diseño P — poll del resultado de génesis", () => {
  it("está pending mientras el usuario todavía no completó GitHub", async () => {
    const flow = await beginGenesis(db, services);
    expect(await pollGenesisResult(db, flow.browser, now)).toBeNull();
  });

  it("un secreto browser que nunca existió también es pending, nunca un error", async () => {
    expect(await pollGenesisResult(db, "no-such-browser-secret", now)).toBeNull();
  });

  it("queda ready con el GenesisResult completo apenas termina finishGenesis, y se entrega una sola vez", async () => {
    const flow = await beginGenesis(db, services);
    const result = await finishGenesis(db, { ...flow, code: "poll-dana" }, services);
    const polled = await pollGenesisResult(db, flow.browser, now);
    expect(polled).toEqual(result);
    // Entrega única: el segundo poll con el mismo secreto ya no encuentra nada.
    expect(await pollGenesisResult(db, flow.browser, now)).toBeNull();
  });

  it("extiende la ventana de expiración al completarse, para que un login lento no deje sin tiempo al poll", async () => {
    clockNow = "2026-09-22T12:00:00Z";
    const flow = await beginGenesis(db, services);
    clockNow = "2026-09-22T12:04:55Z"; // dentro de la ventana original de 5 min, pero sobre el final
    await finishGenesis(db, { ...flow, code: "poll-erin" }, services);
    clockNow = "2026-09-22T12:06:00Z"; // ya venció la ventana ORIGINAL de begin (12:05:00)
    expect(await pollGenesisResult(db, flow.browser, now)).not.toBeNull();
    clockNow = "2026-09-22T12:00:00Z";
  });

  it("expira igual que cualquier otro estado no resuelto — pending, no error, pasado el TTL extendido", async () => {
    clockNow = "2026-09-22T12:00:00Z";
    const flow = await beginGenesis(db, services);
    await finishGenesis(db, { ...flow, code: "poll-frank" }, services);
    clockNow = "2026-09-22T12:10:00Z"; // 10 min después: venció tanto la ventana original como la extendida (+2min)
    expect(await pollGenesisResult(db, flow.browser, now)).toBeNull();
    clockNow = "2026-09-22T12:00:00Z";
  });

  it("recorrido HTTP completo: login → poll pending → callback → poll ready → poll pending de nuevo", async () => {
    const origin = "https://authority.test";
    const routeServices: HumanRouteServices = { ...services, origin, issuer: "issuer-test", signer: { privateKeyPkcs8: new ArrayBuffer(0), keyId: "issuer-key" } };
    const start = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/login",
      { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({}) }), routeServices);
    const { authorizationUrl } = await start.json() as any;
    const state = new URL(authorizationUrl).searchParams.get("state");
    const flowCookie = start.headers.get("Set-Cookie")!.split(";")[0];
    const browser = flowCookie.split("=")[1];

    const pendingBefore = await authorityHumanResponse(db, new Request(origin + `/v1/authority/genesis/result?browser=${browser}`,
      { headers: { Origin: origin } }), routeServices);
    expect(pendingBefore.status).toBe(202);
    expect(await pendingBefore.json()).toEqual({ status: "pending" });

    const callback = await authorityHumanResponse(db, new Request(origin + `/v1/authority/human/callback?state=${state}&code=poll-grace`,
      { headers: { Cookie: flowCookie } }), routeServices);
    const callbackBody = await callback.json() as any;
    expect(callbackBody).toMatchObject({ created: true });

    const ready = await authorityHumanResponse(db, new Request(origin + `/v1/authority/genesis/result?browser=${browser}`,
      { headers: { Origin: origin } }), routeServices);
    expect(ready.status).toBe(200);
    const readyBody = await ready.json() as any;
    expect(readyBody).toMatchObject({ organizationId: callbackBody.organizationId, principalId: callbackBody.principalId, created: true });
    expect(readyBody).toHaveProperty("token");

    const pendingAfter = await authorityHumanResponse(db, new Request(origin + `/v1/authority/genesis/result?browser=${browser}`,
      { headers: { Origin: origin } }), routeServices);
    expect(pendingAfter.status).toBe(202);
  });

  it("un browser vacío o ausente también es pending, nunca 400/500", async () => {
    const origin = "https://authority.test";
    const routeServices: HumanRouteServices = { ...services, origin, issuer: "issuer-test", signer: { privateKeyPkcs8: new ArrayBuffer(0), keyId: "issuer-key" } };
    const noParam = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/result", { headers: { Origin: origin } }), routeServices);
    expect(noParam.status).toBe(202);
    const empty = await authorityHumanResponse(db, new Request(origin + "/v1/authority/genesis/result?browser=", { headers: { Origin: origin } }), routeServices);
    expect(empty.status).toBe(202);
  });
});
