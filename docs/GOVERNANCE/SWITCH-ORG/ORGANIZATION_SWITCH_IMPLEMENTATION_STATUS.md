# Estado de implementación — `SWITCH_ORGANIZATION` / `ORGANIZATION_SWITCHED`

## Propósito y fuente de verdad

Este documento registra la auditoría, las decisiones de implementación y el estado verificable del feature. La arquitectura vigente está en `ORGANIZATION_SWITCH_ARCHITECTURE.md` y el contrato estable de mensajes en `ORGANIZATION_SWITCH_PROTOCOL.md`.

La decisión vigente es el **modelo single-org activa con drenado** (G1-G8), no instancia-por-organización. Si una nota histórica de este documento contradice la arquitectura vigente, prevalece `ORGANIZATION_SWITCH_ARCHITECTURE.md`.

No hagas lo que la sesión de investigación evitó hacer a propósito: no completes un gap con una suposición razonable. Si un archivo pedido acá no existe o no se puede compartir, decilo explícitamente y seguí con lo que sí hay.

---

## 1. Estado confirmado — qué ya se auditó contra código real (no contra spec ideal)

| Pieza | Archivo real | Estado confirmado |
|---|---|---|
| Resolución de org — mecanismo A | `internal/core/org_context.go` (`ResolveNucleusRoot`) | Usa `BLOOM_ORG` (env var del proceso). Usado por Vault y Ownership. Nadie confirmado que la *escriba* — solo lecturas encontradas. |
| Resolución de org — mecanismo B | `internal/supervisor/service.go` (`LoadNucleusConfig`) + `src/utils/org-resolver.ts` (`resolveOrganization`/`resolveOrg`) | Escaneo de filesystem hacia arriba desde CWD, exige exactamente una carpeta `.nucleus-*`. Go y TS **ya están reconciliados entre sí** (confirmado en comentarios del propio `org-resolver.ts`). Usado por Mandates. |
| G2 (`can-switch-org`) | `internal/orchestration/workflows/system_gate.go` | **No existe.** `SystemGateWorkflow` es un primitivo genérico de espera de condición con timeout — reusable como building block, no es G2. |
| G3 (qué es "in-flight") | `internal/orchestration/workflows/mandate_execution_workflow.go` | **No existe.** `MandateExecutionWorkflow` es placeholder confirmado por comentario propio del código ("esqueleto puro", Fase 4 sin implementar). No hay estados terminal/no-terminal que consultar. |
| G4 (lock de drenado) | — | **Sin candidato confirmado en ninguna capa.** No se encontró ningún archivo con lógica de lock/flag `draining`. |
| G5 (Vault scope) | `internal/vault/vault.go` | Confirmado como riesgo real: `RequestKey`/`SetKey`/`DeleteKey` no reciben `org_id` como parámetro explícito — dependen de `ResolveNucleusRoot("")`, es decir, del mecanismo A. |
| G7 (paths) | `internal/core/org_context.go` | Resuelto — es la única fuente de verdad de paths para el mecanismo A. `paths.go` y `registry.go` fueron descartados como falsos candidatos (son infraestructura de instalación y registro de comandos CLI, respectivamente — no tocar por este feature). |

**El bloqueo real no es falta de información — es que dos piezas de infraestructura que este feature necesita (G1/G3, G4) todavía no están construidas**, y una tercera (resolución de organización) tiene dos mecanismos que no se hablan entre sí.

---

## 2. Plan por etapas — ejecutar en este orden, no saltear

### Etapa 1 — Contrato de mensajes en los manifests (implementable ahora, sin dependencias)

**Objetivo:** declarar `SWITCH_ORGANIZATION`, `ORGANIZATION_SWITCH_STATUS` y `ORGANIZATION_SWITCHED` en el protocolo Synapse, con el shape ya definido en `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` §11.4, sin implementar lógica de negocio todavía.

