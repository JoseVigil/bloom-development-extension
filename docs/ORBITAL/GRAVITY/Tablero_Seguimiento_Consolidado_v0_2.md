# Tablero de Seguimiento Consolidado — Gravity / Orbital / Posture (v0.49)

**Estado a:** 2026-09-20
**Reemplaza a:** v0.48. Cierra la aceptación E2E real del primer Mandate Genesis (bloqueo local de autoridad
Master para Nucleus Vault, sin relación con `remote_enforced`) — ver §Z.25.

La aprobación alcanza el código y sus invariantes de seguridad verificados independientemente. No implica despliegue productivo, migración de ambientes, publicación de artefactos ni provisión de credenciales.

---

## Directiva reconfirmada — `Intent Cor` = `Intent Core`, mismo sistema deprecado

Sin cambios — Gravity es la única autoridad vigente sobre autorización de postulados y posturas.

## §X — Nodo SESSION/MANDATE (sin cambios)

Commit `7e5f0fa`, 7 archivos. `EnsureGravityMandateNodeActivity` ya no está bloqueada — ver §Z.5.

## §Y — `DOMAIN`/`GENE` (sin cambios)

Commit `0023f2e`, 15 archivos. Sin caller productivo todavía (`ing`/`dis` no autorizado).

## §Z / §Z.1 / §Z.2 / §Z.3 / §Z.4 — sin cambios respecto de v0.25

Ver v0.25 para el detalle completo. Resumen: `NUCLEUS` cerrado (`c5770f3`), `ProjectID` propagado de punta a
punta (`0b579c9`/`6569ee8`), `PROJECT` fail-closed en `store.go` (`bca8698`). Track de Orbital (§Z.1/§Z.2)
queda superado por §Z.16 — ya no está esperando greenlight, está cerrado.

## §Z.5 — Autorización gobernada `local_legacy` para `ORGANIZATION`/`PROJECT` (sin cambios)

Wiring de punto de entrada implementado y mergeado a `main`. Pendiente, no bloqueante y diferido
explícitamente por José: fix de una línea (`os.Exit(1)` faltante en el `Run` de `init`).

## §Z.6 — Work ROLES §13, fundamento semántico: tres rondas cerradas (sin cambios)

Identidad organizacional, contrato de binding (`4aedfb9`) y contrato del Authority Snapshot (`22c1a5d`), las
tres aprobadas por José el 2026-09-04. Ver v0.27 para el detalle completo.

## §Z.7 — Ronda 4: diseño físico de la autoridad remota, aprobado (sin cambios)

`BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` aprobado formalmente el 2026-09-04, con la corrección del
contrato canónico de `.ownership.json` (§20) integrada. Ver v0.28 para el detalle completo.

---

## §Z.8 — Fase 1 de implementación (Nucleus): completada según reporte de Génesis (sin cambios)

Ver v0.38 para el detalle completo.

## §Z.9 / §Z.10 — Fase 2 (Backend): bug crítico de firma corregido y cerrado formalmente (sin cambios)

Ver v0.38 para el detalle completo. §2.5 resuelto y verificado independientemente; §2.8 pasó a Fase 3.

## §Z.11 — Fase 3 (Seguridad): decisiones aprobadas, tres encargos emitidos, primera verificación (sin cambios)

Ver v0.38 para el detalle completo — histórico, superado por el estado real consolidado en §Z.15.

## §Z.12 — Encargo definitivo de Batcave, Fase 3 (sin cambios)

Ver v0.38 para el detalle completo. Batcave quedó cerrado y verificado en esa ronda.

## §Z.13 — Estado real de Fase 3 verificado el 2026-09-05: Backend con dos defectos, Nucleus sin empezar (histórico)

Ver v0.38 para el detalle completo. **Superado por §Z.15.**

## §Z.14 — Fase 4 §3.1/§3.2: decisión formalmente cerrada, con encargo diferido de investigación (sin cambios)

Ver v0.38 para el detalle completo — superado en alcance por lo construido entre el 2026-09-05 y el
2026-09-10, ver §Z.15.

## §Z.15 — Verificación de Control sobre cinco días de trabajo fuera de ciclo: MandateDelivery/Sync (Nucleus) y sincronización completa de autoridad (Backend–Batcave–Nucleus) (sin cambios)

Ver v0.39 para el detalle completo. Confirmó por lectura directa de tipos que `remote_enforced` sigue sin ser
un valor alcanzable de `AuthorityMode` — la garantía central del diseño sigue intacta. Dejó tres condiciones
para `remote_enforced`/cutover: P1 (onboarding de la primera identidad), P2 (adoptar/recuperar un estado
anterior real), P3 (política productiva ante desconexión), más el mapeo Gravity de `create_organization`/
`create_project` a permisos remotos.

---

## §Z.16 — Cierre de Orbital (diseño→ejecutable→implementación) y P1 de Fase 4 resuelto en diseño

### Nacimiento de agente Orbital (Enfoque A): cerrado de punta a punta

El track que en §Z.1/§Z.2 esperaba greenlight de José avanzó esta semana por las cuatro rondas de diseño
que le faltaban (`v0.1`→`v0.4`, resolviendo ubicación del permiso `agent.issuer.designate`, nombres de rol
`scoped_admin`/`operator`, la regla exacta de scope de `decision.go:scopeIncludes`, y la decisión de
reutilizar `ActorProof`/`ActorAttestation` en vez de un tipo paralelo), hasta un encargo ejecutable v1.0 que
además resolvió el último bloqueante — custodia de la clave efímera — con una decisión verificada contra
`vault.go` real: la clave nunca pasa por `Vault` (`RequestKey`/`SetKey`/`DeleteKey` exigen `core.RoleMaster`,
el rol local del dueño de la máquina; meter ahí una clave efímera de actor sería debilitar ese invariante o
agregarle persistencia real a un secreto que hoy vive sólo en memoria del proceso).

