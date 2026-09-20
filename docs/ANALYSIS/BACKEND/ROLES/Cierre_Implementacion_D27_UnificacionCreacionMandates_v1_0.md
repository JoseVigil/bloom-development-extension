# Cierre de Implementación — D-27 (step `mandate_genesis` triplicado) y Unificación de creación de Mandates (Go/CLI vs Node/API) v1.0

**Basado en:** Agenda Maestra, puntos pendientes del cierre estricto del Tema 1 (Mandate Genesis), plan de
4 puntos aprobado por José en esta misma sesión (validación build/test, D-27, unificación de creación de
Mandates, D-25 — este último sacado de alcance por José para un cowork aparte de Core UI).
**Implementado por:** Control, directamente sobre el dispositivo real (el fix de unificación) y por José en su
propio entorno tras la autorización de Control (el borrado de D-27, por indisponibilidad puntual de la
terminal del bridge).
**Verificado por:** Control, código real contra el dispositivo de José en ambos casos — no el reporte, no el
comentario del código.

---

## §0 — Qué se cerró

Los dos últimos puntos pendientes del cierre estricto del Tema 1 (Mandate Genesis), después de que la
validación build/test y el fix de ESLint/`TestRegisterGravityActivities` se cerraran antes en esta misma
sesión:

1. **D-27** — un tercer camino de arranque de Mandate Genesis, huérfano y drifteado (task queue de Temporal
   equivocada), eliminado del repo.
2. **Unificación de creación de Mandates** — las dos entradas vivas (CLI Go, API Node) ya compartían mecanismo
   pero no el shape completo de `mandate_state.json`; ahora sí.

Con esto no queda ningún punto abierto del bloque que la Agenda Maestra definía para el cierre estricto del
Tema 1 (el único punto restante, D-25, está fuera de alcance por decisión explícita de José, cowork aparte).

## §1 — D-27, diagnóstico y resolución

### Diagnóstico

Trazado de código real (no de comentarios) sobre las tres implementaciones que efectivamente construyen o
arrancan un Mandate Genesis:

- `installer/nucleus/internal/orchestration/commands/mandate.go` (`createBuildMandate`) — CLI, Go. Escribe
  `mandate_state.json`; el watcher de Nucleus (`internal/orchestration/watchers/mandate_watcher.go`, fsnotify)
  dispara `MandateBuildWorkflow`.
- `src/api/handlers/create-mandate.handler.ts` (`createMandateHandler`) — API, Node. Mismo mecanismo
  archivo+watcher. Confirmado wireado y vivo: `src/api/routes/mandates.routes.ts` conecta
  `POST /mandates → createMandateHandler`, sin dependencia de `temporalClient` (confirmado por el propio
  comentario del archivo de rutas).
- `src/temporal/client.ts` (`startMandateBuildWorkflow`) + `src/workflows/mandate-build-workflow.types.ts` —
  un tercer camino, Node, que **ignoraba** el mecanismo archivo+watcher y arrancaba
  `MandateBuildWorkflow` directo contra el cliente de Temporal, con `taskQueue: 'nucleus-mandates'`
  hardcodeado. El worker Go real (`internal/orchestration/temporal/worker.go`) registra el worker de mandates
  en la task queue `"mandate-orchestration"` — un nombre distinto. Si esta vía se hubiera invocado alguna vez,
  el workflow habría quedado arrancado en Temporal sin ningún worker escuchando esa cola.

Verificado, antes de proponer el borrado, que esta tercera vía no estaba wireada a ningún endpoint real:
`mandates.routes.ts` no la importa, y `src/api/server.ts` (bootstrap completo de Fastify) no tiene ninguna
mención a Temporal. Código huérfano — no un camino compitiendo en runtime hoy — pero presente en el repo,
compilable, y desalineado del mecanismo real: exactamente el riesgo de drift que D-27 señalaba.

### Resolución

```
rm -f src/temporal/client.ts src/workflows/mandate-build-workflow.types.ts
```

Ejecutado por José en su entorno, tras diagnóstico y autorización de Control. Verificado por Control
independientemente contra el dispositivo real (`device_list_dir` sobre `src/temporal/` y `src/workflows/`,
ambos directorios vacíos después del borrado) — no se tomó el reporte de José como confirmación suficiente por
sí sola.

