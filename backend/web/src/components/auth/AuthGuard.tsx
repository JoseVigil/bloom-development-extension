import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

/** Envuelve rutas que requieren sesión activa; redirige a /login si no la hay. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { state } = useSession();

  if (state.status === "loading") {
    return <p className="page-status">Verificando sesión…</p>;
  }

  if (state.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  if (state.status === "error") {
    return <p className="page-status page-status-error">No se pudo verificar la sesión: {state.message}</p>;
  }

  return <>{children}</>;
}
