# BLOOM — Estado consolidado (takeaway de sesión)

**Por qué existe este documento:** en esta sesión se investigó a fondo el mecanismo de eventos de Mandate Genesis y se implementó la mitad del trabajo pendiente; en paralelo existe (de una sesión anterior) una investigación igual de profunda sobre los tipos de Intent (`ing`/`dis`/`dev`/`doc`/`exp`/`cor`/`inf`) que no debe perderse de vista solo porque esta sesión se concentró en Mandate Genesis. Este documento es el índice único: qué se investigó, qué se implementó, qué queda pendiente y dónde vive cada pieza — para que ningún hilo quede "en la nada".

---

## 1. Mandate Genesis — mecanismo de eventos (esta sesión)

**Estado: investigado con evidencia y **implementado**.**

Se confirmó, contra código real (no contra documentos de diseño desactualizados):

- `create-mandate.handler.ts` (Camino 2, Fastify) no depende de Temporal; emite `publishMandateEvent` de forma síncrona en el mismo request.
- `mandate.go:createGenesisMandate` (Camino 1, CLI) no emite ningún evento por sí mismo — depende enteramente de `mandate_watcher.go`, que está confirmado sin arrancar bajo `nucleus dev-start`.
- El puente Go (`:48215/internal/mandate-event`) → TS (`:4124`) existe y funciona (`internal-mandate-event.routes.ts`).
- Camino 1 y Camino 2 no son sistemas paralelos: ambos convergen en el mismo único punto de arranque de Temporal (`mandate_watcher.go:295`).
- Timing: Control Plane (`:48215`) está garantizado arriba antes de que la UI de Core monte.

Implementado en base a esos hallazgos:

1. `genesisLaunch.ts` migrado de Camino 1 (IPC→CLI) a Camino 2 (HTTP→Fastify) — emite evento real sin depender del watcher roto.
2. `GET /api/v1/mandates` — endpoint de catch-up, lee `.mandates/` directo de disco.
3. `websocketStore` conectado en el arranque normal de Core (antes solo en `/debug`), `mandate:*` mapeado a `mandateStore`, catch-up disparado al montar.

**Documentos:**
- `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md` (+ Addendum A/B) — la auditoría completa con evidencia archivo/línea.
- `docs/MANDATE/Core_Mandate_No_Aparece_Auditoria_v1.md` — auditoría previa que originó la investigación.

---

## 2. Mandate Genesis — UI de Core (esta sesión, reportado por vos)

**Estado: implementado y validado en vivo contra el mandate real.**

`Sidebar.svelte` reescrito (Intents/Projects fuera, Wisdom/Settings/Account adentro), stubs para `/nucleus`, `/profiles`, `/account`, `/wisdom`, `/settings`, navbar legacy removida, scrollbar restyleado. Dos bugs de fondo resueltos: `content-body` priorizando `MandateTab` sobre rutas del sidebar (`tabsStore.clearActive()`), y desincronización de `aria-current` (unificado en `activeHref` reactivo).

**Pendiente, pausado, sin código escrito (Tarea 2):** vista de Profiles/Accounts. Diagnosticado: `nucleus profile list` no existe en el binario, `GET /api/v1/profile/list` tira 500 (mismatch de schema: Brain devuelve `alias`, no `ai_accounts`; `refresh-accounts` llama a un subcomando de Brain nunca implementado). Decisiones abiertas: cómo normalizar el schema, qué hacer con `refresh-accounts`, si conviene avanzar la vista con accounts bloqueado o esperar el fix de backend. **No hay documento propio todavía para este hilo** — queda registrado acá para no perderlo.

---

## 3. Mandate Genesis — finalizar el mandate real (esta sesión, investigado, NO implementado)

**Estado: plan exacto escrito, listo para ejecutar — en esta sesión o en Claude Code, tu decisión.**

Se inspeccionó en vivo el único mandate real que existe (`sample_project`, `2d2d1fe3-ee2d-4bf3-9bab-95ffc36f1e4f`, workspace real `/home/jose/repos/elias-repos`): está congelado exactamente en el estado de creación desde hace 4 días — cero progreso, confirma en vivo que nada está escuchando `.mandates/`.

Se corrigió TD-001 (que decía "arreglar en `dev_start.go`"): ese proceso termina apenas boot completa, no puede hospedar el watcher. El lugar correcto es `nucleus worker start` (`worker.go`) — ya persistente bajo `dev-start` y `service start`, ya con `temporalClient` vivo, ya corriendo el worker de `mandate-orchestration`. Se identificó además un segundo gap no documentado antes: `PersistHumanSyncActivity`/`SignMandateActivity` no están registradas — el mandate va a fallar al llegar a Fase 3 (validate/sign) aunque se arregle el watcher. El disparo de Fase 3 (signal humana) ya funciona vía CLI (`domains confirm`) — no hace falta tocarlo.

**Sí, esto se lo podés llevar a Claude Code tal cual está escrito.** El documento trae el código exacto a insertar, dónde, y un checklist de 8 pasos de ejecución. Dos cosas quedaron marcadas explícitamente como "confirmar antes de escribir" (no asumidas, para que la sesión que lo ejecute no las pase por alto):
- Nombres exactos de las funciones exportadas `PersistHumanSyncActivity`/`SignMandateActivity` en `mandate_genesis_activities.go` (solo confirmé sus call sites en el workflow, no el archivo de activities en sí).
- Si importar `internal/supervisor` desde `internal/orchestration/temporal` genera un ciclo de imports — si lo genera, el documento ya deja la alternativa (replicar `resolveMandatesRootForActiveOrg()` en vez de importar).

