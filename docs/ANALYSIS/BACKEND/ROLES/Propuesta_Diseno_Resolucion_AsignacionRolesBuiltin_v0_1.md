# Propuesta de Diseño — Resolución del vacío que impide asignar roles builtin más allá de `master` v0.1

**Responde a:** `Encargo_Diseno_Resolucion_AsignacionRolesBuiltin_v1_0.md` (`ANALYSIS/BACKEND/ROLES/`), §2, §3 y §4 completos.
**Emitido por:** cowork asignado (dominio Backend/Authority).
**Fecha:** 2026-09-23.
**Estado:** diseño cerrado, **a la espera de aprobación de Jose**. No se tocó ningún archivo de código — ni Fase C de invitaciones, ni `administration.ts`, ni `initial-emission.ts`, ni nada más.
**Base de partida (no se rehízo):** `Investigacion_BACKEND_Analisis_ResultadosSuite_PostCorreccion0016_v1_0.md` §4, `Investigacion_Estructura_Tenant_Organizacion_Roles_v0_1.md` y `Propuesta_Resolucion_Inconsistencias_Investigacion_TenantOrganizacionRoles_v0_1.md`.
**Método:** leí completos, sobre la copia actual del repo (`/home/jose/repos/bloom-development-extension`), los archivos de Backend `initial-emission.ts`, `emission.ts`, `emission-store.ts`, `administration.ts`, `administration-store.ts`, `invitation-store.ts`, `tenant-store.ts` y `genesis-store.ts` (este último sólo las partes que tocan roles). Del lado Go (Nucleus) leí `roles.go`, `roles_test.go`, `snapshot.go` (validación y continuidad), `authority/decision.go` y `governance/ownership_reconciliation.go`. Además leí las migraciones `0001`, `0009`, `0010`, `0011` y `0013`, los specs `authority-invitations`, `authority-administration`, `authority-administration-store`, `agent-issuer` e `initial-emission`, y el vector `docs/ROLES/fixtures/authority_interop_v1.json`. Como historia, leí `Encargo_Backend_Genesis_Primera_Emision_v1_0.md` y los cierres de Nacimiento de Agente Orbital y de Mapeo `create_project`.
**Límite declarado:** la terminal del equipo de Jose no llegó a arrancar durante la sesión. Por eso no pude hacer un `grep` de todo el repo ni leer `git log`. Las piezas de Conductor/Batcave/webview de §2.3 las revisé por listado de archivos y lectura puntual, no con un barrido completo (ver §2.3).

---

## 0. Resumen ejecutivo

- **El vacío de §1 del encargo queda confirmado en código, y es más amplio de lo que se había dicho.** Además de `specialist`, tampoco es alcanzable en producción el rol `operator`, del que depende todo el permiso `agent.issuer.designate` de Nacimiento de Agente Orbital (§2.5). Las pruebas que "prueban en producción" el otorgamiento de `specialist` arman el estado inicial a mano, con evidencia de fixture de test, y ya traen `specialist` sembrado. Nunca pasan por la génesis real. Por eso el hueco no se había visto (§2.5).
- **Por qué la génesis siembra sólo `master` (§2.1):** no es una decisión de seguridad. El diseño original de la génesis pedía **no** poner ningún `role_definition` en el estado, porque la idea era que los builtin se referenciaran de forma implícita. Esa idea choca con una regla estructural del contrato: toda asignación tiene que apuntar a una definición presente **en el mismo estado firmado**. Quien implementó metió `master` en el estado para cumplir esa regla y no pensó en los demás roles. Lo que sí es deliberado es otra cosa: que el estado de génesis sea **determinista** (se arma sólo a partir de la identidad, nunca con datos del caller) y que haya exactamente **un** principal, **una** membership y **una** asignación `master`. El "exactamente un `role_definition`" es un efecto colateral, no una regla con valor propio.
- **El catálogo global de la base (`organization_id IS NULL`) no es, ni puede ser, fuente del motor (§2.2).** Nucleus evalúa sin conexión, sólo sobre el estado firmado, y no tiene acceso a esa tabla. El motor tampoco la lee: sólo la lee `initial-emission.ts` para `master`, y sólo como interruptor de activación. La fuente de verdad real del contenido de cada builtin son las **constantes compiladas** de `emission.ts` y de `roles.go`.
- **Hallazgo lateral grave, fuera de alcance pero bloqueante para producción (§2.4):** los catálogos builtin de TypeScript y de Go **divergen** para `master`. Go incluye `create_project` y TypeScript no lo reconoce. Leyendo el código, cualquier emisión real del Backend sería rechazada por el `VerifyAndAccept` de Nucleus. No lo verifiqué ejecutando. Esta propuesta no lo resuelve ni lo empeora, pero hay que decidirlo aparte y pronto.
- **Conclusión (§4):** ninguna de las tres alternativas del encargo, tomada sola, es la mejor. La alternativa 3 tal como está escrita no es viable, porque rompe el estado autocontenido que verifica Nucleus. **Recomiendo un cuarto camino que combina la idea de la 1 con la mecánica correcta: "reconciliación determinista del catálogo builtin en los puntos de producción de estado".** Una única función pura agrega al estado, sin tocar nada de lo que ya existe, toda definición builtin del catálogo compilado que falte. Se aplica en tres lugares: (a) al armar el estado de génesis, (b) al comienzo de `evaluateAdministration`, sobre el estado que se va a evaluar y emitir, y (c) como vista de sólo lectura en `createInvitation`. Las organizaciones existentes se completan solas en su próxima emisión administrativa. Los builtin futuros se agregan en un único lugar. El fundador no tiene que hacer ningún paso extra. Y ninguna guarda de otorgamiento se relaja.

