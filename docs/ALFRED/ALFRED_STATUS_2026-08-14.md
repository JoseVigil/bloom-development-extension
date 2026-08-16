# Alfred — Estado actual y hoja de ruta

**Fecha:** 2026-08-14
**Propósito de este documento:** dar contexto completo y autocontenido para arrancar cualquier sesión nueva
(Cowork, Claude Code, o humana) que necesite entender qué es Alfred, qué existe hoy de verdad, qué está
decidido, qué sigue bloqueado, y dónde seguir. No reemplaza a los documentos fuente listados en la sección
7 — los resume y los referencia por ruta exacta.

---

## 0. Qué es Alfred — son dos cosas distintas, no confundir

| | Alfred-Go (gobernanza) | Alfred-conversacional (este documento) |
|---|---|---|
| Lenguaje | Go | Python |
| Ubicación | `installer/nucleus/internal/governance/alfred.go`, `alfred_server.go` | `installer/alfred/` |
| Rol | Custodio angosto: verifica intents contra la constitución (`.rules.bl`, `.ai_bot.sovereign.bl`), responde APPROVED/DENIED | La voz: conversación abierta sobre el modelo de negocio y el proyecto, con memoria de sesión |
| Servidor | REST+WS, ambos en el puerto 48216 (`alfred_server.go`) — el log que menciona 48217 para el WS es un bug conocido, nunca abre ese puerto | REST+WS reales en el puerto 48219 (`server.py`, esta sesión) |
| Estado | Existe, con bugs conocidos sin resolver (ver §6) | Construido esta sesión y la anterior, funcional end-to-end contra un mock de Ollama |

Todo lo que sigue es sobre **Alfred-conversacional**, salvo que se aclare lo contrario.

---

## 1. Estado actual — motor conversacional (`installer/alfred`)

- **Providers reales** (`src/alfred/providers/`): `OllamaTextProvider` (default, local, modelo
  `llama3.2:3b` configurable vía `OLLAMA_TEXT_MODEL`, con `generate_text()` y `generate_text_stream()` —
  este último lee el NDJSON real de `/api/generate` con `stream: true`, no fake-chunkea). `GeminiTextProvider`
  (opt-in explícito vía `--provider gemini`, usa `GEMINI_API_KEY` propia, **transicional** — ver §4).
  `OllamaEmbeddingProvider` (embeddings, heredado de `agentic-harness`, sin uso activo en el chat hoy).
- **Servidor real** (`src/alfred/server.py`, FastAPI, puerto 48219 vía `ALFRED_SERVER_PORT`):
  - `GET /health` — estado de los tres arms (reusa `src/alfred/health.py`, compartido con
    `scripts/check_health.py`).
  - `POST /chat` — respuesta completa, cualquier provider.
  - `WS /ws/chat` — streaming real, solo Ollama (Gemini no tiene path de streaming, ver docstring del
    archivo para el porqué).
  - Verificado de punta a punta contra un mock HTTP local que simula el NDJSON de Ollama: `/health`,
    `/chat` y `/ws/chat` devuelven exactamente el texto esperado, fragmento por fragmento.
- **CLI** (`src/alfred/chat.py`): REPL interactivo + modo `--message` one-shot, flag `--provider`
  (`ollama`/`gemini`, default `ollama` o `ALFRED_TEXT_PROVIDER` env var). Carga contexto real de
  elias-repos (`.ai_bot.sovereign.bl`, `.rules.bl`) — nunca un mock; si faltan, falla con `SystemExit`
  explícito en vez de simular.
- **Contratos** (`src/alfred/contracts/`): mirror de `contracts/types.ts`/`errors.ts` del root del repo —
  `AIPromptPayload`, `ErrorCatalog`/`ProviderError`. No inventados, migrados 1:1.

---

## 2. Estado actual — integración con Core (Electron/webview)

Core ya tenía un pipe bien diseñado para esto (`bloom.ai.execution.*`), pero roto en el punto de ejecución:

