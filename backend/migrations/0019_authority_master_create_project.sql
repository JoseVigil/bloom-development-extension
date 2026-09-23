-- Paridad del catálogo builtin `master` v1 entre Backend y Nucleus (Paso 0 de
-- Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md §4.3; decisión de Jose 2026-09-23).
--
-- installer/nucleus/internal/authority/roles.go BuiltinRoles[RoleMaster] tiene 13 permisos (incluye
-- `create_project`, requisito del cutover a remote_enforced) y emission.ts pasa a tener exactamente los
-- mismos. La fila global de `master` sembrada por 0013 (12 permisos) es el interruptor de activación de la
-- génesis (initial-emission.ts activeMaster): si sus permisos no coinciden con el catálogo compilado, la
-- génesis falla con master_role_unavailable. Esta migración la alinea. Aditiva sobre datos, sin DDL.
--
-- NOTA OPERATIVA: las emisiones de autoridad ya persistidas con `master` de 12 permisos NO decodifican con
-- el catálogo nuevo (recovery_required). Decisión aceptada por Jose: ningún ambiente tiene emisiones reales
-- que conservar; en dev local, resetear la base (o las filas de authority_emissions/_heads afectadas).
UPDATE role_definitions
SET definition = '{"display_name":"Master","permissions":["authority.membership.manage","authority.role_definition.manage","authority.assignment.manage","authority.binding.approve","authority.cutover.approve","mandate.create","mandate.sign","mandate.promote","mandate.install","intent.create","intent.cor.merge","agent.issuer.designate","create_project"]}'
WHERE organization_id IS NULL AND key = 'master' AND version = 1;
