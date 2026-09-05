// backend/test/authority.spec.additions.ts
//
// NO es un archivo nuevo standalone — es el contenido a fusionar dentro de
// `backend/test/authority.spec.ts` ya existente (§1.2 y §1.3 del encargo piden
// modificar ese archivo, no crear uno nuevo). No tengo `authority.spec.ts` en esta
// sesión, así que no puedo aplicar el merge yo mismo ni reusar sus helpers de setup
// reales (creación de organización/principal/membership/role_definition/role_assignment).
//
// Los bloques de abajo usan helpers imaginarios (`insertRoleDefinition`,
// `insertRoleAssignment`, etc.) a modo de placeholder — reemplazar por los que ya
// existan en el archivo real. La parte que sí es código final (no placeholder) son las
// aserciones sobre `buildSnapshotContent` / `resolveTrustBundle` / `registerIssuerSigningKey`,
// que son las funciones que efectivamente cambiaron en `snapshot.ts`.

import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { buildSnapshotContent, registerIssuerSigningKey, resolveTrustBundle } from "../src/authority/snapshot";

describe("role_definitions — integridad referencial (§1.2)", () => {
  it("incluye una versión de rol no-más-reciente si una asignación vigente la referencia", async () => {
    // Setup esperado, con los helpers reales del archivo:
    //   const organizationId = await createTestOrganization(env.DB);
    //   const roleV1 = await insertRoleDefinition(env.DB, { organizationId, key: "specialist", version: 1, status: "active" });
    //   const roleV2 = await insertRoleDefinition(env.DB, { organizationId, key: "specialist", version: 2, status: "active" });
    //   await insertRoleAssignment(env.DB, { organizationId, roleDefinitionId: roleV1.id, status: "active" });
    const organizationId = "REEMPLAZAR_CON_HELPER_REAL";

    const content = await buildSnapshotContent(env.DB, organizationId, null);

    const specialistVersions = content.role_definitions.filter((rd) => rd.key === "specialist").map((rd) => rd.version);
    expect(specialistVersions).toContain(1); // versión vieja: referenciada por una asignación vigente
    expect(specialistVersions).toContain(2); // versión más reciente activa
  });

  it("excluye una versión de rol no-más-reciente si ninguna asignación vigente la referencia", async () => {
    // Mismo setup que el caso anterior pero SIN la asignación sobre roleV1.
    const organizationId = "REEMPLAZAR_CON_HELPER_REAL";

    const content = await buildSnapshotContent(env.DB, organizationId, null);

    const specialistVersions = content.role_definitions.filter((rd) => rd.key === "specialist").map((rd) => rd.version);
    expect(specialistVersions).not.toContain(1);
    expect(specialistVersions).toContain(2);
  });
});

describe("issuer_signing_keys — rotación y trust bundle (§1.3)", () => {
  it("acepta una segunda clave firmada por la primera, y ambas aparecen en el trust bundle", async () => {
    const organizationId = "REEMPLAZAR_CON_HELPER_REAL_ROTATION_1";

    const first = await registerIssuerSigningKey(env.DB, {
      keyId: "key_1",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzE=",
      signedByKeyId: null, // primera clave de la organización: válido
    });
    expect(first.ok).toBe(true);

    const second = await registerIssuerSigningKey(env.DB, {
      keyId: "key_2",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzI=",
      signedByKeyId: "key_1",
    });
    expect(second.ok).toBe(true);

    const bundle = await resolveTrustBundle(env.DB, organizationId);
    expect(bundle.map((key) => key.key_id)).toEqual(expect.arrayContaining(["key_1", "key_2"]));
  });

  it("rechaza una clave con signed_by_key_id inválido (no existe)", async () => {
    const organizationId = "REEMPLAZAR_CON_HELPER_REAL_ROTATION_2";

    const result = await registerIssuerSigningKey(env.DB, {
      keyId: "key_orphan",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzM=",
      signedByKeyId: "key_no_existe",
    });
    expect(result.ok).toBe(false);
  });

  it("rechaza una clave autofirmada cuando ya existe una clave previa en la organización", async () => {
    const organizationId = "REEMPLAZAR_CON_HELPER_REAL_ROTATION_3";

    const first = await registerIssuerSigningKey(env.DB, {
      keyId: "key_a",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzQ=",
      signedByKeyId: null,
    });
    expect(first.ok).toBe(true);

    const second = await registerIssuerSigningKey(env.DB, {
      keyId: "key_b",
      organizationId,
      publicKeyRaw: "QkFTRTY0X1BMQUNFSE9MREVSXzU=",
      signedByKeyId: null, // inválido: ya existe key_a en la organización
    });
    expect(second.ok).toBe(false);
  });
});