---

## 1. Confirmación del vacío (§1 del encargo)

Confirmado sin correcciones de fondo, con estas precisiones de línea y de alcance:

| Afirmación del encargo | Evidencia en código |
|---|---|
| La génesis siembra sólo `master` | `initial-emission.ts:43-56`: lee `master` de la base (`activeMaster`) y arma `role_definitions: [role]`. |
| La forma "exactamente un rol" se valida | La validación **no** está en `initial-emission.ts` sino en `emission-store.ts:125-142` (`prepareEmission`, rama `canonical`): `state.role_definitions.length !== 1 \|\| role?.role_id !== "master" ...` → `initial_evidence_required`. |
| `define_role` sólo admite roles de organización | `administration.ts:187-196`, línea 190: `if (!r \|\| r.role_origin !== "organization") deny("role_unavailable")`. |
| `roleFor` mira sólo el estado vigente | `administration.ts:91-95` y `invitation-store.ts:73-78`: los dos buscan en `state.role_definitions`. |
| `normalizeState` exige que la asignación apunte a una definición en el estado | `emission.ts:96`: `!f.role_definitions.some(r => roleKey(r) === roleKey(a))` → `"assignment reference"`. |

**Precisión:** el estado **sí admite** tener `specialist`/`operator` builtin. `normalizeState` (`emission.ts:85-87`) los acepta si coinciden exactamente con la constante compilada y tienen `role_version: "1"`. El problema no está en el formato del estado. Lo que falta es un **camino de producción** que los escriba ahí.

---

## 2. Investigación estructural (Parte 1)

### 2.1 ¿Por qué la emisión inicial exige un único `master`?

**Historia, según `Encargo_Backend_Genesis_Primera_Emision_v1_0.md` (2026-09-10), §2.2 y §2.3:**

- El diseño original fijó dos principios deliberados: (1) el estado de génesis **se construye de forma determinista a partir de la identidad y nunca se acepta del caller** (*"no un estado arbitrario provisto por el caller"*), y (2) el resultado es *"exactamente un principal/membership/role_assignment master"*.
- Sobre las definiciones de rol, el mismo encargo decía textualmente: *"`role_definitions`: **vacío en el estado** (los built-in no se duplican por organización, mismo criterio ya usado en el resto del sistema)"*.

**Qué pasó al implementar:** ese "vacío" es incompatible con `normalizeState` (`emission.ts:96`) y con el verificador Go (`snapshot.go`, `validateProjection`, en el bloque de asignaciones: `!roles[roleKey(a.RoleID, a.RoleVersion)]` → `"invalid role assignment"`). Una asignación a `master` sin su definición en el estado se rechaza en los dos lados. La implementación real (`initial-emission.ts:53`) metió la definición de `master`, que era la única imprescindible para que la asignación del fundador fuera válida. Y la guarda de `prepareEmission` (`emission-store.ts:136`) congeló esa forma como `length !== 1`.

**Conclusión de este punto:**

