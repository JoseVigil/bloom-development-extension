// Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md — Enfoque A (principal de servicio efímero
// por turno). Este archivo cubre únicamente la política pura de scope del §2.2: qué scope de la
// asignación real del emisor se usa para evaluar `agent.issuer.designate`, nunca un tipo fijo derivado
// del `project_id` de destino.
//
// FUERA DE ALCANCE DE ESTE ARCHIVO (deliberado, no un olvido): la emisión firmada de la
// `IssuerDesignation` en sí — envelope, dominio de firma, idempotencia — no está especificada en ningún
// lado del encargo ni del repo (a diferencia de esta regla de scope, que el encargo fija con precisión
// exacta en §2.2 y decision.go confirma línea a línea). Ese es el mismo tipo de decisión de diseño físico
// que schema.ts ya señala como pendiente para el resto del wire contract ("SUPUESTO DE DISEÑO: no tengo
// el diseño físico en esta sesión"). Inventar esa forma de punta a punta sin ese diseño sería agregar
// superficie nueva no revisada, no completar el encargo — administration-store.ts (mutación de
// WireFullContent, versión de autoridad, proposal/accept) tampoco es el molde correcto: una
// IssuerDesignation no muta el snapshot de autoridad ni pide un nuevo authority_version, es un artefacto
// derivado, de vida corta, separado.

import { authorityInstant } from "./administration";
import type { WireFullContent, WireRoleAssignment } from "./schema";

export class AgentIssuerError extends Error {
  constructor(readonly code: string) { super(`authority_agent_issuer_${code}`); }
}
const deny = (code: string): never => { throw new AgentIssuerError(code); };

export interface AgentIssuerActor { organizationId: string; principalId: string }
export interface AgentIssuerScopeDecision { scope: WireRoleAssignment["scope"] }

const AGENT_ISSUER_DESIGNATE = "agent.issuer.designate";

/**
 * Política pura (§2.2). Determina, para un pedido de nacimiento de agente sobre `projectId`, el scope
 * REAL de la asignación del emisor contra el que corresponde evaluar `agent.issuer.designate` —
 * verificado contra decision.go:scopeIncludes (`grant == requested`, igualdad exacta de struct, nunca
 * jerarquía):
 *
 *  - Emisor con una asignación activa de `agent.issuer.designate` en scope `{type:"organization", id:
 *    actor.organizationId}` (rol builtin `master`, hoy el único con ese scope): se evalúa contra ESE
 *    scope organización, aunque `projectId` sea puntual — el emisor no necesita una asignación por
 *    proyecto.
 *  - Emisor con una asignación activa de `agent.issuer.designate` en scope `{type:"project", id:
 *    projectId}` (rol builtin `operator`, hoy el único con ese scope): sólo alcanza si el `id` de esa
 *    asignación coincide EXACTO con `projectId` — se rechaza si no coincide.
 *
 * Sin esta regla, un founder solo con `master` quedaría bloqueado para pedir el nacimiento de un agente
 * de proyecto — lo opuesto al propósito del encargo (§2.2, último párrafo).
 *
 * No hace red I/O ni firma nada — el caller (no incluido en este archivo, ver nota de alcance arriba)
 * es responsable de cargar `state` desde la emisión de autoridad vigente y de construir/firmar la
 * IssuerDesignation con el scope que esta función devuelve.
 */
export function evaluateAgentIssuerDesignation(state: WireFullContent, actor: AgentIssuerActor,
  projectId: string, now: string): AgentIssuerScopeDecision {
  if (!actor?.organizationId || !actor.principalId) deny("actor_unverified");
  if (typeof projectId !== "string" || !projectId.length) deny("invalid_project");
  const instant = authorityInstant(now);

  const principal = state.principals.find(p => p.principal_id === actor.principalId);
  if (!principal || principal.principal_type !== "human" || principal.status !== "active"
    || !principal.external_identities.some(e => e.status === "verified" && authorityInstant(e.verified_at) <= instant)) deny("human_unavailable");

  const revoked = (kind: string, target: string) => state.revocations.some(r =>
    r.target_type === kind && r.target_id === target && authorityInstant(r.effective_at) <= instant);
  const current = (v: { status: string; valid_from: string; valid_until: string | null; accepted_at: string }) =>
    v.status === "active" && authorityInstant(v.valid_from) <= instant
    && (v.valid_until === null || authorityInstant(v.valid_until) > instant) && authorityInstant(v.accepted_at) <= instant;

  const activeMemberships = state.memberships.filter(m => m.principal_id === actor.principalId
    && m.organization_id === actor.organizationId && current(m) && !revoked("membership", m.membership_id));

  const grantsDesignateAt = (scope: WireRoleAssignment["scope"]): boolean => activeMemberships.some(m =>
    state.role_assignments.some(a => {
      if (a.membership_id !== m.membership_id || !current(a) || revoked("role_assignment", a.assignment_id)) return false;
      if (a.scope.type !== scope.type || a.scope.id !== scope.id) return false;
      const role = state.role_definitions.find(r => r.role_id === a.role_id && r.role_version === a.role_version);
      return !!role && role.status === "active" && !revoked("role_definition", role.role_id) && role.permissions.includes(AGENT_ISSUER_DESIGNATE);
    }));

  const organizationScope: WireRoleAssignment["scope"] = { type: "organization", id: actor.organizationId };
  if (grantsDesignateAt(organizationScope)) return { scope: organizationScope };

  const projectScope: WireRoleAssignment["scope"] = { type: "project", id: projectId };
  if (grantsDesignateAt(projectScope)) return { scope: projectScope };

  return deny("permission_denied");
}
