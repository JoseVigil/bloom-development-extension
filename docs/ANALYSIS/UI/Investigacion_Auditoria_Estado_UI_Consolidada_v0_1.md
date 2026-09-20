# Auditoría Consolidada de Estado de UI — puente hacia el cowork de Core UI Redesign v0.1

**Tipo:** Investigación de sólo lectura. Es un mapa, no una propuesta de diseño. No se tocó código ni se
resolvió ninguna tensión de diseño.
**Basado en:** `Encargo_Investigacion_Auditoria_Estado_UI_Puente_CoreUIRedesign_v0_1.md` (`docs/ANALYSIS/UI/`).
**Ejecutado por:** cowork de investigación dedicado, 2026-09-20.
**Método de verificación:** lectura directa del repositorio (`/home/jose/repos/bloom-development-extension`)
vía herramientas de dispositivo remoto (`device_list_dir`, `device_stage_files`) — no se ejecutaron builds,
tests ni servicios. `git rev-parse HEAD` no pudo confirmarse en esta sesión porque la shell remota
(`device_bash`) no llegó a inicializar durante toda la ejecución; la evidencia de código se tomó por lectura
directa de archivo, con `mtime` de cada archivo citado como referencia de vigencia, no por hash de commit.

---

## §0 — Hallazgo que condiciona todo lo demás: D-25 ya no es un ítem de backlog abierto

El encargo (§1.4) parte de la premisa de que D-25 es una pregunta sin resolver: *"confirmar si hace falta
separar `GenesisTab` de `StandardMandateTab` o unificar en un `MandateTab` orientado por estado"*, y que
"probablemente no está documentado en ningún Investigación/Propuesta previo". Ambas cosas eran ciertas hasta
donde llega el corpus documental (§1) — pero el relevamiento de código pedido en §1.4/§2.5 encuentra que la
decisión **ya fue tomada e implementada**, sin que exista un Investigación/Propuesta/Encargo/Cierre que lo
documente. La evidencia está en el propio código:

> `webview/app/src/lib/components/MandateTab.svelte`, líneas 1-9 (comentario de cabecera):
> *"Componente único y genérico para el contenido de un tab de mandate. Reemplaza la distinción
> GenesisTab/StandardMandateTab: esa frontera nunca existió como código real (solo como comentarios TODO en
> routes/genesis/+page.svelte y Sidebar.svelte), así que no hay nada que migrar salvo el contenido de esa
> ruta. Genesis es hoy `mandateType: 'genesis'`, no un componente aparte."*

Esto **no contradice una decisión ratificada** (no había ninguna decisión ratificada sobre D-25 — el propio
encargo lo dice) — contradice la premisa de que la pregunta sigue abierta. Se señala tal cual, sin corregirla
por cuenta propia: el detalle completo, con evidencia archivo+símbolo, está en §5.