**Archivos a pedir y tocar** (según `installer/cortex/extension/` y `brain/core/profile/web/templates/discovery/`):
- `installer/cortex/extension/protocols/discovery.schema.json` — declarar los tres mensajes en `messages` **y** en `observable_events` según corresponda. Confirmar explícitamente cuáles van en cada lista antes de escribir — no asumir por simetría con otros mensajes existentes.
- `brain/core/profile/web/templates/discovery/discoveryProtocol.js` — el SynapseSimulator carga este manifest manual **con prioridad sobre el JSON** (confirmado en comentario propio del archivo, líneas ~382-399, "HALLAZGO 2026-07-17"). Si se declara el mensaje solo en el `.schema.json` y no acá, es un evento zombie de manual — declarar en los dos, sin excepción.
- `installer/cortex/extension/background.js` — confirmar si hace falta registrar el mensaje en `REGISTERED_HANDLERS`/`forwardToHost()` para que efectivamente se despache, o si eso es automático a partir del schema.

**Criterio de verificación de esta etapa:** el SynapseSimulator (`synapse-simulator/index.html`, dev-only) debe poder simular `SWITCH_ORGANIZATION` y ver los tres eventos aparecer en su UI de "Protocols" sin que nada del otro lado responda todavía (no hay lógica real aún) — eso confirma que no quedó zombie.

**No incluir en esta etapa:** ningún cambio en `main_conductor.js`, `workspace-synapse-handlers.js`, `milestone-registry.js` ni `milestone-reactor.js`. Eso es Etapa 5.

---

### Etapa 2 — Unificar resolución de organización (bloquea todo lo que sigue)

**Objetivo:** decidir y ejecutar una de estas dos opciones — no queda a criterio de quien implemente, tiene que confirmarse antes de tocar código:

- **Opción A:** deprecar `BLOOM_ORG` / `ResolveNucleusRoot()` en favor del mecanismo de filesystem-scan (`LoadNucleusConfig`/`resolveOrganization`), migrando Vault y Ownership a consultarlo.
- **Opción B:** construir un adaptador único que ambos mecanismos consulten, de forma que cambiar la organización activa por cualquiera de los dos caminos sea consistente para el otro.

**Antes de elegir, confirmar con código (no está en los archivos ya auditados):**
1. ¿Quién escribe `BLOOM_ORG` hoy? Solo se confirmaron lecturas (`vault.go`, `ownership.go`) — buscar `os.Setenv("BLOOM_ORG"` o el proceso que lanza `nucleus` con esa variable seteada (candidato: algo en Conductor, tipo `spawn`/`exec` con env explícito).
2. Si nadie la escribe todavía, la Opción A es probablemente más simple — no hay migración de un mecanismo activo, es directamente adoptar el que ya funciona.

**Archivos a tocar según la opción elegida:**
- Opción A: `internal/core/org_context.go`, `internal/vault/vault.go`, `internal/governance/ownership.go` — reemplazar las llamadas a `ResolveNucleusRoot("")` por el mecanismo de scan. Ojo: `LoadNucleusConfig()` depende de CWD o de `BLOOM_NUCLEUS_PATH` — confirmar que Vault/Ownership corren en un proceso con CWD válido (no es obvio si corren como daemon).
- Opción B: nuevo archivo adaptador (ubicación a definir junto con quien tenga autoridad de arquitectura) que ambos mecanismos consulten como fuente única.

**Criterio de verificación:** un test que cree dos organizaciones locales de prueba, cambie el contexto activo por el mecanismo elegido, y confirme que **tanto** una operación de Vault **como** una operación de Mandates ven la misma organización activa después del cambio.

---

### Etapa 3 — Tracking real de estado en Mandates (condición previa de G1/G3)

**Objetivo:** que `MandateExecutionWorkflow` deje de ser placeholder para el propósito mínimo que este feature necesita: exponer si hay Actions en estado no-terminal.

