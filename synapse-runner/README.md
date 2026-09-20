# synapse-runner

Suite de testing E2E UI-driven para el onboarding de Bloom, y sistema de
diagnóstico/detección temprana de fallas para todo el pipeline — desde un
browser genérico sin nada instalado (Fase 0, server-side) hasta
Electron/Conductor + Chromium/Discovery + Side Panel/Companion + CLI `brain`
(Fases 1-4, local).

**Fuente de verdad actual:**
[`docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_Requerimiento_Integrado_v1_0.md`](../docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_Requerimiento_Integrado_v1_0.md)
— integra, sin reemplazarlos en disco, el encargo original de Fase 0, la
investigación server-side ya verificada contra código real, y el dossier de
arquitectura de Fases 1-4. Los tres documentos fuente (ese encargo, esa
investigación, y el
[dossier original](../docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md))
quedan intactos en disco como referencia histórica — este README y el
código de `synapse-runner/` son lo que se actualiza cuando cambia el
esquema. Esta sección y las siguientes reflejan la incorporación de Fase 0
al esquema local (Requerimiento Integrado §15 "Próximos Pasos").

**Independiente del código de producción que audita** — vive en la raíz del
repo (`synapse-runner/`), no dentro de `installer/` ni de ninguna otra
carpeta existente.

---

## Por qué existe

Objetivo actualizado (Requerimiento Integrado §2): validar la hipótesis de
automatización end-to-end **desde un browser genérico sin nada instalado**
hasta la finalización del onboarding local, cruzando dos capas
fundamentalmente distintas:

- **Fase 0 (server-side):** browser genérico → registro/login GitHub contra
  el backend → descarga del instalador. Sin extensión Cortex instalada
  todavía. **Sigue como stub** — ver "Fase 0" más abajo.
- **Fases 1-4 (local):** Electron/Conductor + Chromium/Discovery + Side
  Panel/Companion + CLI de Synapse Intent — esto sí está implementado, y es
  lo que documentaba el objetivo original del dossier: automatizar
  **exclusivamente desde las capas de UI** (sin inyectar eventos sintéticos
  por protocolo), usando la captura de eventos/IPCs como capa de
  observabilidad — y, además, como **sistema de diagnóstico y detección
  temprana de fallas** en todo el pipeline (Sección 6 del dossier).

La arquitectura de observabilidad (`src/diagnostics/`) no es un agregado
posterior: es lo primero que se construyó, y todo paso de la suite corre
envuelto en ella (`SynapseRunner.runStep()`), tenga o no aserciones de
negocio.

---

## Arquitectura

```
src/
  config/          bloom-paths.ts (resolución de paths BloomNucleus, ver
                   más abajo), env.ts, selectors.ts,
                   flow-matrix.ts   — esquema tipado de la Matriz de Flujo
                                      completa (00a-00d + 01-11) y de las
                                      6 fronteras externas — NUEVO
  diagnostics/      Capas 1-4 + Correlator + Reporter (Sección 6 del dossier)
  preflight/        extension-parity-check.ts (resuelve el punto 7),
                     environment-check.ts (falla rápido si el entorno no
                     está levantado)
  surfaces/         Las 5 superficies (Requerimiento Integrado §7):
                       phase0-generic-browser.ts — Superficie 0, STUB — NUEVO
                       electron-conductor.ts   — Superficie 1, _electron.launch()
                       discovery-chromium.ts   — Superficie 2, chromium.connectOverCDP()
                       companion-panel.ts      — Superficie 3, Target CDP del Side Panel
                       submit-cli.ts           — Superficie 4, CLI `brain` (contingencia)
  runner/           SynapseRunner — orquestador, envuelve cada paso en una
                     StepDiagnosticSession
tests/
  fixtures/         fixture de Playwright que engancha SynapseRunner
  e2e/              onboarding-flow.spec.ts — Fases 1-4 (pasos 01-11)
                     phase0-server-onboarding.spec.ts — Fase 0 (pasos
                       00a-00d), test.fixme() — punto de inserción marcado,
                       NO implementado — NUEVO
scripts/
  preflight-check.ts   `npm run preflight` — chequeos de entorno standalone
```