**Consecuencia para el cowork de Core UI Redesign:** el ítem de la Agenda Maestra ("D-25: confirmar si hace
falta separar...") debe darse por resuelto en el sentido de unificación, con la implementación ya en
producción bajo `MandateTab.svelte` + `mandateStore.ts`. Lo que sí queda abierto — y no estaba en el radar del
encargo porque nadie lo había documentado — es el estado de completitud de esa implementación (ver §5.3) y la
ausencia total de un Investigación/Propuesta/Cierre formal para esta decisión, que ahora mismo solo vive como
comentarios de código.

---

## §1 — Inventario de vistas/pantallas

Columnas: nombre, dónde está documentada, dónde está implementada (archivo+símbolo), estado. Estados
posibles: `solo_research`, `solo_spec`, `prototipo_no_conectado`, `implementado_parcial`,
`implementado_completo`.

| Vista | Documentada en | Implementada en (archivo+símbolo) | Estado |
|---|---|---|---|
| Orrery (interfaz orbital 3D, selección + inspector) | `Orrery_Research_Brief_Interfaz_Principal_v0_1.md`, `Orrery_Research_Resultados_v0_1.md` | `installer/conductor/workspace/core/orrery/src/main.ts` (`select`, `selected`, cámara orbital, labels HTML); `data.ts` (`items`, `genes`) | `prototipo_no_conectado` |
| Vista "grafo completo" de Gravity (separada, deliberada) | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §2.3, §6 | No se encontró ningún componente en `webview/app/src` ni `src/ui` | `solo_spec` |
| Breadcrumb de Gravity activa (compacto §2.2 / expandido §2.3) | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §2 | No se encontró ningún componente — se revisó especialmente `LedgerPanel.svelte` (candidato más cercano por ubicarse en el right-pane del shell de mandate) y no corresponde: es un feed de eventos, no un breadcrumb de Postura/Gravity | `solo_spec` |
| Panel de postulación de Postura (`PosturaDraft`, control retroactivo "Postular") | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §1; `Paladin_Client_Object_Model_v0_1.md` §2 | No se encontró implementación | `solo_spec` |
| Seis señales de conflicto Gravity↔pedido (⛔⚠️🔁⬆️🔓📝) | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §3 | No se encontró implementación | `solo_spec` |
| Métrica de masa (⚖ 1-3 segmentos) | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §4 | No se encontró implementación | `solo_spec` |
| MandateTab unificado (D-25: Genesis/DomainExpansion/Standard, ciclo de 4 fases, picker de Capa 0) | Ningún documento previo — solo comentarios de cabecera en el propio código (ver §0 y §5) | `webview/app/src/lib/components/MandateTab.svelte` (todo el componente); `webview/app/src/lib/stores/mandateStore.ts` (`createMandateStore`, `hydrateFromList`, `applyMandateEvent`, `createReconciliationCoordinator`); `webview/app/src/lib/bootstrap/genesisLaunch.ts` (`runPendingGenesisLaunch`); `webview/app/src/routes/+layout.svelte` (montaje condicional de `MandateTab` sobre `<slot/>`); `webview/app/src/lib/components/docsGate.ts` (picker de Capa 0, migrado 1:1) | `implementado_parcial` (ver §5.3 para el detalle de qué falta) |
| TabBar del shell + store de tabs abiertos | Comentario propio cita `PROMPT_Fix_TabBar_y_Errores_Consola.md` (no forma parte del corpus del encargo) | `webview/app/src/lib/components/TabBar.svelte`; `webview/app/src/lib/stores/tabs.ts` (`createTabsStore`, `openTab`, `clearActive`) | `implementado_completo` |
| Ledger / "Event Bus Feed" (zona 3 del shell de mandate) | Comentario propio cita `bloom-conductor-genesis-v1_1.html` como referencia visual, no un doc de research/spec | `webview/app/src/lib/components/LedgerPanel.svelte` | `implementado_parcial` — nota visible en el propio componente: *"Datos de ejemplo (placeholder) — solo observabilidad, sin acciones desde este panel"* (línea 57); `ledgerStore.ts` explícitamente placeholder |

**Fuera del corpus del encargo, encontradas al relevar D-25 — se registran como contexto, no se auditan en profundidad:**
Sidebar (`Sidebar.svelte`) y las rutas `/home`, `/nucleus`, `/profiles`, `/wisdom`, `/account`, `/settings`, más
`NucleusPanel.svelte`/`ProjectsPanel.svelte` (CRUD real de Organization/Project vía `listNuclei`,
`createNucleus`, `listNucleusProjects`, `addProject` — no simulado, pega contra backend real). Ninguna de estas
vistas aparece mencionada en el corpus §1 del encargo; se dejan fuera del inventario detallado por ese motivo,
pero el cowork de Core UI Redesign debería saber que existen y están operativas, porque D-25/Orrery van a
convivir con ellas en el mismo shell.

---

## §2 — Decisiones ratificadas vs. decisiones abiertas

### 2.1 — Ratificadas (no reabrir sin motivo nuevo)

| Decisión | Fuente | Estado de implementación |
|---|---|---|
| SESSION es una corrida de `MandateExecutionWorkflow` (creación, Activities, consumidor), no solo un enum/"conversación viva" | `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §3, corrección 1, evidencia E10-E12 | Confirmado en código real (`mandate_execution_workflow.go`, `mandate_gravity_session_activities.go`) — reinterpretación ya ratificada y con código que la sostiene |
| `ProjectID` tiene productores y transporte de punta a punta (Conductor y Brain) | `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §3, corrección 2, §9 | Ver §3 más abajo — esta ratificación **contradice el resumen que el propio encargo (§1.2) hace de un documento anterior y superado (v0.3)**; se señala como hallazgo, no se resuelve acá |
| `EnsureGravityMandateNodeActivity` crea PROJECT cuando falta, vía autorización gobernada (los comentarios de código que dicen lo contrario están desactualizados) | `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §3, corrección 3, E10 | Ratificado, código real |
| Postulación de Postura: Alternativa A (control retroactivo "Postular esto" sobre mensaje ya enviado), no un modo de escritura previo | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §1.3 | **Spec ratificada, sin implementación de código encontrada** (ver §1 del inventario) |
| Breadcrumb de Gravity: patrón compacto por defecto + expandido al click, proyección turno a turno (nunca el grafo completo) | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §2 | Spec ratificada, sin implementación de código encontrada |
| `AutoridadDeAlcanceDelIngeniero` debe revalidarse en cada apertura del panel de postulación, no cachearse una sola vez por sesión (corrección explícita del propio documento) | `Paladin_Client_Object_Model_v0_1.md` §4 | Spec ratificada; no aplica a código real porque no existe el panel de postulación todavía |
| `D-25`: unificación de Genesis/DomainExpansion/Standard en un único `MandateTab` orientado por `mandateType`/`domainBaseline` | Sin documento previo — decisión tomada e implementada directamente en código (ver §0 y §5) | **Ya implementada.** No es una decisión "ratificada" en el sentido formal del resto de esta tabla (no hay Investigación/Propuesta/Encargo/Cierre que la respalde) — se lista acá porque el código ya la trata como cerrada y el cowork de Core UI Redesign debería heredarla como hecho consumado, no como pregunta |
| Intent `cor` deprecado desde 2026-09-02 | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`, banner de corrección; `Tablero_Seguimiento_Consolidado_v0_2.md`, directiva reconfirmada "`Intent Cor` = `Intent Core`, mismo sistema deprecado" | Ratificado en dos fuentes independientes y consistentes entre sí |

### 2.2 — Abiertas (el cowork de Core UI Redesign las hereda como preguntas)

| Pregunta abierta | Fuente | Nota |
|---|---|---|
| ¿Constellation/Orbital/Gravity: vista continua con zoom semántico o vistas separadas? | `Orrery_Research_Brief_Interfaz_Principal_v0_1.md` §0; `Glosario_Contexto_Cognituum_para_Cowork.md` §3 | El research (`Orrery_Research_Resultados_v0_1.md` §3, pregunta 1) sí toma una posición con evidencia — "mixta: Constellation↔Orbital continuo, Gravity separada" — pero es una recomendación de un documento de tipo `[R]` (research), no una ratificación de José. Se registra como abierta, tal como indica el encargo (§1.1), con la posición del research anotada para que el cowork de Core UI Redesign no tenga que releerla entera |
| ¿Orrery es una sola metáfora astronómica o contenedor de vistas con geometrías distintas? | Idem, pregunta 2 | Idem — research toma posición ("contenedor de vistas, no una sola geometría") pero abierta a ratificación |
| ¿Gravity se representa literal (fuerzas/masa visual) o se traduce a lenguaje humano? | Idem, pregunta 3 | Idem — research toma posición ("lenguaje humano por defecto, geometría literal opcional bajo demanda") pero abierta a ratificación |
| ¿Guardar borrador de Postura persistente? | `Paladin_Client_Object_Model_v0_1.md` §3 | Marcada explícitamente como "decisión de producto pendiente" por el propio documento, fuera de su alcance |
| Mecanismo exacto de firma para Postura de alcance `PROJECT` | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` §6; heredado de `Impl` §5 | Bloqueado además por un gap de autorización: el rol `Architect` que `Impl` asume para firmar `PROJECT` no existe en el modelo de autorización vigente (`Paladin_Client_Object_Model_v0_1.md` §5, heredado de **Audit**) |
| Reemplazo del mecanismo `cor` para escalar a autoridad de Organization | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`, banner de corrección | "Sin ratificar todavía", textual |
| Vigencia completa de `Paladin_Client_Object_Model_v0_1.md` | El propio documento, encabezado: "Borrador v0.1 — análisis en curso, no cerrado" | No se encontró ningún documento posterior que lo cierre o lo reemplace. Sigue vigente como el mejor análisis disponible, pero formalmente abierto |
| Contrato físico de Location (schema, ubicación/propietario de módulos, persistencia) | `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §15 | Explícitamente "reservado a José" — no es una pregunta de diseño de UI, es de arquitectura de datos, pero condiciona qué puede mostrar Orrery (ver §4) |

---

## §3 — Hallazgo documental: el gap de `ProjectID` que cita el encargo está superado

El encargo (§1.2) resume el hilo Location/Domain/Gene a partir de tres documentos (`v0_1_PARCIAL`,
`v0_2_Continuacion`, `v0_3_Addendum`, fechados 2026-09-14) y concluye que *"el gap de mayor apalancamiento...
es la ausencia de un productor real de `ProjectID` estable"*.

En el repositorio real, esos tres archivos **no existen** en `docs/ANALYSIS/ORRERY/LOCATION/`. Lo único que
hay es `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`, fechado 2026-09-15, con estado *"Research cerrado y
aprobado por José Vigil"* (línea 3) — un día posterior al addendum que el encargo cita, y que explícitamente
se presenta como el cierre de esa misma línea de investigación. Es decir: **el corpus evolucionó entre que el
encargo se redactó (citando v0.3) y lo que hoy vive en el repo (v1.1, ya cerrado y aprobado)**, y el encargo no
llegó a reflejar ese cierre.

La caracterización del gap cambia de forma material entre ambas versiones:

- El encargo (citando v0.3): *"ausencia de un productor real de `ProjectID` estable"*.
- v1.1, §9, punto 3 (textual): *"Identidad estable distinta de nombre/ruta: **sí existe y se persiste**. El
  gap es correspondencia/continuidad, no ausencia universal de generador."*

No es un caso de "código real contradice una decisión ratificada" en sentido estricto — es un documento más
reciente y ya aprobado por José que reemplaza la caracterización de uno anterior que el encargo tomó como
vigente sin saber que había sido superado. Se señala tal cual, sin corregirlo: **el cowork de Core UI Redesign
debería tratar `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` como la fuente vigente sobre Location**, no el
resumen que hace de él el §1.2 del encargo. El gap real, según v1.1, es de correspondencia/continuidad entre
representaciones (B2, §11), no de ausencia de identidad — dato que cambia qué tipo de encargo de backend haría
falta si en algún momento se decide atacarlo (no es objeto de esta auditoría resolverlo, ver §4).

---

## §4 — Dependencias de backend no resueltas (fuera del alcance de UI)

Todas marcadas como tales para que Core UI Redesign sepa qué no puede prometer todavía. Ninguna se toca en
esta auditoría.

| Dependencia | Fuente | Qué bloquea en UI |
|---|---|---|
| Cadena canónica Project → Domain → Gene sin productor conectado (encargos C1/C2 reservados) | `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §4, §12, §13 | Orrery no puede mostrar Domain/Gene reales — solo los `genes` simulados de `data.ts` |
| Coherencia de Organization entre configuración/Blueprint/ownership/binding (encargo B1) | Idem §11, §13 | Cualquier vista que dependa de una Organization inequívoca (incluida la que consumiría Location) |
| Continuidad de ProjectID entre representaciones (Conductor/Brain/CLI/migración) — encargo B2 | Idem §9, §11, §13 | Ver §3: no es ausencia, es correspondencia — bloquea igual la promesa de "misma identidad en toda vista" |
| Identidad humana y autorización de captura para Orrery/Location (encargo B3) | Idem §11, §13 | Sin esto, ninguna captura de Location puede atribuirse a un humano real |
| Contrato físico de Location (schema, persistencia) — encargos A1/A2 | Idem §13, §15 | Bloquea que la selección en Orrery (`select`/`selected` de `main.ts`) se convierta en algo durable |
| Rol `Architect` no existe en el modelo de autorización vigente | `Paladin_Client_Object_Model_v0_1.md` §5, heredado de **Audit** | Bloquea el selector de alcance `PROJECT` en el panel de postulación (que tampoco existe todavía como UI) |
| Contrato de backend para postular Postura de alcance Sesión (qué endpoint, qué DTO) | `Paladin_Client_Object_Model_v0_1.md` §5 | Bloquea que `PosturaPendienteDeConfirmación` tenga a qué apuntar |
| "Nuevo Mandate" manual (botón de TabBar) sigue sin pegar contra backend real | `mandateStore.ts`, `createMandate()` — ver §5.3 | El Mandate creado desde ese botón es un placeholder local; solo el Genesis automático post-onboarding (`genesisLaunch.ts`) usa el camino real (Fastify) |

---

## §5 — Estado real de D-25 (relevamiento de código, sin documento previo)

### 5.1 — Qué existía antes de la consolidación (rastro en comentarios, no en código vivo)

`MandateTab.svelte` (líneas 1-9) y `mandateStore.ts` (líneas 1-7) coinciden, de forma independiente, en que
`GenesisTab`/`StandardMandateTab` **nunca existieron como componentes reales** — solo como comentarios `TODO`
en dos archivos que ya no están: `routes/genesis/+page.svelte` (confirmado eliminado — no aparece en el
listado actual de `webview/app/src/routes/`, que hoy contiene `account/`, `debug/`, `home/`, `intents/`,
`nucleus/`, `profiles/`, `settings/`, `welcome/`, `wisdom/`, sin `genesis/`) y comentarios equivalentes en
`Sidebar.svelte`.

### 5.2 — Qué existe hoy (implementación real, verificada archivo por archivo)

- **`webview/app/src/lib/components/MandateTab.svelte`** — componente único, impulsado por estado
  (`mandateType`: `'genesis' | 'domain_expansion' | 'standard'`; `domainBaseline`: `'empty' | 'existing'`),
  sin ninguna rama de código por tipo de mandate (confirmado leyendo el componente completo — la única
  variación es de copy, líneas 74-84). Contiene: picker de Capa 0 migrado 1:1 desde la ruta eliminada (mismo
  store `docsGate.ts`), y un ciclo de vida visual de 4 fases (`ingest`/`cluster`/`validate`/`scaffold`).
- **`webview/app/src/lib/stores/mandateStore.ts`** — `createMandateStore()` con tres vías de datos que
  conviven por diseño (documentado explícitamente, líneas 19-23): `createMandate()` (placeholder local, sin
  backend, para el botón "Nuevo Mandate"), `hydrateFromList()` (catch-up real contra `GET /api/v1/mandates`),
  y `applyMandateEvent()` (consume eventos `mandate:*` reales por WebSocket, cubre los 10 eventos documentados
  de `WsEventMap`, con manejo explícito de eventos desconocidos vía `reconcileRequester`).
- **`webview/app/src/lib/bootstrap/genesisLaunch.ts`** — `runPendingGenesisLaunch()`, hook de arranque
  automático post-onboarding. El comentario de cabecera (líneas 11-22) documenta una migración de mecanismo ya
  hecha: de un "Camino 1" (IPC → CLI Go) a un "Camino 2" (Fastify → Node, `POST /api/v1/mandates`), con
  justificación técnica citada (Camino 2 emite el evento de forma síncrona, Camino 1 dependía de un watcher
  confirmado sin arrancar bajo `nucleus dev-start`, referenciando `TD-001` de deuda técnica).
- **`webview/app/src/routes/+layout.svelte`** — monta `MandateTab` en el `content-body` del shell cuando hay
  un tab activo con `mandateId`, en lugar del `<slot/>` de ruta (líneas 140-145); dispara
  `runPendingGenesisLaunch()` al montar; conecta el store de mandates a WebSocket y a un catch-up inicial.
- **`webview/app/src/lib/components/Sidebar.svelte`** (líneas 51-56) — confirma en comentario que el nav item
  provisorio `/genesis` fue retirado y que `routes/genesis/+page.svelte` "fue eliminado; su contenido vive
  ahora dentro de `MandateTab.svelte`".
- **`webview/app/src/lib/stores/mandateStore.test.js`** — existe un test real (no solo el store en sí) que
  bundlea `mandateStore.ts` con `esbuild` y lo ejercita con Node `test` — confirma que la consolidación no es
  solo un comentario de intención sino código con cobertura de test.

### 5.3 — Qué falta (para que Core UI Redesign no lo dé por completo)

- El botón "Nuevo Mandate" de `TabBar.svelte` sigue creando un mandate **placeholder local**
  (`mandateStore.createMandate()`, sin llamada a backend) — a diferencia del Genesis automático post-onboarding,
  que sí usa el camino real. No hay todavía ningún flujo de UI que cree un mandate `standard` o
  `domain_expansion` real desde el shell.
- El botón "Continuar" del picker de Capa 0 (`MandateTab.svelte`, línea 165-169) tiene una nota visible en el
  propio componente, migrada tal cual desde la ruta eliminada: *"Fase 1 puede haber arrancado ya o arrancar en
  cualquier momento — el gate que lo evita todavía no existe del lado del sistema"* — un gap de backend
  conocido y ya documentado en el propio código (referencia a "Q-06/Q-07" sin resolver), no inventado por esta
  auditoría.
- No existe ningún Investigación/Propuesta/Encargo/Cierre formal que documente la decisión de unificación en
  sí — vive enteramente como comentarios de código. Es un gap de proceso, no de UI: si el cowork de Core UI
  Redesign necesita citar esta decisión como antecedente, hoy solo puede citar el código, no un documento.

---

## §6 — Componentes/patrones reutilizables vs. datos simulados

### 6.1 — Patrón de interacción reutilizable (sobrevive aunque cambien los datos)

| Componente/patrón | Archivo+símbolo | Por qué es reutilizable |
|---|---|---|
| Motor de cámara orbital + selección por raycasting + labels HTML + panel inspector lateral no destructivo | `installer/conductor/workspace/core/orrery/src/main.ts` (`select`, `selected`, cámara) | Confirmado como capa de interacción genuinamente resuelta tanto por el hilo Already/Orrery original citado en el encargo (§1.1) como por `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` (E19) — el directorio sigue existiendo con `mtime` de 2026-09-15, sin cambios posteriores detectados |
| `MandateTab.svelte` — ciclo de vida de 4 fases impulsado por estado, sin ramas por tipo de mandate | Componente completo | Genérico por diseño: agregar un cuarto `mandateType` no requeriría un componente nuevo |
| `mandateStore.ts` — `hydrateFromList()` + `applyMandateEvent()` con manejo de eventos desconocidos y descarte de actualizaciones stale por `stateVersion` | `mandateStore.ts` líneas 104-131, 184-268 | Patrón de reconciliación real (no simulado) ya resuelto: catch-up + WS complementarios, con protección contra eventos fuera de orden |
| `TabBar.svelte` + `tabsStore` (`tabs.ts`) | Componentes completos | Genérico, sin acoplamiento a mandates específicamente (el campo `mandateId` es opcional en `Tab`) |
| `docsGate.ts` (picker de Capa 0: detección + drag&drop de docs) | Migrado 1:1 desde la ruta eliminada, sin cambios de comportamiento | Reutilizado tal cual dentro de `MandateTab.svelte` |

### 6.2 — Datos simulados (no arrastrar como reales al próximo cowork)

| Dato simulado | Archivo+símbolo | Evidencia explícita |
|---|---|---|
| Objetos/genes de Orrery | `installer/conductor/workspace/core/orrery/src/data.ts` (`items`, `genes`) | Badge propio del prototipo: "ESQUICIO 01 · DATOS SIMULADOS" (citado en el hilo Already/Orrery original y confirmado vigente por `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` §1, tabla, fila "Orrery": *"Selección de objetos ficticios en memoria, sin captura durable de Location"*) |
| Feed de eventos del Ledger | `webview/app/src/lib/components/LedgerPanel.svelte` línea 57 | Nota visible en el propio componente: *"Datos de ejemplo (placeholder) — solo observabilidad, sin acciones desde este panel"* |
| Mandate creado por el botón "Nuevo Mandate" de TabBar | `mandateStore.ts`, `createMandate()` | Comentario explícito: *"No pega contra backend — ver nota de cabecera"* (línea 12) |

---

## §7 — Fuera de alcance de esta auditoría (recordatorio, no se tocó nada de esto)

Sin cambios de código. Sin resolución de las tres tensiones del Research Brief de Orrery. Sin tocar el gap de
`ProjectID`/Location ni ningún otro gap de backend encontrado (§3, §4) — todos quedan registrados, no
atacados. Sin reabrir SESSION ni ninguna otra decisión ratificada del corpus. La única evidencia nueva
generada es la de D-25 (§0, §5), tal como pedía el encargo §2.5.
