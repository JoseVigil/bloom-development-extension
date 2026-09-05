// backend/test/authority.spec.ts
//
// NOTA IMPORTANTE: este archivo no fue ejecutado en esta sesión (no hay acceso de red a
// npm/wrangler ni a `@cloudflare/vitest-pool-workers` en este entorno, y tampoco un D1
// real disponible). Usa un `FakeD1` mínimo que implementa sólo lo que
// `identity.ts`/`snapshot.ts` invocan (`prepare().bind().first()/.all()/.run()`), como
// sustituto de un binding D1 real para poder razonar sobre la lógica sin depender de la
// infraestructura de Workers. Antes de confiar en estos tests, correrlos de verdad con
// `@cloudflare/vitest-pool-workers` contra una D1 local (`wrangler d1 execute --local`)
// aplicando 0001 y 0002.

import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { canonicalizeJson } from "../src/authority/canonical";
import {
  INSTALLATION_AUTH_DOMAIN,
  isWithinReplayWindow,
  loadInstallationIdentity,
  registerInstallationIdentity,
  verifyInstallationRequest,
  verifyRegistrationRequest,
  type InstallationAuthHeaders,
} from "../src/authority/identity";
import { buildSnapshotContent } from "../src/authority/snapshot";

// ---------------------------------------------------------------------------
// FakeD1: implementación mínima en memoria de las tablas relevantes de 0001 + 0002.
// No es un D1 real -- sólo soporta las queries literales que emiten identity.ts/snapshot.ts.
// ---------------------------------------------------------------------------

interface FakeRow {
  [key: string]: unknown;
}

class FakeD1 {
  tables: Record<string, FakeRow[]> = {
    principals: [],
    memberships: [],
    role_definitions: [],
    role_assignments: [],
    revocations: [],
    authority_state: [],
    installation_identities: [],
  };

  prepare(sql: string) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  private boundArgs: unknown[] = [];
  constructor(
    private db: FakeD1,
    private sql: string,
  ) {}

  bind(...args: unknown[]) {
    this.boundArgs = args;
    return this;
  }

  private run_query(): FakeRow[] {
    const sql = this.sql;
    const args = this.boundArgs;

    if (sql.includes("FROM installation_identities WHERE installation_id = ?") && sql.includes("SELECT installation_id\n")) {
      return this.db.tables.installation_identities.filter((r) => r.installation_id === args[0]);
    }
    if (sql.startsWith("INSERT INTO installation_identities")) {
      this.db.tables.installation_identities.push({
        installation_id: args[0],
        organization_id: args[1],
        public_key: args[2],
        created_at: args[3],
        revoked_at: null,
      });
      return [];
    }
    if (sql.includes("SELECT installation_id, organization_id, public_key, created_at, revoked_at FROM installation_identities")) {
      return this.db.tables.installation_identities.filter((r) => r.installation_id === args[0]);
    }
    if (sql.includes("FROM authority_state")) {
      return this.db.tables.authority_state.filter((r) => r.organization_id === args[0]);
    }
    if (sql.includes("FROM memberships")) {
      const [organizationId, sinceFilter] = args as [string, number];
      return this.db.tables.memberships.filter(
        (r) => r.organization_id === organizationId && (r.since_version as number) > sinceFilter,
      );
    }
    if (sql.includes("FROM principals")) {
      const sinceFilter = args[args.length - 1] as number;
      const ids = args.slice(0, -1) as string[];
      return this.db.tables.principals.filter((r) => ids.includes(r.id as string) && (r.since_version as number) > sinceFilter);
    }
    if (sql.includes("FROM role_definitions")) {
      const [organizationId, sinceFilter] = args as [string, number];
      return this.db.tables.role_definitions.filter(
        (r) => (r.organization_id === null || r.organization_id === organizationId) && (r.since_version as number) > sinceFilter,
      );
    }
    if (sql.includes("FROM role_assignments")) {
      const [organizationId, sinceFilter] = args as [string, number];
      return this.db.tables.role_assignments.filter(
        (r) => r.organization_id === organizationId && (r.since_version as number) > sinceFilter,
      );
    }
    if (sql.includes("FROM revocations")) {
      const [organizationId, sinceFilter] = args as [string, number];
      return this.db.tables.revocations.filter(
        (r) => r.organization_id === organizationId && (r.visible_from_version as number) > sinceFilter,
      );
    }
    throw new Error(`FakeD1: query no soportada en el mock: ${sql}`);
  }