- **Contrato reusable, confirmado sólido:** `AIPromptPayload` (`contracts/types.ts`) y `AIExecutionState`
  (`contracts/state-machines.ts`, máquina de estados `idle→connecting→streaming→completed/cancelled/error`).
  El envelope WS (`bloom.ai.execution.{connected,prompt,cancel,stream_start,stream_chunk,stream_end,error,
  cancelled}`) está cableado punta a punta en `src/server/WebSocketManager.ts` y
  `webview/app/src/lib/stores/websocket.ts`.
- **Lo que estaba roto (y se arregló esta sesión):** `src/ai/adapters/OllamaNativeAdapter.ts` shelleaba
  `brain ollama chat --json` — comando que **no existe** en `brain/` — y fake-chunkeaba palabra por palabra
  una respuesta que nunca se generó. `cancelProcess()` era un `console.log`, no cancelaba nada.
- **Arreglado:** `OllamaNativeAdapter.ts` ahora abre un WebSocket real contra `installer/alfred`'s
  `/ws/chat` (puerto 48219) y forwardea chunks reales. `cancelProcess(processId)` ahora cierra el socket
  real (se threadeó `processId` a través de `WebSocketManager.handleAIExecutionPrompt`).
  `WebSocketManager.classifyError()` ahora prioriza el `error_code` estructurado que manda Alfred
  (`AlfredProviderError`) en vez de adivinar por substring en inglés, que nunca iba a matchear mensajes en
  español. Typecheck completo del proyecto (`tsc --noEmit -p tsconfig.json`) sin errores.
- **Lo que falta, sin ambigüedad:** no existe todavía ningún componente Svelte que consuma este pipe para
  Alfred. `webview/app/src/lib/components/ChatBTIP.svelte` es otra cosa — turnos de un Intent `dev`/`doc`
  vía REST (`intentsStore.addTurn`), sin streaming, sin relación con `bloom.ai.execution.*`. Construir la UI
  real de chat de Alfred en Core es el próximo trabajo de interfaz pendiente.
- **Gap conocido, no resuelto a propósito:** el campo `context` semántico de `AIPromptPayload`
  (`'general'|'dev'|'doc'|...`) no viaja todavía desde `WebSocketManager` hasta Alfred — hoy se manda
  `'general'` fijo.

---

## 3. Estado actual — integración con AITAP

- **AITAP es real** (`installer/aitap`), scaffold v0.1: CLI propio (`aitap system status`, `keys list`,
  `route status`), categorías `SYSTEM/KEYS/ROUTE/HEALTH`. **Motor de ruteo inter-proveedor no implementado**
  — `aitap route status` responde literalmente "no implementado todavía". Sin conexión real a Nucleus Vault
  todavía tampoco.
- **Rol de AITAP, fijado como no-negociable:** Grifo + Vault (por referencia, nunca custodia) +
  Contabilidad. Nunca orquesta, nunca parsea ni interpreta el `BSIP-Response` — eso es 100% del
  orquestador consumidor (Brain o Alfred).
- **Alfred es orquestador de primer nivel**, mismo estatus que Brain (`IntentExecutor`) — no un cliente
  secundario ni una integración ad-hoc.
- **Lado Emisión, preparado:** `installer/alfred/src/alfred/aitap/bisp_payload.py` arma el payload como
  `index.json` (capas `operational`/`autarchic`/`marketplace`, sin vector — capa aditiva) y declara el
  Contrato de Synapse (default A — Continuar). `client.py` define `AitapClient`/`AitapRawResponse`
  (respuesta cruda + tokens/costo/latencia de Contabilidad), pero `AitapClient.ask()` levanta
  `AitapNotImplementedError` **a propósito** — no hay ningún endpoint real de AITAP al que apuntar todavía.
  No reemplazar por una simulación.
- **Lado Recepción, formalmente bloqueado:** el schema del Contrato D (`BSIP-Response`) todavía no está
  cerrado. `docs/AITAP/BSIP_Response_Spec_PoC_Disparo1_v1_0.md` **ya existe** (no existía cuando se escribió
  la directiva del Disparo 2) pero su propio estado dice "Orden de trabajo abierta — investigación y PoC,
  sin schema final todavía" — tiene un borrador de JSON Schema (§2) y preguntas abiertas sin cerrar (§7:
  formato de `diff`, operaciones parciales vs. todo-o-nada, dónde vive la validación de scope). **No
  diseñar el parser de Alfred hasta que ese PoC cierre.**
