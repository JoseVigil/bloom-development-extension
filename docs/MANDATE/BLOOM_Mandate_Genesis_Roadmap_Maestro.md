# BLOOM Mandate Genesis — Roadmap Maestro (documento único de orientación)

**Propósito:** este es el único documento que junta todo lo que se decidió y construyó en esta sesión — Backend (Go/Nucleus), Frontend (Electron + Svelte webview), y las Capas del Bootstrap Strategy. Cuando te sientas perdido, empezá acá, no en el historial de chat.

**Regla de esta sesión:** todo lo que se marca "✅ Confirmado" fue verificado contra un archivo real, no contra un resumen. Todo lo que dice "🔄 En curso" o "⬜ Sin empezar" es honesto sobre su estado — no hay nada "medio hecho" escondido.

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
  └── step MANDATE (último step): copy + botón → dispara `nucleus mandate genesis --project --source --docs?`
        └── escribe mandate_state.json (currentPhase: "ingest", status: "pending")
        └── dispara onboarding:complete → Opción C: ventana nueva (Core) + cierre de la vieja
                │
                ▼
CORE (Electron, ventana 2 — Svelte webview en :5173)
  └── mandate_watcher.go (servicio Go, ya corriendo en paralelo) detecta el archivo por fsnotify
        └── arranca MandateGenesisBuildWorkflow (Temporal) — YA CORRIÓ o está por correr
              │
              ▼
        FASE 1 — ingest        (automático, sin input humano)
        FASE 2 — cluster       (automático hoy: siempre devuelve 1 dominio, sin Capas 1-3 reales)
        FASE 3 — validate      (ÚNICO paso con input humano: confirmar/renombrar dominios — HTML ya construido)
        FASE 4 — scaffold      (automático, placeholder — P4 real no implementado)