  async first<T>(): Promise<T | null> {
    const rows = this.run_query();
    return (rows[0] as T) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.run_query() as T[] };
  }

  async run(): Promise<void> {
    this.run_query();
  }
}

// ---------------------------------------------------------------------------
// Helpers de firma (lado "Nucleus" simulado con node:crypto, no con el Nucleus real en Go)
// ---------------------------------------------------------------------------

function makeKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyRaw = publicKey.export({ type: "spki", format: "der" }).subarray(-32); // últimos 32 bytes = raw Ed25519
  return { publicKey, privateKey, publicKeyBase64: Buffer.from(publicKeyRaw).toString("base64") };
}

function signAsNucleus(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
  domain: string,
  payload: string,
): string {
  const domainBytes = Buffer.from(domain, "utf8");
  const payloadBytes = Buffer.from(payload, "utf8");
  const message = Buffer.concat([domainBytes, Buffer.from([0x00]), payloadBytes]);
  const signature = nodeSign(null, message, privateKey);
  return signature.toString("base64");
}

function buildHeaders(params: {
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  installationId: string;
  organizationId: string;
  method: string;
  path: string;
  timestamp?: string;
}): InstallationAuthHeaders {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const payload = canonicalizeJson({
    installation_id: params.installationId,
    organization_id: params.organizationId,
    method: params.method,
    path: params.path,
    timestamp,
  });
  return {
    installationId: params.installationId,
    timestamp,
    signatureBase64: signAsNucleus(params.privateKey, INSTALLATION_AUTH_DOMAIN, payload),
  };
}

// ---------------------------------------------------------------------------
// Separación de dominio (mismo requisito que binding_test.go del lado Nucleus, §1.2)
// ---------------------------------------------------------------------------

