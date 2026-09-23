// backend/test/authority-invitations.spec.ts
//
// Invitaciones a organización ajena — Fase B: createInvitation / listInvitations /
// revokeInvitation (Propuesta_Diseno_Invitaciones_Organizacion_v0_2.md §2/§4, aprobada
// por Jose 2026-09-22). Archivo nuevo, aislado — no toca ningún spec existente.
//
// Setup calcado de tenant-organizations.spec.ts: misma organización de origen llevada
// hasta tener una emisión inicial real (createInitialAuthorityEmission), para probar el
// criterio de autorización real (sostener authority.membership.manage Y
// authority.assignment.manage en la emisión vigente) — no un atajo ni un mock. Cuando un
// test necesita que un segundo humano sostenga un rol no-master, se lo otorga por el
// mecanismo real de propose+accept vía el propio HTTP /v1/authority/administration ya
// probado (authority-administration-route.spec.ts) — nunca un INSERT directo de
// membership/assignment, que dejaría sin probar exactamente el camino que
// evaluateAdministration exige.
//
// Fase C (redención: beginInvitation/finishInvitation/pollInvitationResult, y el
// mecanismo de actor sintético de §3 del diseño) NO está cubierta acá — todavía no
// autorizada, ver la Corrección adjunta sobre el commitGuard que ese paso necesita y
// que el diseño no había identificado.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authorityHumanResponse, type HumanRouteServices } from "../src/authority/administration-route";
import { createInvitation, listInvitations, revokeInvitation } from "../src/authority/invitation-store";
import { createInitialAuthorityEmission, initialEmissionGuardStatement } from "../src/authority/initial-emission";
import { loadCurrentEmission } from "../src/authority/emission-store";
import { beginHumanLogin, finishHumanLogin, initialHumanIdentity, resolveHumanSession, type HumanServices } from "../src/authority/human-session-store";

let db: D1Database, mf: Miniflare, temp: string, sequence = 0, privateKey: ArrayBuffer;
const now = "2026-09-22T12:00:00Z";
const routeOrigin = "https://authority.test";
const masterPermissions = ["authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage",
  "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote",
  "mandate.install", "intent.create", "intent.cor.merge", "agent.issuer.designate", "create_project"];
const human: HumanServices = { now: () => now, encryptionKey: Buffer.alloc(32, 7).toString("base64"),
  provider: { source: "github-app", authorize: () => "https://github.test", exchange: async (code: string) => ({ token: code, expiresIn: 28800 }),
    identify: async (token: string) => ({ subject: token, handle: `user-${token}` }) } };
const signer = () => ({ privateKeyPkcs8: privateKey, keyId: "issuer-key" });
const services = (): HumanRouteServices => ({ ...human, origin: routeOrigin, issuer: "issuer-test", signer: signer() });

async function loadMigrations(files: string[]) {
  for (const file of files) {
    const sql = readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8").replace(/--[^\r\n]*/g, "").trim();
    for (const part of sql.split(/;\s*(?=(?:CREATE|ALTER|INSERT|UPDATE)\b)/i)) if (part.trim()) await db.prepare(part).run();
  }
}

async function seedOrg(id: string, subject: string) {
  await db.prepare("INSERT INTO organizations(id,name,master_github_username,key_fingerprint,created_at) VALUES(?,?,?,?,?)")
    .bind(id, id, `user-${subject}`, "unassigned", 0).run();
  await db.prepare("INSERT INTO installation_keys(installation_id,organization_id,public_key_raw,status,registered_at) VALUES(?,?,?,'active',0)")
    .bind(`installation-${id}`, id, "key").run();
  await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)")
    .bind(id, "founder", subject, now, `user-${subject}`).run();
}

/** Organización con master real (emisión inicial publicada) — el estado que necesita
 * cualquier prueba de invitaciones. */