| Parte de la restricción | ¿Deliberada? | ¿Hay que conservarla? |
|---|---|---|
| Estado de génesis determinista, nunca aportado por el caller | Sí, principio de seguridad explícito | **Sí, siempre** |
| Exactamente 1 principal, 1 membership y 1 asignación, y esa asignación es `master` en scope organización | Sí: el fundador entra con autoridad completa, y sólo él | **Sí** |
| Exactamente 1 `role_definition` | **No.** Es un efecto colateral de la implementación. El diseño original ni siquiera quería definiciones en el estado | No: se puede generalizar a "exactamente el catálogo builtin", sin perder determinismo |

Una definición de rol **no otorga nada por sí sola**, porque sólo una asignación otorga. Tener más definiciones builtin en el estado de génesis no cambia ninguna garantía de seguridad del fundador.

### 2.2 ¿El catálogo global de la base fue pensado para que lo lea el motor?

**No. Y además arquitectónicamente no puede serlo:**

1. **Origen:** la tabla `role_definitions` nace en `0001_authority_snapshot.sql`, del modelo relacional *legacy* (Lot 1B). La Propuesta de Resolución de Inconsistencias §2 ya mostró que ese modelo no está conectado a ningún endpoint de producción. El comentario de la propia migración dice que la columna `definition` es *"opaco para Backend"*.
2. **Lectores actuales:** el único lector activo de las filas `organization_id IS NULL` es `initial-emission.ts:43-44` (`activeMaster`), y sólo para `master`. El otro lector es `snapshot.ts` (legacy), que no está conectado. `normalizeState`, `evaluateAdministration`, `invitation-store.ts`, `tenant-store.ts` y `agent-issuer.ts` nunca consultan la base para roles.
3. **La fila de la base no puede aportar contenido, sólo estado de activación.** Aunque `activeMaster` lee los permisos de la fila, `normalizeState` (`emission.ts:86-87`) exige después que coincidan carácter por carácter con la constante compilada `master`. Si no coinciden, `builtin contradiction`. O sea: la fila sólo puede **hacer fallar** la génesis (si está ausente o suspendida, `master_role_unavailable`), nunca cambiar lo que se emite. Hoy funciona como un interruptor de operaciones, no como catálogo.
4. **Nucleus no tiene base.** `decision.go` (autoridad, líneas 128-146) y `ownership_reconciliation.go:162` derivan permisos exclusivamente de `role.Permissions` **dentro del estado firmado** y validan cada builtin contra `BuiltinRoles` compilado (`ValidateRoleDefinition`). Un rol que "existe en la base pero no en el estado" es invisible para Nucleus, por definición.
5. **Un precedente de este mismo mal:** el comentario de `0011_authority_role_catalog_operator.sql` ya advertía que *"no hay precedente [...] de cómo se sembraron las filas built-in"*. Las filas de la base se agregaron para desbloquear la génesis, no como fuente del motor.

**Conclusión:** el estado de cada organización está pensado para ser siempre **autocontenido y explícito**: todo lo que una asignación referencia tiene que estar en la misma emisión firmada. La referencia implícita a un catálogo global no existe en ningún camino, y no puede existir sin romper la verificación sin conexión de Nucleus. Hoy hay **tres copias** del catálogo builtin: las constantes de `emission.ts`, `BuiltinRoles` de `roles.go` y las filas de la base. Las que mandan son las dos constantes compiladas.

### 2.3 ¿Qué otras piezas asumen que en una organización nueva sólo existe `master`?

