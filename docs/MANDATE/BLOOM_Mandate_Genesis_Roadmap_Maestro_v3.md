# BLOOM Mandate Genesis — Roadmap Maestro (documento único de orientación)
**Migrado a `ing/` + `dis/` — v3, alineado con `ING_Intent_Spec_v1_1.md` y `DIS_Intent_Spec_v1_0.md`**

**Propósito:** este es el único documento que junta todo lo que se decidió y construyó en esta sesión — Backend (Go/Nucleus), Frontend (Electron + Svelte webview), y las Capas del Bootstrap Strategy. Cuando te sientas perdido, empezá acá, no en el historial de chat.

**Regla de esta sesión (heredada, sigue vigente):** todo lo que se marca "✅ Confirmado" fue verificado contra un archivo real, no contra un resumen. Todo lo que dice "🔄 En curso" o "⬜ Sin empezar" es honesto sobre su estado — no hay nada "medio hecho" escondido.

**Regla nueva de v2, sigue vigente en v3:** "✅ Confirmado" se subdivide en dos niveles porque hay dos fuentes distintas de verdad:
- **✅ Confirmado (código real — GAP V3):** verificado línea por línea contra `mandate_genesis_activities.go`, `mandate_genesis_build_workflow.go`, `mandate_watcher.go`, `ws-events.ts`.
- **✅ Confirmado (spec previa, sin cross-check de código en esta ronda):** lo que ya estaba marcado ✅ en v1 pero el GAP V3 no lo tocó — sigue siendo válido, pero no fue re-verificado ahora.
- **🎯 Redefinido (objetivo, no implementado):** partes de este documento que antes describían *estado actual* y ahora describen el *diseño objetivo* de `ing/` y, desde v3, también de `dis/`. El código real de hoy **todavía no hace esto** — se marca así para no confundir "lo que queremos que haga Fase 1/2, o lo que debería disparar `dis/`" con "lo que el workflow hace hoy".

**Regla nueva de esta migración (v3):** la capa de Intents BISP que corre por debajo del ciclo de vida de un Genesis Mandate (Fases 1-4, Go/Temporal, ver §9) ya no es un único motor — se formalizó e independizó en **dos** intents complementarios, cada uno con su propia spec:
- **`ing/` (Intent de Ingesta, `ING_Intent_Spec_v1_1.md`):** procesa lotes locales e incrementales de material raw — `.reception/ → .classification/ → .consolidation/` — y **propone** dominios locales vía `.domain_resolution.json`, sin alterar el mapa global BISP directamente hasta que un turno de `.consolidation/` cierra `committed: true`. Es el motor que las Fases 1 y 2 del workflow invocan (ver §2 y §9). Nunca reestructura Dominios ya existentes — no fusiona, no divide, no renombra, no agrega una segunda arista a un Gene que ya tenía Dominio.
- **`dis/` (Intent de Discovery, `DIS_Intent_Spec_v1_0.md`):** corre **después** de una o más corridas de `ing/`, a demanda o periódicamente, con la vista completa y retrospectiva del grafo — `.discovery/ → .mapping/ → .ratification/`. No asimila material crudo, no crea Genes; su única salida es un grafo de Dominios corregido: fusiones, splits, renombres y detección de Genes cross-domain. Es el intent que asume la propiedad de la topología de Dominios a partir de `ING_Intent_Spec_v1_1.md`.

En una frase: **`ing/` sube información al sistema y propone localmente; `dis/` reordena el sistema completo mirando todo lo que ya subió `ing/`.** Ninguno de los dos reemplaza al otro ni compiten por el mismo dato — `ing/` nunca hace lo que hace `dis/`, y `dis/` nunca hace lo que hace `ing/` (ver §9 para el mapeo formal Fase↔Intent y el disparador de `dis/`).

---

## 0. Glosario — para no volver a confundir esto

Tres numeraciones conviven en esta sesión y **no son la misma cosa**:

| Término | Qué es | Ejemplos |
|---|---|---|
| **Fases** (1-4) | El ciclo de vida técnico de UN Genesis Mandate ya creado: `ingest → cluster → validate → scaffold` | Fase 3 = pantalla de confirmar dominios |
| **Capas** (0-3) | La estrategia del *Bootstrap Strategy* para que la Fase 2 (cluster) tenga datos reales en vez de un placeholder | Capa 0 = subir documentación |
| **Pasos** (1-5) | La migración de UI de Core de HTML/vanilla-JS a Svelte real | Paso 1 = Sidebar fusionado |

Estos tres ejes son ortogonales entre sí — un Mandate puede estar en Fase 3, mientras Capa 1 todavía no existe, mientras la UI sigue en Paso 2 de la migración. No se bloquean mutuamente salvo donde se indica explícitamente abajo.