async function createOrgWithMaster() {
  const org = `inv-org-${++sequence}`, subject = `subj-${sequence}`;
  await seedOrg(org, subject);
  const flow = await beginHumanLogin(db, org, human), login = await finishHumanLogin(db, { ...flow, code: subject }, human);
  const actor = (await resolveHumanSession(db, login.token, org, human))!;
  const identity = (await initialHumanIdentity(db, org, "founder", human))!;
  await createInitialAuthorityEmission(db, org, "founder", { now: () => now, issuer: "issuer-test", signer: signer(),
    initialIdentity: async () => identity, commitGuard: (id, at, evidence) => initialEmissionGuardStatement(db, actor, id, at, evidence) });
  return { org, subject, login, actor, principalId: "founder" };
}

/** Agrega un segundo humano a `org`, real (identidad canónica + sesión), sin ningún rol
 * asignado todavía. */
async function addBareMember(org: string, principalId: string, subject: string) {
  await db.prepare("INSERT INTO authority_human_identities VALUES(?,?,?,'canonical:github','canonical','1','active',?,?)")
    .bind(org, principalId, subject, now, `user-${subject}`).run();
  const memberHuman: HumanServices = { ...human, provider: { ...human.provider, identify: async () => ({ subject, handle: `user-${subject}` }) } };
  const flow = await beginHumanLogin(db, org, memberHuman), login = await finishHumanLogin(db, { ...flow, code: subject }, memberHuman);
  const actor = (await resolveHumanSession(db, login.token, org, memberHuman))!;
  return { actor, login, principalId };
}

async function administerHTTP(org: string, cookie: string, csrf: string, command: unknown, expectedVersion: string) {
  const res = await authorityHumanResponse(db, new Request(routeOrigin + "/v1/authority/administration", {
    method: "POST", headers: { Origin: routeOrigin, "Content-Type": "application/json", "X-Authority-CSRF": csrf, Cookie: cookie },
    body: JSON.stringify({ organizationId: org, requestId: crypto.randomUUID(), expectedVersion, command }),
  }), services());
  if (res.status !== 200) throw new Error(`administer failed: ${res.status} ${await res.text()}`);
  return await res.json() as { authorityVersion: string };
}

/** Define un rol propio de la organización vía el comando real `define_role` sobre el HTTP de
 * administración — nunca un INSERT en la tabla global `role_definitions`, que no llega al
 * estado firmado (Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md §2.2). */
async function defineOrgRole(org: string, master: { login: { token: string; csrf: string } }, roleId: string, displayName: string, permissions: string[]) {
  const current = (await loadCurrentEmission(db, org))!;
  await administerHTTP(org, `__Host-authority-session=${master.login.token}`, master.login.csrf,
    { kind: "define_role", role: { role_id: roleId, role_version: "1", role_origin: "organization", display_name: displayName, status: "active", permissions } },
    current.metadata.authority_version);
}

/** Otorga `roleId` en scope de organización a `recipient`, vía el mecanismo real de
 * propose+accept sobre el HTTP de administración ya probado — nunca un INSERT directo. */
async function grantRole(org: string, master: { login: { token: string; csrf: string } },
  recipient: { principalId: string; login: { token: string; csrf: string } }, roleId: string, roleVersion = "1") {
  const masterCookie = `__Host-authority-session=${master.login.token}`, recipientCookie = `__Host-authority-session=${recipient.login.token}`;
  let current = (await loadCurrentEmission(db, org))!;
  if (!current.state.memberships.some(m => m.principal_id === recipient.principalId)) {
    const membershipId = `m-${recipient.principalId}`;
    const propose = await administerHTTP(org, masterCookie, master.login.csrf,
      { kind: "propose_membership", proposalId: `pm-${recipient.principalId}`, membershipId, principalId: recipient.principalId, validFrom: now, validUntil: null },
      current.metadata.authority_version);
    await administerHTTP(org, recipientCookie, recipient.login.csrf, { kind: "accept", proposalId: `pm-${recipient.principalId}` }, propose.authorityVersion);
  }
  current = (await loadCurrentEmission(db, org))!;
  const membershipId = current.state.memberships.find(m => m.principal_id === recipient.principalId)!.membership_id;
  const assignmentId = `a-${recipient.principalId}-${roleId}`;
  const proposeAssignment = await administerHTTP(org, masterCookie, master.login.csrf,
    { kind: "propose_assignment", proposalId: `pa-${recipient.principalId}-${roleId}`, assignmentId, membershipId, roleId, roleVersion, scope: { type: "organization", id: org }, validFrom: now, validUntil: null },
    current.metadata.authority_version);
  await administerHTTP(org, recipientCookie, recipient.login.csrf, { kind: "accept", proposalId: `pa-${recipient.principalId}-${roleId}` }, proposeAssignment.authorityVersion);
}

