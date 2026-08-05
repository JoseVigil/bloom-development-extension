# agentic-harness — instrucciones de proyecto para Claude Code

Este archivo se carga automáticamente al abrir Claude Code en esta carpeta.
Leelo antes de escribir código.

## Qué es esto

Un harness agéntico (tool-calling loop + router local/externo + gate de
permisos + logging + eval set) construido **siguiendo el mismo patrón
arquitectónico que ya usa Bloom** para separar autoridad de ejecución
(Nucleus firma, Brain ejecuta, Alfred solo enruta sin firmar nunca). El
objetivo es de portfolio: demostrar diseño agéntico real, no un wrapper
genérico de API.

**Decisión de raíz (2026-08-05, tomada por Jose):** este proyecto vive
DENTRO del repo `bloom-development-extension`, no en un repo separado. Eso
significa que el harness lee los contratos y el motor reales de Bloom **en
vivo, por path relativo**, no de copias. Ver `context/DECISION-live-source.md`
para el razonamiento completo y qué hacer si en algún momento esta carpeta
se extrae a un repo propio para mostrarla sola.

## Fuentes reales — leer por path relativo, no asumir contenido

- `../contracts/types.ts` — `AIProvider` (`'ollama' | 'gemini'`),
  `AIPromptPayload`, `IntentType` (solo dev/doc acá), `ErrorCode`,
  `APIResponse<T>`.
- `../contracts/errors.ts` — `ERROR_CATALOG` completo, incluye
  `AI_EXECUTION_OLLAMA_NOT_RUNNING` / `_MODEL_MISSING` con `retry_strategy`.
- `../contracts/state-machines.ts` — `AIExecutionState` (idle → connecting
  → streaming → completed/cancelled/error). Mapear el loop del harness 1:1
  contra esta máquina, no inventar estados nuevos.
- `../contracts/websocket-protocol.ts` — protocolo `bloom.ai.execution.*`,
  útil como referencia de shape de mensajes aunque el harness no hable
  WebSocket con nada.
- `../brain/core/intent_types.py` — motor real de fases (`ing`, `dis`),
  patrón de registro declarativo (`IntentTypeSpec`/`PhaseSpec`). Es el
  precedente de diseño para el gate/router del harness: motor genérico
  dirigido por tabla, no `if` por tipo de tarea.
- `../brain/core/bisp/ollama_manager.py` — implementación real de gestión
  del proceso Ollama (localizar exe, health check, auto-arranque, mensajes
  de error accionables). Referencia directa para la Pieza 1
  (abstracción de proveedor), aunque ese archivo específico está scopeado a
  embeddings — para chat/generación va a `/api/generate` o `/api/chat` de
  Ollama, no a ese módulo.
- `../docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md` — documento
  completo de arquitectura. Secciones más relevantes para este proyecto:
  §8 (Batcave), §9 (Alfred), §7 (Mandates), §4-6 (taxonomía de intents).
- `../brain/help/` o `brain --help --full` (si el CLI está instalado en
  este entorno) — comandos reales disponibles.
- **`../tree/` son MOCKUPS, no estructura productiva.** Corrección de Jose
  (2026-08-05): `../tree/bloom/bloom_nucleus_tree.txt`,
  `../tree/bloom/bloom_project_tree.txt`, etc. son trees de referencia/diseño
  usadas para documentación interna del propio Bloom — no son la forma real
  de un Nucleus corriendo. Sirven para entender la *forma esperada* (nombres
  de fase, shape de JSON), no como fuente de verdad de qué existe en disco
  hoy.
- **La estructura real y productiva se genera donde se crea un Nucleus**,
  dentro de una carpeta `.bloom/`. Ejemplo real, ya explorado y disponible
  como referencia de solo lectura (repo hermano, fuera de
  `bloom-development-extension`):
  `../../elias-repos/.bloom/.nucleus-elias-repos/` — Nucleus real de la
  organización `elias-repos`, con `.core/.nucleus-config.json`,
  `.core/.rules.bl`, `.mandates/{uuid}/mandate_state.json` +
  `domain_proposal.json` reales. Es la referencia a usar para saber cómo
  luce un Nucleus de verdad, no `../tree/`. Es un repo hermano (vive en
  `/home/jose/repos/elias-repos`, no dentro de este repo) — tratarlo como
  lectura de referencia únicamente, nunca escribir ahí, y no asumir que va
  a seguir en ese path si el repo se mueve o se renombra.

## Lo que ya se investigó — no repetir el trabajo, leer `context/`

