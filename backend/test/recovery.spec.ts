import { describe, expect, it } from "vitest";
import { buildMembershipRestoration, buildAssignmentRestoration, RecoveryError } from "../src/authority/recovery";
import type { WireFullContent } from "../src/authority/schema";

// Encargo_Implementacion_Recuperacion_Estado_Anterior_Autoridad_v1_0.md §2.3 / §3 — reconstrucción pura
// del comando de restauración a partir de una foto histórica (`WireFullContent` de una versión pasada).

const now = "2026-09-13T12:00:00Z";
const org = "org-fixture";

function historicalFixture(): WireFullContent {
  return {
    principals: [],
    memberships: [
      { membership_id: "m-active", principal_id: "recipient", organization_id: org, status: "active", valid_from: now, valid_until: null, accepted_at: now },
      { membership_id: "m-suspended", principal_id: "recipient", organization_id: org, status: "suspended", valid_from: now, valid_until: null, accepted_at: now },
    ],
    role_definitions: [],
    role_assignments: [
      { assignment_id: "a-active", membership_id: "m-old", role_id: "specialist", role_version: "2", scope: { type: "project", id: "project-a" }, status: "active", valid_from: now, valid_until: null, accepted_at: now },
      { assignment_id: "a-revoked", membership_id: "m-old", role_id: "specialist", role_version: "2", scope: { type: "project", id: "project-a" }, status: "revoked", valid_from: now, valid_until: null, accepted_at: now },
    ],
    revocations: [],
  };
}

describe("buildMembershipRestoration (§2.3)", () => {
  it("reconstruye propose_membership con id nuevo a partir de la membership activa en la foto histórica", () => {
    const command = buildMembershipRestoration(historicalFixture(), "m-active", "m-fresh", now);
    expect(command).toEqual({ kind: "propose_membership", proposalId: "m-fresh", membershipId: "m-fresh", principalId: "recipient", validFrom: now, validUntil: null });
  });

  it("rechaza una membership que no existe en esa versión", () => {
    expect(() => buildMembershipRestoration(historicalFixture(), "m-never-existed", "m-fresh", now))
      .toThrow(RecoveryError);
    expect(() => buildMembershipRestoration(historicalFixture(), "m-never-existed", "m-fresh", now))
      .toThrow("authority_recovery_membership_unavailable");
  });

  it("rechaza una membership que en esa versión no estaba active", () => {
    expect(() => buildMembershipRestoration(historicalFixture(), "m-suspended", "m-fresh", now))
      .toThrow("authority_recovery_membership_unavailable");
  });
});

describe("buildAssignmentRestoration (§2.3)", () => {
  it("reconstruye propose_assignment con id nuevo y el membershipId vigente pasado por el caller", () => {
    const command = buildAssignmentRestoration(historicalFixture(), "a-active", "a-fresh", "m-current", now);
    expect(command).toEqual({ kind: "propose_assignment", proposalId: "a-fresh", assignmentId: "a-fresh", membershipId: "m-current",
      roleId: "specialist", roleVersion: "2", scope: { type: "project", id: "project-a" }, validFrom: now, validUntil: null });
  });

  it("rechaza un assignment que no existe en esa versión", () => {
    expect(() => buildAssignmentRestoration(historicalFixture(), "a-never-existed", "a-fresh", "m-current", now))
      .toThrow(RecoveryError);
    expect(() => buildAssignmentRestoration(historicalFixture(), "a-never-existed", "a-fresh", "m-current", now))
      .toThrow("authority_recovery_assignment_unavailable");
  });

  it("rechaza un assignment que en esa versión estaba revoked", () => {
    expect(() => buildAssignmentRestoration(historicalFixture(), "a-revoked", "a-fresh", "m-current", now))
      .toThrow("authority_recovery_assignment_unavailable");
  });
});
