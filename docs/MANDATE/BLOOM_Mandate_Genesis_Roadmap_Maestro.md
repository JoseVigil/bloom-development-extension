# BLOOM Mandate Genesis — Roadmap Maestro (documento único de orientación)
**Migrado a `ing/` — v2, cross-check contra GAP V3 (código real Go/TS)**

**Propósito:** este es el único documento que junta todo lo que se decidió y construyó en esta sesión — Backend (Go/Nucleus), Frontend (Electron + Svelte webview), y las Capas del Bootstrap Strategy. Cuando te sientas perdido, empezá acá, no en el historial de chat.

**Regla de esta sesión (heredada, sigue vigente):** todo lo que se marca "✅ Confirmado" fue verificado contra un archivo real, no contra un resumen. Todo lo que dice "🔄 En curso" o "⬜ Sin empezar" es honesto sobre su estado — no hay nada "medio hecho" escondido.

**Regla nueva de esta migración:** a partir de v2, "✅ Confirmado" se subdivide en dos niveles porque ahora hay dos fuentes distintas de verdad:
- **✅ Confirmado (código real — GAP V3):** verificado línea por línea contra `mandate_genesis_activities.go`, `mandate_genesis_build_workflow.go`, `mandate_watcher.go`, `ws-events.ts`.
- **✅ Confirmado (spec previa, sin cross-check de código en esta ronda):** lo que ya estaba marcado ✅ en v1 pero el GAP V3 no lo tocó — sigue siendo válido, pero no fue re-verificado ahora.
- **🎯 Redefinido (objetivo, no implementado):** partes de este documento que antes describían *estado actual* y ahora, por instrucción explícita de esta migración, describen el *diseño objetivo* de `ing/`. El código real de hoy **todavía no hace esto** — se marca así para no confundir "lo que queremos que haga Fase 1/2" con "lo que Fase 1/2 hace hoy".

---

## 0. Glosario — para no volver a confundir esto

Tres numeraciones conviven en esta sesión y **no son la misma cosa**:

| Término | Qué es | Ejemplos |
|---|---|---|
| **Fases** (1-4) | El ciclo de vida técnico de UN Genesis Mandate ya creado: `ingest → cluster → validate → scaffold` | Fase 3 = pantalla de confirmar dominios |
| **Capas** (0-3) | La estrategia del *Bootstrap Strategy* para que la Fase 2 (cluster) tenga datos reales en vez de un placeholder | Capa 0 = subir documentación |
| **Pasos** (1-5) | La migración de UI de Core de HTML/vanilla-JS a Svelte real | Paso 1 = Sidebar fusionado |

Estos tres ejes son ortogonales entre sí — un Mandate puede estar en Fase 3, mientras Capa 1 todavía no existe, mientras la UI sigue en Paso 2 de la migración. No se bloquean mutuamente salvo donde se indica explícitamente abajo.

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

| Fase | Estado real hoy (✅ código — GAP V3) | Objetivo `ing/` (🎯 Redefinido, no implementado) |
|---|---|---|
| 1 — ingest | Una sola `PublishMandateEventActivity` que emite el evento `mandate:phase:ingest` con `mandateId`. **No lee archivos, no llama a Brain, no toca ChromaDB.** Es, literalmente, un evento hueco. | Leer los archivos de contexto desde `{MandatesRoot}/{MandateID}`, empaquetar el payload BISP de ingesta, extraer texto y coordinar la vectorización en ChromaDB — reemplazando el evento hueco actual. |
| 2 — cluster | `ScaffoldDomainActivity` con `Mode: dry_run`. **No clusteriza nada**: devuelve siempre un único dominio igual a `input.Project`. No existe canal a Brain — el cliente TCP:5678 mencionado en specs previas **no existe en Go**. | Pasar de mock `dry_run` a un Intent BISP procesado vía Synapse / IA generativa, que valide la coherencia semántica de los dominios propuestos antes de llegar a Fase 3. |
| 3 — validate | Espera Signal `mandate:genesis:validate`; CLI (`domains confirm`) y Signal ya señalizan correctamente. | Sin cambios de esta migración — se mantiene igual. |
| 4 — scaffold | `SignMandateActivity` arma `mandate.json` firmado; `MandateExecutionWorkflow` (P4 real) sigue placeholder puro. | Sin cambios de esta migración — se mantiene igual. |

**Nota crítica de esta migración:** en v1 de este documento, Fase 1 y Fase 2 estaban marcadas "✅ Corriendo, automático" sin distinguir entre "corre sin errores" y "hace algo real". El GAP V3 deja esto sin ambigüedad: **corren, pero Fase 1 no ingiere nada y Fase 2 no clusteriza nada.** La columna "Objetivo `ing/`" de arriba es la redefinición formal pedida para esta migración — es diseño, todavía no código.

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

---

## 7. Qué hacer ahora, en orden de prioridad real