**Un cuarto eje, nuevo en v3, no ortogonal a "Fases" sino anidado dentro de él:** las Fases 1-4 son la orquestación *externa* (Temporal/Go). Por debajo, dos Intents BISP hacen el trabajo real:

| Intent | Nivel | Alcance | Cuándo corre |
|---|---|---|---|
| **`ing`** | Interno a un Mandate, invocado por Fase 1 y Fase 2 | Local — el lote de material que acaba de entrar, comparado contra dominios ya existentes | Cada vez que el workflow de un Genesis Mandate pasa por Fase 1/2, y en cualquier incorporación posterior de subsistema/repo/módulo (no exclusivo de Génesis) |
| **`dis`** | Nucleus-wide, no atado a un Mandate en particular | Global — todo el grafo de Dominios/Genes ya consolidados, retrospectivo | Bajo demanda o tras acumulación de cambios incrementales de una o más corridas de `ing` (ver §9) |

No confundir "Fase 2 del workflow" con "`dis/`": Fase 2 dispara `.classification/` de `ing/`, que propone una asignación **local** de dominio para el lote entrante. `dis/` es una corrida aparte, no forma parte del ciclo Fase 1-4 de un Mandate — puede correr sin que haya ningún Mandate en Fase 1-4 activo en ese momento.

---

## 1. El flujo completo, de punta a punta, en una sola tabla

```
ONBOARDING (Electron, ventana 1)
  └── step PROJECT: usuario elige/importa carpeta de proyecto (ya sube TODO el proyecto a la raíz .bloom/)
  └── step MANDATE (último step): copy + botón → dispara CLI `nucleus mandate genesis --project --source [--docs]`
        └── el flag `--docs` es parseo de CLI para Capa 0 (detección de documentación) — NO viaja como
            campo del input de Temporal (ver §1.1). No confundir ambas cosas.
        └── escribe mandate_state.json (currentPhase: "ingest", status: "pending")
        └── dispara onboarding:complete → Opción C: ventana nueva (Core) + cierre de la vieja
                │
                ▼
CORE (Electron, ventana 2 — Svelte webview en :5173)
  └── mandate_watcher.go (servicio Go, ya corriendo en paralelo) detecta el archivo por fsnotify
        └── arranca MandateGenesisBuildWorkflow (Temporal) — YA CORRIÓ o está por correr
              │
              ▼
        FASE 1 — ingest        (ver §1.1 y §2 — estado real vs. objetivo `ing/` difieren)
        FASE 2 — cluster       (ver §1.1 y §2 — estado real vs. objetivo `ing/` difieren)
        FASE 3 — validate      (ÚNICO paso con input humano: confirmar/renombrar dominios — HTML ya construido)
        FASE 4 — scaffold      (automático, placeholder — P4 real no implementado)
```

**El picker de Capa 1** (`/genesis` en el webview) vive **en Core**, y hoy es best-effort — no bloquea ni pausa Fase 1, porque no existe (todavía) un gate en `mandate_watcher.go` que lo obligue a esperar.

### 1.1 Fase 0 — Setup / `GenesisBuildInput` (Temporal) — ✅ Confirmado (código real — GAP V3)

La firma real del input de Temporal **no incluye `RawDocs` ni empaquetado de adjuntos**. El struct `GenesisBuildInput` tiene únicamente estos campos, confirmados contra `mandate_genesis_build_workflow.go`:

- `MandateID`
- `MandateType`
- `BaseGenesisID`
- `Source`
- `Project`
- `MandatesRoot`

Cualquier mención previa (v1 de este documento, y otros docs relacionados) a que el workflow "empaqueta adjuntos" o "transmite `RawDocs`" queda **corregida**: eso no existe en el código real. Si Capa 0 necesita mover documentos al workflow, tiene que hacerlo por otro canal (filesystem, no por el input de Temporal) — ver §3, Capa 0.

---

## 2. Estado por Fase del workflow — Backend

