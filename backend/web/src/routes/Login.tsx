import { Navigate } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { LoginButton } from "@/components/auth/LoginButton";
import { isMockAuth } from "@/api/mock";

export function Login() {
  const { state } = useSession();

  if (state.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Bloom</h1>
        <p>Iniciá sesión con tu cuenta de GitHub para administrar tu organización.</p>
        <LoginButton />
        {state.status === "error" ? <p className="form-error">{state.message}</p> : null}
        {isMockAuth() ? (
          <p className="mock-banner mock-banner-inline">
            Modo simulado — este botón no llama a GitHub, entra con una sesión falsa
          </p>
        ) : null}
      </div>
    </div>
  );
}