**Alcance explícitamente acotado** — no es "completar la Fase 4 de Mandates" (eso es un trabajo mayor, fuera de este feature):
- Agregar un campo de estado por `DomainAction` (terminal / no-terminal), persistido de forma consultable — no solo en memoria del workflow.
- No implementar la lógica real de ejecución de cada Action (scaffold, dependencias vía `DependsOn`) — eso sigue siendo P4, fuera de scope, tal como ya estaba marcado en el propio código antes de esta sesión.

**Archivo a tocar:** `internal/orchestration/workflows/mandate_execution_workflow.go`. Pedir también `mandate_genesis_activities.go` (mencionado en el comentario de `DependsOn` como donde se resuelven las dependencias) antes de tocar este archivo, para no duplicar tipos que ya existan ahí.

**Criterio de verificación:** una query (`workflow.Query` de Temporal, o el mecanismo que G1 termine usando) que devuelva `true`/`false` para "¿hay algo no-terminal para esta organización?" contra un Mandate real en ejecución de prueba.

**Nota de implementación (pivote aprobado por el usuario, ver `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3.md`):**
El alcance original de esta Etapa 3 (arriba) proponía un campo de estado por `DomainAction` dentro de `MandateExecutionWorkflow`. Se descartó esa vía al confrontar el roadmap maestro de Mandate Genesis: ese documento marca explícitamente Fase 4/`MandateExecutionWorkflow` como "sin cambios de esta migración" y anticipa una reescritura real de Fase 4 impulsada por los Intents `ing/`/`dis/` — tocar `DomainAction` acá habría generado colisión directa con ese trabajo futuro. El roadmap también confirma, en su tabla de deuda (D-21) y en §9, que la precedencia `BLOOM_NUCLEUS_ROOT → BLOOM_ORG → scan` (Etapa 2 de este documento) es la única fuente de verdad esperada para la org activa — validando que Etapa 2 era prerequisito real, no solo local a este feature.

Implementación final, sin tocar `DomainAction`/`MandateExecutionWorkflow`/`mandate_genesis_build_workflow.go`:
- `internal/orchestration/temporal/temporal_client.go`: `Client.HasNonTerminalMandateWork(ctx, mandatesRoot)` enumera las carpetas bajo el `mandatesRoot` ya resuelto por Etapa 2 (por lo tanto ya scoped a la organización activa) y consulta a Temporal (`DescribeWorkflowExecution`) el estado real de los dos Workflow IDs posibles por mandate (`mandate_genesis_{id}`, `mandate_execution_{id}`). `RUNNING` = no-terminal; `NotFound` = terminal/ausente, no error.
- `internal/orchestration/temporal/temporal_client_test.go`: test de integración real contra Temporal Server local (`localhost:7233`), se salta con `t.Skip` si no hay servidor disponible — arranca un workflow dummy, confirma detección mientras corre, lo señaliza, confirma que deja de detectarse.
- Fuente de verdad para G1/G3: híbrida — índice local (`mandate_state.json`) para saber *qué* mandates existen, Temporal en vivo para saber si están *en curso*. `mandate_state.json` no sirve solo: su campo `status` nunca sale de `"building"` (la señal terminal real es la existencia de `mandate.json`, ver `mandate_genesis_sign_activity.go`).

**Dependencia pendiente con el roadmap maestro:** Etapa 4 (G2/G4) y Etapa 5 de este documento pueden construirse sobre `HasNonTerminalMandateWork` sin más cambios de Fase 4. Pero cuando el roadmap maestro implemente la reescritura real de Fase 4 (Intents `ing/`/`dis/`, ver su §7 item 6), `HasNonTerminalMandateWork` debe revisarse: si Fase 4 real introduce sub-estados por debajo de "workflow completo" (p. ej. un Action fallido pero el workflow padre todavía RUNNING por retry), la señal binaria RUNNING/NotFound de hoy puede quedarse corta. Dejar como ítem abierto para cuando esa reescritura empiece.

---

### Etapa 4 — G2 (`can-switch-org`) y G4 (lock de drenado)