| Fase | Estado real hoy (✅ código — GAP V3) | Objetivo `ing/` / `dis/` (🎯 Redefinido, no implementado) |
|---|---|---|
| 1 — ingest | Una sola `PublishMandateEventActivity` que emite el evento `mandate:phase:ingest` con `mandateId`. **No lee archivos, no llama a Brain, no toca ChromaDB.** Es, literalmente, un evento hueco. | Invocar `brain` como subproceso CLI desde las Activities de Go (no TCP/EXECUTE_INTENT, ver §6 D-15): `brain intent create --type ing --json` para crear el intent, seguido de `brain intent hydrate --id <id> --files <paths de {MandatesRoot}/{MandateID}>` para leer los archivos de contexto, disparando `.reception/` (BISP §3 de `ING_Intent_Spec_v1_1.md`) — recibe el raw material, empaqueta el payload BISP de ingesta y coordina la vectorización en ChromaDB, reemplazando el evento hueco actual. |
| 2 — cluster | `ScaffoldDomainActivity` con `Mode: dry_run`. **No clusteriza nada**: devuelve siempre un único dominio igual a `input.Project`. No existe canal a Brain — el cliente TCP:5678 mencionado en specs previas **no existe en Go**. | Pasar de mock `dry_run` a invocar `brain intent add-turn` (subproceso CLI, no TCP) para los turnos de `.classification/`, que resuelve Raw→Dominio→Gene en dos pasadas (§4 de `ING_Intent_Spec_v1_1.md`) y escribe la propuesta en `.domain_resolution.json` — **acotada al lote local**, comparando solo contra los centroides de Dominio ya existentes al momento de la corrida, nunca reconsiderando Dominios ya consolidados entre sí. `brain intent submit` cuando el paso requiera invocar a un provider de IA generativa vía Synapse para la validación semántica de esa propuesta local, antes de llegar a Fase 3. **Esta fase nunca fusiona, divide, renombra Dominios ni agrega una segunda arista a un Gene que ya tenía Dominio** — esa reestructuración global es competencia exclusiva de `dis/` (ver fila siguiente y §9). |
| 3 — validate | Espera Signal `mandate:genesis:validate`; CLI (`domains confirm`) y Signal ya señalizan correctamente. | Sin cambios de esta migración — se mantiene igual. Al cerrar el turno con `committed: true` en `.consolidation/`, Brain siembra o extiende **exactamente una arista** en `.cache/.semantic-index.json` (§5 de `ING_Intent_Spec_v1_1.md`) — la propuesta local de Fase 2 recién se vuelve efectiva acá. |
| 4 — scaffold | `SignMandateActivity` arma `mandate.json` firmado; `MandateExecutionWorkflow` (P4 real) sigue placeholder puro. | Sin cambios de esta migración — se mantiene igual. |
| *(fuera del ciclo Fase 1-4, servicio aparte)* — `dis/` | ⬜ Sin empezar — no existe invocación de `dis/` en ningún punto del código Go hoy. | **`dis/` no es una quinta Fase del workflow.** Se posiciona como servicio/etapa que se ejecuta **bajo demanda o tras la acumulación de cambios incrementales** de una o más corridas de `ing/` (Génesis u otras), para la reestructuración profunda y retrospectiva del mapa semántico: recorre `.discovery/ → .mapping/ → .ratification/` (`DIS_Intent_Spec_v1_0.md`), toma como entrada el `.cache/.semantic-index.json` global y produce como salida ese mismo archivo corregido — fusiones, splits, renombres de Dominio, y altas de arista para Genes cross-domain. Se invoca igual que `ing/`, vía `brain intent create --type dis --json` seguido del ciclo `hydrate/add-turn/submit/finalize` del mismo patrón CLI subprocess (ver §6 D-15). No requiere que haya un Mandate en Fase 1-4 activo al momento de correr. |

**Nota crítica de esta migración:** en v1 de este documento, Fase 1 y Fase 2 estaban marcadas "✅ Corriendo, automático" sin distinguir entre "corre sin errores" y "hace algo real". El GAP V3 deja esto sin ambigüedad: **corren, pero Fase 1 no ingiere nada y Fase 2 no clusteriza nada.** La columna "Objetivo `ing/` / `dis/`" de arriba es la redefinición formal pedida para esta migración — es diseño, todavía no código. La adición de `dis/` en v3 no reabre esta nota: `dis/` no forma parte de Fase 1 ni Fase 2, así que no cambia lo que el GAP V3 confirmó sobre ellas — solo agrega el paso posterior, hoy inexistente, que resolvería el problema de fondo (dominios que deberían ser uno solo, resueltos por lotes que nunca se vieron entre sí).

---

## 3. Estado por Capa del Bootstrap Strategy — Backend + Frontend

| Capa | Qué es | Backend | Frontend |
|---|---|---|---|
| 0 — Documentación | Detectar docs existentes + drag-and-drop | Flag `--docs` en CLI `mandate genesis` ✅ (solo sirve en creación, no post-mandate; **no viaja al input de Temporal**, ver §1.1) | `docsGate.ts` + `/genesis` ✅ construido — pero 2 endpoints que necesita (`GET/POST /api/project/docs`) ⬜ no existen |
| 1 — Vectorizar (Ollama+ChromaDB) | Extraer patrones de la documentación | ⬜ Sin empezar como Capa aislada — pero la coordinación de vectorización en ChromaDB pasa a ser responsabilidad formal de Fase 1 dentro de `ing/` (🎯 Redefinido, ver §2). Técnica de extracción sin decidir todavía. | N/A |
| 2 — Matching contra filesystem | Proponer dominios reales a partir de los patrones | ⬜ Sin empezar — depende de 1. La validación semántica de esta propuesta es lo que Fase 2 hará vía Synapse/IA generativa (🎯 Redefinido, ver §2). | N/A |
| 3 — Biblioteca de patrones | Acumular confirmaciones humanas entre mandates | ⬜ Sin empezar — depende de 1-2 | N/A |

