// ---------------------------------------------------------------------------
// GAP CONOCIDO: ninguno de estos endpoints existe todavía en backend/.
// El backend real hoy solo expone GET /, GET /v1/manifest y
// GET /v1/releases/:id/download (ver el Mapa del Backend Bloom, artifact).
// Esta capa define el contrato que el frontend espera consumir una vez que
// el trabajo de docs/ANAYSIS/BACKEND/ROLES produzca esos endpoints —
// llamarla hoy contra un backend real devuelve 404.
// ---------------------------------------------------------------------------

import { apiFetch } from "./client";

export interface Session {
  userId: string;
  githubUsername: string;
  organizationId: string;
  role: string;
}

/** Redirige al flujo de OAuth de GitHub que el backend debería mediar. */
export function loginWithGitHub(): void {
  const base = import.meta.env.VITE_API_BASE_URL ?? "";
  window.location.href = `${base}/v1/auth/github/start`;
}

/** Sesión actual, si existe una cookie válida. Lanza ApiError(401) si no. */
export function fetchSession(): Promise<Session> {
  return apiFetch<Session>("/v1/auth/session");
}

export function logout(): Promise<void> {
  return apiFetch<void>("/v1/auth/logout", { method: "POST", parseJson: false });
}
