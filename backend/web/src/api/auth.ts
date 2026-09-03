// ---------------------------------------------------------------------------
// GAP CONOCIDO: ninguno de estos endpoints existe todavía en backend/.
// El backend real hoy solo expone GET /, GET /v1/manifest y
// GET /v1/releases/:id/download (ver el Mapa del Backend Bloom, artifact).
// Esta capa define el contrato que el frontend espera consumir una vez que
// el trabajo de docs/ANAYSIS/BACKEND/ROLES produzca esos endpoints —
// llamarla hoy contra un backend real devuelve 404.
//
// Con VITE_MOCK_AUTH=true (ver .env.example), cada función de acá delega a
// api/mock.ts en vez de llamar al backend — así se puede ver y probar
// Login + ABM completos sin esos endpoints. Ver api/mock.ts para el detalle
// de qué se simula.
// ---------------------------------------------------------------------------

import { apiFetch } from "./client";
import { isMockAuth, mockFetchSession, mockLogin, mockLogout } from "./mock";

export interface Session {
  userId: string;
  githubUsername: string;
  organizationId: string;
  role: string;
}

/** Redirige al flujo de OAuth de GitHub que el backend debería mediar. */
export function loginWithGitHub(): void {
  if (isMockAuth()) {
    mockLogin();
    window.location.assign("/");
    return;
  }
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  window.location.href = `${base}/v1/auth/github/start`;
}

/** Sesión actual, si existe una cookie válida. Lanza ApiError(401) si no. */
export function fetchSession(): Promise<Session> {
  if (isMockAuth()) {
    return mockFetchSession();
  }
  return apiFetch<Session>("/v1/auth/session");
}

export function logout(): Promise<void> {
  if (isMockAuth()) {
    mockLogout();
    return Promise.resolve();
  }
  return apiFetch<void>("/v1/auth/logout", { method: "POST", parseJson: false });
}
