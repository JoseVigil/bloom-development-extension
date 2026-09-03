// Roles reales confirmados en el modelo actual (ver
// docs/ANAYSIS/BACKEND/GRAVITY/GravityGraph_Fundamentos_Base_v0_1.md y la
// auditoría de .ownership.json): "architect" no existe implementado todavía,
// solo "master" y "specialist". orgMembers.role sigue siendo texto libre en
// el schema real de D1 — este tipo es una restricción del lado del cliente,
// no una garantía del backend, hasta que el trabajo de ROLES lo formalice.
export type Role = "master" | "specialist";

export interface User {
  id: string;
  githubUsername: string;
  email: string | null;
  createdAt: number;
}

export interface OrgMember {
  orgId: string;
  userId: string;
  role: Role;
}

export interface UserWithMembership extends User {
  role: Role;
}

export interface InviteUserInput {
  githubUsername: string;
  role: Role;
}

export interface UpdateUserRoleInput {
  userId: string;
  role: Role;
}