### Sistema de diagnóstico (Sección 6)

4 listeners independientes, uno por capa, todos publicando al mismo
`DiagnosticBus`:

| Capa | Fuente | Archivo |
|---|---|---|
| 1 — Companion | Port directo (`chrome.runtime.connect({name:'companion-link'})`) — `background-companion.js` no publica al bridge centralizado | `layer1-companion-port.ts` |
| 2 — Inyección DOM en Gemini | Reinterpreta eventos de Capa 1 + watchdog propio (`RUNNER_WATCHDOG_MS`) | `layer2-dom-watchdog.ts` |
| 3 — Debug Panel/EventBus | WebSocket `ws://localhost:4124` directo, sin scraping del HTML | `layer3-eventbus-ws.ts` |
| 4 — CLI de contingencia | `spawn('brain', ['intent','submit',...])`, clasifica stderr | `layer4-cli-contingency.ts` |

`correlator.ts` arma, por cada paso (`SynapseRunner.runStep()`), un
**bundle de diagnóstico único** cruzando las 4 capas por `commandId` /
`mandateId` / `intent_id` — nunca reporta "step failed" genérico; siempre
apunta a la capa específica, con el trazo crudo adjunto. `reporter.ts`
persiste cada bundle a `diagnostics-output/` a medida que se produce (no al
final), para no perder visibilidad si el propio proceso de Playwright
crashea a mitad de corrida.

Nota: esta arquitectura de 4 capas cubre las Fases 1-4 (local). La Fase 0
(server-side) **no tiene hoy una capa de observabilidad propia** — ver
"Fase 0" más abajo y Requerimiento Integrado §14.4 (decisión pendiente, no
bloqueante).

---

## Cinco superficies (no cuatro)

El dossier original definía cuatro superficies controladas simultáneamente
por Playwright. La Fase 0 agrega una quinta, **anterior** a las otras
cuatro en el tiempo (Requerimiento Integrado §7):

| # | Superficie | Archivo | Estado en este Runner |
|---|---|---|---|
| 0 | Browser genérico (`chromium.launch()`, sin extensión Cortex) — pasos 00a-00c | `src/surfaces/phase0-generic-browser.ts` | 🚧 **STUB** — bloqueada por decisión pendiente de José, §14.1 (ver "Decisiones pendientes" abajo) |
| 1 | `_electron.launch()` — ventana Conductor | `src/surfaces/electron-conductor.ts` | ✅ Implementada |
| 2 | `chromium.connectOverCDP()` — tab Discovery | `src/surfaces/discovery-chromium.ts` | ✅ Implementada |
| 3 | Target CDP del Side Panel (Companion) | `src/surfaces/companion-panel.ts` | ✅ Implementada |
| 4 | Proceso CLI como testigo (`brain intent submit`, contingencia) | `src/surfaces/submit-cli.ts` | ✅ Implementada (fuera de banda) |

La Superficie 0 debe cerrarse/descartarse antes de levantar las
Superficies 1-4, ya que éstas asumen la extensión Cortex ya instalada —
cosa que la Superficie 0, por definición, todavía no tiene.

---

## Fase 0 — server-side (pasos 00a-00d) — STUB, no implementada

La investigación de Fase 0 confirmó que el onboarding **no** empieza al
arrancar Electron — antes hay una etapa server-side completa. La Matriz de
Flujo completa (`src/config/flow-matrix.ts`, `FLOW_MATRIX`) ahora arranca en
`00a`, no en `01`:

| Paso | Qué hace | Estado en el backend | ¿Implementado en el Runner? |
|---|---|---|---|
| 00a. Registro server-side | Login/registro GitHub contra el backend (`POST/GET /v1/authority/genesis/login`) | ✅ CONSTRUIDO | ❌ No — stub |
| 00b. Autorización GitHub (backend) | Autorizar la GitHub App propia del backend | ✅ CONSTRUIDO | ❌ No — stub |
| 00c. Descarga del instalador | `GET /v1/releases/:releaseId/download` | ⚠️ CONSTRUIDO, sin descubrimiento público de `releaseId` para un humano anónimo | ❌ No — stub |
| 00d. Instalación + `nucleus authority sync` | Ejecutar instalador, `nucleus init` manual, `sync` | ✅ CONSTRUIDO — pasos manuales, no automáticos incluso en el flujo real | ❌ No — stub, y ni siquiera correspondería a un browser (corre en el SO) |