| Pieza | ¿Depende de "sólo `master` en el estado"? | Efecto de agregar builtin al estado |
|---|---|---|
| `emission-store.ts:136` (guarda canónica de v1) | **Sí, de forma literal** (`role_definitions.length !== 1`) | Hay que generalizarla si la génesis siembra el catálogo (§3, §4) |
| `test/initial-emission.spec.ts:71` | **Sí**: espera `role_definitions:[{role_id:"master"...}]` | Hay que actualizar la expectativa |
| `tenant-store.ts:44-54` (`isActiveMaster`) | No: busca `master` por id, sin importar qué más haya | Ninguno |
| `administration.ts:107-111` (`masterPermissions`) | No: busca `master` por id | Ninguno |
| `invitation-store.ts:68-72` (`masterPermissionsOf`) | No | Ninguno |
| `agent-issuer.ts` | No: evalúa asignaciones reales | Ninguno (de hecho, se habilita, ver §2.5) |
| Go `snapshot.go` `validateContinuity` (667-700) | No: agregar definiciones es un *upsert* permitido; sólo prohíbe quitarlas o cambiar sus permisos | Ninguno |
| Go `ownership_reconciliation.go:162` | No: busca `create_project` en cualquier rol activo | Ninguno |
| Go `governance/ownership.go` y `governance/decision/decision.go:327-340` (marcadores `.master`/`.specialist`) | No: son marcadores locales *legacy* del sistema de archivos, independientes del estado de autoridad | Ninguno |
| Conductor / Batcave / webview de la extensión | Listé `src/` (extensión) completo y no hay ningún archivo de autoridad o roles. Según `Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md` §1, `backend/web` (`RoleBadge.tsx`) está armado contra el schema *legacy* `users`/`org_members` con datos de prueba. | **No confirmado por barrido completo** (ver el límite declarado arriba). Por lo leído, ningún consumidor de UI lee `role_definitions` del estado firmado. |

**Conclusión:** la única pieza que depende de verdad de la invariante es la guarda canónica de `prepareEmission` (y su test). Todo lo demás busca `master` por id o evalúa asignaciones, y agregar definiciones builtin no lo afecta.

### 2.4 Hallazgo lateral — el catálogo `master` diverge entre TypeScript y Go

Fuera del alcance de este encargo, pero lo reporto porque condiciona cualquier cosa que llegue a Nucleus:

- `roles.go:45-52` — `BuiltinRoles[RoleMaster]` tiene **13** permisos, incluido `"create_project"` (agregado el 2026-09-15 por `Encargo_Implementacion_Mapeo_Gravity_CreateProject_y_Cierre_P3_v1_0.md`, que sólo tocó Go).
- `emission.ts:5` — la constante `master` tiene **12**. `create_project` ni siquiera está en el universo de permisos de TypeScript (`emission.ts:11`), así que `normalizeState` rechazaría una definición que lo incluya (`unknown permission or wildcard`).
- `snapshot.go:258` (`VerifyAndAccept` → `validateProjection`) aplica `ValidateRoleDefinition` a cada definición. Un `master` builtin de 12 permisos falla con `"built-in permissions contradict catalog"` (`roles.go:103-110`).
- El vector de interop (`authority_interop_v1.json`) sólo trae roles `org:editor`, ningún builtin. Por eso la divergencia no la detecta ningún test de interop.

**Consecuencia leyendo el código (alta confianza, no verificada ejecutando):** cualquier emisión real del Backend, que siempre contiene `master`, sería rechazada por Nucleus al aceptarla. Arreglarlo no es trivial, porque los dos validadores fijan los builtin a `role_version: "1"`. Si se agrega `create_project` a `master` v1 en TypeScript, **todas las emisiones ya guardadas** fallarían al decodificarse (`decodeEmission` → `normalizeState` → `recovery_required` en todas las organizaciones). El camino correcto probablemente sea un `master` v2 con soporte de versionado de builtin en ambos validadores. Es una decisión de Jose, aparte de esta. **Recomiendo verificarlo ejecutando antes de cualquier otra cosa** (los specs "*... with Go*" que ya fallan son el lugar natural).

Divergencia menor, en el mismo espíritu: Go reserva como id de rol de organización sólo `master`/`specialist` (`roles.go:85`), mientras que TypeScript también reserva `operator` (`emission.ts:88`).

### 2.5 ¿Algún documento previo ya rozó esto? Y el alcance real del vacío

- `Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` y `Cierre_Investigacion_Roles_Organizacionales_y_Nomenclatura_Agente_v0_1.md` tratan **qué** roles hacen falta, no **cómo** un builtin se activa en el estado. No lo rozan.
- `Encargo_Backend_Genesis_Primera_Emision_v1_0.md` §2.3 es el único que lo tocó, y con el supuesto equivocado ("vacío en el estado", ver §2.1).
- `Encargo_Diseno_Nacimiento_Agente_Orbital_EnfoqueA_v0_1.md` §2 y su cierre agregaron `operator` al catálogo compilado y a la base (`0011`), pero **ningún camino lo escribe en el estado de ninguna organización.** `agent-issuer.spec.ts:25-33` lo prueba con un estado armado a mano que ya trae `operator`. **Resultado: la capacidad de designar emisor de agente para un `operator` con scope proyecto tampoco es alcanzable en producción hoy.** El vacío no afecta sólo a invitaciones: afecta a toda capacidad construida sobre un builtin distinto de `master`.
- **Por qué nadie lo vio:** `authority-administration.spec.ts:15-16`, `authority-administration-store.spec.ts:29-30` y `agent-issuer.spec.ts:25-28` inicializan la organización con `persistEmission(... initialFixtureEvidence ...)`, es decir, con la rama de fixture de `prepareEmission`, que acepta cualquier estado. Siempre traen `specialist`/`operator` ya sembrados. `authority-invitations.spec.ts` es el **primer** test que pasa por `createInitialAuthorityEmission` real y después intenta otorgar `specialist`. Por eso fue el primero en fallar. La frase "*`propose_assignment`/`accept` ya probado en producción*" es correcta para el mecanismo, pero ese mecanismo nunca se probó con un estado nacido de génesis real.

