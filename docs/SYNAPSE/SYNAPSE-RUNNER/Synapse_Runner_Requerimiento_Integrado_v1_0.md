# Requerimiento Integrado — Suite `synapse-runner` (Fase 0 Server-Side + PoC E2E UI-Driven)

> **Estado:** Documento de requerimiento completo, listo para que la próxima sesión que trabaje sobre `synapse-runner` actualice su esquema local incorporando la Fase 0 server-side. Integra, sin reemplazarlos en disco, los tres documentos fuente:
> 1. `Encargo_Investigacion_Fase0_Onboarding_ServerSide_Cowork_Linux.md` — el encargo que pidió investigar la Fase 0.
> 2. `Fase0_Server_Side_Onboarding_Seccion.md` — el resultado de esa investigación (verificado contra código real).
> 3. `Synapse_Runner_E2E_Architecture_Dossier.md` — la arquitectura ya documentada de las Fases 1-4 (local: Electron/Discovery/Companion/CLI), que asumía —incorrectamente— que el onboarding empieza al arrancar Electron.
>
> Los tres archivos originales quedan intactos en `/home/jose/repos/bloom-development-extension/docs/SYNAPSE/SYNAPSE-RUNNER/`. Este documento es la lectura única recomendada para retomar el trabajo de `synapse-runner` de acá en adelante.

---

## 0. Procedencia y Reglas de Este Documento

**Terminología (fijada en el encargo original, se mantiene):** "onboarding" es el alta de una persona o empresa en el servidor. "Bootstrap" queda reservado al arranque de un servidor local (Nucleus o Batcave).

**Precedencia documental:** ante contradicción entre documentos, prevalece el más reciente (`Tablero_Seguimiento_Consolidado_v0_2.md`, hasta §Z.24). `AUTHORITY_BOUNDARY.md` tiene precedencia específica en todo lo relativo a credenciales y automatización de proveedores externos.

**Naturaleza de la integración:** las Secciones 3-4 y 10-14 de abajo son contenido nuevo, producido por la investigación de Fase 0. Las Secciones 1, 5-9 reproducen y extienden el contenido ya validado del dossier de Fases 1-4, renumerado para que la secuencia completa (Fase 0 → Fase 4) se lea de corrido. Ningún hallazgo de las Fases 1-4 fue re-verificado en esta integración — siguen con el mismo nivel de confianza (✅/🔶/🚧/⚠️) que tenían en el dossier original.

---

## 1. Repositorio e Índice de Rutas

**Raíz única del repo:** `/home/jose/repos/bloom-development-extension` (Backend Cloudflare, Nucleus/Go, Electron/Conductor, extensión Cortex, y el CLI Python `brain` conviven en un solo repo).

**⚠️ Hallazgo estructural aún sin confirmar (heredado del dossier, no resuelto por esta integración):** los archivos de Companion y Discovery existen duplicados en `brain/core/profile/web/templates/{companion,discovery,synapse-simulator}/...` (source) y en `installer/cortex/extension/...` (runtime empaquetado). Sigue pendiente confirmar si se sincronizan por build automático o manual — ver §12.7.

### 1.1 Rutas de Fase 0 (server-side, nuevas en esta integración)

```
backend/src/authority/genesis-store.ts
backend/src/authority/human-identity.ts
backend/src/authority/human-session-store.ts
backend/src/authority/administration-route.ts
backend/src/authority/administration.ts
backend/src/authority/administration-store.ts
backend/src/authority/initial-emission.ts
backend/src/authority/tenant-store.ts
backend/src/authority/tenant-self-route.ts
backend/src/index.ts
backend/src/manifest.ts
backend/wrangler.jsonc
backend/migrations/0011_authority_role_catalog_operator.sql
backend/migrations/0013_authority_genesis.sql
backend/test/authority-genesis.spec.ts
installer/nucleus/internal/governance/authority_command.go
installer/nucleus/internal/governance/ownership.go
installer/nucleus/internal/governance/ownership_migration.go
installer/nucleus/internal/governance/ownership_reconciliation.go
installer/nucleus/internal/governance/ownershipcontract/schema.go
installer/nucleus/internal/authority/identity.go
installer/nucleus/internal/authority/tenant_fetch.go
installer/nucleus/internal/authority/roles.go
docs/CORTEX/AUTHORITY_BOUNDARY.md
```

### 1.2 Rutas de Fases 1-4 (local, heredadas del dossier)

**A. Electron / Conductor**
```
installer/conductor/workspace/main_conductor.js
installer/conductor/workspace/onboarding/preload_onboarding.js
installer/conductor/workspace/onboarding/renderer/steps/step-identity.js
installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js
installer/conductor/workspace/ipc/workspace-synapse-handlers.js
```

**B. Chromium / Discovery**
```
brain/core/profile/web/templates/discovery/discoveryProtocol.js
brain/core/profile/web/templates/synapse-simulator/synapse-simulator.js
installer/conductor/workspace/shared/synapse-simulator.html
installer/native/config/onboarding/onboarding_steps.json
installer/conductor/workspace/onboarding/milestone-registry.js
installer/conductor/workspace/onboarding/milestone-reactor.js
installer/cortex/extension/manifest.json
```
🔴 `scenarios/discovery_happy_path.json` y `validate-scenario.js` — **NO EXISTEN** en el repo. Sin cambios respecto del dossier original.