**Implementación verificada por Control, código real, no por el reporte del cowork:** `roles.go` (permiso +
rol `operator` con el permission-set exacto), `actor_proof.go` (whitelist de audience, `ActorAttestation`
extendida con `SchemaVersion` "1.1" aditiva, validación cruzada 1.0↔1.1 correcta en ambos sentidos), el test
de guardia `TestActorProofDoesNotImportVault` (existe, funciona como se describió), `vault.go` sin tocar
(mtime muy anterior a esta semana), `agent-issuer.ts` + su spec (regla de scope de §2.2 implementada exacto,
buena cobertura de bordes), migraciones `0011`/`0012` correctas. **Cerrado.**

**Hallazgo colateral de esta verificación, no de Orbital en sí:** ninguna migración sembró nunca las filas
builtin `master`/`specialist` del catálogo global `role_definitions` — sólo `operator` (`0011`). Esto no es
un problema de Orbital, es un problema de Génesis — ver abajo.

### P1 de Fase 4 — resuelto en diseño, dos encargos, uno ya implementado sin que Control lo supiera

Verificando el hallazgo de arriba contra el repo completo (las 13 migraciones y todo `backend/src/authority`)
aparecieron tres huecos que nadie había conectado: (1) ningún código crea una organización fuera de
`seed.sql`; (2) ningún código crea la primera identidad humana canónica — esto es P1, literalmente; (3) el
catálogo builtin nunca se sembró en ningún ambiente real.

**Corrección de registro:** `Encargo_Backend_Genesis_Primera_Emision_v1_0.md` (2026-09-10, nunca antes
verificado como implementado) **ya está implementado** — como `initial-emission.ts`/
`createInitialAuthorityEmission()`/ruta `POST /v1/authority/initial-emission`, wireada en `index.ts`, más
estricta que lo especificado (exige además una instalación activa antes de emitir `master`). Se cierra sin
reabrir.

José convirtió el hueco restante en una directiva de arquitectura — **Organización Personal por Defecto**:
todo primer login crea, atómicamente, usuario + organización personal + `master` sobre esa organización.
Resultado: `Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md`, que además trae la migración que
siembra `master`/`specialist` en el catálogo builtin (la pieza más urgente de las tres, porque sin ella la
emisión inicial YA implementada no puede funcionar para nadie en un ambiente real). Un matiz que el propio
código obliga a mantener: la emisión de `master` sigue exigiendo una instalación Nucleus ya registrada — no
es una única transacción de punta a punta, son dos pasos (identidad+organización atómico; luego `master` en
cuanto Nucleus se registra), por la misma razón de no debilitar un invariante de seguridad real que ya se
aplicó con Vault en Orbital.

Por decisión de José, la implementación de este encargo se ejecuta en un cowork nuevo (misma disciplina que
Orbital) — este canal queda libre para Fase 4.

**Quedan nombrados, sin resolver, no bloqueantes:** la UI real de login (el prototipo en `backend/web/` está
mockeado contra el schema legado `users`/`org_members`, sin conexión a las rutas reales); cómo el proceso
local de Nucleus se entera del `organizationId` recién nacido para registrarse; y que invitar a alguien a la
organización propia (colaboración) todavía necesita que se siembre su identidad en la organización ajena —
el motor de reparto de roles ya funciona, pero nada crea esa fila hoy.

## §Z.17 — Cierre de implementación de Génesis/Primer Registro, verificado: P1 de Fase 4 cerrado

El cowork nuevo devolvió `Cierre_Implementacion_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md`.
Control lo verificó código por código contra el repo real, no contra el reporte:

- `backend/migrations/0013_authority_genesis.sql`, `backend/src/authority/genesis-store.ts`,
  `administration-route.ts`, `index.ts` y `authority-genesis.spec.ts` existen y su contenido coincide
  exactamente con el encargo — permission-sets del seed builtin correctos, lógica de carrera en
  `finishGenesis` correcta (sólo absorbe el error del `batch` si efectivamente hay un ganador en
  `authority_genesis_registry`, cualquier otro error se relanza), binding de columnas del `INSERT` a
  `authority_human_identities` verificado uno por uno contra el schema real de `0006`.
- `human-session-store.ts`: comparado función por función contra la versión leída al diseñar el
  encargo — son byte-idénticas salvo `export` agregado a seis símbolos. Cero cambios de lógica, como
  prometía el cierre.
- El fallback del callback (`finishHumanLogin` → si `flow_invalid` → `finishGenesis`) preserva exacto el
  shape de respuesta de un login normal (sin el campo `created`) — ningún cliente existente se rompe.
- `authority-genesis.spec.ts`: suite real con Miniflare/D1 real (no stubs), incluye el test de carrera
  con dos `finishGenesis` simultáneos vía `Promise.all` y un recorrido HTTP de punta a punta.

**Límite honesto de esta verificación, igual que en Orbital:** ni el cowork ni Control pudieron ejecutar
`npm test` contra la máquina de José esta vez (bridge caído de ambos lados) — el cowork corrió contra un
entorno aislado reconstruido y reporta 6/6 en la suite nueva, 103/103 en el resto de archivos tocados.
Control verificó el código directamente y es correcto, pero esa cifra de test sigue sin re-ejecutarse por
Control mismo.

**Con esto, P1 de Fase 4 queda cerrado**: existe, verificado, un camino de código completo desde "GitHub
nuevo, sin organización" hasta "organización personal con `master` emitido en cuanto Nucleus se registra".

## §Z.18 — P2 cerrado: diseño acelerado por decisión directa de José, implementación verificada