---

## 3. Análisis de alternativas (Parte 2)

Criterios comunes: (i) si resuelve las organizaciones **nuevas**, (ii) las **existentes**, (iii) los builtin **futuros**; (iv) invariantes afectadas; (v) archivos; (vi) riesgo.

### Alternativa 1 — La génesis siembra todos los builtin activos

- **Mecánica:** `createInitialAuthorityEmission` arma `role_definitions` con el catálogo builtin completo, y la guarda de `prepareEmission` pasa de `length === 1 && master` a "exactamente el catálogo builtin, construido de forma determinista".
- **(i) Nuevas:** sí. **(ii) Existentes:** **no.** Todas las organizaciones que ya tienen v1 siguen sin `specialist`/`operator`, sin ningún camino para obtenerlos, y requieren un mecanismo aparte (backfill o comando). **(iii) Futuros:** **no.** Cada builtin nuevo reabre el mismo problema para todas las organizaciones creadas antes.
- **Invariantes:** se conservan el determinismo y "una sola asignación `master`". Cambia la forma literal de v1. `normalizeState` y Go la aceptan (§1, §2.3).
- **Archivos:** `initial-emission.ts`, `emission-store.ts` (guarda canónica) y `initial-emission.spec.ts`.
- **Tiene sentido de negocio que un rol exista sin asignar?** Sí. Una definición es un "rol disponible para otorgar", no un otorgamiento. Es lo que una UI de invitación necesita listar.
- **Riesgo:** bajo-medio. Toca la guarda más sensible del sistema, aunque de forma acotada y bien cubierta por `initial-emission.spec.ts`. **Insuficiente sola.**

### Alternativa 2 — Comando explícito para dar de alta un builtin (p. ej. `adopt_builtin_role`)

- **Mecánica:** un comando nuevo en `evaluateAdministration` que recibe sólo `role_id` (nunca permisos del caller) y copia la definición desde la constante compilada. Requiere `authority.role_definition.manage` (hoy sólo `master` lo tiene). Falla si ya está presente (se hace una sola vez por `(role_id, role_version)`, compatible con el versionado append-only de `define_role`).
- **(i) y (ii):** sí. **(iii):** sí, pero **cada organización tiene que ejecutarlo por cada builtin nuevo**.
- **Invariantes:** ninguna rota. Es el camino más explícito y auditable (su propio `command.kind` en el log de auditoría).
- **Archivos:** `administration.ts` (tipo del comando, `validateCommand`, rama nueva), `administration-route.ts` (validación del body) y tests.
- **Costo de negocio:** le pone al fundador un paso técnico antes de poder invitar ("activá el rol Specialist"), o bien la UI tiene que ejecutarlo en silencio antes de proponer. Eso duplica emisiones y agrega un modo de falla, y en la práctica es la alternativa 4 implementada del lado del cliente.
- **Riesgo:** bajo técnicamente, **alto en fricción de producto** y en superficie de API nueva que mantener.

### Alternativa 3 — `roleFor` consulta el catálogo global de la base para los builtin

