# Propuesta de Resolución — Inconsistencias de la Investigación de Tenant/Organización/Roles v0.1

**Responde a:** §5 de `Investigacion_Estructura_Tenant_Organizacion_Roles_v0_1.md`, a pedido explícito de Jose (2026-09-22, mismo día).
**Objetivo:** decidir, para cada una de las tres inconsistencias, si es un bloqueante técnico real para el diseño de invitaciones (Fase 2) — y sólo para eso. Ninguna decisión de producto que no bloquee Fase 2 se resuelve acá.
**Método:** antes de proponer resolución, se verificó en código (no se asumió) si cada punto toca alguna ruta que el diseño de invitaciones necesitaría usar. El punto 2 requirió una verificación adicional que no estaba en el informe original — se hizo en esta sesión y se documenta en §2.

---

## Resumen de la recomendación

| # | Inconsistencia | Acción | ¿Bloquea Fase 2? |
|---|---|---|---|
| 1 | Roles `delegate`/`scoped_admin` aprobados, no implementados | **Postergar** — diseñar invitaciones parametrizadas por rol, no atadas a un catálogo fijo | **No** |
| 2 | Estados de `role_assignment`: wire schema vs. `CHECK` SQL | **Postergar** — es código legacy, no wireado a ningún endpoint activo | **No** |
| 3 | Rol del invitado — ¿formalizar `scoped_admin` ahora? | **No es mandatorio** — el primitivo de otorgamiento ya soporta "administración acotada" sin ese rol builtin | **No** |

Ninguna de las tres es un bloqueante técnico real. Las tres pueden quedar abiertas sin que eso retrase el inicio de Fase 2 — lo que sí corresponde es que el diseño de Fase 2 se escriba de forma que no dependa de ninguna de ellas resolverse primero (ver cómo, en cada sección).

---

## 1. Roles faltantes (`delegate` / `scoped_admin`)

### Pregunta que se hizo Jose
¿Los implementamos ahora como paso cero, o diseñamos las invitaciones limitándonos al catálogo actual (`master`, `specialist`, `operator`)?

### Resolución propuesta: **Postergar la implementación — diseñar invitaciones agnósticas al nombre del rol**

No hace falta elegir entre "sólo `master`/`specialist`/`operator`" y "esperar a `delegate`/`scoped_admin`", porque el mecanismo de otorgamiento que ya existe (`propose_assignment` en `administration.ts`, confirmado en la investigación §3.4) **nunca hardcodea qué roles son válidos** — valida contra `role_definitions` activas de la organización, sean builtin o personalizadas, y contra `grantable()` (el otorgante no puede dar más de lo que él mismo tiene). Ya `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §2.2 lo diseñó así desde el principio: *"Valida `role_id`/`role_version` contra `role_definitions` activas de esa organización [...] se puede invitar con cualquier rol que el master pueda otorgar"*.

Esto significa que el diseño de invitaciones no necesita elegir un catálogo fijo — necesita recibir `role_id`/`role_version` como parámetro de la invitación y dejar que las guardas ya existentes (`grantable`/`scopeVerified`/`selfGrant`) decidan si es otorgable. Con el catálogo de hoy (`master`/`specialist`/`operator`), eso ya funciona. Si mañana se agrega `delegate`/`scoped_admin` — o cualquier otro rol personalizado que una organización defina vía `define_role` —, el mecanismo de invitación no necesita ningún cambio: el nuevo rol simplemente aparece como una opción más entre las que el master puede elegir al invitar.

**Por qué no conviene implementarlos ahora como "paso cero":** la aprobación de 2026-09-12 fue explícitamente de primera pasada, con nombres "no finales" — construir sobre eso agregaría alcance no controlado al mismo problema que el propio encargo original de investigación buscaba evitar (mezclar decisiones de catálogo de roles, que son de producto, con el mecanismo de invitación, que es de autorización). Si en algún momento se decide implementarlos, es trabajo independiente y paralelo — no antecede a Fase 2.

**Qué sí corresponde pedirle a Fase 2:** que el diseño trate el rol del invitado como un parámetro de la invitación (elegido por quien invita, entre los roles que puede otorgar), nunca como una decisión hardcodeada de qué rol recibe "todo invitado". Eso ya es, de hecho, lo que proponía `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §2.2 — se confirma que es el camino correcto y no hay motivo para apartarse de él.