José cerró los ejes de diseño de P2 sin ronda iterativa, para acelerar el cierre de Fase 4: alcance limitado
al escenario (A) — deshacer un error administrativo propio; el invariante anti-downgrade de Nucleus
(`VerifyAndAccept`) queda absoluto e intocado; "recuperar" significa restaurar el efecto práctico hacia
adelante (nueva emisión `N+1`, nunca reescribir el historial); lo ejecuta quien ya tenga
`authority.membership.manage`/`authority.assignment.manage` en el scope — sin rol ni permiso nuevo.

Con esas cuatro decisiones cerradas, el mecanismo resultó mínimo porque casi todo ya existía:
`loadEmissionVersion` ya permitía leer cualquier versión histórica, y `propose_membership`/
`propose_assignment`+`accept` (motor de `administration.ts`, sin cambios) ya permiten crear una relación
nueva que convive con una revocación vieja — sólo bloquean reusar el mismo id. `Encargo_Implementacion_
Recuperacion_Estado_Anterior_Autoridad_v1_0.md` se redujo a: un endpoint de sólo lectura nuevo
(`GET /v1/authority/administration/history`) y dos funciones puras nuevas (`recovery.ts`) que arman el
comando de restauración a partir de la foto histórica. Cero cambios en Nucleus/Go, cero migraciones, cero
cambios en el motor de políticas.

**Implementación verificada por Control código por código contra el repo real** (no contra el reporte del
cowork): `recovery.ts` — firmas y lógica de rechazo (`membership_unavailable`/`assignment_unavailable`)
exactas a lo especificado; `recovery.spec.ts` — 6 tests, los 3 casos obligatorios por función; el branch
`GET /v1/authority/administration/history` en `administration-route.ts` insertado en el punto exacto
indicado (junto al GET del callback, antes del gate de `POST`), mismo gate de sesión que la ruta de
administración. Por mtimes, confirmado que ningún otro archivo del repo fue tocado.

**Mismo límite honesto que en Génesis y Orbital:** bridge caído toda la sesión — el cowork corrió contra un
entorno aislado y reporta `recovery.spec.ts` 6/6, 115/115 en los archivos vecinos, 201/216 en la suite
completa (los 15 fallos restantes son el mismo ruido preexistente ya documentado, sin relación con este
encargo). Control no re-ejecutó los tests, sólo verificó el código.

**Con esto, P2 de Fase 4 queda cerrado.**

## §Z.19 — P3 cerrado (sin cambio de motor) y mapeo Gravity parcial (`create_project`) cerrado

Al retomar el "próximo paso" que había quedado anotado al final de §Z.18, Control investigó P3 y el mapeo
Gravity contra el código real antes de diseñar nada nuevo — y encontró que la mayoría de los parámetros que
`Contexto_Decision_Autoridad_Organizacional_Roles_v0_1.md` §13 dejaba pendientes de decisión de José (TTL,
freshness, latencia máxima de revocación, tratamiento de Batcaves desconectadas, evidencia de entrega/
aceptación) **ya estaban resueltos por infraestructura existente**, sin necesidad de código nuevo: el campo
`Emission.ExpiresAt` que `DecisionEvaluator.Evaluate` ya usa para denegar en cuanto expira (`state_expired`)
ya es el TTL/freshness; `SyncClient.Poll` + `HandleNotice`/`ConsumeNotices` con `Urgency` ya cubren la
latencia de revocación; Batcave nunca decide autoridad (solo transporta/cachea), así que su desconexión no
es un estado relevante para esta política; `SyncMeasurement` ya es la evidencia de entrega/aceptación.
Rotación de claves queda fuera de alcance (dominio de Fase 3/identidad local, ya resuelto ahí).

Quedaron dos preguntas reales, resueltas por José el 2026-09-15
(`Propuesta_Diseno_P3_PoliticaDesconexion_y_MapeoGravity_v0_1.md`):

- **`create_organization` no se mapea por ahora** — el chequeo `scope_outside_binding` de `Evaluate()`
  exige una organización ya vinculada al binding, estructuralmente incompatible con la operación que la
  crea; y es un evento único de arranque por instalación, no recurrente. Sigue `operation_permission_
  unmapped`, a propósito — documentado en el propio código (`roles.go`, comentario `NOTA`) para que no se
  "corrija" sin releer esta decisión.
- **La excepción de observación/diagnóstico que pide la política offline no requiere tocar el motor de
  decisión** — esas operaciones (`nucleus authority decision` en consulta, `mandate status`) nunca pasan
  por `Evaluate()` hoy, así que el fail-closed total que `Evaluate()` ya aplica al expirar el snapshot no
  las bloquea en la práctica.

**Implementación** (`Encargo_Implementacion_Mapeo_Gravity_CreateProject_y_Cierre_P3_v1_0.md` →
`Cierre_Implementacion_Mapeo_Gravity_CreateProject_y_Cierre_P3_v1_0.md`), **verificada por Control leyendo
los tres archivos completos y trazando a mano la ejecución de `Evaluate()`, no por el reporte del cowork:**
`"create_project"` agregado a `PermissionsV1` y a `BuiltinRoles[RoleMaster]` en `internal/authority/roles.go`
(único, no a `specialist`/`operator`), con el comentario `NOTA` explicando por qué `create_organization`
queda afuera; `roles_test.go` actualizado (`TestBuiltinCatalogExact`) más dos tests defensivos nuevos
(`TestCreateOrganizationDeliberatelyUnmapped`, `TestCreateProjectMappedOnlyToMaster`); `decision_test.go` con
`TestDecisionEvaluatesCreateProjectForMasterAndDeniesSpecialist`, cuyos dos subtests Control trazó a mano
contra la lógica real de `Evaluate()` (recorrido de membership→assignment→role→permission) y confirmó
correctos: master llega a `permission_granted`, specialist a `permission_not_granted`. Por mtime en el
dispositivo, confirmado que `decision.go`, todo `internal/gravity` y todo `internal/governance` (incluido
`governance/decision`) quedaron exactamente como estaban — cero cambios fuera de los tres archivos
declarados.

