# Cross-check: AUDIT_REPORT original vs. repo real (`verify_harness_migration.sh`)

## Resumen ejecutivo

| | Audit original | Repo real |
|---|---|---|
| Ocurrencias `harness` (case-insensitive) | 585 | **1971** |
| Archivos con matches | 6 de 7 docs | **116 archivos** |
| Rutas físicas cubiertas en tabla de rename | 22 | ~22 confirmadas OK, pero **faltan 2 subsistemas enteros** |

El audit se generó sobre 7 documentos + un árbol de texto, no sobre el filesystem real — esto ya lo sabíamos, pero la magnitud de lo que falta es mayor de lo esperable. Hay **dos hallazgos críticos** que requieren tu decisión antes de dejar que Claude Code arranque la Fase 1.

---

## 🔴 CRÍTICO 1 — `agentic-harness/`: ¿es el mismo concepto o no?

Existe un directorio completo, **no mencionado en ningún lugar del audit**:

```
agentic-harness/
├── CLAUDE.md
├── context/
│   ├── HARNESS_CONTEXT_BRIEF.md
│   ├── DECISION-live-source.md
│   ├── DECISION-ollama-role.md
│   ├── mock-nucleus/README.md
│   └── README.md
├── harness/                      ← paquete Python
│   ├── __init__.py
│   ├── alfred_chat.py
│   ├── contracts/ (errors.py, __init__.py)
│   └── providers/ (base.py, gemini_provider.py, ollama_provider.py)
├── scripts/check_providers.py
└── tests/ (test_errors_contract.py, test_gemini_provider.py, test_ollama_provider.py)
```

Y en paralelo, `installer/alfred/` tiene **la misma estructura** (`alfred/chat.py`, `alfred/contracts/errors.py`, `alfred/providers/base.py`, `gemini_provider.py`, `ollama_provider.py`) — lo cual sugiere que `agentic-harness/harness/` es un paquete Python real que se importa desde otro lado, no solo texto suelto.

**Por qué importa:** todo el resto del audit trata "Harness" como el nombre de un *activo/pantalla de la extensión Cortex* (Discovery/Landing/Harness). Pero `agentic-harness/` con su paquete `harness/` (chat con proveedores Gemini/Ollama, contratos, tests) tiene toda la pinta de ser un **harness de ejecución de agentes** — un concepto de infraestructura completamente distinto que comparte nombre por casualidad (como "harness" en el sentido genérico de testing/agent harness, no en el sentido de "el componente Harness de la UI").

Si es así, renombrarlo a "synapse-simulator" sería incorrecto y potencialmente rompería imports reales. Si en cambio es el mismo concepto bajo otro nombre de carpeta, hay que sumarlo entero a la Fase 1.

**✅ DECISIÓN CONFIRMADA (Jose, 15/08/2026): es un concepto distinto — se excluye por completo de la migración.**

Esto agrega dos exclusiones nuevas a la sección "EXCLUSIONES" de `CLAUDE_CODE_INSTRUCTIONS.md`:

