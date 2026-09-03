import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="page-status">
      <p>Página no encontrada.</p>
      <Link to="/">Volver</Link>
    </div>
  );
}