- **Tal como está escrita, no es viable.** Si una asignación referencia un builtin sin definición en el estado, `normalizeState` la rechaza (`emission.ts:96`, `"assignment reference"`) y también el verificador Go (`snapshot.go`, `"invalid role assignment"`). Aunque se relajaran los dos validadores, Nucleus (`decision.go`) no podría calcular los permisos de esa asignación porque no tiene la base. El resultado es `referenced_role_unavailable` y, en la práctica, un rol otorgado que no otorga nada. Se rompe la propiedad central del contrato: el estado firmado se verifica solo.
- **Su única forma viable es "materializar al otorgar":** cuando `propose_assignment` pide un builtin ausente, el motor lo agrega al estado en esa misma emisión. Esto sí funciona, pero (a) mete un efecto colateral de catálogo dentro de un comando de otorgamiento, (b) exige repetir el mismo truco en `createInvitation` y en la futura redención (Fase C), y (c) leer la base desde `evaluateAdministration` rompería que es una función pura. Habría que usar la constante compilada, con lo cual deja de ser "consultar el catálogo de la base".
- **Archivos:** `administration.ts` (`roleFor` + inserción), `invitation-store.ts` y, si de verdad se lee la base, además `administration-store.ts` (pasar el catálogo por contexto).
- **Riesgo:** alto en su forma literal (rompe el contrato). Medio en su forma viable, que resulta ser un caso particular, más angosto, de la alternativa 4.

### Alternativa 4 (nueva) — Reconciliación determinista del catálogo builtin en los puntos de producción de estado

- **Mecánica:** una única función pura, p. ej. `withBuiltinCatalog(state)`, que **agrega** al estado cada par `(role_id, role_version)` del catálogo builtin compilado que falte, copiándolo de la constante con `status: "active"`. **Nunca** modifica una definición existente. **Nunca** vuelve a agregar un builtin que tenga una revocación `role_definition` sobre su `role_id`. Se aplica en tres lugares, y sólo en ellos:
  1. **Génesis** — `createInitialAuthorityEmission` arma el estado v1 con el catálogo completo, y la guarda de `prepareEmission` compara contra `withBuiltinCatalog(...)` (sigue siendo determinista).
  2. **Motor de administración** — al comienzo de `evaluateAdministration`, sobre el estado que se va a evaluar: `const state = withBuiltinCatalog(normalizeState(input, org))`. Así, cualquier comando (`propose_*`, `accept`, `suspend_*`, etc.) evalúa y emite con el catálogo completo.
  3. **Lectura de invitaciones** — `createInvitation` aplica la misma función como **vista de sólo lectura** sobre el estado vigente, para validar el rol pedido. No persiste nada: la persistencia real ocurre cuando la redención pase por `evaluateAdministration` (punto 2).
- **(i) Nuevas:** sí, desde v1. **(ii) Existentes:** sí, en su **próxima** emisión administrativa, sin migración ni backfill. La primera invitación ya valida gracias a la vista (punto 3). **(iii) Futuros:** sí. Agregar un builtin es cambiar la constante (TypeScript + Go), y todas las organizaciones lo reciben solas.
- **Invariantes:**
  - Estado autocontenido: **se conserva** (las definiciones viajan dentro de la emisión firmada).
  - Génesis determinista: **se conserva** (el catálogo es código, no un input).
  - Una sola asignación `master` en v1: **se conserva**.
  - Append-only y continuidad de Go: **se conservan** (agregar es *upsert* permitido, `snapshot.go:679-690`; nunca se quita ni se cambian permisos).
  - Doble evaluación de `administerAuthority` (`administration-store.ts:92-96`, `decision_time_changed`): **se conserva**, porque la función es determinista y da el mismo resultado en ambas evaluaciones.
  - `grantable`/`selfGrant`/`scopeVerified`: **intactas.** Que un rol esté disponible no significa que se pueda otorgar: sigue limitado por el techo de `master` y por lo que el otorgante ya tiene.
- **Restricción crítica de diseño:** la invariante "el estado contiene el catálogo completo" **no** se puede exigir en `normalizeState` ni en `validateProjection` de Go. Esas funciones también decodifican emisiones históricas (`decodeEmission`, `emission-store.ts:25`). Si se la exigiera ahí, toda organización existente caería en `recovery_required`. Se exige **sólo donde se produce estado**, nunca donde se lee.
- **Archivos:** `emission.ts` (exportar el catálogo como dato y `withBuiltinCatalog`; es su hogar natural, ya que ahí vive la constante que `normalizeState` hace cumplir), `initial-emission.ts`, `emission-store.ts` (guarda canónica), `administration.ts` (una línea en la entrada de `evaluateAdministration`), `invitation-store.ts` (vista de lectura, importando la **misma** función para no crear una cuarta copia del catálogo) y tests.
- **Riesgo:** bajo-medio. El cambio en el motor es una línea en un punto de entrada puro. El cambio en la génesis está acotado a una guarda con buena cobertura. El principal riesgo operativo es que la próxima emisión de cada organización existente traiga en su delta un *upsert* de definiciones que Nucleus no había visto antes. Es un cambio aceptado por la continuidad de Go, pero hay que probarlo de punta a punta junto con la divergencia de §2.4.

