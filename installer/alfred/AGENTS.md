# installer/alfred — instrucciones de proyecto para cualquier agente

Leé esto antes de escribir código acá, además del docstring de
`src/alfred/chat.py`. Mismo patrón que `installer/aitap/AGENTS.md`:
decisiones de raíz primero, tripwires operativos después, no
re-discutir sin evidencia nueva.

## Decisión de raíz — no reabrir sin evidencia nueva

**Alfred es un orquestador de primer nivel, al mismo estatus que Brain
(`IntentExecutor`). No es un cliente secundario ni una integración
ad-hoc de AITAP.**

Fuente: `Alfred_Integracion_AITAP_Disparo2_v1_0.md` (directiva de
integración específica de Alfred, "Disparo 2") y
`docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` v1.1 §2
("Alfred es el segundo consumidor de primer nivel, diseñado desde el
arranque con el mismo estatus que Brain — no como una integración ad-hoc
posterior"). Confirmado por Jose 2026-08-13.

**AITAP es el grifo (Gateway + Vault + Contabilidad). Nunca el
orquestador, nunca el que parsea la respuesta de Alfred.** Ver
`installer/aitap/AGENTS.md` para el guardrail completo del lado AITAP —
no se duplica acá, se referencia.

## Estado real hoy (2026-08-13) — para no asumir de más

- Alfred conversa hoy con Ollama local (`OllamaTextProvider`, default) o
  Gemini directo (`GeminiTextProvider`, opt-in vía `--provider gemini`,
  usa `GEMINI_API_KEY` propia). **Este camino directo a Gemini es
  transicional**, no la arquitectura final — ver próxima sección.
- AITAP existe como scaffold (`installer/aitap`), pero su motor de
  ruteo inter-proveedor **no está implementado**. `aitap route status`
  literalmente responde "no implementado todavía". No hay ningún
  comando real al que Alfred pueda apuntar todavía.
- El lado Emisión (Alfred → AITAP) está diseñado en
  `src/alfred/aitap/bisp_payload.py` y `src/alfred/aitap/client.py` —
  arma el payload correcto (BISP, Contrato de Synapse declarado) pero
  `AitapClient.ask()` levanta `AitapNotImplementedError` a propósito,
  porque no hay nada real que invocar. **No lo reemplaces por una
  simulación** — misma disciplina que GOV-INV-004 en Nucleus (nunca
  fallback silencioso a un simulation_env).
- El lado Recepción (cómo Alfred parsea el `BSIP-Response` que devolvería
  AITAP) está **formalmente bloqueado** hasta que
  `BSIP_Response_Spec_PoC_Disparo1_v1_0.md` cierre un schema validado
  para el Contrato D. Ese documento todavía no existe en el repo. No
  diseñes ni codees el parser antes de que exista.

## Tripwires explícitos

Si estás por escribir código en `installer/alfred` que hace cualquiera
de estas cosas, pará: estás en el componente equivocado o adelantándote
a una dependencia bloqueada.

- **No hacer que Alfred parsee o valide nada de AITAP hoy.** El schema
  del Contrato D no existe todavía. Cualquier parser de `BSIP-Response`
  que escribas hoy se va a reescribir en cuanto el PoC del Disparo 1
  cierre el formato — es trabajo duplicado, no anticipación útil.
- **No inventar un cuarto Contrato de Synapse.** Los únicos son A
  (Continuar), B (Evaluar), C (Decidir compatibilidad) —
  `docs/BSIP/BLOOM_BISP_Fuente_de_Verdad_v1_0.md` A.2.5. Si un caso de
  uso de Alfred no encaja en ninguno, eso se documenta como propuesta de
  contrato nuevo en un documento de integración — no se fuerza dentro de
  uno existente ni se agrega ad-hoc en código.
- **No hacer que `AitapClient.ask()` simule una respuesta "para poder
  seguir probando".** Si necesitás probar el flujo end-to-end antes de
  que AITAP tenga motor de ruteo real, el camino correcto sigue siendo
  `--provider ollama` o `--provider gemini` directo — no un mock
  disfrazado de AITAP.
- **No duplicar rotación de keys ni lógica de vault dentro de Alfred.**
  Eso es dominio de AITAP (referencia a Nucleus Vault) una vez que exista
  — Alfred nunca debe guardar ni gestionar credenciales de proveedores de
  frontera por su cuenta más allá del uso directo/transicional actual de
  `GEMINI_API_KEY`.
- **No asumir que Ollama va a pasar por AITAP.** AITAP enruta modelos de
  frontera (Gemini/Claude/OpenAI/xAI). Ollama es local y sigue siendo
  invocado directo por Alfred siempre — ver README de `installer/aitap`,
  sección "Decisiones ya tomadas".
- **Cuando el motor de ruteo de AITAP exista de verdad:** el candidato a
  migrar es el path Gemini de `chat.py` (hoy transicional, directo a
  `GEMINI_API_KEY`), no el path Ollama. Migrarlo es cambiar
  `build_provider()` para que `--provider gemini` (o un nuevo
  `--provider aitap`) construya sobre `AitapClient` en vez de
  `GeminiTextProvider` — el resto de `chat.py` no debería tener que
  cambiar de forma, mismo principio que ya aplica al swap
  Ollama↔Gemini (`TextGenerationProviderArm`).

## Contexto adicional

- `src/alfred/chat.py` — docstring explica la decisión Ollama-default /
  Gemini-opt-in y por qué.
- `src/alfred/aitap/bisp_payload.py`, `client.py` — lado Emisión
  preparado, sin wirear a `chat.py` todavía.
- `../aitap/AGENTS.md` — guardrail operativo del lado AITAP (los tres
  pilares, lo que AITAP nunca hace).
- `../../docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` v1.1
  — marco conceptual completo, fuente de verdad.
- `../../docs/AITAP/Alfred_Integracion_AITAP_Disparo2_v1_0.md` — directiva
  de integración específica de Alfred (Disparo 2), incluye la sección
  bloqueada del lado Recepción.
- `../../docs/BSIP/BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A —
  protocolo BISP genérico (schema de `index.json`, Contratos de Synapse).
