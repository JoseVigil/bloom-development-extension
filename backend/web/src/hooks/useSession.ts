import { useContext } from "react";
import { SessionContext } from "@/context/SessionContext";

/** Debe usarse dentro de <SessionProvider>. Ver src/context/SessionContext.tsx. */
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession debe usarse dentro de SessionProvider");
  }
  return context;
}
