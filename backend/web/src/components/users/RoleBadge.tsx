import type { Role } from "@/types/user";

const LABELS: Record<Role, string> = {
  master: "Master",
  specialist: "Specialist",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`role-badge role-badge-${role}`}>{LABELS[role]}</span>;
}