---

## 2. Discrepancia de estados en `role_assignment` (schema vs. SQL)

### Pregunta que se hizo Jose
¿Cuál es el ajuste exacto necesario a nivel código para alinear esto antes de avanzar?

### Verificación adicional hecha en esta sesión

La inconsistencia original señalaba que `schema.ts` admite cinco estados (`pending|active|suspended|expired|revoked`) para `role_assignments`, pero el `CHECK` de la migración `0014_authority_role_assignment_status.sql` sólo permite tres (`'active','pending','suspended'`). Antes de proponer un ajuste, había que confirmar **a qué tabla real se aplica ese `CHECK`** y si esa tabla participa del flujo que las invitaciones usarían.

Se leyó `snapshot.ts` y `snapshot-route.ts`/`index.ts` completos en esta sesión (no estaban en el alcance original del informe de Fase 1, que se había limitado a los archivos listados en §3 del encargo). Resultado:

- La tabla `role_assignments` con el `CHECK` discrepante (`migrations/0001_authority_snapshot.sql`, `0014_...sql`) es parte de un **modelo relacional legacy** ("Lot 1B" / "Fase 2" según los comentarios de cabecera de `schema.ts` y `snapshot.ts") que existía **antes** de que se construyera el modelo actual de emisiones firmadas (`authority_emissions`, JSON completo, `emission-store.ts`).
- `snapshot.ts` tiene **dos** funciones que arman un snapshot: `buildSnapshotContent`/`resolveAuthoritySnapshot` (legacy, lee esas tablas SQL relacionales) y `resolveWireAuthoritySnapshot` (vigente, lee `authority_emissions.state_json` vía `loadCurrentEmission`/`loadEmissionVersion`). El propio comentario de esta última es explícito: *"Wire 1B: serve immutable persisted bytes. **Never call the legacy builder or sign on pull.**"*
- Confirmado en `index.ts:199` (la única ruta que expone snapshot, `GET /v1/authority/snapshot`) y en `snapshot-route.ts`: la ruta activa llama exclusivamente a `resolveWireAuthoritySnapshot`. `buildSnapshotContent`/`resolveAuthoritySnapshot` **no están wireadas a ningún endpoint de producción** — no hay ningún `import` de esas dos funciones fuera de `snapshot.ts` mismo.
- Consistente con esto: `hasEvidence()` (`emission-store.ts:57-68`, ya citado en la investigación de Fase 1) trata la existencia de filas en `memberships`/`role_assignments`/`role_definitions`/`authority_state` como **evidencia de un estado legacy que fuerza `recovery_required`** — es decir, el código vigente ni siquiera espera que esas tablas tengan filas nuevas. Nada en `administration.ts`, `administration-store.ts`, `genesis-store.ts`, `tenant-store.ts` ni `initial-emission.ts` — el camino completo que cualquier diseño de invitaciones usaría — escribe en esas tablas relacionales. Todo el estado de autoridad vive en el JSON de `authority_emissions`.

### Resolución propuesta: **Postergar — es deuda técnica en código muerto, no un bloqueante**

La discrepancia es real, pero vive en una ruta que el sistema activo no usa y que el diseño de invitaciones no va a tocar (Fase 2 operaría sobre `evaluateAdministration`/`administerAuthority`, exactamente como hoy hace `propose_membership`/`accept` — nunca sobre las tablas relacionales legacy). No hay ningún ajuste "antes de avanzar" que hacer: alinear ese `CHECK` no cambia nada de lo que Fase 2 necesita.

**Si en algún momento se decide limpiar esto** (no urgente, señalado para otro hilo), el ajuste exacto tiene dos caminos, y cuál corresponde depende de una decisión de producto que tampoco bloquea Fase 2:

- **(a) Alinear el `CHECK` a los 5 valores del wire schema.** SQLite no permite `ALTER TABLE ... ALTER CONSTRAINT` — requeriría una migración que recree la tabla completa (`CREATE TABLE role_assignments_new` con el `CHECK` corregido, copiar filas, `DROP TABLE` viejo, `ALTER TABLE ... RENAME`, recrear los dos índices de `0001_authority_snapshot.sql`). Tiene sentido sólo si se decide que el modelo legacy sigue vivo y debe quedar correcto.
- **(b) Eliminar el código muerto en vez de arreglarlo.** Dado que `buildSnapshotContent`/`resolveAuthoritySnapshot` no están wireadas a ningún endpoint y el propio comentario del código dice explícitamente "never call the legacy builder", una alternativa igual de válida es borrar esas dos funciones (y evaluar si las tablas relacionales legacy siguen haciendo falta para algo, o si `hasEvidence()` es hoy su único consumidor real). Esto vuelve la discrepancia irrelevante en vez de corregirla.

Ninguna de las dos requiere decidirse ahora. Se deja registrado para quien retome ese hilo — no es parte del gate de Fase 2.

---

## 3. El rol del invitado — ¿es mandatorio formalizar `scoped_admin` ahora?

### Pregunta que se hizo Jose
Si decidimos que las invitaciones requieren administración acotada, ¿es mandatorio formalizar el rol `scoped_admin` ahora mismo?

### Resolución propuesta: **No es mandatorio**

"Administración acotada" ya es alcanzable hoy, sin `scoped_admin` builtin, por dos caminos que ya existen y están probados:

1. **`define_role` (organización personalizada).** Cualquier organización puede definir, hoy, un rol propio con un subconjunto de permisos de `authority.*` (p. ej. sólo `authority.assignment.manage`, sin `authority.cutover.approve` ni `authority.binding.approve`) — exactamente el mismo recorte de permisos que `scoped_admin` propondría como builtin. La única diferencia es que hoy cada organización tiene que definirlo por su cuenta la primera vez, en vez de recibirlo de fábrica.
2. **El `scope` de la asignación, no del rol, es lo que acota.** Confirmado en la investigación de Fase 1 (§3.3): un mismo rol (builtin o personalizado) puede asignarse con `scope.type: "project"`, acotando su autoridad a un proyecto puntual sin tocar el resto de la organización — eso ya es "administración acotada" en el sentido que `scoped_admin` buscaba formalizar, y no depende de que ese nombre exista como builtin.

Esto es consistente con el punto 1: si el diseño de invitaciones trata el rol del invitado como un parámetro (cualquier rol activo que el master pueda otorgar, con el scope que el master elija), "invitar con administración acotada" ya es una operación soportada por el sistema actual — usando un rol personalizado con scope de proyecto, en vez de un builtin todavía no construido. Formalizar `scoped_admin` mejoraría la experiencia (un master no tendría que inventar el rol la primera vez), pero no es una capacidad que falte para que Fase 2 funcione.

**Recomendación para el diseño de Fase 2:** no asumir `scoped_admin` como builtin disponible, y no bloquear la propuesta de diseño a que se decida construirlo. Si en algún momento se formaliza (junto con `delegate`, ver §1), el mecanismo de invitación no necesita cambios — simplemente aparece como una opción más entre los roles otorgables.

---

## Conclusión — habilitación de Fase 2

Las tres inconsistencias quedan **postergadas**, ninguna objetada ni requiriendo resolución previa. Ninguna es un bloqueante técnico real para el diseño de invitaciones, siempre que Fase 2 se escriba con el criterio que ya vienen mostrando ambos puntos de esta propuesta: **el rol otorgado a un invitado es un parámetro validado por las guardas de autorización ya existentes (`grantable`/`scopeVerified`/`selfGrant`), nunca un nombre de rol hardcodeado en el diseño.**

Con esto, no veo objeción técnica para que autorices el inicio de Fase 2.