### Tabla comparativa

| | Alt. 1 | Alt. 2 | Alt. 3 (literal / viable) | **Alt. 4** |
|---|---|---|---|---|
| Organizaciones nuevas | ✅ | ✅ (con paso extra) | ❌ / ✅ | ✅ |
| Organizaciones existentes | ❌ | ✅ (con paso extra) | ❌ / ✅ | ✅ (automático) |
| Builtin futuros | ❌ | ⚠️ por organización | ❌ / ✅ | ✅ (un solo lugar) |
| Paso extra para el fundador | No | **Sí** | No | No |
| Rompe el estado autocontenido o la verificación de Nucleus | No | No | **Sí** / No | No |
| Superficie nueva de API | No | **Comando nuevo** | No | No |
| Toca la guarda canónica de v1 | Sí | No | No | Sí |

---

## 4. Conclusión arquitectónica (Parte 3) — el entregable

### 4.1 Decisión recomendada

**Adoptar la Alternativa 4, "reconciliación determinista del catálogo builtin en los puntos de producción de estado", como mecanismo único de activación de roles builtin.** Incluye la génesis (lo bueno de la Alternativa 1) y reemplaza a las Alternativas 2 y 3.

Enunciado normativo, listo para un encargo de implementación:

> **Regla R1.** Todo estado de autoridad que el Backend **produce**, sea la emisión inicial canónica o una emisión administrativa, contiene como `role_definitions` builtin exactamente las entradas del catálogo builtin compilado que todavía no estén presentes, agregadas con `status: "active"`, además de todo lo que ya existía, que queda intacto.
> **Regla R2.** El catálogo builtin es **código** (la constante de `emission.ts`, espejada en `roles.go`), nunca la tabla de la base ni un input del caller. La tabla `role_definitions` con `organization_id IS NULL` conserva sólo su rol actual de interruptor de activación de `master` en la génesis, y no se extiende a otros usos.
> **Regla R3.** R1 se aplica en la **producción** de estado, nunca en la **lectura o validación** (`normalizeState`, `decodeEmission`, `validateProjection` de Go no cambian), para no invalidar emisiones históricas.
> **Regla R4.** Ninguna guarda de otorgamiento cambia. Que un rol builtin esté disponible no lo vuelve otorgable: `grantable`, `selfGrant` y `scopeVerified` siguen decidiendo.
> **Regla R5.** La emisión inicial canónica sigue siendo determinista y con exactamente un principal, una membership y una asignación `master` en scope organización. Sólo cambia "exactamente una definición" por "exactamente el catálogo builtin".

### 4.2 Justificación de negocio

- **Fundador nuevo, fricción cero.** Desde el primer día, y sin pasos técnicos, puede invitar a alguien como `specialist` o designar un `operator` de proyecto. Una UI de invitación puede listar los roles disponibles leyendo el propio estado, con builtin y personalizados en un mismo lugar. La Alternativa 2 lo obligaba a entender y ejecutar una "activación" que no tiene ningún significado para él.
- **Seguro por defecto.** Lo que se agrega al estado es catálogo, no autoridad: ninguna definición otorga nada sin una asignación, y las asignaciones siguen pasando por las mismas guardas. El contenido de cada builtin sale del código, fijado y validado por `normalizeState` y por Go, nunca de la base ni del request. La génesis mantiene sus dos garantías deliberadas (determinismo y fundador único con `master`).
- **Lo más simple de mantener a largo plazo.** Una función, una lista y tres lugares de aplicación. Un builtin futuro (`delegate`/`scoped_admin`, si se decide) se agrega en la constante de TypeScript y de Go, y cada organización lo recibe en su próxima emisión, sin migración, backfill ni comando por organización. Además se elimina la necesidad de parches por feature: `operator` y el Nacimiento de Agente Orbital quedan habilitados en producción sin tocarlos (§2.5).
- **Por qué no la Alternativa 3:** porque el estado firmado autocontenido es lo que le permite a Nucleus decidir sin conexión y sin confiar en el Backend. Hacer que las asignaciones dependan de una tabla que Nucleus no ve socava la razón de ser de todo el diseño de emisiones.