- **Identidad de consumidor — decisión confirmada 2026-08-14 (Modelo A):** Alfred es **multi-instancia** —
  un Alfred por dispositivo (cada workspace Electron, eventualmente cada instalación mobile), cada uno
  habla con AITAP directo para cualquier uso de tokens, sin excepción. Se evaluó y se descartó un modelo
  alternativo (un solo Alfred "primario" por organización, el resto llegando como clientes remotos vía
  túnel de Batcave) — ese es el modelo que hoy describe `.ai_bot.sovereign.bl` de elias-repos, confirmado
  por Jose como contenido **legacy y poco desarrollado**, no como la arquitectura a seguir.
- **Regla no-negociable confirmada:** el proceso renderer de Electron nunca tiene el token/credencial de
  Alfred frente a AITAP. Solo el proceso main le habla a AITAP; el renderer pide por IPC.
- **Gap confirmado, sin resolver, trabajo nuevo real:** no existe en ningún lugar del ecosistema un
  mecanismo de alta de dispositivo/cliente. Se buscó explícitamente (`device_id`, `machine_id`,
  `hardware_id`, `fingerprint`) en `installer/nucleus`, `installer/sentinel`, `installer/metamorph` — sin
  resultados relevantes. `safeStorage`/`keytar` — cero uso en todo `src/`/`webview/`. `.ownership.json` es
  identidad de organización, no de dispositivo. El vault de Nucleus
  (`installer/nucleus/internal/vault/vault.go`) valida el patrón de guardar secretos en el keyring del SO,
  pero no emite identidad, y su propia `InitializeVault()` no la llama nadie en código real todavía.
  **Diseñar quién emite la credencial inicial de cada dispositivo, y dónde vive, es el próximo trabajo de
  arquitectura pendiente sobre AITAP.**

---

## 4. Decisiones arquitectónicas confirmadas (cronológico)

1. **2026-08-09** — Alfred conversacional se migra de `agentic-harness/harness/` a `installer/alfred/`,
   proyecto independiente, no vive dentro de Batcave.
2. **2026-08-09** — Ollama local es el motor **default** de texto de Alfred, no un paso intermedio hacia
   Gemini. Gemini queda como arm opt-in explícito, nunca default silencioso — razón de fondo: soberanía de
   datos (principio BTIPS de distribución agnóstica de carga, ningún punto único debe poder reconstruir el
   negocio completo).
3. **2026-08-13** — Alfred es orquestador de primer nivel frente a AITAP, mismo estatus que Brain.
4. **2026-08-13** — AITAP = Grifo + Vault + Contabilidad, nunca parsea el `BSIP-Response`. Brain y Alfred
   parsean cada uno por su cuenta.
5. **2026-08-14** — Alfred es multi-instancia: un Alfred por dispositivo, cada uno consumidor directo de
   AITAP. Descartado el modelo de un solo Alfred "primario" por organización con el resto vía túnel de
   Batcave.
6. **2026-08-14** — El renderer de Electron nunca tiene el token de Alfred frente a AITAP; solo el proceso
   main.

---

## 5. Próximos pasos concretos, en orden de dependencia

1. **Diseñar el mecanismo de alta de dispositivo** (§3, último punto) — bloquea que `AitapClient` deje de
   ser un stub. Es pieza nueva, no extensión de algo existente. Candidato natural para dueño: Nucleus (ya
   es dueño de `.ownership.json` y del vault), pero confirmar si aplica igual quando no hay Nucleus local
   (caso mobile) antes de fijarlo.
2. **Construir el componente Svelte de chat de Alfred en Core**, consumiendo el pipe `bloom.ai.execution.*`
   ya arreglado (§2) — es la primera interfaz real de usuario para Alfred conversacional.
3. **Seguir el PoC del Contrato D** (`BSIP_Response_Spec_PoC_Disparo1_v1_0.md` §4/§7) — no es trabajo de
   Alfred directamente, pero desbloquea el lado Recepción cuando cierre.