4. **`agentic-harness/`** (carpeta completa, incluyendo `agentic-harness/harness/`, `agentic-harness/context/`, tests, scripts) — es un harness de ejecución de agentes, concepto no relacionado con el componente "Harness" de la UI Cortex. No renombrar nada acá, ni el paquete Python `harness`, ni `HARNESS_CONTEXT_BRIEF.md`, ni ningún identificador dentro de esos archivos.
5. **`installer/alfred/`** — replica la misma estructura de `agentic-harness/harness/` (chat.py, contracts/errors.py, providers/*). **✅ CONFIRMADO (Jose, 15/08/2026): también se excluye por completo**, mismo criterio que `agentic-harness/`.

---

## 🔴 CRÍTICO 2 — `installer/conductor/workspace/`: subsistema entero sin auditar

**✅ DECISIÓN CONFIRMADA (Jose, 15/08/2026): SÍ es parte del componente Harness — se incluye en la migración.** Esto significa que hay que sumar estos 11 archivos + `HARNESS_WS_STATE` a `MIGRATION_PLAN.md` en la Fase 1, cosa que el `AUDIT_REPORT` original no contempla en absoluto.

Ni un solo archivo de esta carpeta aparece en la tabla de rename del audit, y tiene **11 archivos** con referencias a `harness`, incluyendo un identificador nuevo que no está en la tabla 2 del audit:

- `HARNESS_WS_STATE` (en `tab-system.js` y `debug.html`)

Archivos afectados: `main_conductor.js`, `onboarding/onboarding.js`, `onboarding/onboarding.html`, `onboarding/preload_onboarding.js`, `onboarding/ipc/onboarding-handlers.js`, `onboarding/renderer/core/tab-system.js`, `onboarding/renderer/core/ipc-bridge.js`, `onboarding/renderer/steps/step-workspace.js`, `onboarding/renderer/steps/step-identity.js`, `ipc/workspace-synapse-handlers.js`, `shared/debug.html`.

Nota curiosa: `workspace-synapse-handlers.js` ya tiene "synapse" en el nombre de archivo **y** contiene "Harness" adentro — punto de posible confusión al introducir "synapse-simulator" (mismo tipo de ambigüedad que la nota #15 del audit original sobre "Synapse" protocolo vs. "Synapse Simulator" componente).

---

## 🟡 Identificadores nuevos no cubiertos por la tabla 2 del audit

Encontrados en código real (no solo en `tree/*.txt`), necesitan casing-check contra la tabla de conversión antes de tocarlos:

| Identificador | Dónde |
|---|---|
| `HARNESS_WS_STATE` | conductor/workspace |
| `HARNESS_GET_WATCHED_GOOGLE_TAB` / `harness_get_watched_google_tab` | discoveryProtocol.js, discovery.schema.json |
| `harnessConfig`, `harnessFile`, `harnessUrl`, `HARNESS_LOG_MAX` | `installer/cortex/extension/background.js` |
| `harness_schema` | background.js, HARNESS_SOURCE_OF_TRUTH_1_6.md |
| `bootHarness`, `checkHarness`, `harnessResult` | `installer/nucleus/internal/supervisor/*.go` |
| `harnessData`, `harnessPage` | `installer/sentinel/internal/ignition/ignition_identity.go` |
| `harnessDir` (camelCase) | `IMPL_PROMPT_CORTEX_SENTINEL_Harness.md` — **inconsistente** con `harness_dir` (snake_case) que sí está en la tabla del audit. Puede ser typo del doc original o un identificador real distinto — confirmar. |
| `harness_dead_diagnosis` | `HARNESS_Manual_Onboarding_Debug.md` |
| `demoHarness` | `bloom-conductor-genesis-v1_1.html` |
| `HARNESS_PROTOCOL` (sin `_MANIFEST`) | `IMPL_PROMPT_CORTEX_SENTINEL_Harness.md` — confirmar si es typo o constante real distinta de `HARNESS_PROTOCOL_MANIFEST` |

---

## 🟡 Backups "fuera de scope" — no existen físicamente, pero se mencionan por nombre en código vivo

`HARNESS_SOURCE_OF_TRUTH.md`, `HARNESS_SOURCE_OF_TRUTH_1_2.md`, `HARNESS_SOURCE_OF_TRUTH_FIX.md` **no están en el repo** (el `find` no encontró nada). El audit los marcaba como "no tocar" asumiendo que existían como archivos.

Lo que sí existe es el *string/mención* `HARNESS_SOURCE_OF_TRUTH` (sin sufijo) y `HARNESS_SOURCE_OF_TRUTH_FIX` dentro de:
- `installer/cortex/extension/background.js` ⚠️ (código vivo, no doc)
- `docs/HARNESS/HARNESS_SOURCE_OF_TRUTH_1_6.md`
- `docs/IONPUMP/BLOOM_HARNESS_IONPUMP_SOT_v3.md`
- `docs/LANDING/BLOOM_LANDING_VAULT_SPEC_v1_0.md`
- `docs/SYNAPSE/PROTOCOLO-synapse-homologacion-v3.md`

Que aparezca en `background.js` es lo más raro — si es un string usado en runtime (por ejemplo para armar una URL o un path a un doc), hay que ver si ese path se resuelve contra un archivo que ya no existe (posible bug preexistente, no relacionado con la migración) o si es solo un comentario/log.

---

## 🟡 Artefactos de build adicionales, no cubiertos por la única exclusión del audit (`extension/harness/`)

El audit solo excluye `extension/harness/` — pero esa carpeta **no existe actualmente** como tal (solo existe `installer/cortex/extension/protocols/harness.schema.json`, que es un archivo fuente real, no build output). En cambio, sí aparecen copias generadas en otros 4 lugares que el audit no menciona:

```
installer/native/bin/linux64/brain/_internal/brain/core/profile/web/harness_generator.py (+ templates/harness/*)
installer/native/bin/linux_x64/brain/_internal/brain/core/profile/web/harness_generator.py (+ templates/harness/*)
installer/native/bin/linux_x64/setup/linux-unpacked/resources/brain/_internal/.../harness_generator.py (+ templates/harness/*)
dist/brain/_internal/brain/core/profile/web/harness_generator.py (+ templates/harness/*)
```

Son bundles tipo PyInstaller (`_internal/`) — casi seguro build output empaquetado, mismo criterio que la exclusión #1 del audit. Pero hay que ampliar la regla de exclusión para cubrir `dist/**` e `installer/native/bin/**/_internal/**`, si no Claude Code puede intentar tocarlos a mano innecesariamente (y quedan obsoletos apenas se rebuildee igual).

---

## 🟢 Duplicado detectado

`docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md` existe **en dos rutas**: `docs/` y `docs/BTIPS/`. Si son copias del mismo contenido, conviene decidir cuál es la vigente antes de editar (para no migrar una y dejar la otra desalineada).

---

## 🟢 Confirmado correcto del audit original

- Las 22 rutas de la tabla 1 existen tal cual → **0 faltantes**.
- Los 19 identificadores de la tabla 2 existen con conteos reales (95 a 4 apariciones cada uno) → consistente.
- `HARNESS_SOURCE_OF_TRUTH_1_6.md` es efectivamente el único de la familia SOURCE_OF_TRUTH presente en el repo.
- Los 4 pares `IMPL_PROMPT_*_Harness[.md/_v2.md]` pendientes de confirmación existen tal cual los listó el audit.

---

## Recomendación

**No lanzar la Fase 1 de Claude Code todavía basándose solo en `AUDIT_REPORT_harness_to_synapse-simulator.md`** — está incompleto en ~4x. Decisiones ya tomadas y pendientes:

### Resuelto
- ✅ `agentic-harness/` → excluida por completo (concepto distinto, harness de agentes).
- ✅ `installer/alfred/` → excluida por completo (mismo criterio).
- ✅ `installer/conductor/workspace/` → **incluida** en la migración (11 archivos + `HARNESS_WS_STATE` deben sumarse al `MIGRATION_PLAN.md`).

### Pendiente antes de la Fase 1
1. Ampliar exclusiones de build output en `CLAUDE_CODE_INSTRUCTIONS.md`: `dist/**`, `installer/native/bin/**/_internal/**` (4 copias generadas encontradas, ver sección de build artifacts arriba).
2. Resolver el duplicado de `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` (existe en `docs/` y `docs/BTIPS/`).
3. Confirmar si `HARNESS_SOURCE_OF_TRUTH` (sin sufijo) dentro de `installer/cortex/extension/background.js` es un string funcional que hay que migrar con cuidado, o un comentario/log inocuo.
4. Confirmar si `harnessDir` (camelCase, en `IMPL_PROMPT_CORTEX_SENTINEL_Harness.md`) y `HARNESS_PROTOCOL` (sin `_MANIFEST`, mismo doc) son typos del documento original o identificadores reales distintos de `harness_dir` / `HARNESS_PROTOCOL_MANIFEST`.
5. Decidir cómo tratar `workspace-synapse-handlers.js` — ya usa "synapse" en el nombre y contiene "Harness" adentro; verificar que renombrar a "synapse-simulator" no genere ambigüedad con el protocolo Synapse existente (mismo tipo de nota #15 del audit original).
6. Pasarle a Claude Code el output real de `rg` de este script (no solo el audit de 7 docs), junto con este archivo actualizado, como insumo real de la Fase 1.
