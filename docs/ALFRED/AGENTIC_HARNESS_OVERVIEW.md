# Agentic Harness — Overview del proyecto

> Ubicación del código: `agentic-harness/` (raíz del repo `bloom-development-extension`).
> Este documento vive en `docs/ALFRED/` porque el harness es una pieza de portfolio
> construida siguiendo el mismo patrón arquitectónico que ya usa **Alfred**
> (ver §9 de `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`) — no es Alfred en sí,
> ni lo reemplaza, ni corre en producción dentro del ecosistema Bloom.

---

## 1. Qué es esto y por qué existe

`agentic-harness` es un harness agéntico standalone: un loop de tool-calling +
router semántico + gate de permisos + logging + eval set, construido por Jose en
Claude Code como pieza de portfolio.

No es un wrapper genérico de API sobre un LLM. Es un ejercicio de diseño
deliberado: replicar, en una escala pequeña y auditable, el mismo principio de
**separación entre autoridad y ejecución** que ya sostiene todo el ecosistema
Bloom — y que en Bloom real se expresa como `Nucleus firma → Brain ejecuta →
Alfred solo enruta sin firmar nunca`. El harness copia esa forma: propone,
nunca decide ni ejecuta una acción sensible por sí mismo.

**Es solo una parte.** El proyecto Bloom es grande — tiene Nucleus, Brain,
Cortex/Synapse, Batcave, Conductor, la app mobile, Alfred real corriendo en
Batcave, y más. Este harness no es ninguno de esos componentes: es un
artefacto separado que Jose se tomó la libertad de desarrollar en Claude Code,
leyendo los contratos y el motor reales de Bloom **en vivo, por path
relativo**, para quedar estructuralmente compatible con el sistema real sin
tocarlo ni depender de él en runtime.

## 2. Objetivo

Demostrar diseño agéntico real — no una demo de "llamo a un LLM y muestro la
respuesta" — a través de:

- Un motor de decisión (router) que clasifica la tarea entrante antes de
  decidir cómo pedirle una respuesta al proveedor externo.
- Un gate de permisos explícito y no-autoritativo que se interpone entre
  "el harness propone" y "algo se ejecuta", reemplazable después por algo
  tipo BlindJudge sin cambiar la forma del código alrededor.
- Logging con la misma forma estructural que usa Bloom (`payload / index /
  response`), no un log ad hoc.
- Un eval set con pass/fail automatizado en vez de una demo manual.

El resultado buscado no es "un chatbot que funciona", es un artefacto que
pueda explicarse en una entrevista como: *"diseñé un agente siguiendo el
mismo patrón de separación autoridad/ejecución que usa el sistema de
producción del que se desprende"* — sin mostrar ni depender de una línea de
dato propietario real de ninguna organización.

## 3. Relación con Alfred (el real) — qué es y qué NO es

Para que quede sin ambigüedad, porque el nombre puede confundir:

| | Alfred (real, BTIPS §9) | `agentic-harness` (este proyecto) |
|---|---|---|
| Dónde corre | Batcave, GitHub Codespaces, control plane remoto | Local, Claude Code, repo de portfolio |
| Conocimiento de negocio | Contrato soberano real `.ai_bot.sovereign.bl` de una organización real | `context/mock-nucleus/` — contrato ficticio, misma forma, cero datos reales |
| Autoridad | Nunca firma; enruta instrucción → Nucleus local firma → Brain ejecuta | Nunca firma ni ejecuta; gate explícito no-autoritativo (`signed_by: "mock-harness"`) |
| Consume | Túnel soberano de Batcave, BlindJudge, WebSocket protocol real | `../contracts/`, `../brain/core/` del mismo repo, leídos en vivo, sin red |
| Propósito | Componente de producción del ecosistema Bloom | Pieza de portfolio, aislada, no enlazada a ningún sistema real hoy |

El harness **no es** una reimplementación de Alfred ni un intento de
reemplazarlo. Es un proyecto separado que **copia su patrón arquitectónico**
(autoridad siempre local/gated, el agente solo enruta/propone) porque ese
patrón ya está probado en producción y es el precedente de diseño correcto
para cualquier pieza que quiera, algún día, ser enlazable al ecosistema real
sin reescritura.

## 4. Las 5 fases del proyecto

| Fase | Nombre | Qué hace | Estado |
|---|---|---|---|
| 1 | Abstracción de proveedor | Implementa `AIProvider` real (`'ollama' \| 'gemini'`) con roles asimétricos: el arm de Ollama **solo genera embeddings** (`generate_embedding`, modelo `nomic-embed-text`), el arm externo (Gemini) es el único que genera texto/razonamiento real. Maneja explícitamente `AI_EXECUTION_OLLAMA_NOT_RUNNING` / `_MODEL_MISSING` del catálogo de errores real. | ✅ Completada (2026-08-05) |
| 2 | Router semántico | Usa el embedding local (Fase 1) para clasificar la tarea entrante / matchearla contra el eval set, y decide con eso cómo armar el prompt para el proveedor externo. No es "tarea simple → local, tarea compleja → externo" — la generación de texto siempre es externa; el routing decide *cómo* llamar al externo, no *si* evitarlo. | Pendiente |
| 3 | Gate de permisos | El harness propone, nunca decide ni ejecuta acciones sensibles por sí mismo. Stub explícito no-autoritativo, diseñado para ser reemplazable por algo tipo BlindJudge sin cambiar la forma del código alrededor. | Pendiente |
| 4 | Logging en forma BISP | Todo output mapeable a `payload.json / index.json / response/{raw_output.txt, report.json, staging/}`, en carpetas al estilo `governance/security/relay` que ya usa Batcave. | Pendiente |
| 5 | Eval set | 5-10 tareas con pass/fail automatizado, no demo manual. | Pendiente |