4. **Cuando el motor de ruteo de AITAP exista de verdad:** migrar el path Gemini de `chat.py` (hoy directo
   a `GEMINI_API_KEY`) para que construya sobre `AitapClient` en vez de `GeminiTextProvider`. Ollama nunca
   migra — sigue siendo directo siempre.
5. **Deuda técnica de Alfred-Go, deprioritizada pero real** (no tocada esta sesión): `loadGovernanceConfig()`
   lee `nucleus-governance.json` relativo al CWD, sin el punto ni el prefijo real (`.core/.nucleus-governance.json`)
   — bloquea correr `nucleus alfred start` contra elias-repos tal cual está hoy. Modelo hardcodeado
   `"llama2"` en `ollama_client.go`, nunca confirmado que exista.

---

## 6. Documentación desactualizada — no tratar como fuente de verdad

- **`docs/ALFRED/AGENTIC_HARNESS_OVERVIEW.md`** — describe el estado *anterior* a esta sesión: código
  todavía en `agentic-harness/`, Ollama como arm exclusivo de embeddings, Alfred real "corriendo en
  Batcave, GitHub Codespaces". Los tres puntos están superados por las decisiones de §4.1 y §4.2 de este
  documento. No se edita ese archivo desde acá — señalado para que no genere confusión en otra sesión.
- **`.ai_bot.sovereign.bl`** (elias-repos) — describe a Alfred enrutando por el túnel de Batcave hacia un
  único Nucleus local. Confirmado por Jose como legacy/poco desarrollado. No es fuente de verdad de la
  arquitectura de identidad de Alfred (ver §3, Modelo A).

---

## 7. Referencias documentales completas

### AITAP
- `docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md` — resolución original (2026-08-12):
  AITAP es grifo, no implementador ni orquestador.
- `docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` (v1.1) — marco conceptual consolidado, fuente
  de verdad de los tres pilares de AITAP. Incluye §6 (ciclo Brain↔AITAP↔OpenCode) y **§7, agregado esta
  sesión** (decisión de identidad por dispositivo para Alfred).
- `docs/AITAP/Alfred_Integracion_AITAP_Disparo2_v1_0.md` — directiva de integración específica de Alfred:
  lado Emisión (desbloqueado), lado Recepción (bloqueado hasta el Disparo 1).
- `docs/AITAP/BSIP_Response_Spec_PoC_Disparo1_v1_0.md` — Contrato D, borrador de JSON Schema, todavía sin
  cerrar (orden de trabajo abierta).
- `installer/aitap/README.md`, `installer/aitap/AGENTS.md` — estado real del scaffold, tripwires
  operativos, qué AITAP nunca hace.

### BISP / protocolo genérico
- `docs/BSIP/BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A — protocolo BISP genérico: schema de
  `index.json`, los tres Contratos de Synapse (A/B/C) que sí están cerrados.

### Alfred (este proyecto)
- `installer/alfred/AGENTS.md` — guardrail operativo completo, decisiones de raíz, tripwires, estado real
  actualizado hoy.
- `installer/alfred/src/alfred/chat.py`, `server.py`, `aitap/bisp_payload.py`, `aitap/client.py` —
  docstrings de cada archivo explican el porqué de cada decisión de diseño puntual.

### Gobernanza / identidad (contexto para el gap de §3)
- `docs/GOVERNANCE/GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` — schema canónico de `.ownership.json`, identidad de
  organización (no de dispositivo).
- `docs/GOVERNANCE/G1-G8_multi-org-switch-design.md` — modelo de switch de organización, single-org-activa.

### Batcave / Synapse (contexto del modelo descartado en §3)
- `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` — desactualizado en el punto de "Alfred vive dentro del proceso TS
  de Batcave" (corregido en sesiones previas: Batcave es relay, no contiene la lógica de Alfred).
- `docs/CORTEX/HANDOFF-github-app-batcave-synapse.md` — GitHub App + Device Flow para autorización de
  Batcave (mecanismo de auth remota ya real, relevante si el Modelo A necesita algo similar para
  dispositivos).

### Legacy / no autoritativo (ver §6)
- `docs/ALFRED/AGENTIC_HARNESS_OVERVIEW.md`.