**Nota importante (heredada, sigue vigente):** Capas 1-3 no bloquean el lanzamiento. El sistema funciona hoy con el fallback ya documentado (Fase 2 siempre propone 1 dominio = el proyecto entero — confirmado por código en §2). No es ideal, pero es funcional y honesto (la UI ya lo comunica, ver `/genesis`).

---

## 4. Estado de la migración de UI (los 5 Pasos) — 100% Frontend

*(Sin evidencia nueva del GAP V3 en esta sección — no es código Go/TS de backend. Se mantiene igual que v1, sin re-verificar en esta ronda.)*

| Paso | Qué es | Estado |
|---|---|---|
| 1 — Sidebar fusionado | Rail visual del mock + 6 links reales de SvelteKit | ✅ Confirmado (spec previa, sin cross-check en esta ronda) |
| 2 — tab-bar | Reemplazar `switchTab` vanilla JS por Svelte real + store de tabs | 🔄 En curso — pedido ya enviado a la sesión de Frontend, sin devolución todavía |
| 3 — LedgerPanel | Estructura real + `ledgerStore.ts` (placeholder de datos explícito) | ⬜ Sin empezar — depende de 2 |
| 4 — Frontera GenesisTab/StandardMandateTab | Decidir la diferencia entre los dos tipos de tab, con el shape del Ledger ya definido | ⬜ Sin empezar — depende de 3, **bloquea que `/genesis` se vea dentro de una solapa** |
| 5 — Rutas `/nucleus` y `/projects` | Montar `NucleusPanel.svelte`/`ProjectsPanel.svelte` ya existentes | ⬜ Sin empezar — independiente, puede ir en paralelo en cualquier momento |

**Por qué `/genesis` hoy se ve "suelta", sin tab:** decisión explícita (Opción 1, tomada unos turnos atrás) — se priorizó tener el picker de Capa 0 funcional ya, en vez de esperar a los pasos 2-4. Es esperado, no un bug. Se resuelve solo cuando el Paso 4 esté listo.

---

## 5. Filesystem y Eventos — ✅ Confirmado (código real — GAP V3)

### 5.1 `domain_proposal.json` — layout resuelto

Este documento (v1) tenía la deuda D-13 abierta: "layout plano vs. árbol anidado, sin resolver cuál es el correcto". **Queda resuelto:**

- Lo escribe `scaffoldDryRun()` en `mandate_genesis_activities.go`, vía `os.WriteFile`.
- Ruta real: `{mandatesRoot}/{mandateID}/domain_proposal.json` — **layout plano**, no anidado.
- El struct `ProposedDomain` usa las claves JSON `"id"` y `"domainName"`.

### 5.2 `ws-events.ts` vs. eventos reales de Go

Este documento (v1) tenía la deuda D-11 abierta: "contenido real de `ws-events.ts` nunca se leyó completo, el contrato se infirió de los emisores Go". **Queda parcialmente resuelto** — se leyó y se cruzó contra el código Go, y aparecen gaps concretos:

**Eventos que Go emite y que NO están en `WsEventMap` (`ws-events.ts`):**
- `mandate:phase:ingest`
- `mandate:genesis:rejected`
- `mandate:genesis:all_complete`

**Evento con payload incompleto en TS:**
- `mandate:action:completed` — Go le agrega la clave `"domains"` (con `ProposedDomain[]`) que el tipo TS no contempla.

**Comportamiento de red (nuevo dato, sin precedente en v1):** `publishMandateEvent()` en Go dispara el envío en una `goroutine` con `http.Client{Timeout: 2 * time.Second}` contra `http://localhost:48215/internal/mandate-event`, y **silencia fallas de red**. Esto es evidencia directa a favor de D-12 (canal fire-and-forget sin retry) — confirma por qué la UI necesita el plan B de timeout+fallback que ya tiene implementado en `/genesis`.

---

## 6. Deuda técnica y preguntas abiertas — consolidado, todo en un lugar