## 5. Tecnologías

- **Python 3.12**, entorno virtual (`.venv/`), `pytest` como test runner
  (`pyproject.toml` con `testpaths = ["tests"]`).
- **Ollama** local, embebido con el resto de Bloom
  (`~/.local/share/BloomNucleus/bin/ollama/ollama` en Linux, con fallback a
  `ollama` en PATH) — arm exclusivo de embeddings vía `/api/embeddings` o
  endpoint equivalente, modelo `nomic-embed-text`. Mismo patrón de resolución
  que `OllamaManager.from_nucleus_path` en `brain/core/bisp/ollama_manager.py`.
- **Gemini** (u otro proveedor externo que Jose decida para portfolio) como
  único arm de generación de texto/razonamiento real. Requiere credencial
  cargada vía `brain gemini keys-list` / `keys-add` antes del primer
  end-to-end.
- **`requests`** como única dependencia externa declarada hasta ahora
  (`requirements.txt`), sin SDKs pesados — llamadas HTTP directas a las APIs
  de Ollama/Gemini.
- Contratos consumidos **en vivo por path relativo**, no vendorizados: el
  harness lee `../contracts/types.ts`, `../contracts/errors.ts` y
  `../brain/core/` directamente del mismo checkout de git (ver
  `agentic-harness/context/DECISION-live-source.md`). No hay mecanismo de
  sincronización porque no hace falta: es el mismo repo.
- Módulos ya presentes (Fase 1): `harness/contracts/{types.py, errors.py}`
  (mirror manual, no generado, de la porción `AI_PROVIDER` de `types.ts`),
  `harness/providers/{base.py, ollama_provider.py, gemini_provider.py}` con
  dos ABCs separadas (`EmbeddingProviderArm`, `TextGenerationProviderArm`) —
  un arm nunca implementa un método fuera de su rol real.

## 6. Cómo interactúa (y cómo NO interactúa) con el resto del ecosistema

**Hoy, en Fase 1-2:** el harness no está enlazado a nada del ecosistema real
en runtime. Lee dos cosas del repo Bloom, ambas de solo lectura y sin red:

1. Los contratos compartidos (`../contracts/types.ts`, `errors.ts`, y en el
   futuro `state-machines.ts`) — la interfaz mínima que cualquier cosa que
   quiera hablar con Bloom debe consumir, según
   `context/HARNESS_CONTEXT_BRIEF.md` §3.
2. El motor real de fases (`../brain/core/intent_types.py`) como precedente
   de diseño para el router/gate — un motor genérico dirigido por tabla
   (`IntentTypeSpec`/`PhaseSpec`), no `if` por tipo de tarea.

No abre conexión con Batcave, no usa el protocolo WebSocket real, no carga
ningún `.ai_bot.sovereign.bl` real, no firma ni ejecuta ningún intent o
Mandate real. Todo dato de "negocio" que necesita para operar viene de
`context/mock-nucleus/` — un contrato ficticio con la misma forma que uno
real, para una organización inventada.

**Si algún día se decide enlazarlo de verdad:** el diseño está pensado para
que ese paso sea configuración, no reescritura — apuntar el cliente a un
Nucleus real, reemplazar el gate stub por BlindJudge, y el mock de contrato
soberano por el archivo real. Esto es exactamente el patrón que Alfred real
ya demuestra que funciona (`context/HARNESS_CONTEXT_BRIEF.md` §0): separado,
sin autoridad propia, hablando con el resto del sistema a través de
contratos versionados — nunca protocolo ad hoc "por ahora".

**Invariantes que garantizan esto** (forma, no valores — tomados de
`BATCAVE_ARCHITECTURE.md` §11 vía `INVARIANT-ORG-*` / `INVARIANT-ALF-*`):

- Nunca hardcodear nombre de organización/proyecto en ningún path.
- El harness nunca firma nada — cualquier aprobación simulada está marcada
  explícitamente como no-autoritativa.
- El harness nunca ejecuta una acción sensible sin pasar por el gate
  (Fase 3), aunque hoy sea un stub.
- Ningún dato real de organización, cliente o `.ownership.json` real entra a
  tests o fixtures.

## 7. Referencias

- `agentic-harness/CLAUDE.md` — instrucciones de proyecto completas.
- `agentic-harness/context/HARNESS_CONTEXT_BRIEF.md` — brief original de
  separación de Alfred, invariantes, contrato BISP, jerarquía de autoridad.
- `agentic-harness/context/DECISION-live-source.md` — por qué el harness lee
  fuentes en vivo en vez de vendorizarlas.
- `agentic-harness/context/DECISION-ollama-role.md` — por qué Ollama local
  solo genera embeddings acá.
- `docs/BTIPS_Bloom_Technical_Intent_Package_v6_0.md` §8 (Batcave) y §9
  (Alfred) — el precedente arquitectónico real que este proyecto replica.