**C. Companion**
```
brain/core/profile/web/templates/companion/companionProtocol.js
brain/core/profile/web/templates/companion/index.html
brain/core/profile/web/templates/companion/styles.css
brain/core/profile/web/templates/companion/companion.js
installer/cortex/extension/background-companion.js
installer/cortex/extension/protocols/companion.schema.json
installer/cortex/extension/background.js
```

**D. Synapse Intent / Submit (CLI Python)**
```
brain/commands/intent/submit.py
brain/core/intent_manager.py
brain/core/synapse/synapse_manager.py
brain/core/synapse/synapse_protocol.py
brain/core/synapse/synapse_ipc_server.py
brain/commands/synapse/synapse_host_cli.py
brain/commands/intent/build_payload.py
brain/commands/intent/download.py
brain/core/context_planning/payload_builder.py
```

---

## 2. Objetivo General Actualizado

El objetivo original de `synapse-runner` (dossier §1) era: *"Validar la hipótesis de automatización del onboarding exclusivamente desde las capas de UI (...) sin inyectar eventos sintéticos directamente por protocolo."* Ese objetivo **asumía que el onboarding empieza cuando arranca Electron/Conductor**. La investigación de Fase 0 confirmó que eso es falso: antes de que Electron exista en la máquina del usuario, hay una etapa server-side completa (registro, login GitHub, descarga del instalador) que también es candidata a automatización end-to-end.

**Objetivo actualizado:** validar la hipótesis de automatización end-to-end **desde un browser genérico sin nada instalado** hasta la finalización del onboarding local ya documentado, cruzando dos capas fundamentalmente distintas:

- **Fase 0 (server-side, nueva):** browser genérico → registro/login GitHub contra el backend → descarga del instalador. Sin extensión Cortex instalada todavía.
- **Fases 1-4 (local, ya documentadas):** Electron/Conductor + Chromium/Discovery + Side Panel/Companion + CLI de Synapse Intent, tal como las describe el dossier original (Secciones 5-9 de este documento).

El Submit Simulator UI-driven (dossier §2C) sigue **fuera de alcance de implementación** en esta etapa — se mantiene como módulo `[PENDING / FEATURE EN DISEÑO]`, usando la contingencia CLI documentada.

---

## 3. Fase 0 — Arquitectura Real (Server-Side, pre-instalación)

*(Condensado de `Fase0_Server_Side_Onboarding_Seccion.md` §1; ver ese documento para el detalle completo de cada cita.)*

### 3.1 Registro (Génesis / Primer Registro) — **[CONSTRUIDO]**

El primer login de un GitHub subject nunca visto crea, atómicamente, una organización personal nueva — el login mismo es el registro, no hay un formulario de alta separado.

- `backend/src/authority/genesis-store.ts` — `beginGenesis`/`finishGenesis`. `db.batch` atómico: `organizations` + `authority_human_identities` + `authority_genesis_registry`.
- `backend/migrations/0013_authority_genesis.sql` — siembra `master`/`specialist` builtin y crea `authority_genesis_registry` (PK en `subject`) + `authority_genesis_flows`.
- `backend/test/authority-genesis.spec.ts` — cobertura real con Miniflare+D1 (login nuevo, login repetido, carrera concurrente, login normal no toca génesis, organización sin instalación rechaza emisión inicial, journey HTTP completo).
- Rutas: `POST/GET /v1/authority/genesis/login`, `GET /v1/authority/human/callback` (`backend/src/authority/administration-route.ts`, líneas 57-64, 82-86, 28-42).

### 3.2 Autorización de Identidad — GitHub (login humano al backend) — **[CONSTRUIDO]**

El backend tiene **su propia** GitHub App, Authorization Code + PKCE, callback real. Distinta de las otras tres fronteras GitHub (ver §4).

- `backend/src/authority/human-identity.ts` — `githubAppProvider()`. `authorize()` arma `https://github.com/login/oauth/authorize` con `code_challenge`/`code_challenge_method=S256`, sin `scope`. `exchange()` valida token `ghu_...`+`bearer`. `identify()` llama `GET https://api.github.com/user`.
- Callback: `{AUTHORITY_HUMAN_ORIGIN}/v1/authority/human/callback`.
- Credenciales vía `AUTHORITY_GITHUB_APP_CLIENT_ID`/`AUTHORITY_GITHUB_APP_CLIENT_SECRET` — nombres de variable citados, ningún valor transcripto.

### 3.3 Descarga del Instalador — **[CONSTRUIDO, alcance limitado]**

