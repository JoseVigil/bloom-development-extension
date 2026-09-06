# Context Plan — Mapa técnico y propuesta mínima

**Estado:** hallazgo de investigación, no arquitectura normativa
**Versión:** 1.0
**Fecha:** 2026-09-05
**Ámbito:** Cognituum / Brain — `core/context_planning/`
**Origen:** ejecución de la Línea de investigación "Context Plan como núcleo
tecnológico de Cognituum"
**Naturaleza del hallazgo:** el pipeline descrito aquí **nunca se ejecutó en
producción**. No existe todavía ningún `.context_plan.json` real, porque
Mandate Genesis no está terminado. Este documento describe una arquitectura
diseñada pero no ejercida — la decisión que propone tomarse ahora es sobre el
diseño de la primera corrida real, no una remediación de algo roto.

## 1. Propósito

Este documento es el primer entregable que pide la Línea de investigación: un
mapa técnico del Context Plan actual, su recorrido completo hasta Execution,
sus invariantes, sus debilidades, las propiedades que ya garantiza, y una
propuesta mínima para fortalecer lo fundamental. No propone una nueva
implementación ni nuevas capas — evalúa si alguna carencia estructural lo
justifica, y en la única parte donde lo hace, propone terminar de conectar
algo que ya está decidido en otro documento, no inventar algo nuevo.

## 2. Fuentes de evidencia

Evidencia directa (código fuente leído):

- `brain/cli/categories.py`
- `brain/commands/intent/plan.py`
- `brain/commands/intent/build_payload.py`
- `brain/core/context_planning/enriched_tree_generator.py`
- `brain/core/context_planning/payload_builder.py`
- `brain/core/context_planning/gemini_router.py`
- `brain/commands/bisp/vectorize.py`
- `brain/commands/bisp/semantic_query.py`

Evidencia documental (fuentes normativas/arquitectónicas):

- `BLOOM_BISP_Documento_Unico_v2_0.md`
- `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`
- `brain_intent_state.md`
- `BTIPS_Bloom_Technical_Intent_Package_v7_2.md`

No verificado — no se pudo leer código, no se afirma su comportamiento:

- `router_prompt.md` (confirmado por el usuario: no existe en disco; el
  prompt en efecto es el fallback embebido en `gemini_router.py`)
- `brain/core/bisp/payload_indexer.py`, `ollama_manager.py`,
  `chroma_client.py` (existencia inferida por import; comportamiento interno
  no verificado)
- `brain/shared/credentials/` (`GeminiKeyManager`) — comportamiento de
  rotación de keys no verificado más allá de su interfaz pública

## 3. Recorrido completo actual

```
.codebase_index.json
        │
        ▼
EnrichedTreeGenerator.generate()          ← FASE 1 · determinista
   • centralidad por grafo de imports (in-degree normalizado)
   • [BLOOM-META] summary/keywords si existen, si no fallback por nombre
   • size_penalty por LOC
   • badges: [CORE] [LEAF] [LARGE] [API] [ASYNC] [DB]
        │
        ▼  (texto plano con badges)
GeminiRouter.create_context_plan()        ← FASE 2 · no determinista
   • prompt = template (router_prompt.md si existe, si no fallback inline)
             + enriched_tree + intent_description + intent_type
   • POST directo a generativelanguage.googleapis.com (gemini-1.5-flash)
     — NO pasa por AITAP
   • generationConfig: temperature=0.2, topP=0.8, topK=40 (sampling activo)
   • reintentos: 3, sólo ante GeminiAPIError (fallo de transporte/API),
     rotando entre keys de GeminiKeyManager (single-provider)
   • _validate_plan(): fuerza schema + límites (crítico≤10, alto≤20, medio≤30)
     → si falla, ValueError sube sin reparación ni reintento con otro enfoque
        │
        ▼
.briefing/.context_plan.json
        │
        ▼
PayloadBuilder.build_from_plan()          ← FASE 3 · determinista
   • localiza .codebase.json / .docbase.json (briefing → execution → último
     refinement)
   • extrae, descomprime (gzip+base64) y ensambla por tier
   • calcula tokens (aprox. len//4) y estadísticas por tier
        │
        ▼
.payload.json  → (Native Host Bridge → AI web, fuera de este documento)
```

