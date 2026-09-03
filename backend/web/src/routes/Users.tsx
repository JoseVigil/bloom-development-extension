import { useCallback, useEffect, useState } from "react";
import { inviteUser, listUsers, removeUser, updateUserRole } from "@/api/users";
import { useSession } from "@/hooks/useSession";
import { UserForm } from "@/components/users/UserForm";
import { UserTable } from "@/components/users/UserTable";
import type { InviteUserInput, Role, UserWithMembership } from "@/types/user";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; users: UserWithMembership[] }
  | { status: "error"; message: string };

export function Users() {
  const { state } = useSession();
  const organizationId = state.status === "authenticated" ? state.session.organizationId : null;

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    setLoad({ status: "loading" });
    try {
      const users = await listUsers(organizationId);
      setLoad({ status: "ready", users });
    } catch (error) {
      setLoad({ status: "error", message: error instanceof Error ? error.message : "No se pudo cargar la lista" });
    }
  }, [organizationId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleInvite(input: InviteUserInput) {
    if (!organizationId) return;
    await inviteUser(organizationId, input);
    setShowForm(false);
    await reload();
  }

  async function handleChangeRole(userId: string, role: Role) {
    if (!organizationId) return;
    await updateUserRole(organizationId, { userId, role });
    await reload();
  }

  async function handleRemove(userId: string) {
    if (!organizationId) return;
    await removeUser(organizationId, userId);
    await reload();
  }

  return (
    <div className="users-page">
      <div className="page-header">
        <h1>Usuarios</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Cerrar" : "Invitar usuario"}
        </button>
      </div>

      {showForm ? <UserForm onSubmit={handleInvite} onCancel={() => setShowForm(false)} /> : null}

      {load.status === "loading" ? <p className="page-status">Cargando usuarios…</p> : null}
      {load.status === "error" ? <p className="page-status page-status-error">{load.message}</p> : null}
      {load.status === "ready" ? (
        <UserTable users={load.users} onChangeRole={handleChangeRole} onRemove={handleRemove} />
      ) : null}
    </div>
  );
}