**Límite honesto, igual que en las rondas anteriores:** el shell del dispositivo no respondió en ningún
intento de esta ronda (ni del cowork ni de Control) — el cowork corrió `go test` contra un mirror del árbol
real, no contra el repo en disco directamente; los archivos sí se escribieron sobre el repo real
(`device_commit_files`). Control no pudo re-ejecutar `go test` por su cuenta; la verificación de Control es
de código y de trazado lógico manual de la nueva prueba, no de una segunda corrida independiente.

**Con esto, P3 y el mapeo Gravity de §Z.15 quedan cerrados** — con el alcance real que resultó (`create_project`
mapeado, `create_organization` deliberadamente no, P3 cerrado sin tocar el motor de decisión).

## §Z.20 — `InstallShadow` activado en producción (primer ítem de la lista `remote_enforced`)

José pidió activar `InstallShadow` en un punto real, puramente observacional, sin gatear nada. Control
investigó dónde: el único call site real de `AuthorizeGravityNodeCreation` es `EnsureGravityMandateNodeActivity`
(para `create_project`; `create_organization` sigue sin mapear), que corre dentro del worker de Temporal
(`nucleus worker start`, `worker.go`). Al preparar el diseño exacto, Control encontró que el wrapper existente
`governance.InstallAuthorityShadow` no se puede usar desde ahí: `internal/governance/org_switch_guard.go` ya
importa `orchestration/temporal`, así que instalar el shadow desde `internal/governance` habría cerrado un
ciclo de imports (`temporal → governance → temporal`). Se corrigió antes de mandar el encargo: el código nuevo
vive en `internal/governance/decision` (el mismo paquete de `InstallShadow`), que no importa `orchestration/
temporal` en ningún lado.

José decidió, vía `Propuesta_Diseno_Activacion_InstallShadow_v0_1.md`, que el `PrincipalID` de la evaluación
remota reuse el owner real de `.ownership.json` (el mismo fundamento de autoridad que ya usa la decisión
local) en vez de instalar un shadow "smoke test" con `Request: nil`.

**Implementación** (`Encargo_Implementacion_Activacion_InstallShadow_v1_0.md` →
`Cierre_Implementacion_Activacion_InstallShadow_v1_0.md`), **verificada por Control leyendo los tres archivos
completos contra el repo real, no por el reporte del cowork:** `internal/governance/decision/
shadow_activation.go` y `shadow_activation_test.go` (nuevos) coinciden byte a byte con el encargo;
`worker.go` tiene el import y la instalación insertados en el punto exacto especificado, inmediatamente antes
de `mandateWorker.Start()`; `decision.go` sin tocar (mismo mtime/tamaño de siempre). Por mtime, confirmado que
ningún otro archivo de `internal/authority`, `internal/gravity` ni el resto de `internal/governance`/
`internal/orchestration/temporal` fue tocado. El cowork agregó, tras un pedido posterior de homologación de
logging, una línea reusando el logger `ORCHESTRATION` ya activo en ese mismo arranque — verificado que no crea
stream ni comando CLI nuevo (un solo `init()`/`RegisterCommand` en todo el archivo, el preexistente).

**Nomenclatura:** por regla de proyecto (instrucción directa de José), ningún archivo/función/comentario nuevo
de este ciclo usa el término en inglés que antes se asociaba a este tipo de arranque de configuración —
verificado con grep case-insensitive sobre los dos archivos nuevos, 0 coincidencias. Queda un uso preexistente
y sin relación de ese término en `worker.go` (un paquete importado, `EnsureSystemHealthSchedule`, no tocado por
este encargo) — señalado para José, no resuelto acá por estar fuera de alcance.

**Límite honesto, igual que en las rondas anteriores:** el shell del dispositivo no respondió en ningún intento
de esta ronda (mismo error de siempre), ni para el cowork ni para Control. No se pudo correr `go build ./...`/
`go vet ./...`/`go test ...` de forma independiente — queda abierto hasta que alguien lo corra en un entorno
con acceso real.

**Efecto neto:** `InstallShadow` queda activo en producción. Cada `create_project` sigue gateado únicamente por
la decisión local real; además, se evalúa y registra (en `observation.json`, legible con `nucleus authority
observation`) una decisión remota observacional. Ningún camino de gating cambió — `remote_enforced` sigue sin
ser un valor alcanzable de `AuthorityMode`.

### Qué quedaba para `remote_enforced` al cierre de §Z.20

De los tres ítems nombrados en §Z.19, ese cierre resolvió el primero. Quedaban dos, sin encargo en curso —
uno de ellos (`create_organization`) es el que dispara todo el trabajo de §Z.21.

## §Z.21 — Sovereign Tenant: Fases 1-4 cerradas (Backend/Batcave), Fase 5 (Nucleus) parcial al cierre de esta sección — completada en §Z.22

José pidió reabrir `create_organization` (Opción B: reconciliar identidad, no dejarlo como límite permanente)
y, en paralelo, cowork BACKEND propuso y José aprobó una arquitectura nueva — **Sovereign Tenant**: un Tenant
como agrupador de múltiples Organizaciones, sin tocar el modelo de autoridad interno de cada una. Confirmado
por grep exhaustivo (Control): no existe una figura de "tenant" separada de "organización" en ningún lado
previo del sistema — la organización actuaba directamente como el límite de tenancy.

**Nota de secuencia (aclarada en §Z.22):** en paralelo a este pedido, `Propuesta_Diseno_Mapeo_CreateOrganization_
v0_1.md` había recomendado una Opción A (cerrar `create_organization` como límite permanente, puramente
documental) con un `Encargo_Documentacion_Cierre_CreateOrganization_v1_0.md` ya redactado. José, al pedir
reabrir con Opción B, superó esa recomendación — ese encargo de Opción A nunca se ejecutó y queda obsoleto,
no como "pendiente".