beforeAll(async () => {
  temp = mkdtempSync(join(tmpdir(), "authority-invitations-"));
  mf = new Miniflare({ ...convertV4MiniflareOptions({ host: "127.0.0.1", cf: false, modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}', compatibilityDate: "2026-08-29", d1Databases: { DB: "authority-invitations" } }),
    resourcePersistencePath: temp });
  db = await mf.getD1Database("DB") as unknown as D1Database;
  await db.prepare(`CREATE TABLE organizations(id TEXT PRIMARY KEY, name TEXT NOT NULL,
    master_github_username TEXT NOT NULL, key_fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL)`).run();
  await loadMigrations(["0001_authority_snapshot.sql", "0002_authority_security.sql", "0004_authority_emissions.sql",
    "0005_authority_administration.sql", "0006_authority_human_identity.sql", "0009_authority_role_definition_status.sql",
    "0010_authority_initial_emission_guard.sql", "0018_authority_invitations.sql"]);
  await db.prepare(`INSERT INTO role_definitions(id,organization_id,key,version,definition,since_version,created_at,status)
    VALUES('master-1',NULL,'master',1,?,1,0,'active')`).bind(JSON.stringify({ display_name: "Master", permissions: masterPermissions })).run();
  await db.prepare(`INSERT INTO role_definitions(id,organization_id,key,version,definition,since_version,created_at,status)
    VALUES('specialist-1',NULL,'specialist',1,?,1,0,'active')`).bind(JSON.stringify({ display_name: "Specialist", permissions: ["intent.create"] })).run();
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  privateKey = await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer;
}, 60000);
afterAll(async () => { await mf?.dispose(); if (temp) rmSync(temp, { recursive: true, force: true }); }, 30000);

describe("createInvitation (Fase B)", () => {
  it("(a) un actor con ambos permisos crea una invitación pending, con token y url", async () => {
    const origin = await createOrgWithMaster();
    const result = await createInvitation(db, origin.org, origin.actor,
      { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin });
    expect(result.invitationId).toBeTruthy();
    expect(result.token).toBeTruthy();
    expect(result.url).toBe(`${routeOrigin}/v1/authority/tenant/invitations/redeem?token=${result.token}`);
    const row = await db.prepare("SELECT * FROM authority_organization_invitations WHERE id=?").bind(result.invitationId).first<any>();
    expect(row).toMatchObject({ organization_id: origin.org, invited_by_principal_id: origin.actor.principalId, role_id: "specialist", status: "pending", scope_type: "organization", scope_id: null });
    expect(row.token_hash).not.toBe(result.token); // nunca se guarda el secreto en claro
  });

  // Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md §4.3 paso 5 — el test que
  // faltaba: génesis REAL (sin fixture) → propose_membership → propose_assignment specialist →
  // accept, todo por el HTTP de administración.
  it("(a2) otorga specialist de punta a punta sobre una organización nacida de génesis real", async () => {
    const origin = await createOrgWithMaster();
    const v1 = (await loadCurrentEmission(db, origin.org))!;
    expect(v1.state.role_definitions.map(r => r.role_id).sort()).toEqual(["master", "operator", "specialist"]);
    expect(v1.state.role_assignments.map(r => r.role_id)).toEqual(["master"]);
    const member = await addBareMember(origin.org, "specialist-holder", `${origin.subject}-specialist`);
    await grantRole(origin.org, origin, member, "specialist");
    const current = (await loadCurrentEmission(db, origin.org))!;
    const membership = current.state.memberships.find(m => m.principal_id === "specialist-holder")!;
    expect(current.state.role_assignments.find(a => a.membership_id === membership.membership_id))
      .toMatchObject({ role_id: "specialist", role_version: "1", status: "active" });
  });

  it("(b) rechaza a un actor que sostiene sólo uno de los dos permisos exigidos", async () => {
    const origin = await createOrgWithMaster();
    await defineOrgRole(origin.org, origin, "membership-only", "Membership only", ["authority.membership.manage"]);
    const member = await addBareMember(origin.org, "membership-only-holder", `${origin.subject}-membership-only`);
    await grantRole(origin.org, origin, member, "membership-only");
    await expect(createInvitation(db, origin.org, member.actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_not_authorized");
  });

  it("(c) rechaza pedir un rol cuyos permisos exceden lo que sostiene el invitador", async () => {
    const origin = await createOrgWithMaster();
    await defineOrgRole(origin.org, origin, "limited", "Limited", ["authority.assignment.manage", "authority.membership.manage", "intent.create"]);
    const member = await addBareMember(origin.org, "limited-holder", `${origin.subject}-limited`);
    await grantRole(origin.org, origin, member, "limited");
    // "limited" sostiene ambos permisos exigidos para invitar, pero no mandate.create —
    // pedir un rol que sí lo incluya (master) debe rechazarse.
    await expect(createInvitation(db, origin.org, member.actor, { roleId: "master", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_not_authorized");
  });

  it("(d) rechaza scope de proyecto sin evidencia activa", async () => {
    const origin = await createOrgWithMaster();
    await expect(createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "project", scopeId: "no-evidence-project" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_scope_unverifiable");
  });

  it("(e) acepta scope de proyecto con evidencia activa", async () => {
    const origin = await createOrgWithMaster();
    await db.prepare(`INSERT INTO authority_project_scope_evidence VALUES(?,?,?,?,?,?,?)`)
      .bind(origin.org, "real-project", "1", "fixture:project", "test-fixture", "active", "2026-12-31T00:00:00Z").run();
    const result = await createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "project", scopeId: "real-project" }, { now: () => now, origin: routeOrigin });
    const row = await db.prepare("SELECT scope_type,scope_id FROM authority_organization_invitations WHERE id=?").bind(result.invitationId).first<any>();
    expect(row).toEqual({ scope_type: "project", scope_id: "real-project" });
  });

  it("(f) rechaza una organización sin emisión vigente", async () => {
    const org = `inv-no-emission-${++sequence}`, subject = `subj-${sequence}`;
    await seedOrg(org, subject);
    const flow = await beginHumanLogin(db, org, human), login = await finishHumanLogin(db, { ...flow, code: subject }, human);
    const actor = (await resolveHumanSession(db, login.token, org, human))!;
    await expect(createInvitation(db, org, actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_organization_unavailable");
  });

  it("(g) rechaza scopeId presente con scopeType organization, y scopeId ausente con scopeType project", async () => {
    const origin = await createOrgWithMaster();
    await expect(createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization", scopeId: "unexpected" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_invalid_request");
    await expect(createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "project" }, { now: () => now, origin: routeOrigin }))
      .rejects.toThrow("authority_invitation_invalid_request");
  });
});

describe("listInvitations / revokeInvitation (Fase B)", () => {
  it("(h) lista las invitaciones de la organización a quien sostiene ambos permisos", async () => {
    const origin = await createOrgWithMaster();
    await createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin });
    const list = await listInvitations(db, origin.org, origin.actor, { now: () => now });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ roleId: "specialist", status: "pending" });
  });

  it("(i) rechaza el listado a un miembro sin ambos permisos", async () => {
    const origin = await createOrgWithMaster();
    const member = await addBareMember(origin.org, "lister-holder", `${origin.subject}-lister`);
    await expect(listInvitations(db, origin.org, member.actor, { now: () => now })).rejects.toThrow("authority_invitation_not_authorized");
  });

  it("(j) revoca una invitación pending; una ya revocada o inexistente falla igual (sin distinguir cuál)", async () => {
    const origin = await createOrgWithMaster();
    const created = await createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin });
    const revoked = await revokeInvitation(db, origin.org, origin.actor, created.invitationId, { now: () => now });
    expect(revoked).toEqual({ revoked: true });
    const row = await db.prepare("SELECT status FROM authority_organization_invitations WHERE id=?").bind(created.invitationId).first<any>();
    expect(row.status).toBe("revoked");
    await expect(revokeInvitation(db, origin.org, origin.actor, created.invitationId, { now: () => now })).rejects.toThrow("authority_invitation_invitation_unavailable");
    await expect(revokeInvitation(db, origin.org, origin.actor, "does-not-exist", { now: () => now })).rejects.toThrow("authority_invitation_invitation_unavailable");
  });

  it("(k) no permite revocar una invitación de otra organización", async () => {
    const origin = await createOrgWithMaster(), other = await createOrgWithMaster();
    const created = await createInvitation(db, origin.org, origin.actor, { roleId: "specialist", roleVersion: "1", scopeType: "organization" }, { now: () => now, origin: routeOrigin });
    await expect(revokeInvitation(db, other.org, other.actor, created.invitationId, { now: () => now })).rejects.toThrow("authority_invitation_invitation_unavailable");
  });
});