**Por qué es un stub y no una implementación real:** Requerimiento
Integrado §14.1 deja explícitamente sin decidir si `AUTHORITY_BOUNDARY.md`
§1 aplica a un arnés de Playwright automatizando login/registro GitHub del
backend. Esa sección es agnóstica de componente pero nunca menciona "arnés
de pruebas" como categoría — no se resuelve sola. Dos opciones quedaron
presentadas, sin inclinar la balanza, y **ninguna de las dos fue elegida
acá**:

- **Opción A** — Playwright sujeto a la restricción: la Superficie 0 se
  detendría en la puerta de GitHub y usaría una sesión ya autenticada
  inyectada por fixture, nunca un login real automatizado.
- **Opción B** — Playwright fuera de alcance por ser herramienta de QA:
  se automatizaría un login de prueba contra una cuenta dedicada. Riesgo
  documentado: si el arnés se reutiliza como base de un flujo de producto
  real, la línea entre "sólo QA" y "el sistema" se vuelve difícil de
  sostener retroactivamente.

El punto de inserción para cuando esta decisión se tome está listo y
marcado en `src/surfaces/phase0-generic-browser.ts` (lanza siempre, a
propósito, con un mensaje que explica por qué) y en
`tests/e2e/phase0-server-onboarding.spec.ts` (`test.fixme()` por cada paso
00a-00d, así que `npx playwright test --list` sigue mostrando estos 4 pasos
como pendientes explícitos en vez de que desaparezcan del inventario).

Relacionado, también pendiente de José y no bloqueante: §14.3 (de dónde
arranca Fase 0 sin una landing pública/dominio confirmado — afecta en
particular al paso 00c) y §14.4 (si vale la pena definir una Capa 0 de
observabilidad para Fase 0, hoy inexistente).

---

## Fronteras externas — seis, no tres ni cuatro

El pipeline completo (Fase 0 + Fases 1-4) cruza **seis** fronteras externas
confirmadas (Requerimiento Integrado §4; esquema tipado en
`EXTERNAL_BOUNDARIES` de `src/config/flow-matrix.ts`). Cualquier diseño de
Playwright que cuente menos está incompleto:

| # | Frontera | Fase | ¿Automatizada por este Runner? |
|---|---|---|---|
| 1 | Login GitHub del backend (Auth Code+PKCE, GitHub App propia del backend) | 0 | ❌ No — bloqueada por la Superficie 0 (stub) |
| 2 | Repo Ops (GitHub App + Device Flow, Cortex/Discovery) | 1-4, paso 03 | ✅ Sí (asume sesión ya autorizada, no automatiza credenciales reales) |
| 3 | Batcave Auth (control plane Codespaces) | Transversal, fuera del onboarding de usuario final | ❌ No — fuera del camino crítico |
| 4 | GitHub App instalada por organización | Transversal | ❌ No — sin ruta HTTP dedicada auditada |
| 5 | Detección de cuenta Google (Companion) | 1-4, paso 04 | ✅ Sí |
| 6 | Tab de Gemini (`gemini.google.com`, DOM de tercero `untrusted-dom`) | 1-4, paso 10 | ✅ Sí (selectores ⚠️ sin verificar — ver Puntos abiertos) |