### Reconciliación de identidad de organización (Control) — base de todo lo demás

Control investigó el mapeo de `create_organization` y encontró dos sistemas de identidad de organización
desconectados: el `org_<timestamp>` local de `.ownership.json` (el único que gatea creación hoy) y el
`organizationId` real del Backend en `state.json`/`config/nucleus.json` (el único contra el que
`DecisionEvaluator.Evaluate` valida). `create_organization` sigue sin poder mapearse (mismo problema de orden
temporal ya documentado: no existe un momento evaluable entre "la organización todavía no existe" y "ya se
creó"), pero Control diseñó y una sesión de Génesis Control implementó la reconciliación de identidad en sí:
`Organization.CanonicalID`/`Binding`/`TrustBinding` (ya existían en `ownershipcontract/schema.go`, con
`Validate()` ya escrito, pero sin ningún escritor de producción) ahora se llenan de verdad, vía
`ReconcileCanonicalOrganization` (`internal/governance/ownership_reconciliation.go`), enganchada en el caso
`"sync"` de `authority_command.go` — con backfill automático para instalaciones ya vinculadas en su próximo
sync de rutina, sin comando nuevo.

### Sovereign Tenant Fases 1-4 (Backend + Batcave): cerradas

Backend: schema inerte (`tenants`, `organizations.tenant_id`, backfill 1:1 — Fase 1); génesis crea tenant +
organización atómicamente (Fase 2); `createOrganizationUnderTenant` + rutas para organizaciones hermanas
dentro de un tenant, reusando `createInitialAuthorityEmission` (Fase 3). Batcave: `discoverTenant()` +
proxy de lectura (Fase 4). Las cuatro fases, con sus propios tests en verde reportados por cowork BACKEND —
Control no re-verificó código de TypeScript/Batcave de estas cuatro fases directamente (fuera del alcance de
esta sesión, que trabaja del lado Nucleus/Go).

## §Z.22 — Sovereign Tenant Fase 5 (Nucleus) cerrada de punta a punta: `TenantID` es de primera clase en `Validate()`

Continuando §Z.21: José dio una directiva arquitectónica explícita — Tenant debe ser un elemento de primera
clase del modelo de identidad, no un ajuste aislado de sincronización. Control verificó que el diseño
entonces vigente contradecía exactamente eso (`TenantID` podía faltar en silencio para siempre) y, tras
encontrar que `Validate()` corre en cada lectura de `.ownership.json` (no sólo al sincronizar), publicó una
secuenciación (`Propuesta_Secuenciacion_Endurecimiento_Validacion_TenantID_v0_1.md`) y, con la confirmación
de José de que todas las instalaciones reales son de prueba/suyas, el encargo ejecutable
(`Encargo_Implementacion_Endurecimiento_Validacion_TenantID_v1_0.md`).

**Paso 0 + fix de autenticación — cerrados en §Z.21, sin cambios acá.**

**Endurecimiento de `Validate()` — cerrado.** José reportó dos veces haber aplicado el encargo, corrido los
tests en verde y commiteado; Control verificó `schema.go`/tests contra el repo real ambas veces y encontró
los archivos sin tocar — José confirmó el mix-up y pidió explícitamente que Control aplicara el cambio
directo con sus propias herramientas. **Control implementó el endurecimiento él mismo**, editando y
commiteando directo a la máquina de José vía bridge de dispositivo, verificado releyendo el contenido real
después de cada escritura (no confiando en la respuesta del commit):

- `ownershipcontract/schema.go`: `Validate()` ahora exige `Organization.TenantID` no vacío para `BOUND`/
  `REMOTE_LOCKED`, mismo nivel que `CanonicalID` — sin excepción ni modo de gracia. Nuevo mensaje de error:
  `"ownership: bound state requires canonical identity, tenant and trust binding"`.
- `ownershipcontract_test.go`: `TestValidateAcceptsBoundDocumentWithAndWithoutTenantID` (obsoleto, describía
  el comportamiento viejo) reemplazado por `TestValidateRequiresTenantIDForBoundDocument`.
- `ownership_reconciliation_test.go`: nuevo `TestReconcileCanonicalOrganizationFailsFirstBindWithoutTenant`
  — primer bind sin tenant debe fallar y dejar el documento en su estado previo, nunca `BOUND` sin tenant.

Al correr la suite completa, José reportó dos fallos esperados — colateral correcto del endurecimiento, no
un defecto: `TestOwnershipModeBindingMatrixAndNoLegacyAfterCutover` (`ownership_migration_test.go`) y
`TestNormalizeAndEffectiveLegacyView` (`ownershipcontract_test.go`) construían documentos `BOUND`/
`REMOTE_LOCKED` de prueba sin `TenantID`, para ejercitar otra cosa (matriz modo/binding, corte de legacy
authority en `remote_enforced`) — no la regla de tenant. Control parcheó ambos inyectando un `TenantID` de
prueba (`"tenant-test"`), verificados de la misma forma (edición directa + commit + relectura desde el
dispositivo real).

**Verificación final: `go build ./internal/governance/... && go vet ./internal/governance/... && go test
./internal/governance/...` — verde**, corrido por José en su entorno local tras el segundo parche. `gofmt -l`
y el grep de nomenclatura (0 coincidencias del término prohibido) se corrieron en cada archivo antes de cada
commit.

**Verificación de comandos Cobra y telemetría (pedido explícito de José, post-cierre):** ninguno de los
archivos nuevos de este ciclo (`ownership_reconciliation.go`, `internal/authority/tenant_fetch.go`, tests)
define comandos — son funciones de librería puras invocadas desde el `case "sync"` del comando `authority` ya
existente y ya registrado bajo `GOVERNANCE`. No hay categoría ni comando nuevo que autodescubrir. El logging
de esta operación (tenant lookup, inyección en `nucleus.json`, reconciliación) vive en el caller
(`authority_command.go`) y reutiliza el stream de telemetría ya existente `nucleus_governance`
(`core.InitLogger(&c.Paths, "GOVERNANCE", ...)`, mismo mecanismo interno que usa `nucleus telemetry
register`) — no se creó stream nuevo ni archivo de log aparte.

**Con esto, Sovereign Tenant queda cerrado de punta a punta: Fases 1-4 (Backend/Batcave) y Fase 5 (Nucleus,
incluido el endurecimiento de `Validate()`) verificadas.** `TenantID` es ahora un campo de primera clase del
modelo de identidad, tal como pidió José — ya no puede faltar en silencio en ningún documento `BOUND`/
`REMOTE_LOCKED`.

### Qué quedaba para `remote_enforced` al cierre de §Z.22

De los tres ítems que quedaban al cierre de §Z.20/§Z.21, el endurecimiento de `Validate()` (tercer ítem,
"para que Tenant deje de ser puramente informativo") quedó resuelto con ese cierre. Quedaban dos, ninguno con
encargo en curso — ambos resueltos en §Z.23.

## §Z.23 — `create_organization` cerrado definitivamente y señal de `InstallShadow` para `create_project` corregida

José pidió retomar los dos ítems que quedaban abiertos al cierre de §Z.22: reabrir la investigación de
`create_organization` ahora que la reconciliación de identidad de Fase 5 ya está construida, y — si de ahí
salía algo accionable — encargarlo.

### `create_organization`: investigación, cierre definitivo (no un pendiente más)

`Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md` confirmó, leyendo el código real de
`decision.go`, `governed_creation.go`, `shadow_activation.go` y `authority/decision.go`, que la reconciliación
de identidad **no destraba el mapeo** — dos motivos independientes, cualquiera de los dos ya alcanza:

1. **Orden temporal** (ya documentado desde §Z.15/§Z.19): `Evaluate()` exige un `state.json` ya aceptado,
   atado a un `Binding.OrganizationID` conocido; ese `state.json` sólo existe después de que la organización
   ya se creó en el Backend. No hay momento evaluable entre "la organización no existe" y "ya se creó".
2. **Scope estructuralmente vacío** (hallazgo nuevo de esta investigación): `authorizeGravityNodeCreationLocal`
   rechaza cualquier `parentID` para `create_organization` — por diseño, es la raíz del árbol de Gravity, no
   un hijo de nada. Como `shadowDecisionRequest` sólo armaba `Scope` cuando había `parentID`, `Evaluate()`
   habría devuelto siempre `scope_invalid`, sin comparar organización alguna — mapearla hoy sería un permiso
   permanentemente inerte, no un mapeo parcial.

José confirmó cerrar `create_organization` como límite permanente con estos motivos actualizados. Control
reescribió el `NOTA` de `roles.go` citando los tres motivos (identidad, orden temporal, Scope vacío) en vez
del comentario viejo que citaba la Propuesta P3 y usaba el término prohibido del proyecto (removido);
actualizó también `roles_test.go` (`TestCreateOrganizationDeliberatelyUnmapped`) para citar la investigación
nueva. `PermissionsV1`/`BuiltinRoles` quedaron byte-idénticos — sólo cambió el comentario. Verificado contra
el dispositivo real, `gofmt -l` limpio, grep de nomenclatura sin coincidencias.

**Este ítem deja de contar como "pendiente hacia `remote_enforced`"** — es una decisión de diseño cerrada,
documentada en código, no un gap a resolver más adelante.

### Hallazgo colateral: `create_project` comparaba contra el id equivocado en la evaluación shadow — corregido

La misma investigación encontró que `shadowDecisionRequest` armaba `Scope.ID` de `create_project` con el
`org_<timestamp>` local (Sistema A, sólo sirve para la estructura del árbol de Gravity) en vez del
`organizationId` real del Backend (Sistema B, lo único que `DecisionEvaluator.Evaluate` compara). Nunca
podían coincidir — `InstallShadow` (activo en producción desde §Z.20) llevaba desde entonces llenando
`observation.json` de `scope_outside_binding` estructuralmente falso, no de señal real. Ahora que
`Organization.CanonicalID` ya está reconciliado (Fase 5), el fix es directo.

`Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md` confirmada por José (§3: `Scope.ID`
debe venir de `CanonicalID`, no del id local) →
`Encargo_Implementacion_Correccion_ScopeID_CreateProject_InstallShadow_v1_0.md` → implementado directamente
por Control (mismo patrón que Fase 5) →
`Cierre_Implementacion_Correccion_ScopeID_CreateProject_InstallShadow_v1_0.md`.

**Implementación verificada por Control código real contra el dispositivo, no el reporte:**
`shadow_activation.go` — `shadowDecisionRequest` arma `Scope.ID` desde `analysis.Canonical.Organization.
CanonicalID` cuando `parentID != nil`; `shadow_activation_test.go` — test existente corregido + dos tests
nuevos (caso feliz, guardia defensiva para `create_organization`).

**Desviación real encontrada por el propio test que el encargo pedía:** el diff especificado en el encargo
tenía un bug — la condición chequeaba sólo `CanonicalID`, sin `parentID != nil`, así que `Scope` se poblaba
también para `create_organization` (que siempre pasa `parentID = nil`), reintroduciendo exactamente el tipo
de señal falsa que este mismo encargo buscaba eliminar. `TestShadowDecisionRequestScopeEmptyForCreateOrganization`
lo agarró en la primera corrida de José. Control corrigió el diff (restauró `parentID != nil` en la
condición, sin cambiar el diseño ya confirmado — `parentID` sigue sin decidir el *valor* de `Scope.ID`, sólo
si la operación tiene noción de scope en absoluto), verificó a mano los 4 tests contra la lógica corregida,
y confirmó en verde en la segunda corrida de José:

```
go build ./internal/governance/... && go vet ./internal/governance/... && go test ./internal/governance/...
ok  	nucleus/internal/governance	3.610s
ok  	nucleus/internal/governance/decision	0.018s
ok  	nucleus/internal/governance/ownershipcontract	(cached)
```

`gofmt -l` limpio y grep de nomenclatura sin coincidencias en ambas rondas.

**Efecto neto:** `observation.json` ahora registra, para cada `create_project`, señal real contra el id que
`DecisionEvaluator.Evaluate` de verdad compara. `create_organization` sigue, correctamente, sin `Scope`
nunca. Ningún camino de gating cambió — `InstallShadow` sigue puramente observacional.

### Qué queda para `remote_enforced`

De los dos ítems que quedaban al cierre de §Z.22, ambos quedan resueltos con esta sección: `create_organization`
como decisión permanente cerrada (ya no cuenta como pendiente), y la señal de `InstallShadow` corregida.
Queda un único ítem abierto:

1. **Gap de "ProjectID productor real"** — ningún componente del pipeline produce hoy un `ProjectID` estable;
   `EnsureGravityMandateNodeActivity` falla cerrado sin él. Documentado en profundidad en
   `Investigacion_Already_Orrery_Location_Infraestructura_v0_3_Addendum.md` §2.3/§4 como "el gap de mayor
   apalancamiento de todo el research" — bloquea en cadena PROJECT → MANDATE-en-Gravity → SESSION →
   resolución de Postures activas. Sin encargo de implementación todavía, sólo investigación. Frente:
   **Orbital/Gravity**, alcance mayor, no relacionado con la identidad de organización.

## §Z.24 — Claim/binding canónico de ProjectID y cutover a `remote_enforced`: cerrado

Génesis Control auditó independientemente el código real, el diff completo y el flujo de punta a punta:

`nucleus.json → claim S2S firmado → evidencia canónica Backend → receipt diagnóstico local → cutover REMOTE_LOCKED/remote_enforced → gate Gravity PROJECT`.

### Identidad y claim canónico

Conductor conserva la experiencia offline-first y continúa generando localmente el UUID del proyecto. En el siguiente ciclo de sincronización, Nucleus descubre todos los proyectos de la organización activa desde `nucleus.json` y presenta cada UUID al Backend mediante una petición S2S firmada con la instalación Ed25519 autenticada.

Backend adopta el UUID mediante `PUT /v1/authority/projects/{project_id}/claim`. La persistencia establece unicidad global e inmutabilidad del claim, resuelve organización y tenant desde la identidad autenticada —nunca desde datos declarados por el cliente— y crea atómicamente la evidencia canónica correspondiente.

Las carreras concurrentes convergen en un único claim. Una reclamación cruzada entre organizaciones falla con conflicto y nunca libera ni reasigna el UUID original.

### Replay multiinstalación y evidencia operativa

Una segunda instalación activa de la misma organización puede reproducir el claim sin exigir que el `source_ref` original le pertenezca. El claim conserva la instalación originaria y Backend sólo responde `already_claimed` después de garantizar que exista exactamente una evidencia operativa compatible.

La evidencia ausente se reconstruye, la vencida puede renovarse mediante replay autorizado y la revocada nunca se reactiva. Actualizaciones de cero filas, evidencia contradictoria, tenant divergente y reclamaciones cruzadas fallan cerrado.

`GET /v1/authority/projects/{project_id}/binding` entrega únicamente evidencia viva, canónica, vigente y coincidente con claim, organización y tenant. La petición está autenticada y firmada sobre el path exacto.

### Receipts locales

Nucleus conserva `project-bindings.json` únicamente como recibo diagnóstico del resultado del claim. El receipt no contiene `principal_id`, no es leído por el gate y no puede conceder identidad, permiso ni autoridad aunque sea editado localmente.

La única fuente de autoridad efectiva para el binding de un proyecto es la evidencia viva obtenida del Backend mediante el canal S2S autenticado.

### Cutover

El cutover exige evidencia concreta y coincidente de:

- organización y tenant canónicos;
- issuer y trust binding;
- snapshot aceptado y vigente;
- checkpoint consistente con versión y digest del snapshot;
- principal canónico único con `create_project`;
- conjunto exacto de proyectos locales;
- binding Backend vivo y vigente para cada proyecto requerido.

Ante cualquier ausencia o contradicción, `.ownership.json` permanece byte a byte intacto. Cuando todas las precondiciones se cumplen, una única escritura atómica publica simultáneamente:

- `AuthorityMode = remote_enforced`;
- `Binding.State = REMOTE_LOCKED`;
- `RemoteLockedAt`;
- eliminación completa de `LegacyAuthority`.

El cutover es idempotente.

### Gate efectivo de Gravity

En `remote_enforced`, toda operación Gravity `PROJECT` pasa obligatoriamente por el gate remoto, incluso cuando el nodo PROJECT ya existe.

El gate:

- vuelve a validar `.ownership.json`, identidad, tenant y trust binding;
- carga el snapshot/checkpoint aceptado;
- resuelve el principal exclusivamente desde el estado canónico;
- obtiene binding vivo desde Backend;
- valida estado `bound`, organización, tenant, proyecto, revisión, evidencia canónica, `source_ref`, `ClaimedAt`, `CheckedAt` y `ValidUntil`;
- aplica una tolerancia explícita de clock skew de un minuto;
- captura T1 después del GET S2S;
- evalúa binding, snapshot, membresías, roles, ventanas de validez y revocaciones contra T1;
- sólo concede una decisión sellada con base `remote_authority`.

Una autoridad válida durante la latencia continúa autorizada. Un snapshot vencido o una revocación efectiva en T1 fallan cerrado. Transporte, expiración, revocación, conflicto, identidad ambigua, estado ausente y permisos insuficientes preservan causas estables.

No existe fallback a `local_legacy` desde `remote_enforced`. Una falla de resolución, lectura, análisis o verificación termina en denegación.

`create_organization` permanece deliberadamente fuera del mapeo remoto como límite arquitectónico permanente establecido en §Z.23.

### Validación independiente

- Backend project-claim: 25/25.
- Paquetes Nucleus Authority, Core, Governance, Decision, Gravity y Activities: verdes.
- Pruebas integradas de sync, cutover y PROJECT preexistente: verdes.
- `go vet` de Authority, Governance y Decision: verde.
- `gofmt` y `git diff --check`: limpios.

**Resultado:** el gap del “ProjectID productor real” queda cerrado y la arquitectura alcanza formalmente el estado `remote_enforced`.

## §Z.25 — Mandate Genesis: aceptación E2E real lograda; bloqueo Vault/AITAP resuelto (gate local `core.RoleMaster`, sin relación con `remote_enforced`)

José pidió, en handoff directo ("Estado real de Mandate Genesis"), diagnosticar en modo sólo lectura el único
bloqueador registrado para aceptar el primer Mandate Genesis real: AITAP no podía resolver la referencia de
credencial Anthropic vía Nucleus Vault. Ownership del hallazgo: GENESIS CONTROL. Explícitamente fuera de
alcance para esta ronda: OpenCode, Orrery/Location, ASM, Monitor, Genes, Gravity, refactor general de AITAP,
rediseño de Genesis/Vault/Remote Authority.

### Diagnóstico (código real, no el reporte)

`installer/aitap/src/aitap/vault/client.py::VaultClient.resolve()` ejecuta `nucleus --json vault request
anthropic-key:default` como subproceso. El gate (`installer/nucleus/internal/vault/vault.go::
createVaultRequestCommand`) exige `core.GetUserRole() == core.RoleMaster`; `core.GetUserRole()`
(`internal/core/metadata.go::detectUserRole`) es un chequeo puramente **local**: busca el marcador `.master`
dentro del nucleus root que resuelve `ResolveNucleusRoot`, y cae cerrado a `RoleUnknown` si no puede resolver
ningún workspace — mismo mensaje de error que un rechazo real ("requires master role").

El marcador `.master` se crea correctamente en el onboarding (`nucleus create --master` →
`activateMasterMarkerAndOwnership`, `internal/governance/ownership.go`) — esa mitad del mecanismo nunca fue
el problema. El punto material de ruptura: Brain corre como servicio TCP persistente
(`brain_poller.go` confirma que escucha en `127.0.0.1:5678`), arrancado por `startBrainServer()`
(`internal/supervisor/service.go`) sin `cmd.Env` explícito — hereda el entorno del proceso Nucleus que lo
lanza (típicamente sin `BLOOM_NUCLEUS_PATH` bajo systemd/NSSM). Todo lo que Brain shellea después (AITAP, y
el `nucleus vault request` que AITAP invoca) hereda ese mismo entorno vacío, así que `ResolveNucleusRoot`
nunca encuentra el `.bloom/.nucleus-{slug}/` real y Vault rechaza al dueño legítimo de la máquina. Mismo
patrón ya diagnosticado y corregido dos veces en el mismo archivo (`CheckVaultStatus()`, spawn de
`bundle.js`/API, ambos con comentario propio fechado 2026-08-12) — nunca aplicado al spawn de Brain.

No se propuso ni se creó ningún mecanismo nuevo de autoridad ("Bootstrap" u otro): la corrección propaga un
mecanismo ya existente (`BLOOM_NUCLEUS_PATH` vía `getWorkspacePath()`, ya definido en `dev_start.go`) al único
punto donde nunca llegaba.

### Implementación

José aprobó el diagnóstico y autorizó la corrección mínima. **Implementada por Control directamente sobre el
dispositivo real**, verificada releyendo el contenido byte a byte después del commit (no confiando en la
respuesta del commit): `internal/supervisor/service.go`, `startBrainServer()` — una línea, mismo patrón ya
probado en el archivo:

```go
cmd.Env = append(os.Environ(), "BLOOM_NUCLEUS_PATH="+getWorkspacePath())
```

Ningún otro archivo tocado.

### Validación

`go build ./internal/supervisor/... && go vet ./internal/supervisor/...` — verde, corrido por José. Criterio
de Aceptación E2E (definido por José, cumplido en este orden): reinicio completo de servicios (para que Brain
levantara ya con el entorno corregido) → creación de un Mandate Genesis real contra Anthropic → Vault autorizó
la credencial → reinicio de servicios a mitad de la corrida, continuidad verificada sin pérdida de estado ni
duplicación de operaciones. José declaró la prueba E2E **ACEPTADA**.

Cierre completo: `Cierre_Diagnostico_Correccion_Bloqueo_E2E_Mandate_Genesis_AITAP_Vault_v1_0.md`.

### Alcance y no-alcance

Esto resuelve exclusivamente el gate **local** `core.RoleMaster` de Vault para el proceso Brain y todo lo que
Brain shellea — un mecanismo enteramente distinto y sin relación con `AuthorityMode`/`remote_enforced`
(Sovereign Tenant, §Z.15–§Z.23; cutover cerrado en §Z.24). No se tocó `internal/authority`,
`internal/governance/decision` ni ningún camino de `AuthorizeGravityNodeCreation`; ese invariante sigue
intacto tal como lo dejó §Z.24. Esta corrida E2E no autoriza cutover adicional, despliegue general ni
provisión de credenciales fuera de este caso puntual.

**Efecto neto:** Mandate Genesis real, contra Anthropic, queda operativo de punta a punta — lifecycle durable
de `ing`, canal Brain↔AITAP para `dis.mapping`, persistencia, reinicio y replay sin duplicación (ya validados
en rondas controladas previas) más, ahora, la resolución productiva de la credencial Anthropic vía Nucleus
Vault y la aceptación funcional completa de una corrida real aislada.
