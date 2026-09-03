import type { Role, UserWithMembership } from "@/types/user";
import { RoleBadge } from "./RoleBadge";

interface UserTableProps {
  users: UserWithMembership[];
  onChangeRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
}

export function UserTable({ users, onChangeRole, onRemove }: UserTableProps) {
  if (users.length === 0) {
    return <p className="page-status">Todavía no hay usuarios en esta organización.</p>;
  }

  return (
    <table className="user-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Email</th>
          <th>Rol</th>
          <th aria-label="Acciones" />
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.githubUsername}</td>
            <td>{user.email ?? "—"}</td>
            <td>
              <RoleBadge role={user.role} />
            </td>
            <td className="user-table-actions">
              <select
                aria-label={`Cambiar rol de ${user.githubUsername}`}
                value={user.role}
                onChange={(event) => onChangeRole(user.id, event.target.value as Role)}
              >
                <option value="specialist">Specialist</option>
                <option value="master">Master</option>
              </select>
              <button type="button" className="btn btn-ghost btn-danger" onClick={() => onRemove(user.id)}>
                Quitar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