Mecanismo aparte, no confundir con lo anterior:

```
.payload.json ya ejecutado
        │
        ▼
vectorize.py → PayloadIndexer                ← POST-HOC, otro propósito
   • Ollama /api/embed sobre el PAYLOAD COMPLETO (1 vector, 768 dims)
   • ChromaDB: almacena bajo intent_uuid/phase
   • actualiza index.json (embedding_ref, embedding_source_text, embedded_at)

semantic_query.py                             ← consulta, no construcción
   • busca similitud contra buckets objectives | payloads | findings
   • uso: dedup de Mandates, "¿ya resolví algo parecido?", reutilización
```

Este segundo mecanismo corresponde a §A.5.2 de `BLOOM_BISP_Documento_Unico_v2_0.md`
(registro semántico post-fase). Es real, tiene código, y funciona para lo que
fue diseñado. **No es** §A.5.1 del mismo documento (ranking semántico
pre-payload, archivo por archivo, contra el objetivo del intent) — ese
mecanismo está marcado "TOMADA" pero no tiene una sola línea de código. La
infraestructura para construirlo (`OllamaManager`, `BISPChromaClient`, mismo
modelo `nomic-embed-text`) ya existe, apuntada a otro problema.

## 4. Qué está implementado, qué es decisión sin código, qué es hipótesis

| Elemento | Estado |
|---|---|
| Árbol enriquecido con centralidad/badges (Fase 1) | Implementado, determinista |
| Curación de tiers vía Gemini (Fase 2) | Implementado, no determinista, single-provider, fuera de AITAP |
| Ensamblado de payload desde el plan (Fase 3) | Implementado, determinista |
| Vectorización post-fase para dedup/similaridad (§A.5.2) | Implementado, integrado a su propio comando, no conectado a Fase 2 |
| Ranking semántico pre-payload archivo-por-archivo (§A.5.1) | Decidido ("TOMADA") en BLOOM_BISP, sin código |
| Reducción automática de alcance ante veredicto de ventana de tokens (§F.2.5 de BLOOM_BISP, `gemini_router.py` "MODIFICADO posible") | Hipótesis, marcada explícitamente como evaluación pendiente |
| Router agnóstico de proveedor para context planning (opción O1 de `brain_intent_state.md`) | Hipótesis / oportunidad documentada, sin código |

## 5. Invariantes que el sistema ya garantiza hoy

1. El schema de `context_plan.json` (`priority_tiers` + límites por tier) se
   valida estructuralmente antes de aceptarse — un plan mal formado no llega
   a `build-payload`.
2. La extracción de archivos y el cálculo de tokens en `PayloadBuilder` son
   reproducibles bit a bit dado el mismo `context_plan.json` y el mismo
   `.codebase.json`.
3. La señal estructural (centralidad, tamaño, badges) es calculable sin
   ninguna llamada a un proveedor de inteligencia, y es portable entre
   proveedores por construcción.
