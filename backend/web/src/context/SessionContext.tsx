import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/api/client";
import { fetchSession, type Session } from "@/api/auth";

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; session: Session }
  | { status: "anonymous" }
  | { status: "error"; message: string };

interface SessionContextValue {
  state: SessionState;
  refresh: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const session = await fetchSession();
      setState({ status: "authenticated", session });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "anonymous" });
        return;
      }
      setState({ status: "error", message: error instanceof Error ? error.message : "Error desconocido" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ state, refresh }}>{children}</SessionContext.Provider>;
}