| # | Ítem | Dueño | Estado tras GAP V3 |
|---|---|---|---|
| D-3 | `dependsOn` entre dominios | Backend | Cerrado a nivel de datos, sin productor real (necesita Capa 1-2 / Fase 2 redefinida) — sin cambios |
| D-9 | `confirmedBy` — identidad de quien confirma | Backend/producto | Vía CLI ✅ resuelto; vía Signal ❌ sigue vacío, decisión de producto pendiente — sin cambios |
| D-11 | Contenido real de `ws-events.ts` | Backend | **✅ Resuelto en esta migración** — leído y cruzado contra Go. Ver §5.2 para los 3 eventos faltantes + 1 payload incompleto. |
| D-12 | Canal de eventos fire-and-forget, sin retry | Backend/Frontend | **✅ Confirmado por código** — `goroutine` + timeout 2s + fallas silenciadas (ver §5.2). UI ya tiene plan B en `/genesis`. |
| D-13 | Layout de filesystem real (plano) vs. árbol documentado (anidado) | Backend | **✅ Resuelto en esta migración** — es plano. Ver §5.1. |
| Q-02 | Endpoints `GET/POST /api/project/docs` | Backend | Bloquea que el picker de Capa 0 funcione de verdad, no solo la UI — sin cambios |
| Q-08 | Endpoint que exponga `genesis_mandate_id`+fase para redirect automático a `/genesis` | Backend | Hoy `/genesis` solo es alcanzable por link manual en el Sidebar — sin cambios |
| `mandate_dir` | Campo nuevo en `GenesisMandateResult` (Go) | Backend | Propuesto, viable, no aplicado todavía — sin evidencia nueva en GAP V3 |
| Preload bridge Core | `window.nucleus` en `preload_core.js` | Frontend | Reportado como arreglado por la sesión de Frontend — archivo real todavía no confirmado por esta sesión |
| D-05 (heredado) | `registerSynapseHandlers` no se llama en el path de Core | Frontend | Sin resolver, deuda conocida desde el Preludio original |
| Sync `ing/` | `mandate_state.json.currentPhase` vs. `.ing_state.json.phase_active` — orden de escritura y comportamiento ante falla parcial | Backend | No bloquea hoy — sin decisión de diseño todavía (ver §8) |
| **D-14 (nuevo)** | **`runGenIntentActivity` no existe en el código.** Cualquier referencia previa (en esta familia de documentos o en discusión) a que el workflow invoca esa función queda cerrada como incorrecta — el workflow real solo dispara `PublishMandateEventActivity` (Fase 1) y `ScaffoldDomainActivity` (Fase 2). | Backend | **✅ Cerrado por código — GAP V3** |
| **D-15** | ¿El puente Go↔`ing/` para Fase 1 y Fase 2 ya existe en algún lado no cubierto por el GAP V3, o es enteramente trabajo pendiente? (planteada en §9) | Backend | **✅ Resuelto** — el puente es invocación CLI subprocess de `brain intent {create,hydrate,add-turn,submit,finalize}`, mismo patrón que ya usa el plugin de VS Code. No requiere Sentinel ni cliente TCP nuevo. |
| **D-18 (nuevo)** | Discrepancia de protocolo/puerto: `server_manager.py` usa Big Endian en el header de 4 bytes sobre :5678 (servidor real de Brain); `submit_intent()` en `intent_manager.py` abre su propio socket también por defecto a :5678 pero con header Little Endian, apuntando conceptualmente al "native host bridge" (`bloom-host.exe`, según su docstring). | Backend | **⬜ Abierto** — confirmar el puerto real de `bloom-host.exe` antes de asumir que son el mismo socket: riesgo de colisión de puerto o de doc desactualizada. |
| **D-19 (nuevo, v3)** | Modelo de ejecución dual de Intents BISP (`ing` para el pipeline de ingesta local, `dis` para el análisis/discovery global retrospectivo) | Backend/producto | **✅ Resuelto en esta migración** — formalizado e independizado como dos intents con spec propia (`ING_Intent_Spec_v1_1.md`, `DIS_Intent_Spec_v1_0.md`). `ing` propone localmente vía `.domain_resolution.json` sin tocar el mapa global hasta confirmar; `dis` corre bajo demanda o tras acumulación de cambios incrementales y es dueño exclusivo de la reestructuración global del grafo BISP (fusión/split/rename de Dominio, altas de arista cross-domain). Ninguno de los dos existe todavía invocado desde el código Go (ver fila `dis/` en §2 y D-15) — lo resuelto acá es el *diseño del reparto de responsabilidades*, no la implementación. |
| **D-20 (nuevo, v3)** | Sincronización de contratos de metadata entre los artefactos de `ing/` (`.domain_resolution.json`, propuesta local por lote) y el grafo global revaluado por `dis/` (`.domain_graph_snapshot.json` al arrancar `.discovery/`, `.mapping_proposal.json` en `.mapping/`, `.domain_graph_delta.json` al cerrar `.ratification/`) | Backend | **⬜ Abierto, nuevo** — ambos intents leen y escriben, en última instancia, la misma fuente de verdad (`.cache/.semantic-index.json`), pero en momentos distintos y con distinta granularidad: `ing/.consolidation` siembra o extiende **una** arista por commit; `dis/.ratification` puede reescribir el grafo entero de una corrida. Falta definir explícitamente qué pasa si una corrida de `ing/` cierra su turno (`committed: true`) **mientras** una corrida de `dis/` tiene un `.mapping/` en curso sobre el mismo `domain_id` — el snapshot que tomó `dis/` en `.discovery/` (`.domain_graph_snapshot.json`) quedaría desactualizado respecto al `semantic-index.json` real al momento de `.ratification/`. Ninguna de las dos specs (`ING_Intent_Spec_v1_1.md` §4/§5, `DIS_Intent_Spec_v1_0.md` §7.3) define un lock o una regla de reintento para esta carrera — la única garantía firme hoy es que un `domain_id` absorbido por un merge o reemplazado por un split nunca se reasigna (§7.3 DIS), lo que evita colisión de identidad pero no resuelve la carrera de escritura. Relacionado con, pero distinto de, el ítem "Sync `ing/`" ya existente en esta tabla (ese es `mandate_state.json` vs. `.ing_state.json`, a nivel de un solo intent; este es entre dos intents distintos compitiendo por el mismo grafo global). |