1. **Confirmar el Paso 2 (tab-bar)** cuando la sesión de Frontend lo entregue — archivo real, no resumen.
2. **Confirmar `main_conductor.js`/`preload_core.js`** reales para cerrar el bridge de `window.nucleus` (reportado, no verificado todavía por esta sesión).
3. **Seguir la secuencia 3 → 4 → 5** de la migración de UI, sin saltos — es la que ya decidimos y la que evita repetir errores de diseñar en abstracto.
4. **Q-02 y Q-08** (los dos endpoints de Backend) pueden ir en paralelo a la migración de UI — no compiten por la misma sesión de Frontend.
5. **Implementar la redefinición de Fase 1 y Fase 2** (§2, columna "Objetivo `ing/`") es ahora la ruta crítica real para que Capas 1-2 del Bootstrap Strategy dejen de estar bloqueadas por "técnica sin decidir" — priorizar sobre Capa 3, que sigue sin ruta crítica.
6. **Capa 3 del Bootstrap Strategy** (biblioteca de patrones) queda para después del lanzamiento — no es parte de la ruta crítica.
7. **Actualizar `ws-events.ts`** con los 3 eventos faltantes y el payload de `mandate:action:completed` (§5.2) — es deuda chica, cross-cutting, y ya está identificada con precisión de línea de código.

---

## 8. Documentos relacionados (ya existentes, este no los reemplaza)

- `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` — contrato técnico detallado de Backend (RESOLUCIÓN v1.3) — **revisar tras esta migración: puede tener las mismas afirmaciones sobre `RawDocs`/TCP:5678/`runGenIntentActivity` ya corregidas acá**
- `bloom-mandate-arquitectura-genesis-conductor.md` — arquitectura completa + UX del Conductor
- `BLOOM_Genesis_UI_Roadmap_v1.md` — roadmap específico de UI (multidominio, eventos)
- `BLOOM_Domain_Bootstrap_Strategy_v0_1.md` — las Capas 0-3 en detalle
- `Bloom Conductor — Workspace Core UI.md` / `BLOOM_CORE_GENESIS_MANDATE_PRELUDIO_v0_1.md` — documentos de producto/UX que trajiste vos, fuente de las 4 Zonas y F-01 a F-09
- `ING_Intent_Spec_v1_0.md` — especificación interna del intent `ing/` (motor de Brain detrás de las Fases 1-4, ver §9)
- `gap_vectorizacion_genesis_v3.md` — **nuevo en esta migración**, fuente primaria de todo lo marcado "✅ Confirmado (código real — GAP V3)" en este documento

Este documento es el índice — cuando haga falta el detalle de algo, se busca en el documento correspondiente de la lista de arriba, no se repite acá.

---

## 9. `ing/` — el motor interno detrás de las Fases 1-4 (resuelto, integrado)

**Nivel de abstracción distinto al resto de este documento — no colisiona, se integra.** Todo lo de arriba (Fases 1-4) describe la orquestación **externa**: el `MandateGenesisBuildWorkflow` de Temporal/Go, los Signals de Electron, la UI. `ing/` (`ING_Intent_Spec_v1_0.md`, verificado línea por línea contra el archivo real) es la especificación **interna** de cómo Brain/Nucleus procesa eso por dentro — vectorización, resolución Dominio→Gene, persistencia de `.genes/`/`.semantic-index.json`. El Workflow en Go no se modifica; `ing/` corre debajo de él.

**Mapeo confirmado (spec `ing/`, sin cross-check de código en esta ronda de GAP V3):**

| Fase (Temporal/Go, externa) | Dispara en `ing/` (interna) |
|---|---|
| 1 — ingest | `.reception/` — acto único, sin turnos, recibe el raw material |
| 2 — cluster | `.classification/` — resolución en dos pasadas, Dominio→Gene, propone `.domain_resolution.json` |
| 3 — validate | `.consolidation/` — abre turno con `committed: false`, renderiza la propuesta, espera Signal humano |
| 4 — scaffold | Mismo turno de `.consolidation/` muta a `committed: true` → dispara escritura de `gen.json`, `.delta_N`, `.semantic-index.json` |

**Tensión a resolver explícitamente (nueva, surge de esta migración):** el mapeo de arriba asume que Fase 1 "recibe el raw material" y Fase 2 "resuelve Dominio→Gene" como si ya estuvieran conectadas a `ing/`. Pero §2 de este mismo documento confirma, por código, que **hoy Fase 1 y Fase 2 en Go no llaman a nada de esto** — son un evento hueco y un `dry_run` mock, respectivamente. El mapeo de esta tabla sigue siendo el diseño objetivo válido, pero no describe una conexión que exista hoy en el código. Se agrega como ítem de deuda:

**D-15 (nuevo):** ¿El puente Go↔`ing/` para Fase 1 y Fase 2 ya existe en algún lado no cubierto por el GAP V3, o es enteramente trabajo pendiente? Sin evidencia de código todavía — no asumir que existe solo porque la spec de `ing/` lo describe.

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) ya contemplada en el spec: `.classification/` no aborta, difiere resolución a decisión manual en `.consolidation/`.

**Punto sin resolver, no bloqueante — sigue en la tabla de deuda técnica (§6):** sincronización entre `mandate_state.json` (`currentPhase`, nivel Mandate) y `.ing_state.json` (`phase_active`, nivel Intent) — quién escribe primero en cada transición, y qué pasa si uno avanza y el otro no ante una falla a mitad de camino. Decisión pendiente, no asumida.