**Objetivo:** implementar las dos guardas sin ningún candidato de código confirmado todavía.

- **G2:** función/query `{ blocked: bool, reasons: [...] }`, construida sobre `SystemGateWorkflow` como primitivo de espera (§ya confirmado que sirve para esto), pero con la condición real siendo "Etapa 3 reporta todo terminal" en vez de un `conditionType` genérico.
- **G4:** flag `draining: true` persistido — no en memoria de un solo proceso, porque un crash durante el drenado no puede dejar el sistema en estado ambiguo indefinidamente (mismo riesgo que marca G3 sobre procesos zombie). Ubicación candidata: junto al mismo lugar donde Etapa 2 terminó consolidando el estado de organización activa — no crear un tercer mecanismo de estado paralelo.

**Antes de escribir código acá:** confirmar con quien tenga autoridad de arquitectura si `internal/orchestration/workflows/` es el lugar correcto para G2, o si debe vivir en `internal/governance/` junto a `ownership.go` — ninguno de los documentos fuente lo resuelve, y es una decisión de una sola vez con impacto en el resto.

**Nota de implementación (decisión confirmada con el usuario esta sesión):**
G2 se implementó como función Go síncrona, no como workflow sobre `SystemGateWorkflow` — ese workflow resuelve "bloqueame hasta que llegue una señal" (lo usa `WaitForSystemReady` al boot), un patrón distinto al que necesita G2 ("decime ahora mismo si está bloqueado y por qué"). `SystemGateWorkflow` queda sin tocar. G2/G4 viven en `internal/governance/org_switch_guard.go` (nuevo archivo, mismo paquete y patrón de persistencia atómica que `ownership.go`/`vault.go`), no en `core/` (que resuelve rutas, no guardas) ni en `orchestration/workflows/`.

- `CanSwitchResult{Blocked, Reasons}` — combina G4 (¿ya hay un drenado en curso?) con G3/Etapa 3 (`temporal.Client.HasNonTerminalMandateWork`, sin reimplementar una segunda forma de listar workflows abiertos).
- `DrainingState` persistido en `draining.json` dentro del mismo `nucleusRoot` que `ownership.json`/`vault.json` (`core.ResolveNucleusRoot("")`), con `BeginDraining(reason)`/`EndDraining()`, escritura atómica (tmp + rename) — mismo criterio de crash-consistency que ya usa `ownership.go`.
- Test en `internal/governance/org_switch_guard_test.go`: round-trip de `DrainingState` y la rama de `CanSwitchOrg` sin Temporal (`tc=nil`). La rama que sí consulta Temporal reusa el test de integración ya escrito en Etapa 3 (`temporal_client_test.go`), no se duplica.

**Pendiente para Etapa 5:** `CanSwitchOrg` todavía no está expuesto por ningún handler — hoy es solo una función Go interna. Etapa 5 debe decidir cómo la consulta el Conductor (IPC/HTTP, lo que ya use el resto de comandos de `nucleus`) y dónde se llama a `BeginDraining`/`EndDraining` dentro del flujo real de switch (G6/G7: `switchActiveOrg()` debe llamar a G2 antes de `getOrCreateOrg`, y a `BeginDraining` si `blocked:false`, no al revés).

---

### Etapa 5 — Handler end-to-end + integración Conductor/Cortex

**Objetivo:** recién acá se conecta la Etapa 1 (contrato ya declarado) con las Etapas 2-4 (infraestructura real). El alcance histórico se conserva aquí como registro; la definición vigente del intercambio está en `ORGANIZATION_SWITCH_PROTOCOL.md`.

