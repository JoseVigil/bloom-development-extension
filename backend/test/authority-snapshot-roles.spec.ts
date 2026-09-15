// backend/test/authority-snapshot-roles.spec.ts
//
// Reemplaza a `authority.spec.additions.ts` (borrador con placeholders
// "REEMPLAZAR_CON_HELPER_REAL" y helpers imaginarios) con setup real vía Miniflare + D1,
// mismo patrón que mandate-publish.spec.ts / authority-genesis.spec.ts. Nombre de
// archivo cambiado para calzar con el glob `test/**/*.spec.ts` de vitest.config.mts —
// `authority.spec.additions.ts` no lo cumplía y nunca se ejecutaba.
//
// Requiere la migración 0014_authority_role_assignment_status.sql (agrega `status` a
// `role_assignments`, columna que `buildSnapshotContent` ya asumía pero no existía en
// ninguna migración previa — bug de producción encontrado y corregido 2026-09-15).
//
// Las aserciones sobre `buildSnapshotContent` / `resolveTrustBundle` /
// `registerIssuerSigningKey` son las mismas que en el borrador original; sólo cambió el
// setup de datos, que ahora inserta filas reales en vez de usar ids inexistentes.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSnapshotContent, registerIssuerSigningKey, resolveTrustBundle } from "../src/authority/snapshot";

let db: D1Database, mf: Miniflare, temp: string;
let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

async function createTestOrganization(id: string = nextId("org")): Promise<string> {
  await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, "Test Org", "owner-" + id, "unassigned", 0).run();
  return id;
}

async function insertPrincipal(id: string = nextId("principal")): Promise<string> {
  await db.prepare("INSERT INTO principals(id, external_ids, display_name, since_version, created_at, updated_at) VALUES(?,?,?,?,?,?)")
    .bind(id, "{}", null, 1, 0, 0).run();
  return id;
}

async function insertMembership(params: { organizationId: string; principalId: string }, id: string = nextId("membership")): Promise<string> {
  await db.prepare(
    `INSERT INTO memberships(id, principal_id, organization_id, status, effective_from, effective_until, since_version, created_at, updated_at)
     VALUES(?,?,?,'active',?,NULL,1,?,?)`,
  ).bind(id, params.principalId, params.organizationId, 0, 0, 0).run();
  return id;
}

async function insertRoleDefinition(
  params: { organizationId: string | null; key: string; version: number; status?: "active" | "suspended" | "retired" },
  id: string = nextId("role_def"),
): Promise<string> {
  await db.prepare(
    `INSERT INTO role_definitions(id, organization_id, key, version, definition, since_version, created_at, status)
     VALUES(?,?,?,?,?,1,0,?)`,
  ).bind(id, params.organizationId, params.key, params.version, "{}", params.status ?? "active").run();
  return id;
}

async function insertRoleAssignment(
  params: { organizationId: string; principalId: string; membershipId: string; roleDefinitionId: string; status?: "active" | "pending" | "suspended" },
  id: string = nextId("role_assignment"),
): Promise<string> {
  await db.prepare(
    `INSERT INTO role_assignments(id, organization_id, principal_id, membership_id, role_definition_id, scope, effective_from, effective_until, since_version, created_at, status)
     VALUES(?,?,?,?,?,NULL,?,NULL,1,?,?)`,
  ).bind(id, params.organizationId, params.principalId, params.membershipId, params.roleDefinitionId, 0, 0, params.status ?? "active").run();
  return id;
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "authority-snapshot-roles-"));
  mf = new Miniflare({
    ...convertV4MiniflareOptions({
      host: "127.0.0.1", cf: false, modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      compatibilityDate: "2026-08-29", d1Databases: { DB: "authority-snapshot-roles" },
    }),
    resourcePersistencePath: temp,
  });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await loadMigrations([
    "0000_initial.sql",
    "0001_authority_snapshot.sql",
    "0002_authority_security.sql",
    "0009_authority_role_definition_status.sql",
    "0014_authority_role_assignment_status.sql",
  ]);
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

beforeEach(async () => {
  for (const table of ["role_assignments", "role_definitions", "memberships", "principals", "issuer_signing_keys", "organizations"])
    await db.prepare(`DELETE FROM ${table}`).run();
});

describe("role_definitions — integridad referencial (§1.2)", () => {
  it("incluye una versión de rol no-más-reciente si una asignación vigente la referencia", async () => {
    const organizationId = await createTestOrganization();
    const principalId = await insertPrincipal();
    const membershipId = await insertMembership({ organizationId, principalId });
    const roleV1 = await insertRoleDefinition({ organizationId, key: "specialist", version: 1 });
    await insertRoleDefinition({ organizationId, key: "specialist", version: 2 });
    await insertRoleAssignment({ organizationId, principalId, membershipId, roleDefinitionId: roleV1, status: "active" });

    const content = await buildSnapshotContent(db, organizationId, null);

    const specialistVersions = content.role_definitions.filter((rd) => rd.key === "specialist").map((rd) => rd.version);
    expect(specialistVersions).toContain(1); // versión vieja: referenciada por una asignación vigente
    expect(specialistVersions).toContain(2); // versión más reciente activa
  });

  it("excluye una versión de rol no-más-reciente si ninguna asignación vigente la referencia", async () => {
    const organizationId = await createTestOrganization();
    await insertRoleDefinition({ organizationId, key: "specialist", version: 1 });
    await insertRoleDefinition({ organizationId, key: "specialist", version: 2 });
    // Sin role_assignment sobre la v1 — no debe sobrevivir en el snapshot.

    const content = await buildSnapshotContent(db, organizationId, null);

    const specialistVersions = content.role_definitions.filter((rd) => rd.key === "specialist").map((rd) => rd.version);
    expect(specialistVersions).not.toContain(1);
    expect(specialistVersions).toContain(2);
  });
});

describe("issuer_signing_keys — rotación y trust bundle (§1.3)", () => {
  it("acepta una segunda clave firmada por la primera, y ambas aparecen en el trust bundle", async () => {
    const organizationId = await createTestOrganization();

    const first = await registerIssuerSigningKey(db, {
      keyId: "key_1",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzE=",
      signedByKeyId: null, // primera clave de la organización: válido
    });
    expect(first.ok).toBe(true);

    const second = await registerIssuerSigningKey(db, {
      keyId: "key_2",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzI=",
      signedByKeyId: "key_1",
    });
    expect(second.ok).toBe(true);

    const bundle = await resolveTrustBundle(db, organizationId);
    expect(bundle.map((key) => key.key_id)).toEqual(expect.arrayContaining(["key_1", "key_2"]));
  });

  it("rechaza una clave con signed_by_key_id inválido (no existe)", async () => {
    const organizationId = await createTestOrganization();

    const result = await registerIssuerSigningKey(db, {
      keyId: "key_orphan",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzM=",
      signedByKeyId: "key_no_existe",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza una clave autofirmada cuando ya existe una clave previa en la organización", async () => {
    const organizationId = await createTestOrganization();

    const first = await registerIssuerSigningKey(db, {
      keyId: "key_a",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzQ=",
      signedByKeyId: null,
    });
    expect(first.ok).toBe(true);

    const second = await registerIssuerSigningKey(db, {
      keyId: "key_b",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzU=",
      signedByKeyId: null, // inválido: ya existe key_a en la organización
    });
    expect(second.ok).toBe(false);
  });
});
