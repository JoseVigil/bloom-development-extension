-- Nacimiento de agente Orbital (Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md §2.2, §3).
--
-- Registro histórico de las IssuerDesignation emitidas: qué emisor (issuer_principal_id) quedó
-- habilitado a pedir el nacimiento de un agente para qué proyecto, bajo qué capability_seam, con qué
-- session_revision, y por cuánto tiempo. Forma del contrato sin cambios desde v0.1 del encargo
-- (designation_id, organization_id, project_id, issuer_principal_id, capability_seam, session_revision,
-- issued_at, expires_at).
--
-- Esta migración cubre sólo el esquema de almacenamiento del registro histórico, con el mismo criterio
-- de inmutabilidad que authority_admin_requests/authority_admin_audit (0005_authority_administration.sql)
-- — nunca se actualiza ni se borra una designación ya emitida. La emisión firmada de la IssuerDesignation
-- en sí (envelope, dominio de firma, idempotencia de la ruta que la emite) es una decisión de diseño
-- físico que no está especificada en el encargo ni en el resto del repo — ver la nota de alcance al
-- principio de agent-issuer.ts. Esta tabla es el destino agnóstico de esa forma final: agrega lo que la
-- ruta que se diseñe después necesite persistir, sin comprometerse hoy con su wire envelope.
CREATE TABLE authority_agent_issuer_designations (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  designation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  issuer_principal_id TEXT NOT NULL,
  capability_seam TEXT NOT NULL,
  session_revision TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, designation_id)
);
CREATE INDEX idx_agent_issuer_designations_project ON authority_agent_issuer_designations(organization_id, project_id);
CREATE INDEX idx_agent_issuer_designations_issuer ON authority_agent_issuer_designations(organization_id, issuer_principal_id);

CREATE TRIGGER authority_agent_issuer_designation_no_update BEFORE UPDATE ON authority_agent_issuer_designations
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
CREATE TRIGGER authority_agent_issuer_designation_no_delete BEFORE DELETE ON authority_agent_issuer_designations
BEGIN SELECT RAISE(ABORT, 'authority_admin_history_immutable'); END;