---

## 7. Qué hacer ahora, en orden de prioridad real

1. **Confirmar el Paso 2 (tab-bar)** cuando la sesión de Frontend lo entregue — archivo real, no resumen.
2. **Confirmar `main_conductor.js`/`preload_core.js`** reales para cerrar el bridge de `window.nucleus` (reportado, no verificado todavía por esta sesión).
3. **Seguir la secuencia 3 → 4 → 5** de la migración de UI, sin saltos — es la que ya decidimos y la que evita repetir errores de diseñar en abstracto.
4. **Q-02 y Q-08** (los dos endpoints de Backend) pueden ir en paralelo a la migración de UI — no compiten por la misma sesión de Frontend.
5. **Implementar la redefinición de Fase 1 y Fase 2** (§2, columna "Objetivo `ing/`") invocando `brain` como subproceso CLI directamente desde las Activities de Go (`mandate_genesis_activities.go`) — **no** abrir un cliente TCP nuevo ni pasar por Sentinel (ver §6 D-15) — es ahora la ruta crítica real para que Capas 1-2 del Bootstrap Strategy dejen de estar bloqueadas por "técnica sin decidir" — priorizar sobre Capa 3, que sigue sin ruta crítica.
6. **Capa 3 del Bootstrap Strategy** (biblioteca de patrones) queda para después del lanzamiento — no es parte de la ruta crítica.
7. **Actualizar `ws-events.ts`** con los 3 eventos faltantes y el payload de `mandate:action:completed` (§5.2) — es deuda chica, cross-cutting, y ya está identificada con precisión de línea de código.
8. **Actualizar `bloom_project_tree.txt` (nuevo en v3)** para reflejar las rutas de artefactos e índices reales de `ing/` y `dis/`, hoy ausentes o desactualizadas en ese árbol de referencia:
   - De `ing/` (`ING_Intent_Spec_v1_1.md` §2): `.reception/` (con `.files/.rawbase.json` y `.rawbase_index.json`), `.classification/.turn_X/.files/.domain_resolution.json`, `.consolidation/.turn_X/` (con `.consolidation.json`), y el `.pipeline/` espejo por fase.
   - De `dis/` (`DIS_Intent_Spec_v1_0.md` §2): `.discovery/.files/` (`.genebase.json`, `.genebase_index.json`, `.domain_graph_snapshot.json`), `.mapping/.turn_X/.files/.mapping_proposal.json`, `.ratification/.turn_X/.files/.domain_graph_delta.json`, y su propio `.pipeline/` espejo — más el archivo de estado `.dis_state.json` a nivel de intent, análogo a `.ing_state.json`.
   - Deuda chica, cross-cutting igual que el punto 7, pero importante para que cualquiera que navegue el filesystem de un Mandate no se encuentre con carpetas `.reception/`/`.discovery/` etc. no documentadas en el árbol de referencia.

---

## 8. Documentos relacionados (ya existentes, este no los reemplaza)

