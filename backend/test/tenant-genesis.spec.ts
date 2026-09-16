// backend/test/tenant-genesis.spec.ts
//
// Sovereign Tenant — Fase 2: finishGenesis crea un tenant
// (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.3.1, §4 — Fase 2, autorizada por
// Jose el 2026-09-16).
//
// Archivo nuevo, aislado — no modifica authority-genesis.spec.ts. El cambio en
// genesis-store.ts es quirúrgico (una fila nueva en el mismo db.batch atómico); este
// archivo prueba específicamente lo que ese cambio agrega, sin repetir la cobertura ya
// existente de authority-genesis.spec.ts (que sigue pasando sin tocarla, prueba de que
// el invariante "un subject, una organización, una sola vez" no se movió).
//
// Mismo patrón Miniflare/D1 que authority-genesis.spec.ts, con dos diferencias locales:
//   - se agrega `0015_tenants.sql` a la lista de migraciones cargadas,
//   - el loader local extiende el lookahead a CREATE|ALTER|INSERT|UPDATE (igual razón
//     que en tenant-schema.spec.ts: el backfill de 0015 necesita un UPDATE que el
//     helper compartido de otros specs no reconoce). No se toca el helper de ningún
//     otro archivo de test.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginGenesis, finishGenesis } from "../src/authority/genesis-store";
import type { HumanServices } from "../src/authority/human-session-store";

let db: D1Database, mf: Miniflare, temp: string;
const now = "2026-09-16T12:00:00Z";
const services: HumanServices = {
  now: () => now, encryptionKey: Buffer.alloc(32, 11).toString("base64"), allowTestFixtures: true,
  provider: { source: "test-fixture", authorize: (state, challenge) => `https://fixture.test/?state=${state}&challenge=${challenge}`,
    exchange: async (code: string) => ({ token: code, expiresIn: 28800 }), identify: async (token: string) => ({ subject: token, handle: `user-${token}` }) },
};

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}
async function genesisLogin(code: string, s: HumanServices = services) {
  const flow = await beginGenesis(db, s);
  return finishGenesis(db, { ...flow, code }, s);
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "tenant-genesis-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "tenant-genesis" } }),
    resourcePersistencePath: temp });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await loadMigrations(["0001_authority_snapshot.sql", "0002_authority_security.sql", "0004_authority_emissions.sql",
    "0005_authority_administration.sql", "0006_authority_human_identity.sql", "0009_authority_role_definition_status.sql",
    "0010_authority_initial_emission_guard.sql", "0013_authority_genesis.sql", "0015_tenants.sql"]);
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

describe("Génesis crea Tenant (Fase 2)", () => {
  it("(a) una génesis nueva crea exactamente un tenant, con id propio (distinto del organizationId)", async () => {
    const result = await genesisLogin("dana");
    const org = await db.prepare("SELECT tenant_id FROM organizations WHERE id=?").bind(result.organizationId).first<any>();
    expect(org.tenant_id).not.toBeNull();
    expect(org.tenant_id).not.toBe(result.organizationId);

    const tenant = await db.prepare("SELECT * FROM tenants WHERE id=?").bind(org.tenant_id).first<any>();
    expect(tenant).toMatchObject({ name: "user-dana", master_github_username: "user-dana", key_fingerprint: "unassigned" });
  });

  it("(b) el tenant y la organización quedan creados con el mismo created_at (misma transacción atómica)", async () => {
    const result = await genesisLogin("erin2");
    const org = await db.prepare("SELECT created_at, tenant_id FROM organizations WHERE id=?").bind(result.organizationId).first<any>();
    const tenant = await db.prepare("SELECT created_at FROM tenants WHERE id=?").bind(org.tenant_id).first<any>();
    expect(tenant.created_at).toBe(org.created_at);
  });

  it("(c) el mismo subject dos veces sigue sin crear una segunda organización NI un segundo tenant", async () => {
    const first = await genesisLogin("frank2");
    const second = await genesisLogin("frank2");
    expect(second.created).toBe(false);
    expect(second.organizationId).toBe(first.organizationId);

    const orgCount = await db.prepare("SELECT COUNT(*) n FROM organizations WHERE master_github_username=?").bind("user-frank2").first<{ n: number }>();
    expect(orgCount?.n).toBe(1);
    const tenantCount = await db.prepare("SELECT COUNT(*) n FROM tenants WHERE master_github_username=?").bind("user-frank2").first<{ n: number }>();
    expect(tenantCount?.n).toBe(1);
  });

  it("(d) una carrera concurrente para el mismo subject nuevo resuelve a exactamente un tenant, sin duplicados", async () => {
    const flows = await Promise.all([beginGenesis(db, services), beginGenesis(db, services)]);
    const outcomes = await Promise.all(flows.map(f => finishGenesis(db, { ...f, code: "grace2" }, services)));
    expect(new Set(outcomes.map(o => o.organizationId)).size).toBe(1);
    const tenantCount = await db.prepare("SELECT COUNT(*) n FROM tenants WHERE master_github_username=?").bind("user-grace2").first<{ n: number }>();
    expect(tenantCount?.n).toBe(1);
  });
});