describe("separación de dominio BLOOM-INSTALLATION-AUTH-v1 vs BLOOM-AUTHORITY-SNAPSHOT-v1", () => {
  it("una firma válida para instalación no debe verificar bajo el dominio de snapshot ni viceversa", async () => {
    const { privateKey, publicKeyBase64 } = makeKeyPair();
    const { verifyWithDomain } = await import("../src/authority/canonical");
    const payload = canonicalizeJson({ hello: "world" });

    const sigInstallation = signAsNucleus(privateKey, INSTALLATION_AUTH_DOMAIN, payload);
    const publicKeyRaw = Buffer.from(publicKeyBase64, "base64");

    expect(await verifyWithDomain(INSTALLATION_AUTH_DOMAIN, payload, sigInstallation, publicKeyRaw)).toBe(true);
    expect(await verifyWithDomain("BLOOM-AUTHORITY-SNAPSHOT-v1", payload, sigInstallation, publicKeyRaw)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Registro de identidad (POST /v1/authority/identity/register)
// ---------------------------------------------------------------------------

describe("registro de identidad de instalación", () => {
  it("acepta un registro con firma válida y crea la fila", async () => {
    const db = new FakeD1() as unknown as D1Database;
    const { privateKey, publicKeyBase64 } = makeKeyPair();
    const headers = buildHeaders({
      privateKey,
      installationId: "inst-1",
      organizationId: "org-1",
      method: "POST",
      path: "/v1/authority/identity/register",
    });

    const proven = await verifyRegistrationRequest({
      organizationId: "org-1",
      method: "POST",
      path: "/v1/authority/identity/register",
      headers,
      publicKeyBase64,
    });
    expect(proven).toBe(true);

    const result = await registerInstallationIdentity(db, {
      installationId: "inst-1",
      organizationId: "org-1",
      publicKeyBase64,
    });
    expect(result.ok).toBe(true);

    const stored = await loadInstallationIdentity(db, "inst-1");
    expect(stored?.public_key).toBe(publicKeyBase64);
    expect(stored?.revoked_at).toBeNull();
  });

  it("rechaza el registro si installation_id ya existe (conflicto, no debe sobreescribir la clave)", async () => {
    const db = new FakeD1() as unknown as D1Database;
    const first = makeKeyPair();
    const second = makeKeyPair();

    await registerInstallationIdentity(db, {
      installationId: "inst-1",
      organizationId: "org-1",
      publicKeyBase64: first.publicKeyBase64,
    });

    const result = await registerInstallationIdentity(db, {
      installationId: "inst-1",
      organizationId: "org-1",
      publicKeyBase64: second.publicKeyBase64,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("conflict");

    const stored = await loadInstallationIdentity(db, "inst-1");
    expect(stored?.public_key).toBe(first.publicKeyBase64); // no se pisó con la segunda clave
  });

  it("rechaza el registro si la firma no corresponde a la clave pública declarada", async () => {
    const attacker = makeKeyPair();
    const victim = makeKeyPair();
    const headers = buildHeaders({
      privateKey: attacker.privateKey, // firma con OTRA clave privada
      installationId: "inst-1",
      organizationId: "org-1",
      method: "POST",
      path: "/v1/authority/identity/register",
    });

    const proven = await verifyRegistrationRequest({
      organizationId: "org-1",
      method: "POST",
      path: "/v1/authority/identity/register",
      headers,
      publicKeyBase64: victim.publicKeyBase64, // pero declara la clave pública de otra instalación
    });
    expect(proven).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Verificación de requests S2S posteriores (GET /v1/authority/snapshot, etc.)
// ---------------------------------------------------------------------------

describe("verificación de requests S2S contra identidad ya registrada", () => {
  it("acepta una firma válida sobre installation_id/organization_id/method/path/timestamp", async () => {
    const { privateKey, publicKeyBase64 } = makeKeyPair();
    const headers = buildHeaders({
      privateKey,
      installationId: "inst-1",
      organizationId: "org-1",
      method: "GET",
      path: "/v1/authority/snapshot",
    });

    const ok = await verifyInstallationRequest({
      organizationId: "org-1",
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
      identity: {
        installation_id: "inst-1",
        organization_id: "org-1",
        public_key: publicKeyBase64,
        created_at: Date.now(),
        revoked_at: null,
      },
    });
    expect(ok).toBe(true);
  });

  it.each(["installationId", "timestamp"] as const)(
    "rechaza si se altera %s manteniendo la firma original",
    async (field) => {
      const { privateKey, publicKeyBase64 } = makeKeyPair();
      const headers = buildHeaders({
        privateKey,
        installationId: "inst-1",
        organizationId: "org-1",
        method: "GET",
        path: "/v1/authority/snapshot",
      });
      const tampered = { ...headers, [field]: field === "timestamp" ? new Date(Date.now() + 1000).toISOString() : "inst-2" };

      const ok = await verifyInstallationRequest({
        organizationId: "org-1",
        method: "GET",
        path: "/v1/authority/snapshot",
        headers: tampered,
        identity: {
          installation_id: "inst-1",
          organization_id: "org-1",
          public_key: publicKeyBase64,
          created_at: Date.now(),
          revoked_at: null,
        },
      });
      expect(ok).toBe(false);
    },
  );

  it("rechaza si organization_id del request no coincide con el de la identidad registrada", async () => {
    const { privateKey, publicKeyBase64 } = makeKeyPair();
    const headers = buildHeaders({
      privateKey,
      installationId: "inst-1",
      organizationId: "org-A",
      method: "GET",
      path: "/v1/authority/snapshot",
    });

    const ok = await verifyInstallationRequest({
      organizationId: "org-A",
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
      identity: {
        installation_id: "inst-1",
        organization_id: "org-B", // registrada para otra organización
        public_key: publicKeyBase64,
        created_at: Date.now(),
        revoked_at: null,
      },
    });
    expect(ok).toBe(false);
  });

  it("rechaza una identidad revocada aunque la firma sea válida", async () => {
    const { privateKey, publicKeyBase64 } = makeKeyPair();
    const headers = buildHeaders({
      privateKey,
      installationId: "inst-1",
      organizationId: "org-1",
      method: "GET",
      path: "/v1/authority/snapshot",
    });

    const ok = await verifyInstallationRequest({
      organizationId: "org-1",
      method: "GET",
      path: "/v1/authority/snapshot",
      headers,
      identity: {
        installation_id: "inst-1",
        organization_id: "org-1",
        public_key: publicKeyBase64,
        created_at: Date.now(),
        revoked_at: Date.now(),
      },
    });
    expect(ok).toBe(false);
  });

  it("rechaza timestamps fuera de la ventana de repetición", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(isWithinReplayWindow("2026-09-04T12:00:00Z", now)).toBe(true);
    expect(isWithinReplayWindow("2026-09-04T11:00:00Z", now)).toBe(false);
    expect(isWithinReplayWindow("not-a-date", now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integridad referencial del snapshot (full y delta) contra el schema real de 0001
// ---------------------------------------------------------------------------

describe("integridad referencial de buildSnapshotContent", () => {
  function seed(db: FakeD1) {
    db.tables.authority_state.push({ organization_id: "org-1", current_version: 5, current_digest: null, updated_at: 0 });

    db.tables.principals.push(
      { id: "p1", external_ids: "{}", display_name: "Ana", since_version: 1 },
      { id: "p2", external_ids: "{}", display_name: "Beto", since_version: 4 },
    );
    db.tables.memberships.push(
      { id: "m1", principal_id: "p1", organization_id: "org-1", status: "active", effective_from: 0, effective_until: null, since_version: 1 },
      { id: "m2", principal_id: "p2", organization_id: "org-1", status: "active", effective_from: 0, effective_until: null, since_version: 4 },
    );
    db.tables.role_definitions.push(
      { id: "r-master", organization_id: null, key: "master", version: 1, definition: "{}", since_version: 1 },
      { id: "r-custom", organization_id: "org-1", key: "reviewer", version: 1, definition: "{}", since_version: 3 },
    );
    db.tables.role_assignments.push({
      id: "ra1",
      organization_id: "org-1",
      principal_id: "p1",
      membership_id: "m1",
      role_definition_id: "r-master",
      scope: null,
      effective_from: 0,
      effective_until: null,
      since_version: 1,
    });
    db.tables.revocations.push({
      id: "rev1",
      organization_id: "org-1",
      target_type: "role_assignment",
      target_id: "ra1",
      visible_from_version: 5,
      effective_until: null,
      reason: "test",
    });
  }

  it("un snapshot full incluye sólo principals con membership en la organización pedida", async () => {
    const db = new FakeD1();
    seed(db);
    // principal ajeno a la organización -- no debe aparecer en el snapshot de org-1
    db.tables.principals.push({ id: "p3", external_ids: "{}", display_name: "Ajeno", since_version: 1 });

    const content = await buildSnapshotContent(db as unknown as D1Database, "org-1", null);
    expect(content.kind).toBe("full");
    const principalIds = content.principals.map((p) => p.id).sort();
    expect(principalIds).toEqual(["p1", "p2"]);

    // toda membership referencia un principal presente en el mismo payload (full)
    for (const membership of content.memberships) {
      expect(principalIds).toContain(membership.principal_id);
    }
    // todo role_assignment referencia una membership y un role_definition presentes
    const membershipIds = content.memberships.map((m) => m.id);
    const roleDefinitionIds = content.role_definitions.map((r) => r.id);
    for (const assignment of content.role_assignments) {
      expect(membershipIds).toContain(assignment.membership_id);
      expect(roleDefinitionIds).toContain(assignment.role_definition_id);
    }
  });

  it("incluye role_definitions built-in (organization_id null) junto con las custom de la organización", async () => {
    const db = new FakeD1();
    seed(db);
    const content = await buildSnapshotContent(db as unknown as D1Database, "org-1", null);
    const keys = content.role_definitions.map((r) => r.key).sort();
    expect(keys).toEqual(["master", "reviewer"]);
  });

  it("un delta desde base_version=2 sólo trae filas con since_version > 2, y revocations con visible_from_version > 2", async () => {
    const db = new FakeD1();
    seed(db);
    const content = await buildSnapshotContent(db as unknown as D1Database, "org-1", 2);
    expect(content.kind).toBe("delta");
    if (content.kind === "delta") expect(content.base_version).toBe(2);

    expect(content.principals.map((p) => p.id)).toEqual(["p2"]); // p1 tiene since_version=1, no > 2
    expect(content.role_definitions.map((r) => r.id)).toEqual(["r-custom"]); // r-master since_version=1
    expect(content.role_assignments).toEqual([]); // ra1 tiene since_version=1
    expect(content.revocations.map((r) => r.id)).toEqual(["rev1"]); // visible_from_version=5 > 2
  });

  it("version en el contenido coincide con current_version de authority_state, no con el conteo de filas", async () => {
    const db = new FakeD1();
    seed(db);
    const content = await buildSnapshotContent(db as unknown as D1Database, "org-1", null);
    expect(content.version).toBe(5);
  });
});