- `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` — contrato técnico detallado de Backend (RESOLUCIÓN v1.3) — **revisar tras esta migración: puede tener las mismas afirmaciones sobre `RawDocs`/TCP:5678/`runGenIntentActivity` ya corregidas acá**
- `bloom-mandate-arquitectura-genesis-conductor.md` — arquitectura completa + UX del Conductor
- `BLOOM_Genesis_UI_Roadmap_v1.md` — roadmap específico de UI (multidominio, eventos)
- `BLOOM_Domain_Bootstrap_Strategy_v0_1.md` — las Capas 0-3 en detalle
- `Bloom Conductor — Workspace Core UI.md` / `BLOOM_CORE_GENESIS_MANDATE_PRELUDIO_v0_1.md` — documentos de producto/UX que trajiste vos, fuente de las 4 Zonas y F-01 a F-09
- `ING_Intent_Spec_v1_1.md` — especificación interna del intent `ing/` (motor de Brain detrás de las Fases 1-2, ver §9) — **reemplaza a `ING_Intent_Spec_v1_0.md`** en esta migración; v1.1 saca el campo `domain` de `gen.json` y lo mueve a `.cache/.semantic-index.json` keyeado por `domain_id`, precisamente para poder convivir con `dis/`
- `DIS_Intent_Spec_v1_0.md` — **nuevo en esta migración**, especificación interna del intent `dis/` (motor de Brain para el análisis retrospectivo/discovery de dominios, ver §9) — depende de `ING_Intent_Spec_v1_1.md`, asume la propiedad de la topología de Dominios a partir de esa versión
- `gap_vectorizacion_genesis_v3.md` — fuente primaria de todo lo marcado "✅ Confirmado (código real — GAP V3)" en este documento

Este documento es el índice — cuando haga falta el detalle de algo, se busca en el documento correspondiente de la lista de arriba, no se repite acá.

---

## 9. `ing/` + `dis/` — los dos motores internos detrás del ciclo de vida de un Genesis Mandate (resuelto, integrado)

**Nivel de abstracción distinto al resto de este documento — no colisiona, se integra.** Todo lo de arriba (Fases 1-4) describe la orquestación **externa**: el `MandateGenesisBuildWorkflow` de Temporal/Go, los Signals de Electron, la UI. Por debajo de esa orquestación, dos Intents BISP hacen el trabajo real, con specs propias e independientes:

- **`ing/`** (`ING_Intent_Spec_v1_1.md`, verificado línea por línea contra el archivo real) es la especificación **interna** de cómo Brain/Nucleus procesa el pipeline directo de ingesta de un proyecto/archivos — vectorización, resolución local Raw→Dominio→Gene, persistencia de `.genes/`. Es invocado **directamente** por Fase 1 y Fase 2 del Workflow (ver §2).
- **`dis/`** (`DIS_Intent_Spec_v1_0.md`) es la especificación **interna** de la fase de análisis retrospectivo/discovery de dominios — toma el corpus completo de Genes ya ingeridos por una o más corridas de `ing/` y reescribe el grafo global de `.cache/.semantic-index.json`. **No es invocado por ninguna Fase del Workflow**: corre aparte, bajo demanda o tras acumulación de cambios incrementales (ver tabla de disparo más abajo).

El Workflow en Go no se modifica por la existencia de ninguno de los dos: `ing/` y `dis/` corren debajo de él, en momentos distintos.

### 9.1 Mapeo Fase → `ing/` (invocación directa desde Fase 1 y Fase 2)

| Fase (Temporal/Go, externa) | Dispara en `ing/` (interna) |
|---|---|
| 1 — ingest | `.reception/` — acto único, sin turnos, recibe el raw material; escribe `.files/.rawbase.json` (inventario BISP-compatible) y `.files/.rawbase_index.json` (texto extraído) |
| 2 — cluster | `.classification/` — resolución local en dos pasadas (Dominio primero, Gene después), compara solo contra dominios ya existentes al momento de la corrida; escribe la propuesta en `.turn_X/.files/.domain_resolution.json` |
| 3 — validate | `.consolidation/` — abre turno con `committed: false` en `.consolidation.json`, renderiza la propuesta de `.domain_resolution.json`, espera Signal humano (`approved`/`overridden`/`rejected` por entrada) |
| 4 — scaffold | Mismo turno de `.consolidation/` muta a `committed: true` → por cada entrada aprobada, escribe `.genes/{gene_id}/gen.json` (nuevo) o `.genes/{gene_id}/.history/.delta_N/` (extend), y siembra o extiende **exactamente una arista** Domain↔Gene en `.cache/.semantic-index.json` |

**Límite explícito de esta invocación (v1.1, no existía como aclaración formal en v2):** el commit de Fase 4 sobre `.semantic-index.json` nunca agrega una segunda arista a un Gene que ya tenía Dominio, nunca fusiona, nunca divide, nunca renombra un Dominio existente. Cualquier necesidad de esas operaciones queda fuera del alcance de Fases 1-4 y pasa a ser trabajo de `dis/` — ver §9.2.