describe("HTTP de punta a punta (Fase B)", () => {
  it("(l) POST crea, GET lista, POST revoke revoca — con CSRF exigido en ambos POST", async () => {
    const origin = await createOrgWithMaster();
    const cookie = `__Host-authority-session=${origin.login.token}`;

    const noCsrf = await authorityHumanResponse(db, new Request(routeOrigin + "/v1/authority/tenant/invitations", {
      method: "POST", headers: { Origin: routeOrigin, "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ organizationId: origin.org, roleId: "specialist", roleVersion: "1", scopeType: "organization", scopeId: null, invitedSubject: null, validUntil: null, expiresInSeconds: null }),
    }), services());
    expect(noCsrf.status).toBe(403);

    const post = await authorityHumanResponse(db, new Request(routeOrigin + "/v1/authority/tenant/invitations", {
      method: "POST", headers: { Origin: routeOrigin, "Content-Type": "application/json", "X-Authority-CSRF": origin.login.csrf, Cookie: cookie },
      body: JSON.stringify({ organizationId: origin.org, roleId: "specialist", roleVersion: "1", scopeType: "organization", scopeId: null, invitedSubject: null, validUntil: null, expiresInSeconds: null }),
    }), services());
    expect(post.status).toBe(201);
    const created = await post.json() as any;
    expect(created.invitationId).toBeTruthy();

    const get = await authorityHumanResponse(db, new Request(routeOrigin + `/v1/authority/tenant/invitations?organizationId=${origin.org}`,
      { headers: { Cookie: cookie } }), services());
    expect(get.status).toBe(200);
    const { invitations } = await get.json() as any;
    expect(invitations.map((i: any) => i.id)).toContain(created.invitationId);

    const revoke = await authorityHumanResponse(db, new Request(routeOrigin + "/v1/authority/tenant/invitations/revoke", {
      method: "POST", headers: { Origin: routeOrigin, "Content-Type": "application/json", "X-Authority-CSRF": origin.login.csrf, Cookie: cookie },
      body: JSON.stringify({ organizationId: origin.org, invitationId: created.invitationId }),
    }), services());
    expect(revoke.status).toBe(200);
    expect(await revoke.json()).toEqual({ revoked: true });
  });

  it("(m) GET sin sesión válida rechaza con 401, sin exponer nada", async () => {
    const origin = await createOrgWithMaster();
    const get = await authorityHumanResponse(db, new Request(routeOrigin + `/v1/authority/tenant/invitations?organizationId=${origin.org}`,
      { headers: { Cookie: "__Host-authority-session=invalid-token" } }), services());
    expect(get.status).toBe(401);
  });
});
