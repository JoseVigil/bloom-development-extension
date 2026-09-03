import { loginWithGitHub } from "@/api/auth";

export function LoginButton() {
  return (
    <button type="button" className="btn btn-primary" onClick={loginWithGitHub}>
      Continuar con GitHub
    </button>
  );
}