- `GET /v1/releases/:releaseId/download` (`backend/src/index.ts` líneas 69-79): público, sin auth, sirve directo desde R2 (`bloom-releases`) por `releaseId` conocido.
- **[NO ENCONTRADO]** ninguna ruta de descubrimiento público de `releaseId` para un humano anónimo. `GET /v1/manifest` (`backend/src/manifest.ts`) **requiere `organizationId` ya existente** — presupone que Fase 0 (registro) ya cerró.
- `backend/wrangler.jsonc` no declara `routes`/dominio custom — sin evidencia en el repo de landing pública. Ver §13.

### 3.4 Punto de Sincronización (bisagra Fase 0 → Fase 1 local) — **[CONSTRUIDO]**

Secuencia real, caso `"sync"` de `installer/nucleus/internal/governance/authority_command.go` (switch en línea 115):

1. `RegisterInstallation` (línea 130) — Ed25519 local (`identity.go`) contra `POST /v1/authority/installations/register`.
2. `FetchAndVerifyTrustManifest` (línea 137) — contra `GET /v1/authority/trust-manifest`, firma S2S Ed25519.
3. `FetchOrganizationTenantID` (línea 189, `tenant_fetch.go`) — contra `GET /v1/authority/tenant/self?org=`.
4. Inyección de `tenantID` en `config/nucleus.json` (líneas 203-214) — fallo no bloqueante, sólo warning.
5. `ReconcileCanonicalOrganization` (línea 221, `ownership_reconciliation.go`) — idempotente, protege estado `DIVERGENT`, **requiere que `.ownership.json` ya exista** (falla no fatal si no existe).
6. `CutoverRemoteEnforced` opcional (línea 335) — gateado por precondiciones estrictas (tenantID, anti-downgrade, bindings de proyecto requeridos).

### 3.5 `.ownership.json` — **[CONSTRUIDO]**

Nunca se crea automáticamente. Sólo dos caminos, ambos manuales: `nucleus init --github-id X [--master]` (`ownership.go`) y la migración de formato de un archivo legado ya existente (`ownership_migration.go`, requiere que el archivo ya exista — `os.ReadFile` sin fallback de creación). `Validate()` (`ownershipcontract/schema.go` línea 165) exige `TenantID` no vacío en `BOUND`/`REMOTE_LOCKED` desde la decisión de José del 2026-09-16.

---

## 4. Fronteras Externas — Vista Unificada (Fase 0 + Fases 1-4)

El pipeline completo (server + local) cruza **seis** fronteras externas confirmadas, no tres ni cuatro. Cualquier diseño de Playwright que cuente menos está incompleto.

| # | Frontera | Fase | Tipo | Estado | Cita |
|---|---|---|---|---|---|
| 1 | Login GitHub del backend (Auth Code+PKCE) | Fase 0 | GitHub App propia | **CONSTRUIDO** | `backend/src/authority/human-identity.ts` |
| 2 | Repo Ops (GitHub App + Device Flow, Cortex/Discovery) | Fase 1 (paso "03. OAuth GitHub" del dossier) | GitHub App | **CONSTRUIDO** | `docs/CORTEX/HANDOFF-github-app-batcave-synapse.md` |
| 3 | Batcave Auth (control plane Codespaces) | Fuera del flujo de onboarding del usuario final, pero parte del ecosistema | OAuth App clásica | **DISEÑADO** (código fuente fuera de este repo) | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` §4.3 |
| 4 | GitHub App instalada por organización (acceso a repos) | Transversal | GitHub App | **DISEÑADO** (sin ruta HTTP dedicada auditada) | `INVARIANT-ORG-008` (Tablero) |
| 5 | Detección de cuenta Google (Companion) | Fase 1 (paso "04. Identity" del dossier) | OAuth Google | **CONSTRUIDO** | `AUTHORITY_BOUNDARY.md` §2.2 — **no confundir con el registro del servidor** |
| 6 | Tab de Gemini (`gemini.google.com`) | Fase 1 (paso "10. Engine inject" del dossier) | DOM de tercero, `trust: 'untrusted-dom'` | **CONSTRUIDO**, selectores ⚠️ no verificados | `installer/cortex/extension/background-companion.js` |

**Regla de oro heredada del encargo original (§4.6 del dossier §2.2, reforzada por la investigación de Fase 0):** `ACCOUNT_REGISTERED` es la cuenta de **Google** del Companion, nunca el registro de cuenta del servidor. Las fronteras 1-4 (GitHub) y la frontera 5 (Google) son mecanismos y credenciales completamente distintos — no comparten client id, secret, ni callback entre sí.

---

## 5. Fases 1-4 — Arquitectura Local (Electron / Discovery / Companion / CLI)

*(Contenido heredado sin cambios del dossier §2 — Archivos de Respaldo. Incluido íntegro porque es la referencia técnica que el Runner necesita para operar estas fases.)*

### 5A. Capa Electron / Conductor

| Archivo | Ruta relativa | Rol |
|---|---|---|
| `main_conductor.js` | `installer/conductor/workspace/main_conductor.js` | Ciclo de vida principal de Electron, creación de ventanas, listeners IPC, orquestación del onboarding. |
| `preload_onboarding.js` | `installer/conductor/workspace/onboarding/preload_onboarding.js` | Bridge IPC expuesto al renderer (`window.onboarding` / `window.electronAPI`). |
| `step-identity.js` | `installer/conductor/workspace/onboarding/renderer/steps/step-identity.js` | Lógica de UI de Electron que reacciona a milestones de identidad y navegación. |
| `onboarding-handlers.js` | `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js` | Manejadores de eventos Synapse/Brain del lado de Conductor. |
| `workspace-synapse-handlers.js` | `installer/conductor/workspace/ipc/workspace-synapse-handlers.js` | Manejadores de eventos Synapse/Brain a nivel workspace. |

### 5B. Capa Chromium / Discovery

| Archivo | Ruta relativa | Rol |
|---|---|---|
| `discoveryProtocol.js` | `brain/core/profile/web/templates/discovery/discoveryProtocol.js` | Definición formal de eventos y manifest del protocolo entre Discovery, Sentinel y Brain. |
| `synapse-simulator.js` | `brain/core/profile/web/templates/synapse-simulator/synapse-simulator.js` | Lógica interna del cliente de simulación y puente con el background script. |
| `synapse-simulator.html` | `installer/conductor/workspace/shared/synapse-simulator.html` | Panel de observabilidad — WebSocket `ws://localhost:4124`. |
| `onboarding_steps.json` | `installer/native/config/onboarding/onboarding_steps.json` | Definición de pasos y secuencia del wizard de onboarding. |
| `milestone-registry.js` | `installer/conductor/workspace/onboarding/milestone-registry.js` | Mapeo de eventos que completan pasos/milestones. |
| `milestone-reactor.js` | `installer/conductor/workspace/onboarding/milestone-reactor.js` | Reacción ante milestones completados. |
| `manifest.json` (extensión) | `installer/cortex/extension/manifest.json` | Manifest de la extensión Cortex (Discovery + Companion comparten la misma extensión). |
| `background.js` | `installer/cortex/extension/background.js` | Router principal Synapse/Discovery/onboarding. Native messaging host (TCP 5678), handshake de 3 fases, bridge al debug panel (`:48215`, `ws://localhost:4124`). |

