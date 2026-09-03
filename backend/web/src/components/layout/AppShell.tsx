import { Outlet } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { logout } from "@/api/auth";

export function AppShell() {
  const { state, refresh } = useSession();
  const githubUsername = state.status === "authenticated" ? state.session.githubUsername : null;

  async function handleLogout() {
    await logout();
    await refresh();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">Bloom</span>
        <nav className="app-nav">
          <span>Usuarios</span>
        </nav>
        {githubUsername ? (
          <div className="app-user">
            <span>{githubUsername}</span>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Salir
            </button>
          </div>
        ) : null}
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
