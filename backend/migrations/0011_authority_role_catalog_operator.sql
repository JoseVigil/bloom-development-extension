-- Nacimiento de agente Orbital (Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md §2.1, §3).
-- Alta del catálogo built-in `operator` (nombre de trabajo, ex-delegate; scope-project admin — ver
-- roles.go BuiltinRoles y emission.ts, ambos ya actualizados con este mismo permission set).
--
-- NOTA: a diferencia de todas las migraciones anteriores (0000-0010, sólo DDL), ésta es la primera que
-- hace un INSERT de datos. No hay precedente en este repo de cómo se sembraron las filas built-in
-- `master`/`specialist` de `role_definitions` — no hay ningún INSERT para ellas en ninguna migración ni
-- en seed.sql (que sólo carga organización/usuario/release de desarrollo local); initial-emission.ts las
-- lee dando por sentado que ya existen (`SELECT ... WHERE organization_id IS NULL AND key='master'`), y
-- initial-emission.spec.ts las inserta a mano como fixture de test. Si `master`/`specialist` se
-- provisionan por algún mecanismo fuera de este repo (runbook de ops, wrangler d1 execute manual),
-- confirmar que este INSERT no lo duplica; si no existe tal mecanismo, este catálogo tampoco tenía forma
-- de llegar a un ambiente real antes de esta migración.
INSERT INTO role_definitions (id, organization_id, key, version, definition, since_version, created_at, status)
VALUES (
  'operator-1',
  NULL,
  'operator',
  1,
  '{"display_name":"Operator","permissions":["intent.create","agent.issuer.designate"]}',
  1,
  unixepoch(),
  'active'
);