🔴 `scenarios/discovery_happy_path.json` y `validate-scenario.js` — no existen en el repo (ver §1).

### 5C. Synapse Intent Submission (CLI Layer — Python) — Estado: `[PENDING / FEATURE EN DISEÑO]`

| Archivo | Ruta relativa | Rol | Estado |
|---|---|---|---|
| `submit.py` | `brain/commands/intent/submit.py` | Comando `brain intent submit`. Capa delgada, delega en `IntentManager`. | ✅ Operativo — contingencia |
| `intent_manager.py` | `brain/core/intent_manager.py` | Orquesta `submit_intent()`. | 🔶 No auditado |
| `synapse_manager.py` | `brain/core/synapse/synapse_manager.py` | `socket.create_connection(("127.0.0.1", 5678))`, publica al EventBus TCP. | ✅ Confirmado por grep |
| `synapse_protocol.py` | `brain/core/synapse/synapse_protocol.py` | Protocolo del bridge. | 🔶 Referenciado, no auditado |
| `synapse_ipc_server.py` | `brain/core/synapse/synapse_ipc_server.py` | Transporte del bridge. | 🔶 Referenciado, no auditado |
| `synapse_host_cli.py` | `brain/commands/synapse/synapse_host_cli.py` | Levanta el Listener Loop (`brain synapse host`). | ✅ Confirmado |
| `build_payload.py` | `brain/commands/intent/build_payload.py` | Arma el payload que `submit` envía. | 🔶 No auditado |
| `payload_builder.py` | `brain/core/context_planning/payload_builder.py` | Candidato a reusar en el Submit Simulator. | 🔶 No auditado |
| `download.py` | `brain/commands/intent/download.py` | Recibe la respuesta posterior al submit. | 🔶 No auditado |
| **Submit Simulator (UI-driven)** | *(no existe — a crear)* | Orquestaría TONs/payloads + interacción DOM. | 🚧 **PENDING / FEATURE EN DISEÑO** |

**Estrategia mientras no exista:** invocar el CLI real como contingencia, etiquetado `fuera de banda / no representativo del objetivo UI-driven`.

### 5D. Companion — Extensión (Side Panel + Engine Channel)

| Archivo | Ruta relativa | Rol |
|---|---|---|
| `companionProtocol.js` | `brain/core/profile/web/templates/companion/companionProtocol.js` | Manifiesto v2.0.0. Canales `commands`, `reports`, `engineChannel` (`trust: 'untrusted-dom'`). |
| `index.html` | `brain/core/profile/web/templates/companion/index.html` | Markup del Side Panel. |
| `styles.css` | `brain/core/profile/web/templates/companion/styles.css` | Estilos del Side Panel. |
| `companion.js` | `brain/core/profile/web/templates/companion/companion.js` | Lógica del Side Panel: Port `'companion-link'`, reconexión/backoff, `GET_ENGINE_STATUS`. |
| `background-companion.js` | `installer/cortex/extension/background-companion.js` | Orquestador real del Companion (detalle abajo). |
| `companion.schema.json` | `installer/cortex/extension/protocols/companion.schema.json` | Schema formal de payload. |

