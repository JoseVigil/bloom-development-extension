import { useState, type FormEvent } from "react";
import type { InviteUserInput, Role } from "@/types/user";

interface UserFormProps {
  onSubmit: (input: InviteUserInput) => Promise<void>;
  onCancel: () => void;
}

export function UserForm({ onSubmit, onCancel }: UserFormProps) {
  const [githubUsername, setGithubUsername] = useState("");
  const [role, setRole] = useState<Role>("specialist");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ githubUsername: githubUsername.trim(), role });
      setGithubUsername("");
      setRole("specialist");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo invitar al usuario");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="user-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="githubUsername">Usuario de GitHub</label>
        <input
          id="githubUsername"
          name="githubUsername"
          value={githubUsername}
          onChange={(event) => setGithubUsername(event.target.value)}
          placeholder="octocat"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="role">Rol</label>
        <select id="role" name="role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="specialist">Specialist</option>
          <option value="master">Master</option>
        </select>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !githubUsername.trim()}>
          {submitting ? "Invitando…" : "Invitar"}
        </button>
      </div>
    </form>
  );
}