**Tensión heredada de v2, sigue vigente:** el mapeo de arriba asume que Fase 1 "recibe el raw material" y Fase 2 "resuelve Dominio→Gene" como si ya estuvieran conectadas a `ing/`. Pero §2 de este mismo documento confirma, por código, que **hoy Fase 1 y Fase 2 en Go no llaman a nada de esto** — son un evento hueco y un `dry_run` mock, respectivamente. El mapeo de esta tabla sigue siendo el diseño objetivo válido, pero no describe una conexión que exista hoy en el código (D-15, ver §6).

**Aclaración (post-cierre de D-15, ver §6):** la tabla de mapeo Fase→`ing/` de arriba sigue siendo correcta tal cual está — Fase 1 sigue disparando `.reception/`, Fase 2 sigue disparando `.classification/`, y así. El mecanismo de invocación no es un cliente TCP nuevo hablándole a Brain por el socket del Event Bus, es `brain` invocado como subproceso CLI directamente desde las Activities de Go (`brain intent create --type ing`, `hydrate`, `add-turn`, `submit`, `finalize`) — mismo patrón que ya usa el plugin de VS Code, sin pasar por Sentinel.

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) ya contemplada en el spec: `.classification/` no aborta, difiere resolución a decisión manual en `.consolidation/`.

### 9.2 `dis/` — no mapea a una Fase, dispara aparte (nuevo en v3)

A diferencia de `ing/`, `dis/` no tiene una fila 1:1 en la tabla de Fases del Workflow porque **no es parte del ciclo de vida de un único Genesis Mandate** — es Nucleus-wide y retrospectivo por diseño (`DIS_Intent_Spec_v1_0.md`, Rationale). Su ciclo interno de tres fases es propio:

| Fase interna de `dis/` | Comportamiento | Artefacto clave |
|---|---|---|
| `.discovery/` | Sin turnos, carga de contexto cara (todo el corpus de Genes + grafo completo) — mismo rol que `.reception/` de `ing/` | `.files/.genebase.json` (snapshot de linaje, sin domain), `.files/.domain_graph_snapshot.json` (copia de `.semantic-index.json` al arrancar) |
| `.mapping/` | Con turnos, propone altas/bajas de arista, fusiones, splits y renombres de Dominio — mismo rol que `.classification/` de `ing/`, pero global en vez de local | `.turn_X/.files/.mapping_proposal.json` |
| `.ratification/` | Con turnos, `committed: false → true`; al cerrar, aplica el mapa final a `.cache/.semantic-index.json` | `.turn_X/.files/.domain_graph_delta.json` (qué cambió respecto al snapshot) |

**Disparo (posicionamiento pedido en esta migración):** `dis/` se ejecuta **bajo demanda o tras la acumulación de cambios incrementales** de una o más corridas de `ing/` — no en cada corrida, no automáticamente encadenado a Fase 2. Casos concretos que lo justifican (`DIS_Intent_Spec_v1_0.md`, Rationale): (a) un Mandate Génesis con múltiples corridas de `ing/` puede terminar creando dos Dominios que en realidad son el mismo territorio conceptual, porque cada corrida de `.classification/` solo compara contra lo ya consolidado, nunca reconsidera dominios entre sí; (b) un Gene puede legítimamente pertenecer a más de un Dominio (cross-domain), y detectar esa segunda pertenencia requiere comparar Genes y Dominios entre sí, no comparar un lote nuevo contra lo existente. Ninguno de los dos casos es detectable desde `ing/` por diseño — de ahí que `dis/` exista como intent aparte y no como una ampliación de `.classification/`.

Igual que `ing/`, se invoca como subproceso CLI desde donde corresponda orquestarlo (`brain intent create --type dis --json`, seguido del mismo ciclo `hydrate/add-turn/submit/finalize`) — no vía TCP ni Sentinel, mismo criterio de D-15. Hoy no existe ningún disparador de `dis/` implementado en el código Go ni en ningún otro punto del sistema — es enteramente trabajo pendiente, sin evidencia de código todavía (ver fila `dis/` en §2).

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) contemplada igual que en `ing/`: `.mapping/` no aborta, difiere resolución a decisión manual en `.ratification/`.

**Garantía de integridad (§7.3 DIS, relevante para D-20 en §6):** un `domain_id` usado y luego absorbido por un merge, o reemplazado por un split, **nunca se reasigna** a una entidad nueva — evita colisión de identidad entre lo que `ing/` pudo haber escrito en paralelo y lo que `dis/` está reescribiendo.

**Punto sin resolver, no bloqueante — sigue en la tabla de deuda técnica (§6):** sincronización entre `mandate_state.json` (`currentPhase`, nivel Mandate) y `.ing_state.json` (`phase_active`, nivel Intent) — quién escribe primero en cada transición, y qué pasa si uno avanza y el otro no ante una falla a mitad de camino. Decisión pendiente, no asumida. Ver también D-20 (§6), la misma clase de problema pero entre `ing/` y `dis/` compitiendo por el mismo grafo global.