**Archivos a tocar** (confirmados en la investigación previa, sección 3.3):
- `installer/conductor/workspace/main_conductor.js` y `installer/conductor/workspace/ipc/workspace-synapse-handlers.js` — los dos call sites de resolución de eventos. Si el switch se engancha en cualquiera de los dos, tocar ambos y mantenerlos sincronizados — no es opcional, es la advertencia §3.4 del prompt original y sigue vigente.
- `installer/conductor/workspace/onboarding/milestone-registry.js` / `milestone-reactor.js` — **solo si** el switch necesita interactuar con el sistema de milestones. Confirmar esto primero, no asumirlo. Si hace falta, usar la separación `_completedSteps`/`_processed` ya existente (semántica AND/OR) — no reintroducir el bug `allBlockingDone` que ya se resolvió una vez.
- `installer/conductor/shared/synapse-bridge.js` — si `ORGANIZATION_SWITCHED`/`ORGANIZATION_SWITCH_STATUS` viajan por acá, agregar al Set `ONBOARDING_EVENTS`.

**Criterios de verificación (mínimos, no negociables):**
- Test de switch exitoso entre dos organizaciones locales reales, confirmando `ORGANIZATION_SWITCHED` con status `SUCCESS` solo después de que Etapa 3/4 confirman drenado completo.
- Test de switch bloqueado por Mandate en curso — confirmar que `status: BLOCKED` trae `reasons` no vacío.
- Test de doble switch rápido — confirmar que el segundo intento choca contra el lock de G4 y no genera condición de carrera.
- Test de no-fuga de datos: después de un switch, ninguna operación de Vault puede acceder a secretos de la organización anterior (caso crítico dado G5).
- `node --check` (o linter Go equivalente) en todos los archivos tocados de los dos call sites.

**Nota de implementación (esta sesión):**
La lista de archivos original resultó incompleta — declarar los mensajes en `discovery.schema.json` (Etapa 1) no alcanza para que viajen. Se rastreó el camino real completo y aparecieron dos capas que el prompt original no tenía mapeadas, ninguna de las dos asumida sin confirmar con el usuario primero (ver AskUserQuestion de esta sesión, dos rondas):

1. **`installer/cortex/extension/background.js`** — `forwardToHost()` no reenvía nada por estar declarado en el schema; cada evento necesita su propia rama explícita. Se agregó `registerHandler('SWITCH_ORGANIZATION', ...)` en `registerOnboardingHandlers()` (reenvía al host) y un branch nuevo en `handleHostMessage()` para `ORGANIZATION_SWITCHED` (relay a la página). Mismo patrón que `ACCOUNT_REGISTERED`/`API_KEY_REGISTERED`, no una ruta nueva.
2. **`brain/core/server/server_manager.py`** — no es transporte puro (a diferencia de bloom-host/Chrome Host, confirmado por el usuario). Tiene un dispatch table explícito por `msg_type`; lo que no matchea cae a un ruteo genérico que **no** le llega a Conductor (registrado como `cli`, el ruteo genérico solo reenvía a otras conexiones `host`). Se agregó una rama `elif msg_type == 'SWITCH_ORGANIZATION'` que relaya a los Sentinels vía `event_bus.add_event` + `_broadcast_event` — mismo mecanismo que `API_KEY_REGISTERED`. Brain **no** ejecuta el switch: `active_org_slug` en `nucleus.json` solo lo escribe `getOrCreateOrg()`/`switchActiveOrg()` (Node), y reimplementarlo en Python sería la segunda fuente de verdad que el roadmap de Mandate Genesis prohíbe (§9).

