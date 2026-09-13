// Encargo_Implementacion_Recuperacion_Estado_Anterior_Autoridad_v1_0.md §2.3 — funciones puras que
// arman, a partir de una foto histórica (`WireFullContent` de una versión pasada, obtenida vía
// `loadEmissionVersion`), el comando `propose_membership`/`propose_assignment` que restaura el efecto
// práctico de una membership o un role_assignment que fue revocado por error.
//
// No hacen I/O ni validan permisos/scope — eso lo sigue haciendo `evaluateAdministration` cuando el
// comando se somete de verdad (§2.3, último párrafo del encargo). Esto sólo arma el payload correcto.

import type { WireFullContent } from "./schema";
import type { MembershipProposalCommand, AssignmentProposalCommand } from "./administration";

export class RecoveryError extends Error {
  constructor(readonly code: string) { super(`authority_recovery_${code}`); }
}
const deny = (code: string): never => { throw new RecoveryError(code); };

/**
 * Reconstruye el comando `propose_membership` que restaura, con un id nuevo (`freshId`), la membership
 * `membershipId` tal como estaba en la foto histórica `historical`. Lanza si esa membership no existe en
 * esa versión o no estaba `active` en ella — esa versión no es un buen punto de restauración.
 */
export function buildMembershipRestoration(historical: WireFullContent, membershipId: string,
  freshId: string, now: string): MembershipProposalCommand {
  const m = historical.memberships.find(m => m.membership_id === membershipId);
  if (!m || m.status !== "active") deny("membership_unavailable");
  return { kind: "propose_membership", proposalId: freshId, membershipId: freshId, principalId: m.principal_id, validFrom: now, validUntil: null };
}

/**
 * Reconstruye el comando `propose_assignment` que restaura, con un id nuevo (`freshId`), el
 * role_assignment `assignmentId` tal como estaba en la foto histórica `historical`. Lanza si ese
 * assignment no existe en esa versión o no estaba `active` en ella.
 *
 * Nota de orden (no opcional, §2.3): `membershipId` acá es el id de la membership VIGENTE en el estado
 * actual del destinatario, no el histórico. Si la membership también fue revocada, el caller primero la
 * restaura con `buildMembershipRestoration` y pasa acá el `membership_id` nuevo resultante — esta función
 * no infiere ni verifica ese orden.
 */
export function buildAssignmentRestoration(historical: WireFullContent, assignmentId: string,
  freshId: string, membershipId: string, now: string): AssignmentProposalCommand {
  const a = historical.role_assignments.find(a => a.assignment_id === assignmentId);
  if (!a || a.status !== "active") deny("assignment_unavailable");
  return { kind: "propose_assignment", proposalId: freshId, assignmentId: freshId, membershipId,
    roleId: a.role_id, roleVersion: a.role_version, scope: a.scope, validFrom: now, validUntil: null };
}