- `context/HARNESS_CONTEXT_BRIEF.md` — brief original: por qué separar el
  harness de Alfred, los invariantes de Batcave (`INVARIANT-ORG-*`,
  `INVARIANT-ALF-*`), el contrato BISP (`payload/index/response`), la
  jerarquía Nucleus→Mandate→Action→Intent, y por qué el principio del
  Marketplace de Mandates ("nunca asumir acceso a recursos propietarios del
  vendor") es la misma disciplina que necesita un portfolio público.
- `context/intent_types_full_reference.py` — los 7 tipos de intent
  (`dev`, `doc`, `exp`, `ing`, `dis`, `cor`, `inf`) con fase, nivel de
  confianza (`CONFIRMED_CLI` / `CONFIRMED_TREE` / `UNCONFIRMED`) y fuente
  citada para cada uno. `inf` no tiene evidencia real — no inventar sus
  fases si hace falta usarlo, leer BTIPS v6.0 §6 directamente primero.
- `context/mock-nucleus/` — contrato soberano ficticio ("Northwind Labs")
  con la misma forma que un `.ai_bot.sovereign.bl` real, para testear el
  harness sin apuntar a datos de negocio reales. Usar esto como fixture de
  test, nunca commitear un contrato real acá.
- `context/DECISION-live-source.md` — por qué el harness lee fuentes en
  vivo en vez de vendorizarlas, y el patrón de resolución de paths a usar
  si esta carpeta se separa en el futuro.
- `context/DECISION-ollama-role.md` — por qué Ollama local solo genera
  embeddings acá (no chat), y qué cambia en las Piezas 1 y 2 por eso.

## Las 5 piezas a construir (en este orden)

1. **Abstracción de proveedor** — implementa `AIProvider` real
   (`'ollama' | 'gemini'`), pero con roles asimétricos (ver
   `context/DECISION-ollama-role.md`): el arm de **Ollama solo genera
   embeddings** (`generate_embedding`, mismo contrato que
   `OllamaManager.generate_embedding` real, modelo `nomic-embed-text`),
   nunca chat/generación de texto — Jose no tiene hardware para correr un
   modelo de chat local, y el propio `ollama_manager.py` real confirma que
   Bloom tampoco lo usa así en producción. El arm **externo (Gemini u otro)
   es el único que genera texto/razonamiento real**. Manejar explícitamente
   `AI_EXECUTION_OLLAMA_NOT_RUNNING` y `AI_EXECUTION_OLLAMA_MODEL_MISSING`
   del catálogo real. Ollama embebido de este equipo vive en
   `~/.local/share/BloomNucleus/bin/ollama/ollama` (Linux) — resolver esa
   ruta con fallback a `ollama` en PATH, mismo patrón que
   `OllamaManager.from_nucleus_path`.
2. **Router semántico** — no decide "local vs externo" como si fueran dos
   motores de chat intercambiables. Usa el embedding local (Pieza 1) para
   clasificar la tarea entrante / matchearla contra el eval set, y con eso
   decide cómo armar el prompt para el proveedor externo (Gemini) — que es
   quien genera la respuesta siempre. Ver `context/DECISION-ollama-role.md`
   para el razonamiento completo.
3. **Gate de permisos** — el harness propone, nunca decide ni ejecuta
   acciones sensibles por sí mismo. Stub explícito no-autoritativo
   (`signed_by: "mock-harness"` o similar), diseñado para ser reemplazable
   por algo tipo BlindJudge sin cambiar la forma del código alrededor.
4. **Logging en forma BISP** — todo output mapeable a
   `payload.json / index.json / response/{raw_output.txt, report.json, staging/}`.
   Carpetas de log al estilo `governance/security/relay`.
5. **Eval set** — 5-10 tareas con pass/fail automatizado, no demo manual.

## Invariantes a respetar desde el día uno (forma, no valores)

- Nunca hardcodear nombre de organización/proyecto en ningún path.
- El harness nunca firma nada. Cualquier aprobación simulada debe estar
  marcada explícitamente como no-autoritativa.
- El harness nunca ejecuta una acción sensible sin pasar por el gate
  (Pieza 3), aunque el gate sea un stub simple al principio.
- Ningún dato real de organización, cliente o `.ownership.json` real entra
  a los tests o fixtures — usar `context/mock-nucleus/` para eso.

## Primer paso sugerido

Leer `../contracts/types.ts`, `../contracts/errors.ts`,
`../brain/core/bisp/ollama_manager.py`, `context/DECISION-live-source.md` y
`context/DECISION-ollama-role.md` completos antes de escribir la Pieza 1.

## Prerrequisito práctico, no bloqueante

Para probar la Pieza 1/2 de punta a punta hace falta una credencial real
del proveedor externo (Gemini u otro). Verificar con `brain gemini
keys-list` si ya hay una cargada; si no, `brain gemini keys-add` antes de
intentar el primer end-to-end. No hace falta resolverlo antes de empezar a
escribir código — solo antes de correr el primer test real contra el
proveedor externo.