```

**El picker de Capa 1** (`/genesis` en el webview) vive **en Core**, y hoy es best-effort — no bloquea ni pausa Fase 1, porque no existe (todavía) un gate en `mandate_watcher.go` que lo obligue a esperar.

---

## 2. Estado por Fase del workflow — Backend

| Fase | Qué hace | Estado Backend |
|---|---|---|
| 1 — ingest | Pulso único de evento, sin escaneo real de archivos | ✅ Corriendo, automático |
| 2 — cluster | `ScaffoldDomainActivity(Mode: dry_run)` — hoy SIEMPRE devuelve 1 dominio (`input.Project`) | ✅ Corriendo (con el placeholder conocido) |
| 3 — validate | Espera Signal `mandate:genesis:validate`; CLI (`domains confirm`) y Signal ya señalizan correctamente | ✅ Corriendo — bug de señal CLI→Temporal ya cerrado |
| 4 — scaffold | `SignMandateActivity` arma `mandate.json` firmado; `MandateExecutionWorkflow` (P4 real) sigue placeholder puro | 🔄 Firma real ✅ / ejecución real del scaffold ⬜ |

## 3. Estado por Capa del Bootstrap Strategy — Backend + Frontend

| Capa | Qué es | Backend | Frontend |
|---|---|---|---|
| 0 — Documentación | Detectar docs existentes + drag-and-drop | `--docs` en `mandate genesis` ✅ (solo sirve en creación, no post-mandate) | `docsGate.ts` + `/genesis` ✅ construido — pero 2 endpoints que necesita (`GET/POST /api/project/docs`) ⬜ no existen |
| 1 — Vectorizar (Ollama+ChromaDB) | Extraer patrones de la documentación | ⬜ Sin empezar — técnica sin decidir | N/A |
| 2 — Matching contra filesystem | Proponer dominios reales a partir de los patrones | ⬜ Sin empezar — depende de 1 | N/A |
| 3 — Biblioteca de patrones | Acumular confirmaciones humanas entre mandates | ⬜ Sin empezar — depende de 1-2 | N/A |

**Nota importante:** Capas 1-3 no bloquean el lanzamiento. El sistema funciona hoy con el fallback ya documentado (Fase 2 siempre propone 1 dominio = el proyecto entero). No es ideal, pero es funcional y honesto (la UI ya lo comunica, ver `/genesis`).

## 4. Estado de la migración de UI (los 5 Pasos) — 100% Frontend

| Paso | Qué es | Estado |
|---|---|---|
| 1 — Sidebar fusionado | Rail visual del mock + 6 links reales de SvelteKit | ✅ Confirmado funcionando (verificado en captura real) |
| 2 — tab-bar | Reemplazar `switchTab` vanilla JS por Svelte real + store de tabs | 🔄 En curso — pedido ya enviado a la sesión de Frontend, sin devolución todavía |
| 3 — LedgerPanel | Estructura real + `ledgerStore.ts` (placeholder de datos explícito) | ⬜ Sin empezar — depende de 2 |
| 4 — Frontera GenesisTab/StandardMandateTab | Decidir la diferencia entre los dos tipos de tab, con el shape del Ledger ya definido | ⬜ Sin empezar — depende de 3, **bloquea que `/genesis` se vea dentro de una solapa** |
| 5 — Rutas `/nucleus` y `/projects` | Montar `NucleusPanel.svelte`/`ProjectsPanel.svelte` ya existentes | ⬜ Sin empezar — independiente, puede ir en paralelo en cualquier momento |

**Por qué `/genesis` hoy se ve "suelta", sin tab:** decisión explícita (Opción 1, tomada unos turnos atrás) — se priorizó tener el picker de Capa 0 funcional ya, en vez de esperar a los pasos 2-4. Es esperado, no un bug. Se resuelve solo cuando el Paso 4 esté listo.

## 5. Deuda técnica y preguntas abiertas — consolidado, todo en un lugar

| # | Ítem | Dueño | Bloquea |
|---|---|---|---|
| D-3 | `dependsOn` entre dominios | Backend | Cerrado a nivel de datos, sin productor real (necesita Capa 1-2) |
| D-9 | `confirmedBy` — identidad de quien confirma | Backend/producto | Vía CLI ✅ resuelto; vía Signal ❌ sigue vacío, decisión de producto pendiente |
| D-11 | Contenido real de `ws-events.ts` | Backend | Nunca se leyó completo — el contrato de eventos se infirió de los emisores Go |
| D-12 | Canal de eventos fire-and-forget, sin retry | Backend/Frontend | UI necesita plan B (timeout+fallback) — ya implementado en `/genesis` |
| D-13 | Layout de filesystem real (plano) vs. árbol documentado (anidado) | Backend | Sin resolver cuál es "el correcto" |
| Q-02 | Endpoints `GET/POST /api/project/docs` | Backend | Bloquea que el picker de Capa 0 funcione de verdad, no solo la UI |
| Q-08 | Endpoint que exponga `genesis_mandate_id`+fase para redirect automático a `/genesis` | Backend | Hoy `/genesis` solo es alcanzable por link manual en el Sidebar |
| `mandate_dir` | Campo nuevo en `GenesisMandateResult` (Go) | Backend | Propuesto, viable, no aplicado todavía |
| Preload bridge Core | `window.nucleus` en `preload_core.js` | Frontend | Reportado como arreglado por la sesión de Frontend — **archivo real todavía no confirmado por esta sesión** |
| D-05 (heredado) | `registerSynapseHandlers` no se llama en el path de Core | Frontend | Sin resolver, deuda conocida desde el Preludio original |
| Sync `ing/` | `mandate_state.json.currentPhase` vs. `.ing_state.json.phase_active` — orden de escritura y comportamiento ante falla parcial | Backend | No bloquea hoy — sin decisión de diseño todavía (ver §8) |

---

## 6. Qué hacer ahora, en orden de prioridad real

1. **Confirmar el Paso 2 (tab-bar)** cuando la sesión de Frontend lo entregue — archivo real, no resumen.
2. **Confirmar `main_conductor.js`/`preload_core.js`** reales para cerrar el bridge de `window.nucleus` (reportado, no verificado todavía por esta sesión).
3. **Seguir la secuencia 3 → 4 → 5** de la migración de UI, sin saltos — es la que ya decidimos y la que evita repetir errores de diseñar en abstracto.
4. **Q-02 y Q-08** (los dos endpoints de Backend) pueden ir en paralelo a la migración de UI — no compiten por la misma sesión de Frontend.
5. **Capas 1-3 del Bootstrap Strategy** quedan para después del lanzamiento — no son parte de la ruta crítica.

---

## 7. Documentos relacionados (ya existentes, este no los reemplaza)

- `BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md` — contrato técnico detallado de Backend (RESOLUCIÓN v1.3)
- `bloom-mandate-arquitectura-genesis-conductor.md` — arquitectura completa + UX del Conductor
- `BLOOM_Genesis_UI_Roadmap_v1.md` — roadmap específico de UI (multidominio, eventos)
- `BLOOM_Domain_Bootstrap_Strategy_v0_1.md` — las Capas 0-3 en detalle
- `Bloom Conductor — Workspace Core UI.md` / `BLOOM_CORE_GENESIS_MANDATE_PRELUDIO_v0_1.md` — documentos de producto/UX que trajiste vos, fuente de las 4 Zonas y F-01 a F-09
- `ING_Intent_Spec_v1_0.md` — especificación interna del intent `ing/` (motor de Brain detrás de las Fases 1-4, ver §8)

Este documento es el índice — cuando haga falta el detalle de algo, se busca en el documento correspondiente de la lista de arriba, no se repite acá.

---

## 8. `ing/` — el motor interno detrás de las Fases 1-4 (resuelto, integrado)

**Nivel de abstracción distinto al resto de este documento — no colisiona, se integra.** Todo lo de arriba (Fases 1-4) describe la orquestación **externa**: el `MandateGenesisBuildWorkflow` de Temporal/Go, los Signals de Electron, la UI. `ing/` (`ING_Intent_Spec_v1_0.md`, verificado línea por línea contra el archivo real) es la especificación **interna** de cómo Brain/Nucleus procesa eso por dentro — vectorización, resolución Dominio→Gene, persistencia de `.genes/`/`.semantic-index.json`. El Workflow en Go no se modifica; `ing/` corre debajo de él.

**Mapeo confirmado:**

| Fase (Temporal/Go, externa) | Dispara en `ing/` (interna) |
|---|---|
| 1 — ingest | `.reception/` — acto único, sin turnos, recibe el raw material |
| 2 — cluster | `.classification/` — resolución en dos pasadas, Dominio→Gene, propone `.domain_resolution.json` |
| 3 — validate | `.consolidation/` — abre turno con `committed: false`, renderiza la propuesta, espera Signal humano |
| 4 — scaffold | Mismo turno de `.consolidation/` muta a `committed: true` → dispara escritura de `gen.json`, `.delta_N`, `.semantic-index.json` |

Degradación graceful si Ollama no está disponible (Invariante 3 BISP) ya contemplada en el spec: `.classification/` no aborta, difiere resolución a decisión manual en `.consolidation/`.

**Punto sin resolver, no bloqueante — agregado a la tabla de deuda técnica (§5):** sincronización entre `mandate_state.json` (`currentPhase`, nivel Mandate) y `.ing_state.json` (`phase_active`, nivel Intent) — quién escribe primero en cada transición, y qué pasa si uno avanza y el otro no ante una falla a mitad de camino. Decisión pendiente, no asumida.
