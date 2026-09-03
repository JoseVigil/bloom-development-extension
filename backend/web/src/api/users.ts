// ---------------------------------------------------------------------------
// GAP CONOCIDO: igual que api/auth.ts, estos endpoints todavía no existen
// en backend/. orgMembers.role hoy es una columna de texto libre sin
// versionado, scope ni vigencia (ver
// docs/ANAYSIS/BACKEND/ROLES/BACKEND_Requerimiento_Autoridad_Organizacional_Roles_v0_1.md
// §5) — este ABM asume el modelo mínimo (usuario + rol) hasta que ese
// trabajo defina membership, definición de rol y asignación por separado.
// ---------------------------------------------------------------------------

import { apiFetch } from "./client";
import type { InviteUserInput, UpdateUserRoleInput, UserWithMembership } from "@/types/user";

export function listUsers(organizationId: string): Promise<UserWithMembership[]> {
  return apiFetch<UserWithMembership[]>(`/v1/organizations/${organizationId}/users`);
}

export function inviteUser(organizationId: string, input: InviteUserInput): Promise<UserWithMembership> {
  return apiFetch<UserWithMembership>(`/v1/organizations/${organizationId}/users`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateUserRole(organizationId: string, input: UpdateUserRoleInput): Promise<UserWithMembership> {
  return apiFetch<UserWithMembership>(`/v1/organizations/${organizationId}/users/${input.userId}`, {
    method: "PATCH",
    body: JSON.stringify({ role: input.role }),
  });
}

export function removeUser(organizationId: string, userId: string): Promise<void> {
  return apiFetch<void>(`/v1/organizations/${organizationId}/users/${userId}`, {
    method: "DELETE",
    parseJson: false,
  });
}