## §2 — Unificación de creación de Mandates

### Diagnóstico

Diff campo por campo entre los dos productores vivos de `mandate_state.json`
(`mandate.go:initialBuildMandateState()` vs el bloque GENESIS/DOMAIN_EXPANSION de
`create-mandate.handler.ts`), cruzado contra los dos consumidores reales
(`mandate_watcher.go`, que arma `MandateBuildInput`; `list-mandates.handler.ts`, que sirve `GET /mandates`).
Antes de este cierre, ambos productores ya compartían mecanismo (mismo archivo, mismo watcher) y la mayoría de
los campos — quedaban 3 diferencias reales:

| Campo | Go (CLI) | Node (API), antes del fix | Uso real verificado |
|---|---|---|---|
| `currentStatus` | no existe | `'building'` (duplicaba `status`) | Ningún consumidor lo necesitaba — `list-mandates.handler.ts::normalizeStatus` ya toleraba su ausencia, cayendo a `status` sin warning. Solo existía como campo redundante y fuente de riesgo de drift si algún día divergía de `status`. |
| `createdAt` | sí | no existía | Consumido por `list-mandates.handler.ts` para la fecha de creación en `GET /mandates` — los mandates creados vía API salían sin esa fecha en el listado. |
| `docsProvided` | sí (`[]` si no se pasó `--docs`) | no existía | No leído de vuelta por el watcher ni por las activities de Go auditadas (`mandate_genesis_activities.go`) — metadata de auditoría, pero el shape debía coincidir igual entre ambos productores. |

### Implementación

`src/api/handlers/create-mandate.handler.ts`, rama GENESIS/DOMAIN_EXPANSION únicamente (la rama `standard`,
que escribe `mandate_draft.json` y no pasa por el watcher de build, queda fuera de este alcance):

```diff
-    status: 'building' as const,
-    currentStatus: 'building' as const,
-    currentPhase: 'ingest' as const,
-    stateVersion: 1,
-    updatedAt: now,
+    status: 'building' as const,
+    currentPhase: 'ingest' as const,
+    stateVersion: 1,
+    createdAt: now,
+    updatedAt: now,
+    docsProvided: [] as string[],
```

Implementado por Control directamente sobre el dispositivo real, commiteado y releído byte a byte después
(no confiando en la respuesta del commit) — confirmado sin `currentStatus` y con `createdAt`/`docsProvided`
presentes en el bloque GENESIS/DOMAIN_EXPANSION.

## §3 — Alcance y no-alcance

Ninguno de los dos puntos tocó `internal/authority`, `internal/governance/decision`, el worker de Temporal en
sí (`worker.go` no se modificó), ni ningún invariante de `AuthorityMode`/`remote_enforced` — §Z.24 del Tablero
sigue intacto tal como quedó. D-27 fue eliminación de código muerto y desalineado, sin efecto en runtime hoy.
La unificación fue un ajuste de 3 campos en un único archivo — no una reescritura del mecanismo de creación,
que ya era el correcto (archivo + watcher) desde antes de este cierre.

## §4 — Efecto neto: Tema 1 (Mandate Genesis) cerrado al 100%

De los 4 puntos que la Agenda Maestra listaba para el cierre estricto del Tema 1:

1. Validación completa build/test — cerrado (modelo de validación de `build-all.py` como autoridad, hallazgos
   de Go no relacionados triados y derivados a backlog de deuda técnica por decisión explícita de José;
   ESLint corregido; `TestRegisterGravityActivities` actualizado y confirmado no colateral de §Z.24).
2. D-27 — cerrado, este documento.
3. Unificación de creación de Mandates — cerrado, este documento.
4. D-25 (Core UI Redesign) — fuera de alcance por decisión explícita de José, cowork aparte.

No queda ningún punto abierto de este bloque. El Mandate Genesis real —creación (CLI o API, mismo shape),
build (`MandateBuildWorkflow`), firma, ejecución, resolución de credencial Anthropic vía Nucleus Vault,
continuidad verificada ante reinicio de servicios a mitad de corrida— queda operativo y cerrado de punta a
punta, con aceptación E2E real ya declarada por José (ver
`Cierre_Diagnostico_Correccion_Bloqueo_E2E_Mandate_Genesis_AITAP_Vault_v1_0.md`).