**Mecánica confirmada:** `AI_SIDE_PANEL_DOMAINS = ['chatgpt.com', 'claude.ai', 'gemini.google.com']`; máquina de estados `SLEEPING → WAKING → READY → BUSY → (READY | DISCONNECTED)`; `injectAndObserve()` con selectores **⚠️ marcados sin verificar en el propio código fuente**; `background-companion.js` **no** publica al bridge `:48215`/`:4124` — sólo `broadcast()` por Port.

---

## 6. Matriz de Flujo Completa (Fase 0 + Fases 1-4)

| Paso | Actor / Superficie | Acción Humana Simulada | Evento Generado | Receptor / Mecanismo de espera | Estado |
|---|---|---|---|---|---|
| 00a. Registro server-side | Browser genérico (sin Cortex) | Iniciar login/registro GitHub contra el backend | `POST/GET /v1/authority/genesis/login` | Backend crea organización + identidad atómicamente | ✅ **CONSTRUIDO** |
| 00b. Autorización GitHub (backend) | GitHub (frontera externa #1, §4) | Autorizar la GitHub App del backend | `GET /v1/authority/human/callback` | Backend emite sesión (`__Host-authority-session`) | ✅ **CONSTRUIDO** |
| 00c. Descarga del instalador | Browser genérico | Descargar el binario | `GET /v1/releases/:releaseId/download` | R2 sirve el objeto directo | ⚠️ **Sin descubrimiento público de `releaseId`** — ver §11 |
| 00d. Instalación + primer `nucleus authority sync` | Sistema operativo del usuario | Ejecutar instalador, luego `nucleus init` manual, luego `sync` | Registro de instalación → trust manifest → tenant lookup → reconciliación `.ownership.json` | Backend + filesystem local | ✅ **CONSTRUIDO** (pasos manuales, no automáticos) |
| 01. Launch | Electron UI | Clic en "Launch Discovery" | `onboarding:launch-discovery` | Brain/Nucleus — spawnea Chromium + perfil | ✅ |
| 02. Device Code | Discovery | Clic en "Auth GitHub" | `GITHUB_DEVICE_CODE` | Brain/SynapseBridge — código en pantalla | ✅ |
| 03. OAuth GitHub | Chromium (frontera externa #2, §4) | Clic en "Authorize App" | `GITHUB_APP_AUTHORIZED` | Brain → Reactor → `milestone:reached` en Electron | ✅ |
| 04. Identity | Discovery | Clic en "Detect Google" (frontera externa #5, §4) | `ACCOUNT_REGISTERED` | Brain → Nucleus, actualiza `nucleus.json` | ✅ |
| 05. Completion | Electron UI | Transición a `success` | `_onOnboardingSuccess` | Electron Main — cierra wizard / redirige | ✅ |
| 06. Submit Intent (objetivo final) | Submit Simulator (UI-driven) | Interacción DOM aún sin definir | TON/payload serializado → dispatch | 🔶 A definir cuando exista el módulo | 🚧 **PENDING / FEATURE EN DISEÑO** |
| 06-contingencia. Submit Intent (temporal) | Proceso CLI (`brain intent submit`) | `spawn()` desde el harness | Publicación TCP vía `synapse_manager.py` | stdout/stderr/exit code + `synapse-simulator.html` | ✅ Operativo — transitorio |
| 07. Companion activation | Chromium — tab activa | Navegar a dominio en `AI_SIDE_PANEL_DOMAINS` | `chrome.sidePanel.setOptions(enabled:true)` | Confirmar panel habilitado antes de targetear su CDP Target | ✅ |
| 08. Companion command | Side Panel (Companion) | Clic en acción que emite `COMMAND_RUN_*` | `COMMAND_ACK` (inmediato) → cola | Esperar `COMMAND_ACK` por el Port | ✅ |
| 09. Engine wake | background-companion.js | — | `ENGINE_STATUS_CHANGED: WAKING→READY` | Broadcast por Port propio del Runner | ✅ |
| 10. Engine inject | Tab Gemini (frontera externa #6, §4) | Inyección DOM (`injectAndObserve`) | `ENGINE_RESPONSE_CAPTURED` / `ENGINE_INJECTION_FAILED` | Port propio del Runner | ⚠️ Selectores no verificados |
| 11. Companion display | Side Panel | Reflejar `REPORT_RESULT`/`REPORT_ERROR` | DOM: `#refined-response[data-state]` | Aserción directa sobre el DOM del panel | ✅ |

---

## 7. Arquitectura del PoC (`synapse-runner`) — Cinco Superficies (no cuatro)

El dossier original definía cuatro superficies controladas simultáneamente por Playwright. La Fase 0 agrega una quinta, **anterior** a las otras cuatro en el tiempo:

0. **Browser genérico (`chromium.launch()`, sin extensión Cortex)** — nueva, cubre los pasos 00a-00c de §6: registro, login GitHub del backend, descarga del instalador. Debe cerrarse o descartarse antes de levantar las superficies 1-4, ya que éstas asumen la extensión Cortex ya instalada.
1. **`_electron.launch()`** — ventana Conductor.
2. **`chromium.connectOverCDP()`** — tab Discovery.
3. **Target del Side Panel (Companion)** dentro de la misma conexión CDP — Chrome lo expone como `Target` propio (`chrome-extension://<id>/index.html`), no anidado en el DOM de Discovery.
4. **Proceso CLI como testigo, no como UI** (`brain intent submit`, contingencia §5C) — etiquetado en el reporte como paso fuera de banda.

**Fronteras externas reales a automatizar o resolver (seis, §4):** login GitHub del backend (superficie 0), OAuth GitHub de Repo Ops (superficie 2), OAuth/Detección Google (superficie 2), tab de Gemini (superficie 3, DOM de tercero `untrusted-dom`). Batcave Auth y la GitHub App por organización quedan fuera del camino crítico de onboarding de un usuario final y no requieren automatización en este PoC.

---

## 8. Rol del Companion — Resumen de Comportamiento Esperado

*(Sin cambios respecto del dossier §5.)*

- El Companion recibe estado de Brain/Synapse indirectamente: su motor (Gemini) opera en un circuito aislado, gobernado por `background-companion.js`.
- Flujo bidireccional: Side Panel emite `COMMAND_RUN_*` → background encola/despacha → Gemini procesa → background captura y filtra (`filterNoise()`) → Side Panel muestra "Respuesta refinada".
- Playwright debe poder hacer **aserción triple** por paso relevante: Electron (milestone global), Discovery/Chromium (flujo web), Companion (`#refined-response` + `#technical-log-list`).

---

## 9. Estrategia de Observabilidad y Diagnóstico de Errores

*(Sin cambios respecto del dossier §6 para las Fases 1-4 — ver ese contenido íntegro más abajo. Nota nueva: la Fase 0 server-side todavía **no tiene una capa de observabilidad propia** — ver §14.4.)*

El pipeline de Fases 1-4 tiene 4 sistemas de eventos independientes: Companion (Port), DOM de Gemini, debug panel `:48215`/`:4124` (WebSocket), y proceso CLI (stdout/stderr/exit code). El diagnóstico se arma correlacionando las 4 por un identificador común (`commandId`/`mandateId`, ventana temporal + `profile_id`, `intent_id`).

- **Capa 1 — Companion:** Port propio del Runner (`chrome.runtime.connect({name:'companion-link'})`), filtrando por `commandId`/`mandateId` propio.
- **Capa 2 — Inyección DOM en Gemini:** tres modos de falla (selector roto `INPUT_NOT_FOUND`, bloqueo/error `ENGINE_RESPONSE_ERROR`, cuelgue silencioso por timeout); watchdog propio más largo que `ENGINE_RESPONSE_TIMEOUT_MS`.
- **Capa 3 — Debug Panel / EventBus:** WebSocket directo a `ws://localhost:4124`, categorías `sentinel`/`brain`/`synapse`.
- **Capa 4 — Proceso CLI de contingencia:** `spawn('brain', ['intent','submit',...])`, clasificación de fallas por tipo de excepción (`ValueError`/`FileNotFoundError` → TON; `ConnectionError`/`TimeoutError` → socket TCP).
- **Correlación cruzada:** bundle de diagnóstico por paso, indicando en qué capa específica falló — nunca un genérico "step failed".

---

## 10. Tabla Consolidada de Estado de Componentes (Fase 0 + Fases 1-4)

| Componente | Fase | Estado | Ruta absoluta / documento | ¿Bloqueante para automatizar? |
|---|---|---|---|---|
| Génesis / primer registro | 0 | **CONSTRUIDO** | `backend/src/authority/genesis-store.ts` | Sí — cruza frontera GitHub #1 |
| Login GitHub del backend (Auth Code+PKCE) | 0 | **CONSTRUIDO** | `backend/src/authority/human-identity.ts` | Sí — credencial de terceros |
| `POST/GET /v1/authority/genesis/login`, callback | 0 | **CONSTRUIDO** | `backend/src/authority/administration-route.ts:28-64,82-86` | Sí |
| `POST /v1/authority/initial-emission` | 0 | **CONSTRUIDO** | `backend/src/authority/initial-emission.ts` | Sí (requiere identidad ya autenticada) |
| Descarga pública de release por id | 0 | **CONSTRUIDO** (sin descubrimiento) | `backend/src/index.ts:69-79` | No (no requiere login) |
| Manifiesto ion-recipe | 0 | **CONSTRUIDO** — requiere `organizationId` ya existente | `backend/src/manifest.ts` | Sí — presupone Fase 0 cerrada |
| Landing pública / dominio sin cuenta | 0 | **NO ENCONTRADO** | — | Pendiente de José, §13 |
| `nucleus authority sync` | 0→1 (bisagra) | **CONSTRUIDO** | `installer/nucleus/internal/governance/authority_command.go:115-390` | Sí — S2S firmado |
| `.ownership.json` (creación) | 0→1 | **CONSTRUIDO** — sólo manual | `installer/nucleus/internal/governance/ownership.go` | No en sí mismo — prerequisito de reconciliación |
| Invitar miembro no-fundador | 0 | **DISEÑADO (parcial) / NO ALCANZABLE EN LA PRÁCTICA** | `backend/src/authority/administration.ts`, `administration-store.ts:72-73`, `human-session-store.ts:79-84` | Sí, si se habilitara — §14.2 |
| Electron/Conductor (launch, milestones) | 1 | **CONSTRUIDO** | §5A | Sí — orquesta todo lo demás |
| Discovery/Chromium (Device Flow GitHub) | 1 | **CONSTRUIDO** | §5B | Sí — frontera GitHub #2 |
| Detección de cuenta Google (`ACCOUNT_REGISTERED`) | 1 | **CONSTRUIDO** | `AUTHORITY_BOUNDARY.md` §2.2 | Sí — frontera Google |
| Companion (Side Panel + Engine Channel) | 1 | **CONSTRUIDO**, selectores ⚠️ no verificados | §5D | Sí — frontera Gemini (DOM tercero) |
| Submit Simulator (UI-driven) | 1 | 🚧 **PENDING / FEATURE EN DISEÑO** | *(no existe)* | No bloqueante — hay contingencia CLI |
| Frontend `backend/web/` (mock auth/usuarios) | — | **DISEÑADO** — mockeado, desconectado | `backend/web/README.md` | No — no funcional |
| Batcave (control plane Codespaces) | — | **DISEÑADO** — código fuera del repo | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` | Depende del repo externo |

---

## 11. Archivos No Encontrados

| Archivo/mecanismo esperado | Ruta esperada | Preguntas sin responder por su ausencia |
|---|---|---|
| `Cierre_Implementacion_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md` / `Encargo_...` | `docs/SYNAPSE/SYNAPSE-RUNNER/` o `ANALYSIS/BACKEND/ROLES/` | Ninguna — el código es autosuficiente; ausentes por instrucción del encargo original, no bloquean nada. |
| Documento/ruta que confirme el dominio de la landing pública o el proyecto Vercel | `docs/BACKEND/` | ¿Dónde empieza el humano sin cuenta? — §13. |
| Ruta HTTP de listado/descubrimiento público de releases | Se esperaría junto a `GET /v1/releases/:releaseId/download` | Cómo un humano anónimo llega al `releaseId` correcto sin `organizationId`. |
| Caller HTTP real que provea `initialIdentity` para un principal genuinamente nuevo | `administration-route.ts` o un módulo de invitaciones dedicado | ¿Cómo se invita a alguien que no es el fundador? — sigue sin resolverse, ver §14.2. |
| Categoría de error explícita en `synapse-simulator.html` distinta de `sentinel`/`brain`/`synapse` (heredado del dossier §7.4) | `installer/conductor/workspace/shared/synapse-simulator.html` | Si el Runner necesita distinguir un cuarto tipo de evento del EventBus. |

---

## 12. Correcciones Registradas (no aplicadas a los documentos originales)

1. El dossier de Fases 1-4 no menciona la frontera GitHub del login humano del backend — no es un error, es simplemente un alcance distinto; ahora cubierta en §4.
2. La evidencia previa de "sólo existen `master`/`specialist`" es **incorrecta**: el rol `operator` está completamente construido (`backend/migrations/0011_authority_role_catalog_operator.sql` + `installer/nucleus/internal/authority/roles.go:11,45,57`).
3. Un comentario en `backend/src/authority/tenant-self-route.ts` (líneas 7-10) describe el endurecimiento de `TenantID` en `.ownership.json` como "todavía no ejecutado" — está desactualizado; `ownershipcontract/schema.go:165-198` ya lo exige.
4. `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` (2026-08-07) describe una ruta legada no-canónica para `ownership.go` que el código actual ya no usa (resuelve por `core.ResolveNucleusRoot`).
5. *(Heredado del dossier §7.5)* Discrepancia de documentación: `background-companion.js` emite `reason: 'ENGINE_RESPONSE_ERROR'`, valor que no está en el `knownReasons` documentado de `companionProtocol.js` v2.0.0.
6. *(Heredado del dossier §7.7)* Sigue sin confirmarse si `templates/{companion,discovery,synapse-simulator}/` y `installer/cortex/extension/` se sincronizan por build automático o manual.

---

## 13. Datos y Confirmaciones Pendientes de José

- **URL/dominio de la landing pública** para Fase 0 sin cuenta (no hay `routes` en `wrangler.jsonc`; el documento de arquitectura Backend/Cloudflare deja esto explícitamente pendiente).
- **Proyecto(s) Vercel**, si existen, que sirvan esa landing.
- **Confirmación en bytes** del tamaño de `~/.local/share/BloomNucleus/bin` (esta investigación sólo confirmó estructura, no midió tamaño exacto).
- **Cadencia/intervalo de polling** de `nucleus authority sync` en producción.
- *(Heredado del dossier §7.2)* Valor exacto de `ENGINE_RESPONSE_TIMEOUT_MS` en `background-companion.js`.
- *(Heredado del dossier §7.3)* Verificación contra un browser real de los selectores de `injectAndObserve()`.

---

## 14. Decisiones Pendientes de José

### 14.1 ¿Aplica `AUTHORITY_BOUNDARY.md` §1 a la superficie 0 del PoC (browser genérico automatizando login/registro GitHub)?

El texto (§1) es explícitamente agnóstico de componente: *"aplica igual si el ejecutor es la extensión de Chrome, el backend, o el Cognituum Runner local."* No decide esta pregunta por sí mismo — nunca menciona "arnés de pruebas" como categoría. Opciones presentadas, sin inclinar la balanza:

- **Opción A — Playwright sujeto a la restricción.** La superficie 0 (§7) tendría que detenerse en la puerta de GitHub y usar una sesión ya autenticada inyectada por fixture, nunca un login real automatizado.
- **Opción B — Playwright fuera de alcance por ser herramienta de QA, no un componente de producción.** Se podría automatizar un login de prueba contra una cuenta de test dedicada, con las debidas precauciones de secreto.
- **Riesgo de la Opción B:** si ese arnés se reutiliza como base de un flujo de producto real, la línea entre "sólo QA" y "el sistema" se vuelve difícil de sostener retroactivamente.

Esta decisión sigue sin tomarse; condiciona directamente cómo se implementa la superficie 0 del PoC de cinco superficies (§7).

### 14.2 Habilitar "invitar miembro no-fundador"

El código soporta la forma (`administration.ts`/`administration-store.ts`) pero **no hay ningún camino** en el repo que cree una identidad verificada para una segunda persona distinta dentro de una organización existente (los únicos dos `INSERT INTO authority_human_identities` del repo son para el mismo fundador). Decidir si se prioriza cerrar este gap antes de construir cualquier automatización de Fase 0 multi-usuario — el PoC actual de cinco superficies asume un solo usuario fundador de punta a punta.

### 14.3 Landing pública / punto de entrada sin cuenta y descubrimiento de releases

Ver §13 y §11 — decidir si Fase 0 hoy empieza siempre desde una superficie ya autenticada de otro componente, o si se necesita construir una landing anónima con descubrimiento de releases antes de que el PoC pueda simular un usuario nuevo real desde cero.

### 14.4 Observabilidad de Fase 0

La estrategia de observabilidad del dossier (§9) cubre las Fases 1-4 con 4 capas correlacionadas. **Fase 0 no tiene ninguna capa de observabilidad propia hoy** — el Runner tendría que apoyarse únicamente en las respuestas HTTP directas del backend (status codes, cuerpos JSON) para diagnosticar fallas en la superficie 0. Decidir si esto es suficiente o si vale la pena definir una Capa 0 de observabilidad (por ejemplo, correlacionando `requestId`/`organizationId` devueltos por el backend) antes de implementar el PoC extendido.

---

## 15. Próximos Pasos — Actualización del Esquema Local de `synapse-runner`

Para que el proyecto `synapse-runner` incorpore lo investigado en el servidor a su esquema local actual:

1. **Renombrar/renumerar la matriz de flujo** (dossier §3, ahora §6 de este documento) para que empiece en `00a` en vez de `01` — el código/config del Runner que hoy asume "el flujo empieza en Launch de Electron" debe actualizarse para reflejar que hay cuatro pasos server-side previos.
2. **Agregar la superficie 0** (browser genérico, §7) a la arquitectura de cuatro superficies existente del PoC — implica un nuevo bloque de setup en el harness de Playwright que corre *antes* de `_electron.launch()`, y que se cierra/descarta antes de levantar las superficies 1-4.
3. **No implementar la superficie 0 todavía** si la decisión de §14.1 sigue pendiente — el harness puede dejar un punto de inserción (stub) documentado, análogo a como el dossier ya trata al Submit Simulator (§5C) como módulo pendiente con contingencia.
4. **Actualizar el conteo de fronteras externas** de tres/cuatro a seis (§4) en cualquier documentación o código del Runner que enumere fronteras explícitamente.
5. **Registrar el gap de invitación de miembros (§14.2)** como una limitación conocida del alcance actual del PoC: el Runner sólo puede simular el flujo del fundador, nunca un segundo usuario invitado, hasta que ese gap se resuelva en el backend.
6. **Dejar pendiente la Capa 0 de observabilidad (§14.4)** como ítem de diseño futuro, sin bloquear el resto de la implementación.
7. Mantener intactos los tres documentos fuente en disco; este documento es la referencia de trabajo, no un reemplazo — cualquier actualización futura de Fase 0 o de Fases 1-4 debe reflejarse primero en su documento de origen y luego integrarse acá.

---

## Nota de Procedencia y Cumplimiento

Este documento es una integración editorial de tres documentos ya existentes en el repo; no involucró nueva investigación de código más allá de la ya realizada para `Fase0_Server_Side_Onboarding_Seccion.md`. No se modificó ningún archivo existente — los tres documentos fuente permanecen intactos. No se transcribió ningún valor de secreto.