Con esas dos capas confirmadas, los archivos tocados terminaron siendo:
- `installer/nucleus/internal/governance/org_switch_guard.go` — nuevos subcomandos CLI `nucleus governance can-switch-org` / `begin-drain` / `end-drain`, exponiendo G2/G4 (Etapa 4) para que Conductor los invoque vía `execNucleus`, mismo patrón que el resto de comandos de este archivo.
- `brain/core/server/server_manager.py` — rama `SWITCH_ORGANIZATION` (arriba).
- `installer/cortex/extension/background.js` — wiring de ida y vuelta (arriba).
- `installer/conductor/shared/onboarding-schema.js` — `switchActiveOrg(onboarding, orgSlug)`, nueva función. A diferencia de `getOrCreateOrg()`, nunca crea la org — falla explícito si no existe localmente (§4.1 del prompt original). Sigue siendo, a propósito, un primitivo tonto de persistencia (G7): no consulta G2 adentro.
- `installer/conductor/shared/synapse-bridge.js` — método público nuevo `sendToProfile(profileId, payload)`, wrapper de `_sendMsg` con `target_profile` (routing directo que `server_manager.py` ya soporta genéricamente).
- `installer/conductor/workspace/main_conductor.js` — `handleSwitchOrganization()`, el orquestador: G2 (`can-switch-org`) → validar que la org destino existe (`switchActiveOrg`, falla explícito si no) → G4 `begin-drain` → escribir `nucleus.json` → G4 `end-drain` → emitir `ORGANIZATION_SWITCHED` vía `sendToProfile`. Bloqueado (G8) se audita como evento local del bridge (`SWITCH_ORGANIZATION_BLOCKED`), no en silencio. Conectado al `'message'` de `_onboardingBridge` (no a los bridges por-ventana de `workspace-synapse-handlers.js`, que son efímeros) porque es el único bridge vivo de forma ambiental durante toda la sesión — este archivo terminó siendo suficiente, `workspace-synapse-handlers.js` no necesitó cambios.
- `installer/conductor/workspace/onboarding/milestone-registry.js`/`milestone-reactor.js` — confirmado que NO hacía falta tocarlos: el switch no es un step de onboarding.

**Endpoints de Batcave:** `EndpointGenerator` sigue sin existir como código real (confirmado de nuevo, solo pseudocódigo en `BATCAVE_ARCHITECTURE.md` — fuera de scope explícito, ver abajo). `handleSwitchOrganization()` arma `batcave_endpoint_rest`/`batcave_endpoint_wss` con el mismo patrón de URL que ya declaran los defaults del schema (`https://batcave.{org_slug}.bloom.dev/...`) como placeholder — hay que reemplazarlo el día que `EndpointGenerator` exista de verdad.

**Sin verificar en este pase (limitación de sandbox, igual que Etapas 2-4):** los 4 criterios de test de arriba requieren un Temporal Server real, un Brain corriendo, y dos organizaciones locales reales — no hay entorno para correrlos acá. Se verificó sintaxis (`gofmt` limpio en Go, `py_compile` limpio en Python, `node --check` limpio en los 4 archivos JS tocados) pero **no** el round-trip real. Correr los 4 criterios de verificación de tu lado antes de mergear.

---

## 3. Fuera de scope (igual que en el prompt original, no repetir acá)

- Resolver la duplicación de lógica entre `main_conductor.js` y `workspace-synapse-handlers.js` en sí misma.
- Completar la Fase 4 real de Mandates más allá del campo de estado mínimo de Etapa 3.
- Cualquier trabajo de GitHub App / Device Flow / scopes.
- Rediseño de `OrganizationContext`/`EndpointGenerator` — de hecho, confirmar primero si `EndpointGenerator` existe en algún lado no auditado todavía, porque hasta ahora solo se confirmó como pseudocódigo en `BATCAVE_ARCHITECTURE.md`, no en código real.

---

## 4. Resumen de una línea para arrancar

Ejecutar las 5 etapas en orden estricto — Etapa 1 (contrato en manifests) es independiente y arrancable ya; Etapas 2, 3 y 4 resuelven gaps de infraestructura confirmados por auditoría de código real (no hipótesis) y bloquean entre sí; Etapa 5 (handler end-to-end en Conductor/Cortex) no arranca hasta que 2-4 estén cerradas, porque conectar el contrato con una infraestructura que no puede reportar "hay algo in-flight" (G1/G3) o que no puede bloquear un segundo switch (G4) reproduce exactamente los bugs de resolución silenciosa que la auditoría anterior (`PROTOCOLO-synapse-homologacion-v3.md`) ya encontró una vez.