**Documento:** `docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md`.
**Deuda técnica registrada (superada en parte por el documento anterior, se mantiene como referencia histórica):** `docs/tech-debt/TD-001-mandate-cli-watcher-fix.md`.

---

## 4. Intent Types — `ing`/`dis`/`dev`/`doc`/`exp`/`cor`/`inf` (sesión anterior, ya cerrada — no tocada en esta sesión)

**Estado: diagnóstico completo y cerrado. Cero código escrito, a propósito — documento de registro, no de implementación.**

Esto es lo que preguntaste específicamente y quería confirmarte con evidencia, no de memoria: **ya existe un documento propio, completo, para este hilo — no se perdió.** Vive en `docs/BSIP/BLOOM_Intent_Types_Gap_Analysis_v1_0.md`. Resumen ejecutivo de su tabla de estado:

| Tipo | ¿Implementado? | Motor | Nivel | Gap principal |
|---|---|---|---|---|
| `dev` | ✅ Funcional en producción | Legacy (`status`/`steps{}`) | Project | No compatible con motor BSIP sin reescritura |
| `doc` | ✅ Funcional en producción | Legacy (`status`/`steps{}`) | Project (+Nucleus sin confirmar) | Mismo gap que `dev`; BTIPS dice que corre en Nucleus, el código no lo muestra |
| `ing` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Project | Ninguno conocido |
| `dis` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Nucleus | Ninguno conocido |
| `exp` | 🟡 Parcial, roto | Ad-hoc propio | Nucleus | `NucleusManager.create_exp_intent()` no existe en el archivo revisado — bug de código, no de diseño |
| `cor` | ❌ No implementado | — | Nucleus (conceptual) | Cero código, solo un árbol de directorios de 6 fases sin noción de commit |
| `inf` | ❌ No implementado | — | — | Cero código en ningún árbol; posible tipo no vigente, absorbido por `.inquiry/` de `exp` o `.reception/` de `ing` — hipótesis sin confirmar |

Decisión explícita ya tomada en esa sesión (§0 del documento): **no** agregar `dev`/`doc` a `intent_types.py` todavía, porque forzar un registro que describa `commit_field`/`has_turns` sobre un modelo que en la realidad no comitea nada sería documentar una gramática falsa.

El documento trae, además, un checklist (§8) de todo lo que hay que resolver *antes* de tocar código el día que se decida migrar `dev`/`doc` al motor BSIP — no repetido acá para no duplicar la fuente de verdad; está completo en el original.

---

## 5. El único punto de cruce real entre los hilos 1-3 y el hilo 4

`IngestReceptionActivity` — la activity que corre en la Fase 1 (ingest) de `MandateGenesisBuildWorkflow`, la misma que se registró/confirmó en el hilo de Mandate Genesis de esta sesión — está comentada en su propio código como implementación de **`ING_Intent_Spec_v1_1.md` §3**. Es decir: la Fase 1 del ciclo de vida de Mandate Genesis *reusa* el diseño del tipo de intent `ing`, que la tabla de arriba marca como "✅ Funcional, ninguno conocido". Esto es una buena noticia concreta: no hay conflicto ni trabajo duplicado entre ambos hilos — Mandate Genesis depende de una pieza del ecosistema de Intents que ya está confirmada sólida, no de una de las rotas (`exp`) o inexistentes (`cor`/`inf`).

No se investigó en esta sesión si hay otro punto de cruce además de éste (por ejemplo, si Fase 2/cluster tiene alguna relación con `dis`) — queda como pregunta abierta si en algún momento hace falta.

---

## 6. Próximos pasos por hilo

| Hilo | Próximo paso | Dónde ejecutarlo |
|---|---|---|
| Finalizar mandate real (§3) | Seguir el checklist de `Mandate_Genesis_Completion_Plan_v1.md` | Esta sesión o Claude Code — vos decidís |
| UI Profiles/Accounts (§2) | Decidir normalización de schema + qué hacer con `refresh-accounts` antes de tocar código | Pendiente de tu decisión, no bloqueado por nada más |
| Intent Types (§4) | Nada urgente — diagnóstico cerrado, checklist de §8 del Gap Analysis para cuando se decida migrar `dev`/`doc` | Sin dueño asignado, no bloquea Mandate Genesis |

---

## 7. Índice de documentos de esta sesión y relacionados

- `docs/MANDATE/Fase-A-Relevamiento-Mandate-Genesis-v1.md` *(ver `docs/CONDUCTOR/ONBOARDING/`)* — split de onboarding en fases.
- `docs/MANDATE/Core_Mandate_No_Aparece_Auditoria_v1.md`
- `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md` (+ Addendum A/B)
- `docs/tech-debt/TD-001-mandate-cli-watcher-fix.md`
- `docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md`
- `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md` — roadmap maestro, versión vigente (D-22 a D-27)
- `docs/BSIP/BLOOM_Intent_Types_Gap_Analysis_v1_0.md` — hilo de Intent Types, sesión anterior
- Este documento: `docs/MANDATE/BLOOM_Estado_Consolidado_Takeaway_v1.md`