**Regla de oro (Requerimiento Integrado §4):** `ACCOUNT_REGISTERED` es la
cuenta **Google** del Companion (frontera #5), nunca el registro de cuenta
del servidor (frontera #1, Fase 0). Son mecanismos y credenciales
completamente distintos — no comparten client id, secret, ni callback entre
sí. No confundirlos al leer logs o bundles de diagnóstico.

---

## Limitación conocida — sólo el usuario fundador

**Este PoC (incluida la Superficie 0, cuando deje de ser stub) sólo puede
simular el flujo del usuario FUNDADOR — nunca a un segundo miembro
invitado.** No es una limitación de diseño del Runner: es que **ese camino
no existe en el backend actual** (Requerimiento Integrado §14.2). El código
soporta la forma (`administration.ts` / `administration-store.ts`), pero no
hay ningún camino en el repo que cree una identidad verificada para una
segunda persona distinta dentro de una organización ya existente — los dos
únicos `INSERT INTO authority_human_identities` del repo son para el mismo
fundador.

Esto queda registrado en código como `KNOWN_LIMITATION_FOUNDER_ONLY` en
`src/config/flow-matrix.ts`, e impreso en el resumen final de cada corrida
(`SynapseRunner.stop()`) para que no se pierda de vista. No es bloqueante
para lo que este PoC sí prueba (el flujo del fundador de punta a punta) —
pero cualquier automatización futura de un flujo multi-usuario debe
resolver primero este gap en el backend, no en el Runner.

---

## Decisiones pendientes de José (no tomadas por esta actualización)

Estas decisiones son explícitamente de José, no de código — este Runner no
toma partido, sólo deja los puntos de inserción listos:

- **§14.1 — ¿Aplica `AUTHORITY_BOUNDARY.md` §1 a la Superficie 0?** Ver
  "Fase 0" arriba. Condiciona directamente cómo se implementa
  `phase0-generic-browser.ts`.
- **§14.3 — Landing pública / punto de entrada sin cuenta.** Sin esto
  confirmado, el paso 00c (descarga del instalador) no tiene forma de
  descubrir un `releaseId` real desde la UI.
- **§14.4 — ¿Vale la pena una Capa 0 de observabilidad dedicada para Fase
  0?** Hoy esa fase no tiene ninguna capa de diagnóstico propia — un
  eventual `phase0-generic-browser.ts` funcional tendría que apoyarse en
  las respuestas HTTP directas del backend nada más, salvo que se decida
  construir algo mejor.

---

## Setup

```bash
cd synapse-runner
npm install
npx playwright install chromium   # si no está ya instalado
cp .env.example .env              # ajustar puertos/paths si hace falta
npm run preflight                 # chequeos de entorno standalone
npm test                          # preflight + suite completa
```

Requisitos para que la suite corra de punta a punta:
- BloomNucleus corrió al menos una vez en esta máquina en modo desarrollo
  (para que exista `<base_dir>/config/profiles.json` con un perfil maestro
  — ver "Resolución del punto 7" más abajo).
- `brain synapse host` corriendo (Capa 4 / paso 06-contingencia depende del
  socket TCP `127.0.0.1:5678`).
- El debug panel / EventBus levantado en `ws://localhost:4124` (Capa 3).
- Chromium de Nucleus/Sentinel levantado con `--remote-debugging-port`
  accesible (ver `SYNAPSE_RUNNER_CDP_ENDPOINT`, placeholder actual:
  `http://localhost:9222` — **no confirmado**, ver Puntos abiertos).

---

## Resolución del punto bloqueante (Sección 7, punto 7)

> **Nota de transparencia (añadida al incorporar Fase 0):** el Requerimiento
> Integrado (§1 y §12.6) sigue listando este punto como *"aún sin
> confirmar"* / *"sigue sin confirmarse"*, heredado tal cual del dossier
> original — esa integración fue una investigación separada de Fase 0
> server-side que explícitamente **no re-verificó** los hallazgos de Fases
> 1-4 (su propia regla de precedencia, §0: *"Ningún hallazgo de las Fases
> 1-4 fue re-verificado en esta integración"*). La resolución de abajo sí
> viene de leer el código real (`profile_create.py` y los 4 `*_generator.py`)
> en una sesión anterior de este mismo proyecto `synapse-runner`, y sigue
> vigente — no hay contradicción real, sólo dos documentos que no se
> vieron entre sí. Si en el futuro se re-verifica esto desde cero, avisar
> para reconciliar ambas fuentes.

> *"Confirmar si `brain/core/profile/web/templates/{companion,discovery,synapse-simulator}/`
> y `installer/cortex/extension/` se sincronizan por un paso de build
> automático o manual."*

**Resuelto por lectura de código** (no por build script tradicional — no
hay ninguno; `build-all.py`/`package.json` no contienen lógica de sync de
templates). Dos mecanismos DISTINTOS, con dos "fuentes de verdad" DISTINTAS:

1. **`templates/{discovery,companion,synapse-simulator,landing}/` →
   siempre en sync, automáticamente, con el runtime.** No es un build:
   es una copia Python **verbatim** (`shutil.copy2`, sin transformación)
   que corre en `brain/core/profile/profile_create.py::_generate_profile_pages()`
   **cada vez que se crea un perfil**, invocando a
   `brain/core/profile/web/{companion,discovery,synapse_simulator,landing}_generator.py`.
   Confirmado leyendo esos 4 generadores — todos copian la misma lista
   fija de archivos estáticos, sin modificarlos.

2. **`installer/cortex/extension/{background.js, background-companion.js,
   manifest.json, content.js, protocols/*.json}` → llegan al perfil por un
   camino DISTINTO y potencialmente desactualizado.** `build-all.py::build_cortex()`
   empaqueta ese directorio en un `.blx` (`installer/native/bin/cortex/`)
   para distribución. En una instalación de desarrollo, el `bin/extension`
   base vive en `<BloomNucleus base_dir>/bin/extension` (resuelto por
   `brain/shared/paths.py::Paths`, replicado en `src/config/bloom-paths.ts`),
   y `profile_create.py::_copy_extension_to_profile()` lo clona
   (`shutil.copytree`) al perfil maestro. **Este segundo camino puede estar
   desincronizado del repo actual** si el BloomNucleus instalado en la
   máquina no fue reconstruido/reinstalado desde el último cambio en
   `installer/cortex/extension/`.

**Consecuencia práctica para Playwright:** el directorio que Chrome carga
de verdad es `<base_dir>/profiles/<profile_id>/extension/` — la parte
discovery/companion/synapse-simulator SIEMPRE refleja `templates/` del repo
actual; la parte `background*.js`/`manifest.json` puede no reflejarlo.
`src/preflight/extension-parity-check.ts` compara ambas copias por hash
**antes de correr la suite** (`npm run preflight`) y avisa con un mensaje
claro si divergen, en vez de asumir sincronía.

Nota adicional descubierta durante esta resolución: el codebase tiene **al
menos 2 convenciones distintas para "base_dir"** conviviendo —
`Paths._resolve_base_directory()` (usada por `profile_create.py`, la que
importa acá) resuelve a `~/.local/share/BloomNucleus` en Linux dev (o
`$XDG_DATA_HOME/BloomNucleus`), mientras que `ExtensionManager._get_default_base_path()`
(en `brain/core/extension/manager.py`, aparentemente no usada por el flujo
de creación de perfiles) resuelve a `~/.bloom`. `bloom-paths.ts` replica
específicamente la primera (la que realmente usa `profile_create.py`).

---

## Puntos abiertos — NO bloqueantes (Sección 7 del dossier)

Los siguientes puntos de la Sección 7 **no bloquean el arranque** del
harness y se dejan explícitamente sin resolver acá, tal como pide la
consigna, en vez de asumirlos:

1. **Auditar `intent_manager.py`, `synapse_protocol.py`, `synapse_ipc_server.py` línea por línea.**
   No auditado. El Runner usa `submit.py` como caja negra vía CLI (Capa 4)
   — no depende de los internals de estos módulos.

2. **Valor exacto de `ENGINE_RESPONSE_TIMEOUT_MS`.** No extraído de
   `background-companion.js` en esta sesión. `layer2-dom-watchdog.ts` usa
   un fallback configurable (`ENGINE_RESPONSE_TIMEOUT_MS_FALLBACK`, 45s por
   defecto) — **ajustar en `.env` apenas se confirme el valor real**, o el
   watchdog puede dar falsos positivos de `silent_hang`.

3. **Selectores de `injectAndObserve()` sin verificar contra un browser
   real** (`div.ql-editor[contenteditable]`, botones por `aria-label`,
   `[data-message-author="model"]`). Fuera del control directo de
   synapse-runner (viven en `background-companion.js`, no en este
   proyecto) — pero es el punto más frágil de toda la arquitectura, y es
   exactamente el tipo de falla que la Capa 2 (`input_not_found`) está
   diseñada para detectar y diagnosticar con precisión en la primera
   corrida real, en vez de fallar con un timeout genérico.

4. **¿`synapse-simulator.html` expone una categoría de error explícita
   distinta de `sentinel`/`brain`/`synapse`?** No confirmado.
   `layer3-eventbus-ws.ts` NO filtra por categoría — reenvía cualquier
   categoría recibida al DiagnosticBus, así que si existe una categoría de
   error separada, ya va a aparecer en los bundles sin necesitar cambios de
   código.

5. **Discrepancia de documentación: `ENGINE_RESPONSE_ERROR` se emite en
   código pero no está en `knownReasons` de `companionProtocol.js` v2.0.0.**
   No es una corrección que le corresponda a este proyecto (es un fix de
   documentación en el repo principal). `layer2-dom-watchdog.ts` ya tolera
   este valor explícitamente (ver comentario `classifyFailureReason()`).

6. **Diseño formal del Submit Simulator UI-driven (Sección 2C).**
   Explícitamente fuera de alcance de este PoC — el dossier lo marca como
   iniciativa propia futura. `src/surfaces/submit-cli.ts` es el único punto
   de inserción: cuando el módulo UI-driven exista, reemplaza
   `runSubmitTestimony()` sin tocar el resto del Runner (el diagnostic bus
   ya espera el shape `cli_submit_result`).

## Puntos abiertos nuevos — de la integración de Fase 0 (Requerimiento Integrado §11/§13)

No bloqueantes, heredados sin resolver de la integración server-side (no
resueltos por esta actualización, tal como pide la consigna):

7. **Landing pública / dominio sin cuenta, y descubrimiento de `releaseId`.**
   Ver "Fase 0" y "Decisiones pendientes de José" arriba (§14.3). Bloquea en
   la práctica el paso 00c cuando la Superficie 0 deje de ser stub.

8. **Tamaño en bytes de `~/.local/share/BloomNucleus/bin`** y **cadencia de
   polling de `nucleus authority sync` en producción.** Datos pendientes de
   José (§13), sin impacto en el código de este Runner hoy.

9. **Capa 0 de observabilidad para Fase 0** (§14.4) — ver "Fase 0" arriba.
   Item de diseño futuro, explícitamente no bloqueante.

## Otras cosas sin verificar contra un browser/proceso real (no vienen de la Sección 7, surgieron al implementar)

Estos NO estaban en la lista de puntos abiertos del dossier, pero aparecieron
al escribir el harness real y se documentan acá por la misma razón — para
no asumirlos silenciosamente:

- **Puerto de `--remote-debugging-port` de Chromium** (`discovery-chromium.ts`):
  placeholder `http://localhost:9222` vía `SYNAPSE_RUNNER_CDP_ENDPOINT`. El
  puerto real que usa Sentinel para levantar Chromium no fue confirmado.
- **API real del bridge IPC de Conductor** (`window.onboarding` vs
  `window.electronAPI`, y la forma de suscripción a milestones —
  `electron-conductor.ts::installMilestoneBuffer()` prueba `onMilestone()`
  y `on('milestone:reached', ...)`, pero no fue confirmado contra
  `preload_onboarding.js` línea por línea.
- **Tipo de CDP Target que reporta esta build de Chrome para un Side
  Panel de extensión** (`companion-panel.ts`) — el código intenta el
  camino simple (`context.pages()`) y cae a enumeración CDP cruda
  (`Target.getTargets`), pero deja un error explícito en vez de adivinar
  si hace falta `Target.attachToTarget` manual.
- **Selectores de Discovery** (`src/config/selectors.ts`) — placeholders
  `__TODO_VERIFY__` que hacen fallar el test con un mensaje claro apenas se
  intentan usar, en vez de fallar silenciosamente contra un selector
  inventado.

**Procedimiento sugerido para la primera corrida real:** ejecutar
`npm run preflight` primero (valida entorno + parity de la extensión), después
`npm run test:headed` para ver el flujo y corregir en vivo los ítems de
arriba — cada uno fue diseñado para fallar con un mensaje que dice
exactamente qué archivo tocar.
