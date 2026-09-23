import { describe, expect, it } from "vitest";
import { evaluateAgentIssuerDesignation, AgentIssuerError } from "../src/authority/agent-issuer";
import type { WireFullContent } from "../src/authority/schema";

// Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md §2.2 / §3 — caso obligatorio: "emisor master
// (scope organización) obtiene designación para un project_id concreto sin ser rechazado por scope."

const now = "2026-09-12T12:00:00Z";
const org = "org-fixture";
const master = ["authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage", "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote", "mandate.install", "intent.create", "intent.cor.merge", "agent.issuer.designate", "create_project"];
const operator = ["intent.create", "agent.issuer.designate"];

const humanPrincipal = (id: string) => ({ principal_id: id, principal_type: "human" as const, status: "active" as const,
  external_identities: [{ provider: "github", subject: id, display_handle: id, status: "verified" as const, verified_at: now }] });
const membership = (id: string, principalId: string) => ({ membership_id: id, principal_id: principalId, organization_id: org,
  status: "active" as const, valid_from: now, valid_until: null, accepted_at: now });
const assignment = (id: string, membershipId: string, roleId: string, scope: { type: "organization" | "project"; id: string }) => ({
  assignment_id: id, membership_id: membershipId, role_id: roleId, role_version: "1", scope, status: "active" as const,
  valid_from: now, valid_until: null, accepted_at: now });

function baseFixture(): WireFullContent {
  return {
    principals: [humanPrincipal("founder"), humanPrincipal("proj-admin"), humanPrincipal("nobody")],
    memberships: [membership("m-founder", "founder"), membership("m-proj-admin", "proj-admin"), membership("m-nobody", "nobody")],
    role_definitions: [
      { role_id: "master", role_version: "1", role_origin: "builtin", display_name: "Master", status: "active", permissions: master },
      { role_id: "operator", role_version: "1", role_origin: "builtin", display_name: "Operator", status: "active", permissions: operator },
      { role_id: "specialist", role_version: "1", role_origin: "builtin", display_name: "Specialist", status: "active", permissions: ["intent.create"] },
    ],
    role_assignments: [
      assignment("a-founder", "m-founder", "master", { type: "organization", id: org }),
      assignment("a-proj-admin", "m-proj-admin", "operator", { type: "project", id: "project-a" }),
      assignment("a-nobody", "m-nobody", "specialist", { type: "organization", id: org }),
    ],
    revocations: [],
  };
}

describe("evaluateAgentIssuerDesignation (§2.2)", () => {
  it("caso obligatorio: master (scope organización) obtiene designación para un project_id concreto sin ser rechazado por scope", () => {
    const decision = evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "founder" }, "project-z-never-assigned", now);
    expect(decision.scope).toEqual({ type: "organization", id: org });
  });

  it("operator (scope project) es habilitado sólo para el project exacto de su asignación", () => {
    const decision = evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "proj-admin" }, "project-a", now);
    expect(decision.scope).toEqual({ type: "project", id: "project-a" });
  });

  it("rechaza a un operator cuya asignación es de otro project — nunca se ensancha a organización", () => {
    expect(() => evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "proj-admin" }, "project-b", now))
      .toThrow(AgentIssuerError);
    expect(() => evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "proj-admin" }, "project-b", now))
      .toThrow("authority_agent_issuer_permission_denied");
  });

  it("rechaza a un principal sin agent.issuer.designate en ningún scope", () => {
    expect(() => evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "nobody" }, "project-a", now))
      .toThrow("authority_agent_issuer_permission_denied");
  });

  it("rechaza una asignación suspendida aunque el rol siga otorgando el permiso", () => {
    const s = baseFixture();
    s.role_assignments.find(a => a.assignment_id === "a-founder")!.status = "suspended";
    expect(() => evaluateAgentIssuerDesignation(s, { organizationId: org, principalId: "founder" }, "project-a", now))
      .toThrow("authority_agent_issuer_permission_denied");
  });

  it("rechaza un role_definition revocado", () => {
    const s = baseFixture();
    s.revocations.push({ revocation_id: "r-1", target_type: "role_definition", target_id: "operator", effective_at: now, recorded_in_authority_version: "1", reason_code: "TEST" });
    expect(() => evaluateAgentIssuerDesignation(s, { organizationId: org, principalId: "proj-admin" }, "project-a", now))
      .toThrow("authority_agent_issuer_permission_denied");
  });

  it("rechaza un principal sin identidad externa verificada", () => {
    const s = baseFixture();
    s.principals.find(p => p.principal_id === "founder")!.external_identities[0].status = "revoked";
    expect(() => evaluateAgentIssuerDesignation(s, { organizationId: org, principalId: "founder" }, "project-a", now))
      .toThrow("authority_agent_issuer_human_unavailable");
  });

  it("rechaza un projectId vacío", () => {
    expect(() => evaluateAgentIssuerDesignation(baseFixture(), { organizationId: org, principalId: "founder" }, "", now))
      .toThrow("authority_agent_issuer_invalid_project");
  });
});
