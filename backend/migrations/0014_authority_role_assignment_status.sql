-- 0014_authority_role_assignment_status.sql
--
-- Bug de producción confirmado 2026-09-15: `buildSnapshotContent` (snapshot.ts, §1.2)
-- selecciona `status` de `role_assignments` desde que existe esa función — pero
-- `0001_authority_snapshot.sql` nunca definió esa columna (a diferencia de
-- `role_definitions`, que la recibe en 0009_authority_role_definition_status.sql). El
-- propio autor de snapshot.ts lo había marcado como "SUPUESTO" en un comentario, dando
-- por hecho que la columna existía. Sin ella, la consulta de §1.2(b) —qué versiones
-- no-más-recientes de role_definitions siguen siendo necesarias porque una asignación
-- vigente (status active/pending/suspended) las referencia— falla en runtime con
-- `no such column: status` apenas exista una fila real en `role_assignments`.
--
-- Mismo patrón que 0009_authority_role_definition_status.sql (misma tabla lifecycle,
-- mismos tres valores). Default 'active': las filas que ya existieran fueron creadas
-- antes de que hubiera ningún mecanismo de revocación/suspensión, y 'active' es el valor
-- que no oculta nada del snapshot que ya se estuviera devolviendo.
ALTER TABLE role_assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','pending','suspended'));
