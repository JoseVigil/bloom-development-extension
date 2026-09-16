// backend/test/tenant-schema.spec.ts
//
// Sovereign Tenant — Fase 1: schema inerte
// (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.2, §4 — Fase 1, confirmada por Jose
// el 2026-09-16).
//
// Este archivo prueba ÚNICAMENTE la migración `0015_tenants.sql`, en aislamiento — no
// toca genesis-store.ts, no toca ninguna ruta ni store. La migración tiene que:
//   (a) aplicar limpio sobre un `organizations` vacío,
//   (b) backfillear exactamente una fila de `tenants` por cada organización YA
//       existente al momento de migrar, reusando `tenant.id = organization.id`,
//   (c) dejar `organizations.tenant_id` apuntando a esa fila para cada una,
//   (d) respetar la FK declarada (`tenant_id REFERENCES tenants(id)`),
//   (e) no alterar el comportamiento de ninguna tabla vecina (mandates, vía FK a
//       organizations, como control de regresión).
//
// No se comparte una única instancia de Miniflare entre tests: cada test necesita
// controlar el orden exacto "¿había organizaciones ANTES de migrar, o no?", así que cada
// uno arma su propia base desde cero y la descarta al terminar (afterEach).
//
// `organizations` se recrea a mano acá, igual que en authority-genesis.spec.ts —
// mismas columnas, mismo orden, byte a byte con 0000_initial.sql — en vez de cargar
// 0000_initial.sql vía el helper de abajo (mismo criterio ya establecido en ese archivo).

import { afterEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mf: Miniflare | undefined, temp: string | undefined;

afterEach(async () => {
  await mf?.dispose();
  if (temp) rmSync(temp, { recursive: true, force: true });
  mf = undefined; temp = undefined;
});

async function freshDb(): Promise<D1Database> {
  temp = mkdtempSync(join(tmpdir(), "tenant-schema-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "tenant-schema" } }),
    resourcePersistencePath: temp });
  const db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  // 0000_initial.sql arranca con esta misma PRAGMA. Se declara acá, aislada, para que la
  // prueba de FK (d) sea real — no depende de si el harness la tolera embebida dentro de
  // un archivo con más sentencias.
  await db.prepare("PRAGMA foreign_keys = ON").run();
  return db;
}

// Igual al helper de authority-genesis.spec.ts, con un único agregado: el backfill de
// esta migración necesita un UPDATE (0000/0003/0013 nunca necesitaron uno), y el
// lookahead original del helper compartido sólo reconoce CREATE/ALTER/INSERT. Se
// extiende acá, local a este archivo — no toca el helper de ningún otro spec.
async function loadMigrations(db: D1Database, files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

function seedOrg(db: D1Database, id: string, name: string) {
  return db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, name, `owner-${id}`, "unassigned", 0).run();
}

describe("0015_tenants.sql — Fase 1 (schema inerte)", () => {
  it("(a) applies cleanly against an empty organizations table", async () => {
    const db = await freshDb();
    await loadMigrations(db, ["0015_tenants.sql"]);
    const tenants = await db.prepare("SELECT COUNT(*) n FROM tenants").first<{ n: number }>();
    expect(tenants?.n).toBe(0);
    // La columna nueva existe y una organización creada DESPUÉS de la migración (fuera
    // de génesis, sin tenant_id todavía porque Fase 2 no está implementada) queda NULL,
    // sin error — confirma que la columna es opcional en esta fase.
    await seedOrg(db, "org-empty-case", "Empty Case");
    const row = await db.prepare("SELECT tenant_id FROM organizations WHERE id=?").bind("org-empty-case").first<any>();
    expect(row.tenant_id).toBeNull();
  });

  it("(b)+(c) backfills exactly one tenant per pre-existing organization, id reused as tenant id", async () => {
    const db = await freshDb();
    await seedOrg(db, "org-acme", "Acme");
    await seedOrg(db, "org-globex", "Globex");
    await loadMigrations(db, ["0015_tenants.sql"]);

    const tenantCount = await db.prepare("SELECT COUNT(*) n FROM tenants").first<{ n: number }>();
    expect(tenantCount?.n).toBe(2);

    const acmeTenant = await db.prepare("SELECT * FROM tenants WHERE id=?").bind("org-acme").first<any>();
    expect(acmeTenant).toMatchObject({
      id: "org-acme", name: "Acme", master_github_username: "owner-org-acme", key_fingerprint: "bloom:tenant:org-acme",
    });

    const acmeOrg = await db.prepare("SELECT tenant_id FROM organizations WHERE id=?").bind("org-acme").first<any>();
    expect(acmeOrg.tenant_id).toBe("org-acme");
    const globexOrg = await db.prepare("SELECT tenant_id FROM organizations WHERE id=?").bind("org-globex").first<any>();
    expect(globexOrg.tenant_id).toBe("org-globex");
  });

  it("(d) enforces the FK: a tenant_id that does not reference an existing tenant is rejected", async () => {
    const db = await freshDb();
    await loadMigrations(db, ["0015_tenants.sql"]);
    await seedOrg(db, "org-orphan", "Orphan");
    await expect(
      db.prepare("UPDATE organizations SET tenant_id=? WHERE id=?").bind("does-not-exist", "org-orphan").run(),
    ).rejects.toThrow();
  });

  it("(e) does not change behavior for a neighboring table (mandates, FK'd to organizations)", async () => {
    const db = await freshDb();
    await db.prepare(`CREATE TABLE mandates(id TEXT PRIMARY KEY, origin_org_id TEXT NOT NULL REFERENCES organizations(id),
      slug TEXT NOT NULL, description TEXT NOT NULL, visibility TEXT NOT NULL, latest_version TEXT NOT NULL,
      pillar TEXT, origin_type TEXT, created_at INTEGER NOT NULL)`).run();
    await seedOrg(db, "org-with-mandate", "Has Mandate");
    await loadMigrations(db, ["0015_tenants.sql"]);
    await db.prepare(`INSERT INTO mandates(id,origin_org_id,slug,description,visibility,latest_version,created_at)
      VALUES('m1','org-with-mandate','slug','desc','private','1',0)`).run();
    const mandate = await db.prepare("SELECT * FROM mandates WHERE id='m1'").first<any>();
    expect(mandate.origin_org_id).toBe("org-with-mandate");
  });
});