### 4.3 Secuencia accionable para el encargo de implementación

**Paso 0 — prerrequisito, decisión aparte de Jose:** resolver o, como mínimo, confirmar ejecutando la divergencia TS↔Go de `master` (§2.4). Esta propuesta no la empeora, porque `specialist` y `operator` coinciden entre TypeScript y Go, pero mientras exista, ninguna emisión real llega aceptada a Nucleus. No tiene sentido validar de punta a punta la reconciliación sin resolverla.

1. **`emission.ts`:** exportar el catálogo builtin como dato (`BUILTIN_ROLE_CATALOG`, derivado de las constantes existentes, sin duplicarlas) y la función pura `withBuiltinCatalog(state)` con la semántica de R1 (sólo agrega; nunca modifica; respeta revocaciones `role_definition` por `role_id`). Hacer que `normalizeState` use ese mismo dato para su chequeo `builtin contradiction`, para que haya una sola fuente dentro de TypeScript. **No** cambiar lo que `normalizeState` acepta o rechaza.
2. **`administration.ts`:** en la línea 75, `const state = withBuiltinCatalog(normalizeState(input, org))`. Nada más en el motor.
3. **`invitation-store.ts`:** en `loadAuthorizedState` (o justo antes de `roleFor`), aplicar `withBuiltinCatalog` como vista de sólo lectura. Importar la función, no reimplementarla.
4. **`initial-emission.ts` + `emission-store.ts:136`:** armar v1 con `withBuiltinCatalog` y generalizar la guarda canónica a "`role_definitions` canónicamente igual al catálogo builtin; exactamente una asignación, que referencia `master` builtin". Mantener todas las demás condiciones de la guarda sin cambios.
5. **Tests obligatorios:**
   - `initial-emission.spec.ts`: v1 contiene el catálogo completo, con una sola asignación `master`; un estado canónico con un builtin de más o de menos, o con un builtin alterado, se rechaza.
   - Test nuevo **de punta a punta sin fixture**: génesis real → `propose_membership` → `propose_assignment specialist` → `accept`. Es el test que faltaba (§2.5).
   - Organización existente con v1 de sólo `master` (armada con fixture): su próximo comando administrativo emite un delta con *upsert* de `specialist`/`operator` y nada más.
   - Doble evaluación de `administerAuthority` estable (sin `decision_time_changed`).
   - `authority-invitations.spec.ts` en verde sin cambios en su lógica: es el test de aceptación natural de todo este encargo.
   - Del lado Go: un test de `validateContinuity` y de `VerifyAndAccept` con un delta que agrega definiciones builtin (condicionado al Paso 0).
6. **Fuera del encargo de implementación:** los roles `delegate`/`scoped_admin` (siguen postergados). Hay que tener en cuenta que un futuro `delegate` con permisos `vault.*` no sería otorgable por `grantable()`, porque esos permisos no están dentro del techo de `master`. Es una decisión de producto para cuando se aborde. También quedan fuera el versionado de builtin más allá de `"1"`, la limpieza de las filas de catálogo de la base, y la divergencia menor de ids reservados en Go (`operator`).

### 4.4 Impacto sobre Fase C de invitaciones

Con R1-R5 implementadas, el vacío de roles builtin deja de bloquear Fase C: la redención va a pasar por `evaluateAdministration`, que ya va a traer el catálogo completo. Fase C sigue bloqueada por el otro motivo ya registrado (`invitationCommitGuard`, `Cierre_Implementacion_FaseAB_Invitaciones_y_Correccion_ActorSintetico_v1_0.md` §2), que esta propuesta no toca.

---

## 5. Confirmación del gate

- §2 (investigación estructural): §2.1-§2.5, con cita de código y documento en cada afirmación, y con el límite de barrido declarado en §2.3.
- §3 (alternativas): las tres del encargo más una cuarta, con archivos, invariantes y riesgo de cada una.
- §4 (conclusión): decisión explícita (Alternativa 4, que incluye la génesis), reglas normativas R1-R5 y secuencia de implementación.
- No se modificó ningún archivo de código. Queda a la espera de la aprobación de Jose antes de cualquier encargo de implementación, y de su decisión aparte sobre el hallazgo de §2.4.
