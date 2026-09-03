// ---------------------------------------------------------------------------
// MODO SIMULADO (VITE_MOCK_AUTH=true): stub puramente de frontend, sin
// backend real, para poder ver y probar Login + ABM mientras
// docs/ANAYSIS/BACKEND/ROLES/BACKEND_Requerimiento_Autoridad_Organizacional_Roles_v0_1.md
// sigue en fase de investigacion (no de implementacion) y esos endpoints
// todavia no existen en backend/. Vive enteramente aca: api/auth.ts y
// api/users.ts son los unicos que llaman a estas funciones, y solo cuando
// el flag esta prendido -- el resto del frontend (context, componentes,
// rutas) no sabe que este archivo existe.
//
// Estado en memoria del modulo (los usuarios) + sessionStorage (si hay
// sesion activa, para sobrevivir un F5 dentro de la misma pestana). Se
// reinicia a los datos semilla de abajo en cada pestana nueva o al cerrar
// el navegador -- a proposito, para que una demo siempre arranque en un
// estado predecible. No usar este archivo como referencia de como se va a
// comportar el backend real: no valida nada, no persiste en disco, y
// acepta cualquier input.
// ---------------------------------------------------------------------------

import { ApiError } from "./client";
import type { Session } from "./auth";
import type { InviteUserInput, UpdateUserRoleInput, UserWithMembership } from "@/types/user";

export function isMockAuth(): boolean {
  return import.meta.env.VITE_MOCK_AUTH === "true";
}

const MOCK_SESSION_KEY = "bloom_mock_session";
export const MOCK_ORGANIZATION_ID = "org-mock";

const MOCK_SESSION: Session = {
  userId: "user-mock-jose",
  githubUsername: "jose-mock",
  organizationId: MOCK_ORGANIZATION_ID,
  role: "master",
};

let mockUsers: UserWithMembership[] = [
  { id: MOCK_SESSION.userId, githubUsername: MOCK_SESSION.githubUsername, email: null, createdAt: Date.now(), role: "master" },
  { id: "user-mock-ana", githubUsername: "ana-dev", email: null, createdAt: Date.now(), role: "specialist" },
];

function delay<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function isLoggedIn(): boolean {
  try {
    return sessionStorage.getItem(MOCK_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function mockLogin(): void {
  try {
    sessionStorage.setItem(MOCK_SESSION_KEY, "1");
  } catch {
    // sessionStorage puede no estar disponible (ventana privada, etc.) -- la
    // sesion simulada simplemente no sobrevive un reload en ese caso.
  }
}

export function mockLogout(): void {
  try {
    sessionStorage.removeItem(MOCK_SESSION_KEY);
  } catch {
    // ver mockLogin
  }
}

export function mockFetchSession(): Promise<Session> {
  if (!isLoggedIn()) {
    return Promise.reject(new ApiError(401, "mock: sin sesion activa"));
  }
  return delay(MOCK_SESSION);
}

export function mockListUsers(): Promise<UserWithMembership[]> {
  return delay([...mockUsers]);
}

export function mockInviteUser(input: InviteUserInput): Promise<UserWithMembership> {
  const created: UserWithMembership = {
    id: `user-mock-${Date.now()}`,
    githubUsername: input.githubUsername,
    email: null,
    createdAt: Date.now(),
    role: input.role,
  };
  mockUsers = [...mockUsers, created];
  return delay(created);
}

export function mockUpdateUserRole(input: UpdateUserRoleInput): Promise<UserWithMembership> {
  let updated: UserWithMembership | undefined;
  mockUsers = mockUsers.map((user) => {
    if (user.id !== input.userId) return user;
    updated = { ...user, role: input.role };
    return updated;
  });
  if (!updated) {
    return Promise.reject(new ApiError(404, `mock: usuario ${input.userId} no encontrado`));
  }
  return delay(updated);
}

export function mockRemoveUser(userId: string): Promise<void> {
  mockUsers = mockUsers.filter((user) => user.id !== userId);
  return delay(undefined);
}