4. Existe fallback documentado y explícito para la vectorización BISP ("si
   Ollama no está disponible, el intent continúa sin vectorización") — el
   principio de degradación graceful ya existe en el sistema, aunque no se
   aplica todavía a la Fase 2.

## 6. Debilidades encontradas, con evidencia puntual

1. **La decisión que constituye el problema es la menos gobernada del
   pipeline.** `gemini_router.py` llama directo al endpoint de Google, sin
   pasar por AITAP. Esto contradice la decisión normativa cerrada #23 de
   `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` ("AITAP posee la implementación
   de routing") y dificulta que el mismo Intent proyecte sus condiciones
   cognitivas sobre otro proveedor sin reescribir código — justo la
   propiedad de portabilidad que pide la Línea de investigación.
2. **No es reproducible ni con inputs idénticos.** `temperature=0.2`,
   `topP=0.8`, `topK=40` implican sampling activo. Dos corridas del mismo
   intent, mismo codebase, mismo prompt, pueden producir tiers distintos.
3. **Sin degradación graceful ante fallo de contenido.** Si Gemini devuelve
   un JSON que no cumple el schema o excede los límites de tier,
   `_validate_plan()` lanza `ValueError` sin reparación ni reintento con
   ajuste de prompt — el comando `plan` falla entero. No hay fallback al
   árbol enriquecido puro (que por sí solo ya permitiría una priorización
   básica por reglas, sin IA).
4. **El artefacto que gobierna la decisión no está versionado de forma
   confiable.** `router_prompt.md` no existe en disco; lo que realmente
   corre es el prompt embebido como fallback dentro del propio `.py`. Un
   cambio al prompt hoy es un cambio de código, no un cambio de
   configuración auditable por separado.
5. **Modelo elegido no coincide con el peso de la decisión.** `gemini-1.5-flash`
   es el modelo rápido/económico de la familia, usado para la única decisión
   del pipeline que determina qué ve la inteligencia de frontera después.
6. **Dos mecanismos de vectorización con el mismo nombre conceptual pero
   propósitos distintos, sin relación en código.** Riesgo de que se asuma
   que "ya hay vectorización en el context plan" cuando en realidad la
   vectorización existente ocurre después del payload, no antes.

## 7. Propuesta mínima

No se propone una capa nueva. Se propone terminar de conectar una decisión
que el propio corpus ya tomó (§A.5.1), reutilizando infraestructura que ya
existe para otro propósito (`OllamaManager`, `BISPChromaClient`,
`nomic-embed-text`), y reducir el rol de Gemini de "quien decide" a "quien
justifica en lenguaje natural una selección ya calculada por reglas
deterministas + similitud vectorial".

1. **Implementar §A.5.1 tal como está decidido:** al iniciar Fase 2, vectorizar
   el objetivo del intent y cada archivo candidato (mismo `OllamaManager` que
   ya usa `vectorize.py`), consultar similitud coseno con threshold
   configurable (default 0.40, ya usado en `semantic_query.py` para
   consistencia), y usar ese ranking — combinado con la centralidad/badges
   de Fase 1 — como base primaria de asignación de tiers.
2. **Reducir el rol de Gemini a texto justificativo, no a decisión.** El
   campo `reason` de cada entrada puede seguir siendo generado por un LLM,
   pero sobre una selección ya cerrada por el paso 1 — así un cambio de
   proveedor o modelo no cambia qué archivos entran, sólo cómo se explican.
3. **Enrutar cualquier llamada a inteligencia restante a través de AITAP,**
   no directo al SDK de Google, para heredar accounting, fallback y
   agnosticidad de proveedor por diseño en vez de por disciplina de código.
4. **Versionar `router_prompt.md` como artefacto real,** separado del
   fallback embebido, para que un cambio de prompt sea auditable como
   cambio de configuración y no como cambio de código.
5. **Agregar degradación graceful a Fase 2,** siguiendo el mismo principio
   ya documentado para la vectorización: si la parte basada en similitud
   vectorial + reglas produce un plan válido, un fallo de la llamada
   justificativa a Gemini no debería bloquear `build-payload`.
6. **Registrar en el propio `context_plan.json` la proveniencia de la
   decisión** (qué mecanismo asignó cada tier: similitud vectorial, regla
   estructural, o LLM) para que el experimento propuesto en la Línea de
   investigación sea auditable después del hecho, no sólo antes.

## 8. El experimento que esto habilita

Con el paso 6 de la propuesta mínima, se vuelve posible correr exactamente el
experimento que pide la Línea de investigación: mismo modelo de ejecución,
misma tarea, misma información disponible, variando únicamente si el
`context_plan` se constituyó por descubrimiento/arrastre convencional o por
esta constitución gobernada — y comparar calidad, consistencia entre
corridas, e iteraciones necesarias, con proveniencia registrada para cada
archivo del payload.

## 9. Pregunta abierta

Con este mapa, la pregunta formulada por la Línea de investigación puede
responderse en dos partes distintas en vez de una:

- **¿Puede la Fase 1 + el ranking vectorial (§A.5.1) constituir hoy una
  primitiva determinista, portable y gobernada?** Sí, con evidencia de que la
  infraestructura ya existe y sólo falta conectarla al punto correcto del
  pipeline.
- **¿Puede la decisión final de tiers dejar de depender de la inferencia
  improvisada de un proveedor específico, sin perder la utilidad de que un
  LLM explique la selección en lenguaje natural?** Esa es la pregunta que
  este documento no cierra — la propuesta mínima la deja en condiciones de
  probarse, no la da por resuelta.
