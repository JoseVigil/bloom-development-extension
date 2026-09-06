# BLOOM — BISP: Documento Único de Referencia

**Bloom Intent Semantic Package — Fuente de Verdad Consolidada**
**Versión:** 2.0 (fusión final) · **Estado:** Vigente
**Fecha de fusión:** septiembre 2026
**Fuente de verdad de terminología general del ecosistema:** `BTIPS_Bloom_Technical_Intent_Package_v7_2.md` (documento externo a esta carpeta, no se duplica acá)

---

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 (Fuente de Verdad) | ago 2026 | Primera consolidación: fusiona `BLOOM_BISP_Session_Decisions_v1_2`, `ING_Intent_Spec_v1_1` y `DIS_Intent_Spec_v1_0` en Partes A–C + Apéndice. |
| **v2.0 (este documento)** | sep 2026 | **Fusión final a archivo único.** Se incorporan como Partes D, E y F los tres documentos que hasta ahora vivían separados: `BLOOM_BISP_Companion_Integration_v2_0`, `BLOOM_Intent_Types_Gap_Analysis_v1_0` y `SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline_v0_1`. **Se retira `BLOOM_BISP_Session_Decisions_v1_1.md`** (contenido interno v1.2) de la carpeta: su contenido ya vivía íntegramente dentro de la Parte A desde la v1.0 de este documento — no aporta nada que no esté acá. Ningún schema, invariante, pseudocódigo, tabla o decisión fue alterado en esta fusión; solo se renumeraron encabezados (`0,1,2…` → `D.0, D.1, D.2…`, etc.) y se reescribieron las referencias cruzadas entre archivos como referencias internas a secciones de este mismo documento. |
| v2.0 — parche puntual | sep 2026 | **Baseline congelada, con un único ajuste.** Se agrega una nota aclaratoria en E.6: `cor` no está "pendiente de implementar" — fue descartado por diseño y reemplazado por la lógica global de Gravity (BTIPS v7.2 §8). No se integran los specs formales de `dev`, `doc`, `exp`, `mrg` ni `tst` recibidos en esta sesión — quedan pendientes de una futura revisión de este documento. |

## Nota de consolidación

Este documento **no introduce decisiones nuevas**. Es la fusión, en un único archivo navegable, de seis
documentos que vivían separados en la carpeta `BSIP/`:

| Documento fuente (retirado tras la fusión) | Versión consolidada | Qué aporta | Parte |
|---|---|---|---|
| `BLOOM_BISP_Session_Decisions` | v1.2 | El protocolo BISP en sí: schema de `index.json`, persistencia, pipeline Brain–Ollama–ChromaDB, contratos de Synapse, invariantes de diseño. | A |
| `ING_Intent_Spec` | v1.1 | Especificación completa del intent `ing/` (Ingesta). | B |
| `DIS_Intent_Spec` | v1.0 | Especificación completa del intent `dis/` (Discovery). | C |
| `BLOOM_BISP_Companion_Integration` | v2.0 | Cómo el Companion Cognitivo (panel lateral Chromium) consume el BISP, sin redefinirlo. | D |
| `BLOOM_Intent_Types_Gap_Analysis` | v1.0 | Diagnóstico del estado real de `dev`, `doc`, `exp`, `cor`, `inf` — los tipos de intent que **no** corren sobre el motor BSIP genérico. | E |
| `SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline` | v0.1 | Qué pasa con la *respuesta* de una IA de frontera a un BISP: Contrato D, protección Anti-EOT, recuperación headless. | F |

Donde los documentos originales se referenciaban entre sí cruzando archivos, esa referencia ahora apunta
a una sección dentro de este mismo documento (por ejemplo, `§F.2.5` refiere a la Parte F, sección 2.5).

> **Nota editorial de esta fusión (no un cambio de arquitectura):** la Parte F cita como fuente
> `BTIPS_v6_0` y su glosario abrevia el marco BTIPS como `dev/doc/ing/dis` únicamente. La fuente de
> verdad vigente de terminología es `BTIPS_v7_2`, que además reconoce `exp`, `cor` e `inf` (ver Parte E).
> No se reescribió el contenido de la Parte F para no alterar un research ya cerrado — se deja esta nota
> para que, al cruzar la Parte F contra los tipos documentados en la Parte E, quede claro que la omisión
> es de abreviación de glosario y no una afirmación de que esos tipos no existen.

## Nota de alcance

**Este documento cubre, de punta a punta, todo lo que hoy vive documentado sobre BSIP:**
- El protocolo BISP como tal — agnóstico de qué intent o qué consumidor lo use (**Parte A**).
- Los dos tipos de intent que hoy implementan ese protocolo de punta a punta, con spec formal
  confirmada: `ing/` (**Parte B**) y `dis/` (**Parte C**).
- Invariantes y pendientes consolidados de A–C (**Apéndice**).
- La integración de consumo del Companion Cognitivo (**Parte D**).
- El estado real (implementado / parcial / inexistente) de los tipos de intent que no corren sobre el
  motor BSIP genérico: `dev`, `doc`, `exp`, `cor`, `inf` (**Parte E**).
- Qué pasa con la respuesta que una IA de frontera devuelve a un intent BISP: Contrato D, protección
  Anti-EOT, recuperación headless sin intervención humana (**Parte F**).

**Este documento no cubre, porque vive fuera de la carpeta `BSIP/` por diseño:**
- La arquitectura general de Bloom (Nucleus, Mandates, Gravity, Batcave, Alfred, apps) — vive en
  `BTIPS_Bloom_Technical_Intent_Package_v7_2.md`.
- Los tipos de intent dentro de `TYPES/` aún no revisados en esta sesión.

## Índice

- **Parte A** — El Protocolo BISP (A.1–A.9)
- **Parte B** — Intent `ing/` (Ingesta) (B.0–B.9)
- **Parte C** — Intent `dis/` (Discovery) (C.0–C.9)
- **Apéndice** — Invariantes y pendientes consolidados (A–C)
- **Parte D** — Companion Cognitivo — Integración con el BISP (D.0–D.9)
- **Parte E** — Intent Types — Gap Analysis: `dev`, `doc`, `exp`, `cor`, `inf` (E.0–E.8)
- **Parte F** — BSIP Response & Recovery Protocol, Baseline v0.1 (F.0–F.6)

---

# PARTE A — El Protocolo BISP

> Fuente: `BLOOM_BISP_Session_Decisions_v1_2` (heredera de v1.0 y v1.1). Válido y completo en cualquier
> etapa del proyecto, exista o no un consumidor activo, exista o no un intent type corriendo sobre él.

## A.1 Propósito

Este protocolo es la fuente de verdad de las decisiones arquitectónicas tomadas en sesión el 23 de mayo
de 2026, actualizadas el 29 de junio de 2026 y migradas a `ing/` en agosto de 2026. Guía la actualización
de BTIPS, BISP, Mandate Domain Spec, y la evaluación de compatibilidad de archivos Python existentes.

> **Regla heredada, sigue vigente:** cualquier decisión de implementación que contradiga lo documentado
> acá requiere revisión explícita de arquitectura. Este protocolo no se diluye con el avance de ejecución.

## A.2 Decisiones Arquitectónicas

### A.2.1 Infraestructura — ChromaDB y Ollama

| Decisión | Fundamento | Estado |
|---|---|---|
| ChromaDB embebido en Brain como librería Python, no como proceso separado | Brain ya es Python. Evita un binario adicional que Metamorph tendría que gestionar. Modelo idéntico a SQLite en Temporal. | TOMADA |
| Ollama como único generador de embeddings vía `/api/embed`, modelo `nomic-embed-text` | Ollama ya está en el sistema para Alfred. 768 dimensiones con excelente relación calidad/velocidad. | TOMADA |
| Brain es el único orquestador: Brain llama a Ollama, Brain llama a ChromaDB. Nunca al revés. | Punto de control único, auditable, reemplazable sin dependencias cruzadas ocultas. | TOMADA |
| Si Ollama no está disponible, el intent continúa sin vectorización (capa aditiva, no bloqueante) | La vectorización mejora el pipeline existente, no es requerimiento crítico. Degradación graceful obligatoria. | TOMADA |

### A.2.2 Persistencia — Dónde vive ChromaDB

| Decisión | Fundamento | Estado |
|---|---|---|
| Colecciones ChromaDB por proyecto, dentro del filesystem del proyecto | Autarquía local: el conocimiento vectorial viaja con el proyecto. | TOMADA |
| Cache global en `.nucleus-{org}/.cache/chroma/` para queries cross-project | El Nucleus necesita búsquedas semánticas a nivel organización. | TOMADA |
| Mandate consolidado en `.mandates/{id}/.semantic/` al cerrarse el Mandate | La unidad de valor del marketplace es el Mandate completo. | TOMADA |

### A.2.3 Package (BISP) — Schema de `index.json`

| Decisión | Fundamento | Estado |
|---|---|---|
| `index.json` tiene tres capas: `operational`, `autarchic`, `marketplace` | Tres audiencias distintas, cada capa procesable independientemente. | TOMADA |
| Campo `embedding_source_text` obligatorio junto a cada vector | Sin texto fuente el vector no es verificable ni regenerable. | TOMADA |
| El vector nunca viaja a la AI web | Los espacios vectoriales no son interoperables entre modelos. El valor se materializa antes de salir del runtime. | TOMADA |
| Nuevos campos en capa `autarchic`: `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge` | Habilitan consulta autárquica cross-runtime. Base del `semantic_descriptor` del Mandate. | TOMADA |
| Dos puntos de vectorización: `context_plan.json` (antes del payload) y `index.json` (después de la fase) | Ranking de relevancia antes de armar payload; registro del embedding para consultas futuras. | TOMADA |

### A.2.4 Mandate — Agregación semántica

| Decisión | Fundamento | Estado |
|---|---|---|
| El campo `marketplace` en `index.json` es `null` en intents individuales. Lo completa el Mandate al cerrarse. | El intent no sabe si pertenecerá a un Mandate de marketplace. | TOMADA |
| `mandate_workflow.json` exporta el Temporal workflow history al completarse el Mandate | Auditabilidad completa, verificable por el comprador sin depender del SQLite de Temporal del vendor. | TOMADA |

### A.2.5 Contrato de Synapse — CERRADO ✓

Se definen tres contratos genéricos según audiencia y modo de uso — describen qué hace *cualquier*
consumidor del package al recibirlo, sin asumir un consumidor particular:

| Contrato | Audiencia | Comportamiento |
|---|---|---|
| **A — Continuar** | AI web en flujo activo (Claude, ChatGPT, Grok) | El package llega como contexto de fondo. La AI continúa el flujo sin reconocer explícitamente la recepción. Enriquecimiento silencioso del prompt. |
| **B — Evaluar** | AI web en modo revisión | La AI recibe el package y emite una evaluación estructurada de consistencia con el BISP, solicitada explícitamente por el ingeniero. |
| **C — Decidir compatibilidad** | Marketplace / runtime Bloom externo | El runtime destino recibe el package con `semantic_descriptor` completo y decide compatibilidad. Requiere capa `marketplace` completa. |

Cualquier consumidor adicional (panel lateral, agente de monitoreo, etc.) debe declarar explícitamente a
cuál de estos tres contratos se acoge y documentar sus propias restricciones en su propio documento de
integración. Este protocolo no prescribe restricciones de ningún consumidor específico.

> El picker de Capa 1 en Core (`/genesis`, webview Svelte) y el futuro consumo de
> `findings_summary`/`domain_tags` por Fase 2 de Mandate Genesis son, en estos términos, consumidores que
> eventualmente deberán declararse bajo uno de estos tres contratos — probablemente **B**. Observación
> abierta, no decisión tomada (ver A.2.6).

### A.2.6 Pendientes sin resolver

| Decisión | Contexto | Estado |
|---|---|---|
| Formato de parsing de la URI `chroma://nucleus-org/intent-uuid/phase` | Convención interna; Brain necesita parsearla a `(collection_name, document_id)`. Sin estándar externo a adoptar. | PENDIENTE |
| Threshold de similitud configurable por intent (default sugerido: 0.40) | Intents de dominio muy específico pueden necesitar thresholds más altos. Configuración en `dev_state.json` o `nucleus-config.json`. | PENDIENTE |
| Formato de exportación de embeddings: binario vs JSON base64 | Binario más compacto, menos debuggeable. JSON base64 self-describing, compatible con gzip del package. | PENDIENTE |
| Contrato de Synapse aplicable a Fase 2 de Mandate Genesis | Ver A.2.5 — probablemente Contrato B, sin decisión formal. | PENDIENTE |

## A.3 Por qué agregar vectores al BISP

> **Tesis central:** los vectores no son para las AI web. Son para Bloom. La AI web consume el resultado
> del trabajo vectorial — texto ya ordenado, conflictos ya clasificados, contexto ya filtrado. El vector
> hace su trabajo antes de que el package salga del runtime.

**El problema que resuelven:** sin vectores, el sistema no puede responder preguntas semánticas a escala
— qué archivos son más relevantes para un intent nuevo, si ya se resolvió algo parecido antes, si un
conflicto en `.cor` es semánticamente grave o solo estructural, qué Mandate del marketplace resuelve mejor
un objetivo dado. Con vectores, Brain responde en milisegundos con precisión medible.

**Valor dentro del sistema:**
- *Ranking semántico del `context_plan`*: antes de armar el payload, Brain vectoriza el objetivo del
  intent y consulta ChromaDB contra el codebase/docbase disponible. Los archivos más relevantes van
  primero. En proyectos con 200+ archivos, la diferencia entre los 10 más relevantes y 10 aleatorios es la
  diferencia entre una respuesta precisa y una genérica.
- *Deduplicación de trabajo en Mandates*: al iniciar un Mandate, Brain lo compara contra Mandates ya
  completados en el Nucleus. Si supera el threshold, alerta al orquestador que el problema ya fue
  resuelto.
- *Clasificación semántica de conflictos en `.cor`*: Brain puede determinar si dos ramas en conflicto son
  semánticamente distintas o solo texto renombrado/reformateado.

**Valor en la autarquía entre núcleos Bloom:**
- *Autarquía local*: otra máquina con el mismo runtime puede reconstruir ChromaDB desde el vector
  embebido en `index.json`. `embedding_source_text` garantiza que el vector es verificable y regenerable
  aun si el modelo cambia de versión.
- *Autarquía semántica*: otro runtime puede entender qué resolvió un package sin ejecutarlo, usando
  `findings_summary` y `domain_tags` — búsqueda semántica cross-nucleus sin acceso al codebase original.

**Valor como moat del marketplace:** un Mandate comprado lleva adentro el conocimiento vectorizado de su
propia ejecución, estructurado en el filesystem BTIPS, con trazabilidad Temporal, dentro del runtime
Bloom. Sin el runtime completo, los archivos son texto inerte — la misma lógica que el marketplace de
assets de Unity dentro del engine.

## A.4 Schema del BISP — `index.json` con capas

```json
{
  "operational": {
    "intent_type": "dev",
    "objective": "Refactorizar módulo JWT para RS256",
    "payload_summary": "Contexto técnico ordenado semánticamente para consumo por AI web",
    "phase": "implementation"
  },
  "autarchic": {
    "findings_summary": "Se migró JWT de HS256 a RS256. Impacto en auth_controller y user_model.",
    "domain_tags": ["jwt", "rsa", "authentication", "security"],
    "resolved": true,
    "reusable_knowledge": true,
    "vector": {
      "model": "nomic-embed-text",
      "version": "1.5",
      "dimensions": 768,
      "embedding_ref": "chroma://nucleus-org/intent-uuid/implementation",
      "embedding_source_text": "Refactorizar módulo JWT para RS256, afecta auth_controller y user_model",
      "embedded_at": "2026-05-23T14:33:12Z"
    }
  },
  "marketplace": null
}
```

**Campo `marketplace` a nivel Mandate:**

```json
"marketplace": {
  "mandate_uuid": "mandate-auth-hardening-x7k2",
  "domain": "security/authentication",
  "value_proposition": "Migración completa JWT HS256→RS256 con zero downtime",
  "intent_count": 4,
  "knowledge_coverage": ["jwt", "rsa", "token_rotation", "backwards_compat"],
  "requires_runtime": "bloom/1.0"
}
```

## A.5 Flujo Operativo Brain–Ollama–ChromaDB

### A.5.1 Generación del `context_plan` (antes del payload)

```
Brain tiene: objetivo del intent (dev_state.json)
Brain tiene: lista de archivos disponibles en .files/

1. Brain → Ollama /api/embed: vectoriza el objetivo
   Ollama → Brain: [vector_objetivo — 768 floats]

2. Brain → ChromaDB: almacena vector_objetivo
   key: intent_uuid/phase/objective

3. Para cada archivo en .files/:
   Brain → Ollama /api/embed: vectoriza el archivo
   Brain → ChromaDB: almacena con key intent_uuid/phase/file/{nombre}

4. Brain → ChromaDB.query(vector_objetivo, n_results=10, threshold=0.40)
   ChromaDB → Brain: [(archivo_1, 0.94), (archivo_2, 0.87), ...]

5. Brain escribe context_plan.json con ese ranking
6. Brain arma payload.json con los archivos en ese orden

La AI web recibe texto ordenado semánticamente. Nunca ve el vector.
```

### A.5.2 Registro en `index.json` (después de la fase)

```
Brain acaba de ejecutar la fase y tiene el payload completo

1. Brain → Ollama /api/embed: vectoriza el payload completo
   Ollama → Brain: [vector_payload — 768 floats]

2. Brain → ChromaDB: almacena con key intent_uuid/phase
   metadata: { intent_type, phase, objective, timestamp }

3. Brain actualiza index.json:
   vector.embedding_ref         = "chroma://nucleus-org/intent_uuid/phase"
   vector.embedding_source_text = texto_que_fue_vectorizado
   vector.embedded_at           = timestamp
```

### A.5.3 Deduplicación de Mandates (query cross-intent)

```
Brain inicia un nuevo Mandate con objetivo X

1. Brain → Ollama /api/embed: vectoriza objetivo X
2. Brain → ChromaDB (colección nucleus global).query(vector_X, n=5, threshold=0.85)
3. Si hay resultados:
   Brain recupera los findings_summary de esos intents
   Brain alerta al orquestador: "Problema similar resuelto en mandate-Y"
   Orquestador decide si reutilizar o ejecutar nuevo Mandate
4. Si no hay resultados:
   Brain continúa el Mandate normalmente
```

## A.6 Impacto en Archivos Existentes (protocolo genérico)

| Archivo / Componente | Estado | Acción requerida |
|---|---|---|
| BTIPS v5.0 (doc) | Actualizar | Agregar sección de capa vectorial, documentar los tres contratos de Synapse, actualizar schema de `index.json`. |
| BISP v1.1 (doc) | Actualizar | Agregar campos: `embedding_source_text`, `findings_summary`, `domain_tags`, `resolved`, `reusable_knowledge`. Formalizar las tres capas. |
| Mandate Domain Spec | Extender | Agregar etapa de consolidación semántica al cierre del Mandate. Documentar `mandate_workflow.json` y `.semantic/`. |
| `chroma_client.py` (NUEVO) | Implementar | `PersistentClient`, `get_or_create_collection`, `add`, `query`. Sin lógica de negocio. |
| `vectorize.py` (NUEVO) | Implementar | Llama a Ollama `/api/embed`, devuelve vector. Manejo graceful si Ollama no está disponible. |
| `chroma_rebuild.py` (NUEVO) | Implementar | Lee `index.json`, extrae `embedding_source_text`, regenera vector, reconstruye la colección local. |
| `semantic_query.py` (NUEVO) | Implementar | Expone `query_similar(text, collection, n, threshold)` para el ranking del `context_plan`. |
| Archivos Python viejos (packages gzip) | Auditar | Evaluar compatibilidad con el pipeline vectorial. |

> Los archivos de consumidores específicos del BISP (Companion, workflow Go de Mandate Genesis) no
> figuran en esta tabla — su impacto se documenta en sus propios documentos de integración y en A.9.

## A.7 Invariantes de Diseño (protocolo)

Estas propiedades no pueden ser violadas por ninguna decisión de implementación posterior sin revisión
explícita de arquitectura.

**Invariante 1 — Texto fuente siempre presente**
Todo vector en el package va acompañado de: modelo exacto, versión, dimensiones, y el texto original que
lo generó. Sin estos cuatro campos, el vector no es parte del BISP.

**Invariante 2 — Brain como único orquestador**
Brain llama a Ollama, Brain llama a ChromaDB. Ningún otro componente tiene acceso directo a ChromaDB.
Ningún componente llama a Ollama excepto Brain.

**Invariante 3 — La capa vectorial es aditiva**
Un intent sin vectorizar es un intent válido. Si Ollama no está disponible, el pipeline continúa sin
vectorización y lo documenta en el `index.json`.

**Invariante 4 — El marketplace es responsabilidad del Mandate**
El campo `marketplace` en `index.json` es `null` en intents individuales. Es el Mandate quien agrega,
consolida y firma el `semantic_descriptor` del package de marketplace.

**Invariante 5 — Separación de audiencias en el package**
`operational` es para AI web (texto). `autarchic` es para runtime Bloom (texto + vector). `marketplace`
es para buyers del marketplace (metadata estructurada). Nunca se mezclan ni se usan fuera de su
audiencia.

## A.8 Estructura de directorios de referencia (protocolo)

```
.bloom/
├── .nucleus-{org}/
│   ├── .cache/
│   │   └── chroma/              ← colección global cross-project
│   └── .mandates/
│       └── {mandate-id}/
│           ├── mandate_workflow.json
│           └── .semantic/       ← consolidación semántica del Mandate
└── .project-{name}/
    └── {intent-uuid}/
        ├── index.json           ← tres capas: operational, autarchic, marketplace
        ├── context_plan.json    ← ranking semántico de archivos
        ├── payload.json
        └── dev_state.json
```

## A.9 Integración con Mandate Genesis (Go/Temporal) — estado real verificado contra código

Esta sección documenta el estado real de un consumidor en potencia del protocolo — el workflow Go de
Mandate Genesis — sin modificar el protocolo en sí.

**Confirmado por código:**
- **Fase 1 (ingest)** del `MandateGenesisBuildWorkflow`: hoy es una sola `PublishMandateEventActivity`
  que emite `mandate:phase:ingest`. **No llama a Brain, no llama a Ollama, no toca ChromaDB.**
- **Fase 2 (cluster)**: hoy es `ScaffoldDomainActivity` con `Mode: dry_run` — devuelve siempre un único
  dominio (`input.Project`), sin clustering real ni consulta a ChromaDB. El cliente TCP:5678 mencionado
  en documentación previa **no existe en el código**.
- **`GenesisBuildInput`** (Temporal): campos reales son `MandateID`, `MandateType`, `BaseGenesisID`,
  `Source`, `Project`, `MandatesRoot`. **No incluye `RawDocs`** — si Fase 1 llega a implementar A.5.1, no
  puede asumir que los archivos le llegan empaquetados en el input de Temporal; tiene que leerlos del
  filesystem en `{MandatesRoot}/{MandateID}`.
- **`runGenIntentActivity`**: no existe en el código.

**Lo que esto significa para la Invariante 2:** sigue siendo el diseño correcto y no cambia. Lo que
cambia es la honestidad sobre el estado actual — Mandate Genesis Fase 1/2 todavía no ejerce esa
invariante porque todavía no llama a nadie. No hay violación de arquitectura; hay una feature no
implementada.

**Pendientes antes de conectar ambos sistemas:**
1. Cómo Fase 1 (Go) invoca a Brain — mecanismo de invocación cross-proceso sin definir (¿HTTP interno
   contra `localhost:48215`, como ya usa `publishMandateEvent()`? ¿otro canal?).
2. Relación entre `{MandatesRoot}/{MandateID}/domain_proposal.json` (layout plano, Go) y
   `.bloom/.project-{name}/{intent-uuid}/index.json` (A.8) — namespaces distintos hoy, sin puente
   definido.
3. Contrato de Synapse aplicable a Fase 2 (ver A.2.5) — cuando se convierta en un Intent BISP procesado
   por IA generativa vía Synapse, tiene que declararse bajo Contrato A, B o C. Hoy no está declarado.

---

# PARTE B — Intent `ing/` (Ingesta)

> Fuente: `ING_Intent_Spec_v1_1`. Sexto tipo de intent del sistema, sumado a `dev`, `doc`, `exp`, `inf`,
> `cor`. Precede en el flujo típico a `dis/` (Parte C).

## B.0 Función y reglas de contrato

`ing/` incorpora archivos raw o de código nuevos al ecosistema — tanto en el arranque de un proyecto
(Mandate Génesis) como en cualquier incorporación posterior (nuevo subsistema, repo, módulo) — y siembra
el linaje de los Genes resultantes. **La curación de la topología de Dominios es responsabilidad de
`dis/`, no de `ing/`** (ver Parte C).

Reglas de diseño fijadas como contrato:

1. `ing/` sigue el mismo principio BSIP que `dev`/`doc`: fases de trabajo humano-gobernado +
   `.pipeline/` espejo por fase. El número de fases es propio de cada tipo (`ing/` define tres, ver B.2).
   No introduce una fase estructural ajena como `.scaffold/`.
2. `ing/` **siempre** corre bajo un Mandate. No existe modo standalone.
3. **Dominio no es un nivel jerárquico, ni una carpeta persistida, ni un campo del Gene.** Es una relación
   N:M entre Dominio y Gene, resuelta por clustering vectorial y persistida exclusivamente en
   `.cache/.semantic-index.json` a nivel Nucleus. `gen.json` no tiene ni necesita campo de dominio.
4. La resolución Raw → Dominio → Gene ocurre en dos pasadas dentro de `.classification/`: primero
   Dominio (coarse, Nucleus-wide), después Gene (fine, acotado al dominio ya resuelto). El resultado es
   la **primera arista** del Gene en `.semantic-index.json` — no un campo del Gene.
5. La vectorización es aditiva y aislada del contrato BSIP — se invoca desde Brain dentro de cada fase,
   siguiendo el mismo mecanismo `context_plan → payload` / `index.json` post-fase de A.5.1/A.5.2. No es
   una fase ni un payload que dialoga con la AI web.
6. La capa vectorial nunca es bloqueante (Invariante 3): si Ollama no está disponible, `ing/` degrada a
   resolución manual en `.consolidation/` (ver B.6).
7. **`ing/` nunca reestructura Dominios ya existentes.** No fusiona, no divide, no renombra, no agrega
   una segunda arista a un Gene que ya tenía Dominio. Toda reestructuración es competencia exclusiva de
   `dis/`.

> **Nota histórica (rationale del cambio `gen/` → `ing/`):** se abandonó una propuesta original de intent
> `gen/` porque no respetaba la gramática BSIP (introducía una cuarta fase ajena, `.scaffold/` por
> dominio) y colisionaba semánticamente con el concepto de "gene". `ing/` fue diseñado desde cero con sus
> propias tres fases, dejando la vectorización como capa aditiva aislada, y resolviendo Raw→Dominio→Gene
> con un embudo de dos pasadas que no requiere niveles jerárquicos nuevos. Además, `ing/` no es exclusivo
> de Mandate Génesis: el campo `domain_baseline` (`empty` para génesis, `existing` para incorporación
> posterior) lo convierte en mecanismo genérico y reutilizable para anexar cualquier subsistema en
> cualquier momento, con trazabilidad vía `parent_mandates` y `.history/.delta_N`.

## B.1 Estructura de `.ing_state.json`

```json
{
  "intent_id": "uuid",
  "intent_type": "ing",
  "mandate_id": "uuid",

  "phase_active": "reception | classification | consolidation | done",
  "resumable": true,

  "domain_baseline": "empty | existing",
  "baseline_scope": [],

  "thresholds": {
    "domain": 0.45,
    "gene": 0.40
  },

  "classification_summary": {
    "clusters_total": 0,
    "domains_matched": 0,
    "domains_created": 0,
    "genes_extended": 0,
    "genes_created": 0,
    "unresolved_no_vectorization": 0
  },

  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos:**
- `domain_baseline`: `"empty"` únicamente en Mandate Génesis puro (no hay genes previos contra qué
  comparar). `"existing"` en cualquier Mandate de incorporación, sin importar el resultado.
- `baseline_scope`: `mandate_id`s contra los que se acota la Pasada 1. Vacío = Nucleus-wide (default).
- `thresholds`: calibrables por Mandate. **Pendientes de validación empírica** — 0.40 (gene) reusa el
  default de A.2.6; 0.45 (dominio) es punto de partida propio de este spec.
- `classification_summary.unresolved_no_vectorization`: clusters diferidos a decisión manual (ver B.6).

## B.2 Estructura de directorios de `ing/`

```
.intents/
└── .ing/
    └── .{intent-name-uuid}/
        ├── .ing_state.json
        │
        ├── .reception/                  ← sin turnos, igual que .briefing/ (dev) y .context/ (doc)
        │   ├── .reception.json
        │   ├── .context_ing_plan.json
        │   └── .files/
        │       ├── .rawbase.json
        │       ├── .rawbase_index.json
        │       └── [optional files]
        │
        ├── .classification/             ← con turnos, igual que .execution/+.refinement/ (dev)
        │   └── .turn_X/
        │       ├── .turn.json
        │       ├── .context_ing_plan.json
        │       └── .files/
        │           ├── .domain_resolution.json
        │           └── [optional files]
        │
        ├── .consolidation/              ← con turnos, igual que .curation/ (doc)
        │   └── .turn_X/
        │       ├── .consolidation.json
        │       ├── .context_ing_plan.json
        │       └── .files/
        │           ├── .docbase.json
        │           ├── .docbase_index.json
        │           └── [optional: .codebase.json, .codebase_index.json]
        │
        └── .pipeline/                   ← contrato BISP idéntico, por fase
            ├── .reception/
            │   ├── .payload.json
            │   ├── .index.json
            │   └── .response/
            │       ├── .raw_output.txt
            │       ├── .report.json
            │       └── .staging/
            ├── .classification/
            │   └── .turn_X/{.payload.json, .index.json, .response/}
            └── .consolidation/
                └── .turn_X/{.payload.json, .index.json, .response/}
```

## B.3 Fase `.reception/`

**Propósito:** apertura — recibe el raw entrante, lo inventaría y extrae texto, listo para
`.classification/`. Sin turnos: un único acto de recepción, igual que `.briefing/` en `dev` o `.context/`
en `doc`. Si algo llega mal formado, se reintenta la fase desde cero — la iteración humana entra recién
en `.consolidation/`.

**`.reception.json`:**
```json
{
  "requested_by": "action_id dentro del Mandate que disparó este intent",
  "objective": "texto libre: qué se está incorporando y por qué",
  "source": "upload_directo | repo_clone | filesystem_scan",
  "files_received": 0,
  "received_at": "ISO-8601"
}
```

**`.files/.rawbase.json` — inventario BSIP-compatible:**
```json
{
  "files": [
    {
      "path": "raw/invoice_schema.pdf",
      "type": "pdf",
      "hash": "sha256:...",
      "size_bytes": 0,
      "status": "received | rejected_duplicate | rejected_invalid"
    }
  ]
}
```

**`.files/.rawbase_index.json` — texto extraído:**
```json
{
  "entries": [
    {
      "path": "raw/invoice_schema.pdf",
      "extracted_text": "...",
      "extraction_method": "pdf_text | ocr | plain_read",
      "embedding_source_text": "texto (o resumen) que se vectorizará — Invariante 1 BISP"
    }
  ]
}
```
`embedding_source_text` es obligatorio por archivo si ese archivo va a vectorizarse en
`.classification/` — aplicación directa de la Invariante 1 (A.7).

**`.context_ing_plan.json`:** reusa sin modificaciones el mecanismo de A.5.1. Brain vectoriza el
objetivo (`.reception.json.objective`) y cada entrada de `.rawbase_index.json`, consulta ChromaDB y
ordena por relevancia. Lo único que cambia respecto a `dev`/`doc` es *qué* se rankea (raw entrante en
vez de codebase/docbase existente) — el mecanismo Ollama→ChromaDB→ranking es el mismo.

**Salida que consume `.classification/`:** la lista de `.rawbase.json` filtrada a `status: "received"`,
en el orden de `.context_ing_plan.json`.

## B.4 Fase `.classification/`

**Propósito:** resuelve, por cada cluster de archivos raw recibidos, la relación Raw → Dominio → Gene
mediante el embudo de dos pasadas: primero Dominio (Nucleus-wide), después Gene (acotado al dominio ya
resuelto). Con turnos: si el humano no acuerda con el clustering o naming propuesto, se abre
`.turn_{X+1}/`, igual que en `.refinement/` de `dev`.

**Acotación de alcance:** esta fase resuelve una asignación **local** para el material que acaba de
entrar — compara contra centroides ya existentes al momento de la corrida, nunca reconsidera Dominios ya
consolidados por corridas anteriores entre sí. Si un Gene en cuestión ya fuera cross-domain por una
corrida previa de `dis/`, esta fase no lo sabe ni le importa — solo agrega o extiende **una** arista, la
que le corresponde a este lote. Cualquier reestructuración es responsabilidad exclusiva de `dis/`.

**Algoritmo** (pseudocódigo del runner, ejecutado por Brain en cada `.turn_X/`):

```
function classification_phase(ing_state, raw_files):
    baseline         = ing_state.domain_baseline          # "empty" | "existing"
    domain_threshold = ing_state.thresholds.domain
    gene_threshold   = ing_state.thresholds.gene

    raw_embeddings = vectorize(raw_files)                 # Brain -> Ollama, capa aislada
    clusters       = semantic_cluster(raw_embeddings)     # agrupa el raw entrante entre sí

    resolution = []

    for cluster in clusters:
        centroid = centroid(cluster.embeddings)

        # ---------- PASADA 1: Dominio ----------
        if baseline == "empty":
            domain_result = { status: "new", name: propose_domain_name(cluster) }
        else:
            candidates = query_domain_centroids(
                scope     = ing_state.baseline_scope,     # [] = nucleus-wide
                vector    = centroid,
                threshold = domain_threshold
            )
            if candidates.best_score >= domain_threshold:
                domain_result = { status: "existing",
                                   domain_id: candidates.best.domain_id,
                                   name: candidates.best.name,
                                   score: candidates.best_score }
            else:
                domain_result = { status: "new", name: propose_domain_name(cluster) }

        # ---------- PASADA 2: Gene (solo si el dominio ya existía) ----------
        if domain_result.status == "existing":
            gene_candidates = query_genes_in_domain(
                domain_id = domain_result.domain_id,
                vector    = centroid,
                threshold = gene_threshold
            )
            if gene_candidates.best_score >= gene_threshold:
                gene_result = { status: "extend",
                                 gene_id: gene_candidates.best.id,
                                 score: gene_candidates.best_score }
            else:
                gene_result = { status: "new" }
        else:
            gene_result = { status: "new" }   # dominio nuevo -> no hay contra qué comparar

        resolution.append({
            cluster_id: cluster.id,
            files:      cluster.files,
            domain:     domain_result,
            gene:       gene_result
        })

    write(".classification/.turn_X/.files/.domain_resolution.json", resolution)
    update(ing_state.classification_summary, resolution)
    return resolution
```

La Pasada 1 resuelve y transporta `domain_id` (la clave estable en `.semantic-index.json`, ver B.7.3),
no solo `name`. El `name` viaja para que el turno de `.consolidation/` sea legible por un humano, pero
la escritura efectiva usa `domain_id`.

**Nota de implementación abierta, no bloqueante:** el pseudocódigo vectoriza y clusteriza a nivel
`cluster.centroid` para ambas pasadas. Es razonable evaluar si la Pasada 2 debería recalcular a
granularidad de archivo individual en clusters heterogéneos grandes — afecta precisión, no la forma del
contrato.

`.domain_resolution.json` sigue el mismo patrón que `.codebase.json`/`.docbase.json` en `dev`/`doc` — no
requiere carpeta nueva. Es la **propuesta**; la confirmación humana ocurre en `.consolidation/`.

## B.5 Fase `.consolidation/`

**Propósito:** cierre — con turnos, igual que `.refinement/` en `dev` o `.curation/` en `doc`. El humano
revisa la propuesta de `.domain_resolution.json`, la aprueba, ajusta o rechaza; solo cuando el turno
cierra confirmado, Brain escribe los cambios irreversibles en `.genes/` y en
`.cache/.semantic-index.json`.

**`.consolidation.json`:**
```json
{
  "turn": "N",
  "reviewed_resolution": [
    {
      "cluster_id": "...",
      "domain": { "status": "existing | new", "domain_id": "dom_auth_a1b2", "name": "auth", "score": 0.52 },
      "gene":   { "status": "extend | new", "gene_id": "..." },
      "human_decision": "approved | overridden | rejected",
      "override_reason": null
    }
  ],
  "committed": false,
  "turn_closed_at": null
}
```

**Efecto de `committed: true`:** por cada entrada con `human_decision: "approved"` u `"overridden"`:
- si `gene.status == "extend"` → escribe `.genes/{gene_id}/.history/.delta_N/` (B.7.2)
- si `gene.status == "new"` → crea `.genes/{new_gene_id}/gen.json` (B.7.1)
- en ambos casos → siembra o extiende **exactamente una arista** en `.cache/.semantic-index.json` (B.7.3):
  - `domain.status == "new"` → crea entrada de Dominio (`domain_id` nuevo, `dom_{slug}_{hex4}`) con
    `genes: [gene_id]`
  - `domain.status == "existing"` → agrega `gene_id` al `genes[]` del `domain_id` ya resuelto, **solo si
    no está ya presente** (idempotencia ante reintentos)
- escribe `.files/.docbase.json` (y `.codebase.json` si el raw incluía código) para un `dev`/`doc` futuro.

**Límite explícito:** este efecto nunca agrega una segunda arista a un `gene_id` que ya tuviera alguna,
nunca quita una arista existente, nunca toca el `genes[]` de un `domain_id` distinto al resuelto en esta
misma corrida, y nunca modifica `name` de un Dominio existente. Cualquier necesidad de esas operaciones
se resuelve con una corrida de `dis/`.

Entradas `"rejected"` no producen efecto — el archivo queda fuera del sistema, disponible para futura
ingesta si se reconsidera. Si `committed: false`, se abre `.turn_{X+1}/` con la propuesta ajustada.

## B.6 Contrato `.pipeline/` y degradación graceful

**Mismo contrato BISP en las tres fases:** cada fase tiene `.pipeline/{fase}/` con `.payload.json`,
`.index.json` y `.response/` (`.raw_output.txt`, `.report.json`, `.staging/`) — sin excepciones. El
`.payload.json` se arma con el ranking de `.context_ing_plan.json` (A.5.1). El `.index.json` se escribe
al cerrar la fase con `vector.embedding_ref`, `vector.embedding_source_text`, `vector.embedded_at`
(A.5.2, Invariante 1), respetando las tres capas del schema general (A.2.3) — `marketplace` queda `null`
en el intent (Invariante 4).

**Degradación graceful si Ollama no está disponible (Invariante 3):**
- `.reception/`: continúa sin bloquearse. `.rawbase_index.json` se escribe igual (sin vector).
  `.context_ing_plan.json` cae a orden de llegada.
- `.classification/`: no puede ejecutar ninguna pasada sin vectores. Clusters afectados quedan marcados
  `status: "unresolved_no_vectorization"` y se difieren a `.consolidation/`, donde el humano asigna
  dominio y gene manualmente. El intent **no** se aborta.
- `.consolidation/`: no depende de vectorización para cerrar — su turno siempre puede cerrarse con
  decisiones humanas explícitas, con o sin vector de respaldo.

## B.7 Estructura de metadatos

### B.7.1 `gen.json`
```json
{
  "gene_id": "uuid",
  "mandate_id": "uuid",
  "name": "session-management",
  "semantic_function": "gestiona creación y validación de sesiones",
  "embedding_ref": "chroma://nucleus/genes/{gene_id}",
  "created_by_intent": "ing-intent-uuid",
  "scope_files": ["src/auth/session.py", "src/auth/tokens.py"],
  "created_at": "ISO-8601"
}
```
Sin campo `"domain"`. El Gene es linaje puro — identidad, función semántica, archivos, Mandate de
origen. La pertenencia a Dominios vive exclusivamente en `.semantic-index.json` (B.7.3), como relación
N:M gestionada por `ing/` (siembra inicial) y `dis/` (reestructuración).

### B.7.2 `.history/.delta_N/delta.json`
```json
{
  "delta_index": "N",
  "intent_id": "ing-intent-uuid",
  "mandate_id": "mandate-de-incorporacion-uuid",
  "change_type": "files_added | files_removed | files_modified",
  "files_delta": {
    "added":    ["src/auth/mfa.py"],
    "removed":  [],
    "modified": []
  },
  "similarity_score": 0.42,
  "timestamp": "ISO-8601"
}
```
`snapshot.json` (mismo `.delta_N/`) conserva el estado completo del scope del gene en ese punto, con
hashes.

### B.7.3 `.cache/.semantic-index.json`
```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_auth_a1b2": {
      "name": "auth",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_auth_a1b2",
      "genes": ["gene-uuid-1", "gene-uuid-2"],
      "mandates": ["mandate-genesis-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    }
  }
}
```

- La clave del mapa es un `domain_id` estable, formato `dom_{slug}_{hex4}`, generado una vez y **nunca
  reutilizado** — ni siquiera si ese Dominio deja de existir por fusión o split ejecutados por `dis/`
  (C.7.3). Un ID derivado de un campo mutable rompe trazabilidad ante un rename.
- `name` es el único campo mutable — un rename (operación exclusiva de `dis/`) solo toca este campo.
- `genes[]` es la única fuente de verdad de la relación N:M Domain↔Gene. Un `gene_id` puede aparecer en
  más de un `domain_id` (Gene cross-domain) — situación que `ing/` nunca produce por sí mismo, pero que
  `dis/` sí puede producir, y que `ing/.classification` debe tolerar sin error si la encuentra (ignora
  las aristas adicionales que no le correspondan).
- `mandates[]` es acumulativo: preserva trazabilidad completa de qué Mandates tocaron cada dominio.

## B.8 Matriz de casos de prueba / transición

| Caso | `domain_baseline` | Resultado Pasada 1 | ¿Corre Pasada 2? | Resultado Pasada 2 | Efecto en `.genes/` | Efecto en `.semantic-index.json` |
|---|---|---|---|---|---|---|
| **Génesis** | `empty` | siempre `new` | No | N/A | Crea gene(s) nuevo(s) bajo el Mandate Génesis, sin `parent_mandates` | Crea entrada de dominio nueva, `mandates: [genesis_id]`, `genes: [gene_id(s)]` |
| **Incorporación — Dominio existente + Gene existente** | `existing` | `existing` (score ≥ threshold) | Sí | `extend` (score ≥ threshold) | Escribe `.delta_N` sobre el gene existente | Actualiza `last_updated`; agrega Mandate a `mandates[]` si no estaba |
| **Incorporación — Dominio existente + Gene nuevo** | `existing` | `existing` | Sí | `new` (score < threshold) | Crea gene nuevo bajo el Mandate de incorporación | Agrega el nuevo `gene_id` al `genes[]` del `domain_id` resuelto |
| **Incorporación — Dominio nuevo + Genes nuevos** | `existing` | `new` (score < threshold en todos) | No | N/A | Crea dominio + N genes nuevos | Crea entrada de dominio nueva, `mandates: [incorporación_id]` |
| **Sin vectorización disponible** | `empty` o `existing` | No se ejecuta | No | N/A | Sin efecto hasta `.consolidation/` | Cluster marcado `unresolved_no_vectorization`, resuelto a mano |

**Invariante que valida la matriz:** dominio nuevo implica, por definición, genes nuevos — no existe
combinación "dominio nuevo + gene existente". La degradación graceful no agrega una quinta rama: es el
mismo árbol resuelto manualmente en vez de por vector.

**Nota de alcance:** esta matriz describe únicamente lo que `ing/` puede producir. La combinación "gene
existente + dominio adicional" (cross-domain) existe en el sistema pero nunca la produce `ing/` — es
competencia exclusiva de `dis/` (Parte C).

## B.9 Pendientes explícitos de `ing/`

- Calibración empírica de `domain_threshold` (0.45) y `gene_threshold` (0.40, heredado de A.2.6, también
  pendiente ahí) contra corpus real.
- Definición de `propose_domain_name(cluster)` — heurística o prompt a AI para nombrar un dominio nuevo.
  Pendiente compartido con `dis/` (`create_domain`, C.9) — resolver una sola vez, no duplicar diseño.
- Granularidad de vectorización en Pasada 2 (centroide de cluster vs. archivo individual) para clusters
  heterogéneos grandes.
- Formato de parsing de la URI `chroma://...` — depende de que se resuelva el pendiente equivalente en
  A.2.6. `ing/` no debería definir un formato propio y paralelo.

---

# PARTE C — Intent `dis/` (Discovery)

> Fuente: `DIS_Intent_Spec_v1_0`. Séptimo tipo de intent del sistema, sumado a `dev`, `doc`, `exp`,
> `inf`, `cor`, `ing`.

## C.0 Rationale — por qué existe y por qué no es parte de `ing/`

Durante el diseño de `ing/` se asumió que la resolución Raw → Dominio → Gene, corrida por lotes en
`.classification/`, era suficiente para mantener consistente la topología de Dominios. Esa asunción
resultó incompleta por una razón estructural: `ing/.classification` resuelve **localmente** — compara el
lote que acaba de entrar contra centroides ya existentes, y solo puede *sumar*. Nunca reconsidera lo ya
consolidado por lotes anteriores.

Esto genera dos escenarios concretos:

1. **Mandate Génesis con múltiples corridas de `ing/`.** Con `domain_baseline: empty`, cada corrida solo
   compara contra Dominios creados por corridas anteriores *dentro del mismo Nucleus*. Es esperable que
   dos lotes ingeridos en momentos distintos, sin verse entre sí, terminen creando dos Dominios que en
   realidad son el mismo territorio mal cortado.
2. **Genes cross-domain.** Un Gene puede legítimamente pertenecer a más de un Dominio. Detectar esa
   segunda pertenencia requiere comparar Genes y Dominios *entre sí* — una mirada retrospectiva y global
   que `ing/` no puede producir desde su diseño local-incremental.

`dis/` corre **después** de una o más corridas de `ing/` — a demanda o periódicamente — con la vista
completa: no asimila material crudo, no toca `.rawbase`, no crea Genes. Su universo es exclusivamente el
conjunto de Genes ya existentes y el grafo de Dominios en `.cache/.semantic-index.json`. Su única salida
es un grafo de Dominios corregido: altas/bajas de la relación Domain↔Gene, fusiones, splits, renombres.

**Reglas de diseño fijadas como contrato:**

1. `dis/` sigue el mismo principio BSIP que `dev`/`doc`/`ing`: fases + `.pipeline/` espejo, con el
   contrato `.payload.json` + `.index.json` + `.response/` **idéntico** al resto, sin variantes.
2. `dis/` **siempre** corre bajo un Mandate, nunca "suelto" — mismo principio que `ing/`.
3. `dis/` **nunca** escribe en `.mandates/{id}/.genes/{gene_id}/gen.json`. El linaje de un Gene es
   inmutable desde su perspectiva. `dis/` escribe exclusivamente en `.cache/.semantic-index.json`.
4. `dis/` **nunca** crea Genes. Si detecta que un Gene debería dividirse, eso es un hallazgo a reportar
   — no una operación que ejecute por sí mismo (ver C.9, pendiente explícito).
5. Las decisiones estructurales (crear/fusionar/dividir/renombrar Dominio, alta/baja de arista) se
   proponen en `.mapping/` y el humano las aprueba, rechaza o edita directamente. No hay estados
   intermedios, tombstones ni herencias. Un `domain_id` usado y luego absorbido por merge o reemplazado
   por split **nunca se reasigna** (C.7.3).
6. La vectorización es aditiva y aislada del contrato BISP, mismo mecanismo que `ing/` (Invariante 3).
   Si no está disponible, `dis/` degrada a resolución manual en `.mapping/` (ver C.6).

`dis/` no es exclusivo de Mandate Génesis: es el mecanismo genérico y reutilizable para curar la
topología de Dominios en cualquier momento de la vida de un proyecto, con la misma trazabilidad y
gobierno humano que el resto de los intents.

## C.1 Estructura de `.dis_state.json`

```json
{
  "intent_id": "uuid",
  "intent_type": "dis",
  "mandate_id": "uuid",

  "phase_active": "discovery | mapping | ratification | done",
  "resumable": true,

  "scope": {
    "mode": "nucleus_wide | mandate_scoped",
    "mandate_ids": []
  },

  "thresholds": {
    "domain_centroid_similarity": 0.45
  },

  "mapping_summary": {
    "domains_created": 0,
    "domains_merged": 0,
    "domains_split": 0,
    "domains_renamed": 0,
    "edges_added": 0,
    "edges_removed": 0,
    "genes_cross_domain": 0,
    "unresolved_no_vectorization": 0
  },

  "created_at": "ISO-8601",
  "updated_at": "ISO-8601"
}
```

**Notas de campos:**
- `scope.mode`: `"nucleus_wide"` (default) analiza todos los Genes del Nucleus disponibles.
  `"mandate_scoped"` acota el análisis a los Genes de los `mandate_ids` listados.
- `thresholds.domain_centroid_similarity`: mismo mecanismo de threshold que `ing/` (A.2.6), aplicado
  centroide-contra-centroide en vez de raw-contra-centroide. Sin calibración empírica, igual que `ing/`.
- `mapping_summary.genes_cross_domain`: contador informativo — cuántos Genes terminan con 2+ aristas de
  Dominio. Útil para reportes de salud del sistema a nivel Nucleus.

## C.2 Estructura de directorios de `dis/`

```
.intents/
└── .dis/
    └── .{intent-name-uuid}/
        ├── .dis_state.json
        │
        ├── .discovery/                  ← sin turnos, igual que .reception/ (ing) y .context/ (doc)
        │   ├── .discovery.json
        │   ├── .context_dis_plan.json
        │   └── .files/
        │       ├── .genebase.json                ← snapshot de todos los Genes del scope (sin domain)
        │       ├── .genebase_index.json
        │       ├── .domain_graph_snapshot.json    ← copia de .semantic-index.json al arrancar
        │       └── [optional files]
        │
        ├── .mapping/                    ← con turnos, igual que .classification/ (ing)
        │   └── .turn_X/
        │       ├── .turn.json
        │       ├── .context_dis_plan.json
        │       └── .files/
        │           ├── .mapping_proposal.json
        │           └── [optional files]
        │
        ├── .ratification/               ← con turnos, cierre — aplica el mapa final
        │   └── .turn_X/
        │       └── [contrato análogo a .consolidation/ de ing]
        │
        └── .pipeline/                   ← contrato BISP idéntico, por fase
            ├── .discovery/{.payload.json, .index.json, .response/}
            ├── .mapping/.turn_X/{.payload.json, .index.json, .response/}
            └── .ratification/.turn_X/{.payload.json, .index.json, .response/}
```

## C.3 Fase `.discovery/`

Sin turnos, igual que `.reception/` de `ing/` o `.context/` de `doc/`. Genera `.genebase.json` (snapshot
de todos los Genes del scope, sin campo `domain` — ver C.7.1) y `.domain_graph_snapshot.json` (copia
congelada de `.semantic-index.json` al momento de arrancar, usada luego en C.5 para calcular el diff de
la corrida). Los candidatos de fusión pueden surgir tanto de similitud de centroide como de **evidencia
de Genes cross-domain** ya presente en el grafo (esta segunda fuente no depende de vectorización — ver
C.6).

## C.4 Fase `.mapping/`

Con turnos, igual que `.classification/` de `ing/`. El humano revisa `.mapping_proposal.json` y aprueba,
rechaza o edita directamente cada operación (`create_domain`, `rename_domain`, `add_edge`, `remove_edge`,
`merge_domains`, `split_domains`) sobre el `.turn.json`. No hay sub-schema de `override` separado — el
humano escribe el estado final directamente sobre la propuesta, y `human_decision: "overridden"` es solo
la marca de que ese contenido fue editado, no generado por Brain.

Si `committed: false`, se abre `.turn_{X+1}/` con la propuesta ajustada — mismo patrón que un turno de
`.refinement/` en `dev` o de `.classification/` en `ing/` que no cierra en la primera vuelta.

## C.5 Fase `.ratification/`

Con turnos, `committed: false → true`. Al cerrar con `committed: true`, Brain aplica sobre
`.cache/.semantic-index.json` el mapa final tal como quedó escrito en el último turno de `.mapping/` —
sin recalcular, sin revalidar, sin herencias. Por cada `operation` con `human_decision` en
`approved`/`overridden`:

| `type` | Efecto en `.semantic-index.json` |
|---|---|
| `create_domain` | Nueva entrada, `domain_id` generado (`dom_{slug}_{hex4}`, C.7.3), `genes[]` con los IDs indicados |
| `rename_domain` | Solo cambia `name`. La clave (`domain_id`) nunca se mueve |
| `add_edge` / `remove_edge` | Alta/baja de `gene_id` en `genes[]` del `domain_id` indicado |
| `merge_domains` | Se crea (o reusa, si `target_domain_id` fue indicado en el override) una entrada con la unión de todos los `genes[]` de los `source_domain_ids`. Los `source_domain_ids` dejan de existir como entradas activas |
| `split_domains` | El `source_domain_id` deja de existir como entrada activa. Se crean los `targets[]` como entradas nuevas, cada una con su subconjunto de `genes[]` |

Operaciones `"rejected"` no producen efecto. `.domain_graph_delta.json` registra, a modo de resumen de la
corrida (no de log transaccional), el `diff` entre `.domain_graph_snapshot.json` (C.3) y el estado final
aplicado — insumo directo para que un `doc/` posterior sepa qué cambió sin recorrer los turnos completos
de `.mapping/`.

## C.6 Contrato `.pipeline/` y degradación graceful

**Mismo contrato BISP en las tres fases, sin excepción:** idéntico al de `ing/`, `dev/` y `doc/` — sin
variantes por tratarse de un intent nuevo. `.payload.json` se arma con el ranking de
`.context_dis_plan.json` (A.5.1). `.index.json` se escribe al cerrar la fase con `vector.embedding_ref`,
`vector.embedding_source_text`, `vector.embedded_at` (A.5.2, Invariante 1). No hay payload ni formato
propio de `dis/` que se aparte de este contrato.

**Degradación graceful si Ollama no está disponible (Invariante 3):**
- `.discovery/`: continúa sin bloquearse. `.genebase_index.json` se escribe sin vector.
  `.context_dis_plan.json` no trae candidatos de fusión por similitud de centroide — pero **sí** puede
  seguir trayendo candidatos por evidencia de Genes cross-domain, que no dependen de vectorización.
- `.mapping/`: sin vectores, los turnos arrancan sin propuestas de `merge_domains` por similitud — el
  humano puede seguir proponiendo manualmente cualquier operación sin restricción, porque ninguna
  operación de `.mapping/` depende de tener un score de similitud para ejecutarse.
- `.ratification/`: no depende de vectorización para cerrar, igual que en `ing/`.

## C.7 Estructura de metadatos

### C.7.1 `.genebase.json` (salida de `.discovery/`)
```json
{
  "genes": [
    {
      "gene_id": "uuid",
      "mandate_id": "uuid",
      "semantic_function": "gestiona creación y validación de sesiones",
      "scope_files": ["src/auth/session.py", "src/auth/tokens.py"],
      "created_by_intent": "ing-intent-uuid",
      "created_at": "ISO-8601"
    }
  ]
}
```
Sin campo `domain` — el linaje del Gene (B.7.1) nunca lo tuvo ni lo necesita.

### C.7.2 `.cache/.semantic-index.json` (única fuente de verdad de Domain↔Gene)
```json
{
  "updated_at": "ISO-8601",
  "domains": {
    "dom_billing_x1y2": {
      "name": "billing",
      "domain_centroid_ref": "chroma://nucleus/domains/dom_billing_x1y2",
      "genes": ["gene-uuid-1", "gene-uuid-9"],
      "mandates": ["mandate-genesis-uuid", "mandate-billing-v2-uuid"],
      "first_created_by": "ing-intent-uuid-0",
      "last_updated": "ISO-8601"
    }
  }
}
```
- `domain_id` (clave): `dom_{slug}_{hex4}`, generado una vez, inmutable, nunca reutilizado aunque el
  Dominio deje de existir por merge o split (C.7.3).
- `name`: mutable. Renombrar solo toca este campo, nunca la clave.
- `genes[]`: única fuente de verdad de la relación N:M — un `gene_id` puede aparecer en más de un
  `domain_id` (cross-domain).
- `mandates[]`: acumulativo, igual que B.7.3.

### C.7.3 Regla de no-reuso de `domain_id`

Cuando un Dominio deja de tener entrada activa (absorbido por `merge_domains`, reemplazado por
`split_domains`), su `domain_id` se retira del mapa y **el generador de IDs nunca vuelve a entregarlo**.
No hay tombstone, no hay campo `status`, no hay redirección automática — solo la garantía de que una
referencia vieja a ese `domain_id` (por ejemplo, desde un `doc/` generado antes del merge) en el peor
caso queda apuntando a algo que ya no está, pero **nunca** a algo que ahora significa otra cosa. Una
referencia desactualizada se resuelve la próxima vez que corra un `doc/`; una referencia que cambió de
significado en silencio es un bug de integridad que este diseño evita de raíz.

## C.8 Matriz de casos de prueba / transición

| Caso | Operación | Precondición | Efecto en `.semantic-index.json` |
|---|---|---|---|
| **Primer Dominio de un cluster sin match** | `create_domain` | Ningún Dominio existente supera el threshold contra el cluster propuesto | Nueva entrada, `domain_id` nuevo, `genes[]` con los IDs del cluster |
| **Gene ya asignado gana una segunda pertenencia** | `add_edge` | El Gene ya tiene arista hacia un Dominio distinto | Se agrega el `gene_id` al `genes[]` del nuevo Dominio, sin tocar la arista existente — Gene queda cross-domain |
| **Corrección de una asignación equivocada de `ing/`** | `remove_edge` + `add_edge` | El humano determina que la siembra local de `ing/` erró el Dominio | Baja del `genes[]` viejo, alta en el correcto |
| **Dos Dominios resultan ser el mismo territorio** | `merge_domains` | Similitud de centroide alta y/o Genes cross-domain compartidos | `source_domain_ids` dejan de tener entrada activa; entrada resultante con la unión de `genes[]` |
| **Un Dominio creció y mezcla dos áreas distintas** | `split_domains` | El humano identifica subconjuntos de `genes[]` con funciones distintas | `source_domain_id` deja de tener entrada activa; se crean los `targets[]` con sus subconjuntos |
| **Sin vectorización disponible** | Cualquiera | Ollama caído | `.discovery/` no trae candidatos por similitud, pero sí por evidencia cross-domain; `.mapping/` sigue operable con propuestas manuales |

## C.9 Pendientes explícitos de `dis/`

- Calibración empírica de `domain_centroid_similarity` (0.45, heredado del punto de partida de `ing/`
  sin medición) contra corpus real.
- Qué hace `dis/` cuando detecta que un **Gene individual** debería dividirse en dos unidades
  funcionales distintas — fijado explícitamente que `dis/` no crea ni divide Genes, solo reporta el
  hallazgo. Falta definir el formato de ese hallazgo y qué intent lo consume (¿un `ing/` de
  re-clasificación puntual? ¿un nuevo tipo de operación?).
- Comportamiento ante concurrencia: qué pasa si `.cache/.semantic-index.json` es tocado por otra corrida
  de `ing/` o `dis/` mientras una corrida de `dis/` está en `.mapping/` con el
  `.domain_graph_snapshot.json` ya congelado. Fuera de alcance de v1.0 — se asume ejecución serializada
  a nivel Nucleus hasta que se defina un mecanismo de lock.
- Definición de `propose_domain_name(cluster)` para `create_domain` — mismo pendiente ya abierto en B.9,
  no se duplica el diseño.
- Formato de parsing de la URI `chroma://...` — depende del mismo pendiente abierto en A.2.6 y en B.9.
  `dis/` no define un formato propio y paralelo.

---

# Apéndice — Invariantes y pendientes consolidados

## Invariantes de diseño (no violables sin revisión explícita de arquitectura)

1. **Texto fuente siempre presente** (A.7) — todo vector va acompañado de modelo, versión, dimensiones y
   texto fuente.
2. **Brain como único orquestador** (A.7) — solo Brain llama a Ollama y a ChromaDB.
3. **La capa vectorial es aditiva** (A.7) — un intent sin vectorizar es válido; degradación graceful
   obligatoria (aplicada en `ing/` B.6 y `dis/` C.6).
4. **El marketplace es responsabilidad del Mandate** (A.7) — `marketplace` es `null` en todo intent
   individual.
5. **Separación de audiencias en el package** (A.7) — `operational`/`autarchic`/`marketplace` nunca se
   mezclan.
6. **Dominio no es un nivel jerárquico ni un campo del Gene** (B.0, regla 3) — es una relación N:M
   persistida exclusivamente en `.cache/.semantic-index.json`.
7. **`ing/` nunca reestructura, `dis/` nunca crea Genes** (B.0 regla 7 / C.0 regla 4) — separación de
   responsabilidades entre siembra local y reestructuración global.
8. **No-reuso de `domain_id`** (B.7.3 / C.7.3) — un ID retirado por merge o split nunca se reasigna.

## Pendientes abiertos (ninguno resuelto en este documento)

| # | Pendiente | Origen | Bloquea a |
|---|---|---|---|
| 1 | Formato de parsing de URI `chroma://...` | A.2.6 | B.9, C.9 |
| 2 | Threshold de similitud default (0.40 gene / 0.45 dominio) sin calibración empírica | A.2.6, B.1, C.1 | Precisión de clustering en `ing/`/`dis/` |
| 3 | Formato de exportación de embeddings (binario vs JSON base64) | A.2.6 | — |
| 4 | Contrato de Synapse aplicable a Fase 2 de Mandate Genesis | A.2.5, A.2.6 | Integración Go/Temporal (A.9) |
| 5 | `propose_domain_name(cluster)` — heurística o prompt de naming | B.9, C.9 | `ing/.classification`, `dis/.mapping` |
| 6 | Granularidad de vectorización en Pasada 2 de `ing/` (centroide vs archivo) | B.9 | Precisión en clusters heterogéneos |
| 7 | Qué hace `dis/` ante un Gene que debería dividirse — formato de hallazgo, intent consumidor | C.9 | Evolución futura de `dis/` o `ing/` |
| 8 | Concurrencia sobre `.semantic-index.json` entre corridas simultáneas de `ing/`/`dis/` | C.9 | Ejecución no serializada a nivel Nucleus |
| 9 | Mecanismo de invocación cross-proceso Go→Brain para Mandate Genesis Fase 1/2 | A.9 | Conexión real del workflow Go al pipeline |
| 10 | Puente entre `domain_proposal.json` (Go, plano) y `.bloom/.project-{name}/{intent-uuid}/` (A.8) | A.9 | Fase 2 de Mandate Genesis apoyándose en `findings_summary`/`domain_tags` |

# PARTE D — Companion Cognitivo — Integración con el BISP

> Fuente: `BLOOM_BISP_Companion_Integration_v2_0`. Este apartado describe cómo el Companion **consume**
> el BISP definido en la Parte A — no redefine su schema, su flujo Brain–Ollama–ChromaDB ni los
> contratos genéricos de Synapse. Si el trabajo es sobre `index.json`, ChromaDB, Ollama o Mandates, ese
> trabajo está en las Partes A–C y no requiere leer esta parte.

## D.0 Prerrequisitos — qué toma prestado del BISP core

El Companion es un **consumidor** del BISP, no un componente que participa en su generación. De Parte A de este documento toma:

- El **Contrato A (Continuar)** de Synapse (Parte A, sección A.2.5), que extiende con restricciones propias (ver sección 3).
- Los campos `operational.intent_type`, `operational.objective` y `autarchic.findings_summary` / `domain_tags` del `index.json` (Parte A, sección A.4), como insumo de contexto.

> **Nota de brecha abierta:** el flujo de implementación de este documento referencia un campo `bisp.openDecision` que **no existe** en el schema `index.json` documentado en el BISP core. Antes de implementar la sección 4 de este documento, esa brecha debe resolverse en el Parte A (agregar el campo al schema, o reemplazar la referencia por un campo existente). Este documento no asume una resolución para no invadir decisiones que corresponden al BISP core.

El Companion **no** participa en la generación de vectores, no llama a Ollama ni a ChromaDB, y no tiene acceso directo a Brain. Consume el package ya cerrado.

---

## D.1 Filosofía de integración

El Companion Cognitivo (panel lateral Chromium) se integra al pipeline BISP como un **observador de sesión con contexto nativo**. A diferencia de la integración vía botón "Brief" (pull manual), la integración BISP es un push automático que ocurre antes de que el ingeniero interactúe con la UI de la AI web.

El principio rector es la **Sesión Prístina**: la sesión de la AI web (Claude, ChatGPT, Grok) permanece libre de ruido de control. El Companion absorbe toda la carga cognitiva de validación y la mantiene disponible en su panel lateral, respondiendo solo cuando el ingeniero lo consulta.

## D.2 Principio de Sesión Prístina

**Definición:** Una sesión prístina es aquella donde el chat de la AI web contiene exclusivamente la conversación técnica entre el ingeniero y el modelo. Sin preguntas de control de contexto, sin verificaciones de consistencia con el BISP, sin ruido de gobernanza.

**Por qué importa:** El ingeniero que pregunta en el chat de Claude "¿esto es compatible con la decisión de arquitectura v1.0?" está ensuciando la sesión con un problema que el Companion puede resolver en paralelo. El historial de Claude queda contaminado con metadata de gobernanza que no aporta a la generación de solución.

**Cómo se garantiza:** El Companion recibe el BISP completo como carga silenciosa antes de que la sesión comience. Actúa como Shadow Monitor: tiene todo el contexto, no lo expresa hasta ser consultado.

## D.3 Contrato de Synapse aplicado al Companion (extensión del Contrato A)

El BISP core define el **Contrato A — Continuar** como uso genérico para cualquier AI web en flujo activo (ver Parte A, sección A.2.5). El Companion se acoge a ese contrato y le agrega restricciones propias, específicas de su rol de panel lateral:

```
Contrato A — Informativo de Fondo (Companion Web)
Extiende: Contrato A del BISP core (Continuar)

- La carga del BISP vía Synapse al Companion es de carácter INFORMATIVO DE FONDO.
- El Companion actúa como Shadow Monitor (Monitor en la Sombra).
- Prohibido: renderizado proactivo de warnings, pop-ups, titileos, o cualquier
  interrupción visual que altere el flujo libre de la sesión de AI principal.
- Si detecta divergencias entre la respuesta de la AI web y el BISP, las
  almacena en su contexto local. Las expone solo bajo consulta explícita.
- El ingeniero siempre tiene control: el Companion prepara, él decide cuándo consultar.
```

Estas restricciones son propias del Companion. No modifican el Contrato A genérico para otros consumidores.

## D.4 Flujo de implementación

**Trigger — Detección de UI Claude en background.js**

```javascript
// background.js — push automático del BISP al Companion
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const AI_WEB_URLS = ['claude.ai', 'chat.openai.com', 'grok.com'];
  const isAIWeb = AI_WEB_URLS.some(url => tab.url?.includes(url));

  if (changeInfo.status === 'complete' && isAIWeb) {
    const bisp = _lastCortexBrief;
    if (bisp) {
      chrome.runtime.sendMessage({
        type: 'INJECT_BISP',
        brief: bisp,
        systemPrompt: buildCompanionPromptForSession(bisp),
        autoSend: true   // bootstrap silencioso: el system prompt se inyecta automáticamente
      });
    }
  }
});
```

**System prompt dinámico por sesión**

```javascript
function buildCompanionPromptForSession(bisp) {
  return `
Sos el Companion Cognitivo de Cognituum asistiendo en una sesión lateral.
El ingeniero está interactuando con una AI web bajo el siguiente contexto BISP:

- Intent: ${bisp.intentType} — ${bisp.summary}
- Estado: ${bisp.openDecision
    ? `Decisión abierta: ${bisp.openDecision}`
    : 'Sin decisiones abiertas.'}

REGLA DE ORO — SESIÓN PRÍSTINA:
1. Tu rol es PASIVO y REACTIVO. No interrumpas el flujo principal ni generes
   outputs sin que el ingeniero te consulte directamente en este panel.
2. Si identificás divergencias entre lo que propone la AI web y el BISP,
   registralas en tu contexto. No las verbalizás hasta ser consultado.
3. Cuando el ingeniero te consulte, respondé con frialdad técnica: análisis
   de consistencia con el BISP, sin juicio sobre las decisiones de la AI web.
4. Tu objetivo es que el chat de la AI web permanezca prístino: solo
   conversación técnica de solución, sin ruido de gobernanza.

Esperá la consulta del ingeniero.
  `.trim();
}
```

> Nota: `bisp.intentType`, `bisp.summary` y `bisp.openDecision` son campos consumidos por esta función. Los dos primeros mapean a `operational.intent_type` y `operational.objective` del schema base. `openDecision` es la brecha señalada en la sección 0 — no tiene mapeo confirmado en el schema `index.json` actual.

## D.5 Nuevo tipo de mensaje: INJECT_BISP

El mensaje existente `INJECT_BRIEF` se extiende con `INJECT_BISP` para diferenciar la carga manual (botón Brief) de la carga automática de sesión:

| Mensaje | Trigger | autoSend | Comportamiento |
|---|---|---|---|
| `INJECT_BRIEF` | Botón "Brief" del toolbar | false | El ingeniero ve el brief y decide si enviarlo. Carga manual explícita. |
| `INJECT_TEXT` | Cortex vía API | configurable | Inyección de texto libre. |
| `INJECT_BISP` | Detección de AI web en tab | true (system prompt) | Carga silenciosa del BISP completo con system prompt dinámico. El ingeniero no ve la inyección — el Companion queda listo en background. |
| `NEW_SESSION` | Botón "Reset" del toolbar | true (system prompt) | Recarga el webview y re-inyecta el system prompt. |

## D.6 Estado SILENT_MONITORING

Post-inyección BISP, el Companion entra en estado `SILENT_MONITORING`. En este estado:

- El statusbar del panel muestra: `● Sesión activa — BISP cargado`
- No hay ningún output visible en el chat del webview (Gemini)
- El Companion tiene el BISP completo en contexto y el system prompt activo
- Al primer mensaje del ingeniero en el panel, el Companion responde con contexto completo

## D.7 Fase 2 — Monitoreo activo opt-in (roadmap)

La Fase 1 implementa el Monitoreo Silencioso descrito en las secciones 4–6.

La Fase 2, opt-in y post-validación de UX, agrega monitoreo activo cuando el BISP tiene `openDecision` presente:

- Si el ingeniero acepta explícitamente activar el modo activo para esa sesión
- El Companion puede emitir un único aviso discreto en su panel (nunca en el chat de Claude) si detecta que la respuesta de la AI web no aborda la decisión abierta
- El aviso no interrumpe el flujo: es un indicador en el statusbar del panel, no un pop-up

La Fase 2 no se implementa hasta que la Fase 1 esté validada en uso real.

---

## D.8 Impacto en archivos existentes (específico de Companion)

| Archivo / Componente | Estado | Acción requerida |
|---|---|---|
| `background.js` (Companion) | Extender | Agregar trigger de detección de UI Claude. Lógica de push automático del BISP al Companion con system prompt dinámico. Ver sección 4. |
| `panel.js` (Companion) | Extender | Soporte para `INJECT_BISP` con system prompt embebido. Estado `SILENT_MONITORING` post-inyección. Ver secciones 5–6. |

> Cambios al schema `index.json`, a Brain, ChromaDB u Ollama **no** se documentan acá — están fuera del alcance de este documento. Ver Parte A de este documento.

---

## D.9 Invariantes de Diseño — Companion

Estas invariantes son propias del Companion y se suman a las invariantes 1–5 del BISP core (Apéndice de invariantes consolidado), sin reemplazarlas.

**Invariante C1 — El Companion no interrumpe el flujo principal**
El Companion Cognitivo opera bajo el Principio de Sesión Prístina. Recibe el BISP como carga de fondo pero nunca emite outputs proactivos durante una sesión activa con una AI web. La interrupción proactiva del flujo principal es una violación de diseño, no una feature.

**Invariante C2 — INJECT_BISP es siempre silencioso**
La carga del BISP al Companion vía `INJECT_BISP` nunca produce output visible en el webview. El ingeniero no debe percibir la inyección. Si la inyección falla, el Companion opera sin contexto BISP y lo indica en el statusbar. La sesión de la AI web no se ve afectada en ningún caso.

**Invariante C3 — El system prompt del Companion es versionado junto al BISP**
El `buildCompanionPromptForSession()` es parte del contrato de consumo del Companion, no una constante libre. Cualquier cambio en su comportamiento es un cambio de versión de este documento, no del BISP core.

---

---

*Fin de la Parte D · Fuente original: `BLOOM_BISP_Companion_Integration_v2_0`, junio 2026.*

---

# PARTE E — Intent Types: Gap Analysis (Investigación de Sesión)

> Fuente: `BLOOM_Intent_Types_Gap_Analysis_v1_0`, agosto 2026. Diagnóstico cerrado sobre el estado real
> de los tipos de intent que **no** corren sobre el motor BSIP genérico (`ing`/`dis`, Partes B–C). Sin
> acción de código tomada — este apartado es el registro, no una implementación.

## E.0 Decisión tomada en esta sesión

**No se agregan `dev`/`doc` a `intent_types.py` / `INTENT_TYPE_REGISTRY` todavía.**

Motivo: `dev` y `doc`, tal como existen hoy en código (`intent_manager.py`), no usan el modelo de máquina de estados que gobierna `ing`/`dis` (`phase_active` + `commit_field` + `IntentStateManager`). Usan un modelo distinto y más laxo (`status` string + `steps{}` boolean checklist, sin gating). Forzar una entrada de registro que describa `commit_field`/`has_turns` para fases que en la realidad no comitean nada sería documentar una gramática que no es cierta — y el propio principio de este ecosistema (ver Parte A de este documento, nota de cabecera) es no diluir la fuente de verdad con supuestos no verificados.

Este documento existe para que, cuando llegue el momento real de implementar `dev`/`doc` sobre el motor BSIP (o de definir `cor`/`inf`/completar `exp` desde cero), el punto de partida sea preciso y no haya que re-descubrir esto.

---

## E.1 Estado real por tipo — resumen ejecutivo

| Tipo | ¿Implementado? | Motor | Nivel | Gap principal |
|---|---|---|---|---|
| `dev` | ✅ Funcional, en producción | Legacy hand-rolled (`status`/`steps{}`) | Project | No es compatible con el modelo BSIP sin reescritura — ver §3 |
| `doc` | ✅ Funcional, en producción | Legacy hand-rolled (`status`/`steps{}`) | Project + Nucleus (BTIPS §6, no confirmado en código a nivel Nucleus) | Idem `dev` — ver §4 |
| `ing` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Project | Ninguno conocido |
| `dis` | ✅ Funcional | BSIP genérico (`IntentStateManager`) | Nucleus | Ninguno conocido |
| `exp` | 🟡 Parcial — roto | Ad-hoc propio, fuera de ambos motores | Nucleus | Método `NucleusManager.create_exp_intent()` no existe en el código revisado — ver §5 |
| `cor` | ❌ No implementado | — | Nucleus (según árbol conceptual) | Cero código; solo existe como mockup de árbol de directorios — ver §6 |
| `inf` | ❌ No implementado | — | — | Cero código, cero estructura de directorios en ningún árbol real — ver §7 |

---

## E.2 Fuentes consultadas en esta investigación

- `intent_state_manager.py`, `intent_types.py` — motor BSIP genérico
- `intent_manager.py` (2192 líneas, `brain/core/`) — orquestador real de `create`/`hydrate`/`add_turn`/`finalize`/`get`/`freeze_to_mandate` para los 4 tipos activos
- `create.py` (CLI `brain intent create`) — valida `intent_type` en `["dev", "doc", "ing", "dis"]`
- `validation_manager.py` — legacy, solo conoce `.dev`/`.doc` (ni siquiera `ing`/`dis`)
- `bloom_project_inspector.py` — legacy, `get_intents_list()` solo escanea `.dev`/`.doc`
- `nucleus_manager.py`, `nucleus_inspector.py`, `create_exp_intent.py` (CLI) — capa Nucleus / `exp`
- `bloom_project_tree.txt`, `bloom_nucleus_tree.txt` — árboles de referencia (parcialmente aspiracionales, no 100% código-verificados)
- `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` §6 — única fuente que da una descripción de una línea para los 5 tipos históricos, incluyendo `inf`
- `Mandate_Domain_Spec_v1_0_0.md` §2.1/§2.3 — lista el "Work Domain" real como `.exp`, `.cor`, `dev`, `doc` (**excluye `inf`** explícitamente)
- `ING_Intent_Spec_v1_1.md` §0 — trata a `inf` como "existente", contradiciendo la ausencia total de código
- Parte A de este documento — protocolo de vectorización, agnóstico de tipo
- `router_prompt.md` — **descartado como fuente**: es un prompt de Gemini para context-planning genérico, no específico de la gramática de intents (aclarado por el usuario)

---

## E.3 `dev` — lo que existe y lo que falta

### Existe (código real, `intent_manager.py`)

- Directorios: `.briefing/`, `.briefing/.files/`, `.execution/`, `.execution/.files/`, `.refinement/`, más `.pipeline/` espejo de `.briefing/` y `.execution/` (`.refinement/` **no** tiene mirror explícito en `.pipeline/` en el código de `_create_directory_structure` — solo `.pipeline/.refinement` sin subcarpetas `.response/.staging`, a diferencia de `.briefing`/`.execution`. Verificar si es intencional).
- `.dev_state.json`:
  ```json
  {
    "status": "created",
    "name": "...", "type": "dev", "uuid": "...", "created_at": "...",
    "initial_files": [],
    "steps": {"create": true, "hydrate": false, "plan": false,
              "build": false, "submit": false, "merge": false}
  }
  ```
- `hydrate_intent()`: escribe `.briefing/.briefing.json` con key `instruction`.
- `add_turn()`: escribe `.refinement/.turn_N/.turn.json` con `{turn_id, actor, content, timestamp}` — **sin campo de commit**.
- `finalize_intent()`: marca `status = "completed"`, `steps["merge"] = true`. **No valida que haya turnos, ni que `.execution/` tenga respuesta.**

### Falta / gaps confirmados

1. **No hay ningún campo de "commit" en `.turn.json` de `.refinement/`.** El parámetro `close_phase` de `add_turn()` es aceptado por la firma pero **nunca se lee** en la rama `dev`/`doc` — es un no-op silencioso. Hay que decidir si se agrega un campo de cierre real, o si el modelo de `dev` es deliberadamente "turnos libres sin gate" (posible, pero debe ser una decisión explícita, no un olvido).
2. **`finalize_intent()` no tiene invariante de precondición.** Se puede finalizar un `dev` con `.refinement/` vacío. Si se migra a BSIP, esto cambia de comportamiento — usuarios que hoy dependen de finalizar sin refinamiento se romperían.
3. **Schema de identidad distinto** (`uuid`/`type` vs `intent_id`/`intent_type`) — cualquier migración a `intent_types.py` requiere decidir si se convive con esta divergencia (como hoy, vía `_uid()`/`_itype()`) o se normaliza.
4. **No hay spec formal `DEV_Intent_Spec_*.md`.** Solo existe como código + mención de una línea en BTIPS §6.

---

## E.4 `doc` — lo que existe y lo que falta

### Existe (código real)

- Directorios: `.context/`, `.context/.files/`, `.curation/`, más `.pipeline/.context/` (con `.response/.staging`) y `.pipeline/.curation/` (sin subcarpetas — mismo patrón asimétrico que `.refinement/` en `dev`).
- `.doc_state.json`:
  ```json
  {
    "status": "created",
    "name": "...", "type": "doc", "uuid": "...", "created_at": "...",
    "initial_files": [],
    "steps": {"create": true, "hydrate": false, "curate": false, "publish": false}
  }
  ```
- `hydrate_intent()`: escribe `.context/.context.json`.
- `add_turn()`: escribe `.curation/.turn_N/.turn.json` — mismo patrón que `dev`, sin commit.
- `finalize_intent()`: marca `steps["publish"] = true`. Mismo problema de falta de invariante que `dev`.

### Falta / gaps confirmados

1. Mismos tres primeros puntos de `dev` (§3.1-3.3), aplicados a `.curation/`.
2. **BTIPS §6 dice que `doc` corre "en Projects y en Nucleus"** — el código revisado (`intent_manager.py`, `_create_directory_structure`) solo cubre el caso Project. No hay evidencia de código de `doc` a nivel Nucleus. Si es un requisito real, está sin implementar; si ya no aplica, la spec BTIPS quedó desactualizada. **PENDIENTE de confirmar cuál de las dos.**
3. No hay spec formal `DOC_Intent_Spec_*.md`.

---

## E.5 `exp` — bug conocido, no gap de diseño

- Estructura de directorios y CLI (`create_exp_intent.py`) existen y están bien formados: flujo `Inquiry → Discovery (con turnos) → Findings`.
- `NucleusManager.create()` scaffoldea `.intents/.exp/` correctamente al crear un Nucleus.
- **El método `NucleusManager.create_exp_intent()`, invocado por el CLI, no existe en el archivo revisado** (`nucleus_manager.py`, 855 líneas). Esto es un bug de código o un archivo desactualizado — no un gap de diseño ni de documentación. **Acción recomendada cuando se retome:** confirmar si existe una versión más reciente de `nucleus_manager.py` en el repo real antes de asumir que hay que escribir el método desde cero.
- `exp` no pasa por `intent_types.py`/`IntentStateManager` — corre con su propia lógica. No estaba en el alcance de esta sesión decidir si conviene migrarlo también; queda anotado para una futura conversación, con el mismo criterio de prudencia que se aplicó a `dev`/`doc`.

---

## E.6 `cor` — sin implementación

- No existe en `nucleus_manager.py`, `nucleus_inspector.py`, `intent_manager.py`, `create.py`, ni en el `features{}` de `nucleus-config.json` (que solo declara `explorationIntents`).
- Única evidencia: un árbol de directorios en `bloom_nucleus_tree.txt` con 6 fases (`freeze_snapshot → structural_analysis → semantic_interpretation → dual_path_synthesis → proposal_assembly → governed_submission`), **ninguna con `.turn_X/`** — patrón estructural distinto a todo lo demás (ni turnos tipo `ing`/`dis`, ni checklist tipo `dev`/`doc`).
- **PENDIENTE, sin resolver:** qué gobierna el avance entre esas 6 fases si ninguna tiene noción de commit visible. No se infiere ni se inventa acá.
- BTIPS §6 lo describe en una línea: "coordina y gobierna acciones humanas y sistémicas... como autoridad" — insuficiente para derivar una gramática de estado.

> **Nota aclaratoria (post-diagnóstico, no forma parte del Gap Analysis original):** lo anterior describe
> el estado de `cor` en el momento del diagnóstico — ausencia de código, sin que se supiera si era una
> implementación pendiente o una vía descartada. Se confirmó después que es lo segundo: `cor` **fue
> descartado por diseño**, no quedó pendiente de construir. Su función de gobernanza fue absorbida por la
> lógica global de **Gravity** (`BTIPS_Bloom_Technical_Intent_Package_v7_2.md`, sección 8 — Postura,
> Postulación, GravityGraph), que hoy maneja el conjunto de posturas a nivel organización en su lugar. Esta
> nota no describe el mecanismo de Gravity en detalle — eso vive en BTIPS §8 — solo dejá trazado que la fila
> de `cor` en la tabla resumen (E.1) debe leerse como "descartado y reemplazado", no como "no implementado
> todavía".

---

## E.7 `inf` — el gap más profundo, posible tipo no vigente

- **Cero código.** Cero estructura de directorios en cualquier árbol (ni `bloom_project_tree.txt`, ni `bloom_nucleus_tree.txt`).
- `Mandate_Domain_Spec_v1_0_0.md` (§2.1, §2.3) — el documento más orientado a "estado real del sistema, sin supuestos" — **excluye explícitamente `inf`** de la lista de tipos del Work Domain (`.exp`, `.cor`, `dev`, `doc`), aun siendo un documento posterior a la versión de BTIPS que sí lo lista.
- `intent_types.py` e `ING_Intent_Spec_v1_1.md` sí lo mencionan como "existente", pero solo repitiendo la enumeración de BTIPS — ninguno de los dos aporta código ni estructura propia.
- **Hipótesis a confirmar en una futura sesión, no asumida como cierta acá:** que `inf` haya quedado conceptualmente absorbido por la fase `.inquiry/` de `exp` o `.reception/` de `ing` (ambas descritas como "recopilar información/archivos sin transformar decisiones", similar a la definición de una línea que da BTIPS para `inf`). No hay evidencia directa de esto — es una pregunta abierta, no una conclusión.

---

## E.8 Checklist para cuando se implemente `dev`/`doc` sobre el motor BSIP

Si en el futuro se decide migrar (no decidido en esta sesión), esto es lo que hay que resolver explícitamente antes de tocar código:

- [ ] ¿Qué campo marca el cierre de `.refinement/`/`.curation/`? ¿Se agrega `committed` a `.turn.json`, o se define otro mecanismo?
- [ ] ¿`finalize_intent()` pasa a exigir una precondición de fase terminal, rompiendo el comportamiento actual (finalizar sin turnos)? ¿Se necesita una migración de intents `dev`/`doc` ya existentes en filesystem?
- [ ] ¿Se normaliza el schema de identidad (`uuid`/`type` → `intent_id`/`intent_type`), o se mantiene el puente de `_uid()`/`_itype()` permanentemente?
- [ ] Confirmar si `.refinement/` y `.curation/` deberían tener mirror completo en `.pipeline/` (con `.response/.staging`) como sí tienen `.briefing`/`.execution`/`.context` — hoy no lo tienen, y no está claro si es a propósito.
- [ ] Confirmar si `doc` corre realmente a nivel Nucleus (BTIPS lo dice, el código no lo muestra).
- [ ] Escribir `DEV_Intent_Spec_*.md` / `DOC_Intent_Spec_*.md` formales — hoy no existen, y el patrón del proyecto exige spec antes que registro en `intent_types.py`.

---

---

*Fin de la Parte E · Fuente original: `BLOOM_Intent_Types_Gap_Analysis_v1_0`, agosto 2026.*

---

# PARTE F — BSIP Response & Recovery Protocol (Baseline v0.1)

> Fuente: `SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline_v0_1`, agosto 2026 (la más reciente de
> las seis fuentes fusionadas). Cubre la mitad del ciclo que las Partes A–C no cubren: qué pasa cuando
> una IA de frontera **devuelve** una respuesta a un intent BISP — Contrato D, protección Anti-EOT en
> 3 capas, y recuperación headless sin intervención humana. Ver la nota editorial sobre drift de
> versión de BTIPS al inicio de este documento.
> **Ámbito:** `brain` (bloom-development-extension) + Contrato D + OpenCode.
> **Fuera de ámbito:** investigación de API directa / AITAP (rama separada).

## F.0 Resumen ejecutivo

Este documento consolida el Baseline v0.1 del protocolo BSIP Response: cómo una IA de frontera empaqueta y devuelve modificaciones de código estructuradas (Contrato D), cómo `brain` las aplica a través de OpenCode, cómo se protege ese ciclo contra agotamiento de tokens (EOT — *End of Tokens*), y cómo se recupera de una interrupción sin intervención humana.

Cuatro pilares quedan cerrados en este baseline:

1. **Simulación de protocolo:** `synapse-simulator` (naming final).
2. **Protección Anti-EOT:** protocolo de 3 capas.
3. **Contrato D + OpenCode:** bloque `execution_hint` por operación.
4. **Recuperación headless:** cadena `recover` → `GapEngine` → `continuity`.

Este documento no reabre ninguna de estas decisiones. Donde una definición depende de la rama de investigación AITAP (todavía no iniciada) o quedó explícitamente pendiente durante el research, se marca como **PENDIENTE** en vez de inventarse una resolución — es preferible una spec incompleta pero honesta a una spec completa pero falsa.

---

## F.1 Glosario y Taxonomía Formal

### 1.1 Tabla de términos

| Término | Definición | Estado |
|---|---|---|
| **BTIPS** | Bloom Technical Intent Package System — el marco general de unidades estructuradas de intención técnica (`dev`, `doc`, `ing`, `dis`). Documento base: `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`. | Estable |
| **BSIP / BSIP-Response** | El intent, en su forma empaquetada, enviado a una IA de frontera (`BSIP`) y la respuesta estructurada que esa IA devuelve (`BSIP-Response`), conteniendo operaciones de filesystem sobre el Contrato D. | Baseline v0.1 |
| **Contrato D** | El schema JSON que define la forma de una `BSIP-Response`: `bsip_response_version`, `intent_id`, `turn_id`, `operations[]` (`create`/`edit`/`patch`/`delete`), checksums SHA-256. Ver §F.3. | Baseline v0.1 (extendido en este documento) |
| **`synapse-simulator`** | Simulador/emulador del protocolo de comunicación Synapse (mensajes de onboarding, registro de cuentas y keys, y — a partir de este baseline — turnos de submit/response de BSIP). Vive en la capa de extensión Chrome, schema-driven (`*.schema.json` + `registerHandler`/`applySchemaDefaults` en `background.js`). | Nombre final — ver §F.1.2 |
| **`Harness`** | Reservado **exclusivamente** para el ecosistema global de gestión y gobernanza de Cognituum sobre las conexiones a IAs de frontera. No se aplica a ningún componente de simulación, recuperación, ni a `synapse-simulator`. | Nombre final — ver §F.1.2 |
| **AITAP** | Capa (en diseño, fuera de este documento) que administrará el "grifo" y la telemetría de todas las conexiones a IA, incluyendo llamadas API directas. | **PENDIENTE** — ver nota de tensión en §F.1.2 |
| **Companion (v1.2, Store-Ready)** | Panel lateral de la extensión Chrome, cuarto activo nativo de Cortex (junto a Discovery, Landing, `synapse-simulator`). Webview de Gemini para asistencia humana ("segunda opinión"). Sin acceso directo al contexto de Cortex, activado manualmente por el ingeniero vía botón en Landing, condicionado a handshake Synapse de 3 fases. | Estable — **excluido de este protocolo**, ver §F.1.3 |
| **`GapEngine` / `GapAnalyzer`** | Módulo Python headless, sin UI, que consume `execution_report.json` (ver §F.4.2) y construye el payload de continuidad tras una interrupción por EOT. | Baseline v0.1 (nuevo) |
| **EOT (End of Tokens)** | Agotamiento del presupuesto de tokens de una IA de frontera a mitad de la generación de una `BSIP-Response`, resultando en un Contrato D truncado/inválido si no se detecta. | Baseline v0.1 |
| **Per-Turn Capacity Check** | Evaluación implícita, dentro de la instrucción del turno (no un intent separado), donde la IA de frontera determina en tiempo de ejecución si puede completar el `BSIP-Response` del turno actual sin truncamiento. Ver Capa 2, §F.2.3. | Baseline v0.1 (nuevo) |
| **`intent dev` de continuidad** | Un nuevo intent tipo `dev`, lanzado por `continuity`, que empaqueta únicamente el delta remanente identificado por `GapEngine`, para ejecución en sesión fresca o proveedor secundario. | Baseline v0.1 (nuevo) |

### 1.2 Desambiguación: `synapse-simulator` vs. `Harness`

Durante el research surgió una colisión de nombres real, ya corregida: el simulador de protocolo (JSON-schema-driven, para simular mensajes de onboarding y, en este baseline, turnos de BSIP) se llamó inicialmente "Harness" en dos lugares distintos y no relacionados — un harness Python ad-hoc de investigación (`synapse_harness.zip`, usado solo dentro de la sesión de research para probar `parse → validate → apply` contra un repo de juguete) y el componente real de la extensión Chrome descrito en `ARCHITECTURE_HarnessProtocol.md`.

**Resolución adoptada:** el componente de simulación de protocolo (incluida su futura extensión para turnos de submit/response de BSIP) se llama formalmente **`synapse-simulator`**. El término **`Harness`** queda reservado en exclusiva para la capa global de gestión y gobernanza de Cognituum sobre IAs de frontera — no se usa para ningún otro componente, presente o futuro.

**Tensión no resuelta, marcada explícitamente:** la definición de `Harness` adoptada en este research ("ecosistema global de gestión y gobernanza de Cognituum") es muy cercana, en su descripción textual, a la definición dada de AITAP ("la capa que administrará el grifo y la telemetría de todas las conexiones a IA"). Este documento **no resuelve** si `Harness` y AITAP son la misma capa vista desde dos ángulos, si AITAP es un subcomponente de `Harness` (el "grifo" específicamente), o si hay una tercera colisión de nombres en formación. Se deja como primera pregunta a resolver, explícitamente, al abrir la rama de investigación AITAP — no se asume ninguna de las tres opciones acá.

### 1.3 Desambiguación: `GapEngine` vs. `Companion`

Se evaluó y **descartó** usar Companion (v1.2, Store-Ready Edition) como el módulo de análisis de brecha del flujo de recuperación. Motivo, verificado contra `Cognituum_Companion_Implementation_Guide_v1_2.md`:

- Companion es un panel lateral de navegador que embebe un webview de Gemini, con inyección de texto vía DOM, para dar "una segunda opinión inmediata... sin reemplazar el pipeline de BTIPS ni tener acceso directo al contexto de Cortex".
- Su activación requiere: onboarding manual completo (cuenta Google + API key de Gemini pegada a mano), handshake Synapse de 3 fases confirmado, y accionamiento manual del ingeniero desde un botón en Landing.
- No existe en su especificación ningún mecanismo de disparo automático ante un evento de `brain`, ni un canal para que Companion devuelva un veredicto estructurado de vuelta al pipeline. Es una herramienta de consulta humana, no un agente autónomo.

**Resolución adoptada:** el análisis de brecha automático se implementa en un módulo nuevo y headless, `GapEngine`/`GapAnalyzer`, dentro de `core/intent/` de `brain` — sin relación de código ni de responsabilidad con Companion. La guía v1.2 de Companion se respeta sin modificaciones; Companion permanece disponible como recurso de consulta humana opcional, fuera de este protocolo.

---

## F.2 Arquitectura del Protocolo Anti-EOT (End of Tokens)

### 2.1 Motivación y alcance de la evidencia

El diseño toma como punto de partida el experimento documentado en `Claude Web Context Awareness - Context Limit Preflight Test.md`, con dos salvedades explícitas que condicionan todo el diseño de abajo:

1. El experimento es **una anécdota de una sola interacción, sin verificación de ground truth** (no se comparó la estimación de tokens del modelo contra un conteo real) y sin distinguir si la respuesta `INSUFICIENTE` reflejaba una estimación real de presupuesto de contexto o un reconocimiento genérico de que la tarea pedida era de gran alcance. Por eso el protocolo no depende de una sola capa de auto-reporte del modelo.
2. El experimento evalúa la dificultad de un **corpus ya visible** (input conocido). El problema real de `brain` es distinto y más difícil: estimar el tamaño de una **salida que el modelo todavía no generó** (operaciones, diffs, checksums). Por este motivo, la Capa 2 de este protocolo se trata como señal heurística de mejor esfuerzo, nunca como garantía, y se refuerza obligatoriamente con las Capas 1 y 3.

### 2.2 Capa 1 — Estimación determinística de entrada (lado `brain`)

- **Cuándo corre:** antes de `submit`, inmediatamente después (o como parte) de `brain intent build-payload`.
- **Qué hace:** tokeniza el `payload.json` ya ensamblado con un tokenizer local aproximado y lo compara contra una tabla de ventanas de contexto conocidas por proveedor/modelo, mantenida por `brain` (no preguntada al modelo).
- **Por qué es la capa prioritaria:** es 100% verificable, no depende de que el modelo coopere, y descarta el caso más simple (payload ya excede la ventana) sin gastar ni un token de la IA de frontera.
- **Salida:** veredicto `PASS` / `WARN` / `FAIL` adjunto al ciclo de vida del intent, antes de invocar `submit`.
- **Dependencia PENDIENTE:** la tabla de ventanas de contexto por proveedor/modelo no existe todavía como artefacto de configuración de `brain` — debe crearse (ver §F.5).

### 2.3 Capa 2 — Per-Turn Capacity Check (lado modelo)

- **Cuándo corre:** en tiempo de ejecución de la IA de frontera, como parte de la instrucción del turno actual — **no** como un intent de preflight separado (se descartó explícitamente por generar overhead inaceptable).
- **Qué hace:** la IA evalúa, antes de comenzar a emitir operaciones, si puede completar el `BSIP-Response` completo del turno sin riesgo de truncamiento. Si determina que no puede garantizarlo, emite el mensaje de control (ver §F.2.5) **en vez de empezar a generar operaciones**, no a mitad de generación.
- **Naturaleza de la señal:** heurística de mejor esfuerzo. No hay garantía de que el modelo la emita correctamente en todos los casos ni en todos los proveedores — la consistencia de formato del mensaje es controlable desde `brain`; que el modelo efectivamente la dispare cuando corresponde, no.

### 2.4 Capa 3 — Detección post-hoc de truncamiento (lado `brain`)

- **Cuándo corre:** al recibir la respuesta, dentro de `brain intent parse --strict`.
- **Qué hace:** clasifica cualquier fallo de parseo en una de tres categorías, en vez de tratarlas todas como "violación de protocolo" genérica:
  - `truncation_detected: true` — JSON incompleto, última operación cortada a mitad de un `diff`/`content`, o `operations.length` declarado (si existiera un conteo previo) no coincide con lo recibido.
  - `schema_violation` — JSON válido y completo, pero no cumple Contrato D (tipos incorrectos, campos requeridos faltantes).
  - `malformed_output` — no es JSON parseable en absoluto y no hay indicios de truncamiento (p. ej. el modelo respondió en prosa).
- **Por qué es la capa que no se puede sacrificar:** es la única de las tres 100% determinística del lado de `brain` y funciona incluso si la Capa 2 falló en silencio (el modelo no se dio cuenta de que se estaba quedando sin presupuesto).
- **Salida:** extensión de `.parse_report.json` con los campos `truncation_detected: boolean` y `likely_cause: "EOT" | "malformed_json" | "schema_violation"`.

### 2.5 Schema JSON del mensaje de control

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "bsip-response-control-envelope-v0.1",
  "title": "BSIP-Response — Envelope de Control Anti-EOT — Baseline v0.1",
  "description": "Bloque de control obligatorio, primer elemento del BSIP-Response. Distinto del bloque 'operations' del Contrato D (ver seccion 3), que solo debe estar presente si control_status permite continuar.",
  "type": "object",
  "required": ["bsip_response_version", "control_status"],
  "additionalProperties": true,
  "properties": {
    "bsip_response_version": { "type": "string" },
    "control_status": {
      "type": "string",
      "enum": ["OK", "INSUFFICIENT_CONTEXT_WINDOW", "PARTIAL_COMPLETION"],
      "description": "OK: turno completo, procesar 'operations' normalmente. INSUFFICIENT_CONTEXT_WINDOW: el modelo determino antes de empezar que no puede completar el turno; 'operations' debe estar ausente o vacio. PARTIAL_COMPLETION: uso reservado para cuando la deteccion ocurre a mitad de generacion (ver limitacion de recuperabilidad en Nota NDJSON abajo); 'operations' contiene solo las operaciones completadas."
    },
    "control_detail": {
      "type": "object",
      "required": ["reason"],
      "properties": {
        "reason": { "type": "string", "description": "Explicacion breve, legible, del motivo del control_status." },
        "operations_planned": { "type": "integer", "minimum": 0 },
        "operations_completed": { "type": "integer", "minimum": 0 },
        "resume_strategy_suggested": {
          "type": "string",
          "enum": ["split_turn", "reduce_scope", "chunk_by_file"]
        }
      }
    },
    "operations": {
      "type": "array",
      "description": "Presente solo si control_status es OK o PARTIAL_COMPLETION. Ver Contrato D, seccion 3, para el schema de cada operacion.",
      "items": { "$ref": "bsip-response-contrato-d-v0.1#/$defs/operation" }
    }
  }
}
```

**Nota — decisión abierta, marcada explícitamente como PENDIENTE:** el Contrato D actual (§F.3) es un único blob JSON. Si el modelo se corta a mitad de generación, un JSON incompleto no es parseable ni parcialmente — por lo tanto, `control_status: PARTIAL_COMPLETION` con recuperación real de las operaciones ya completadas **solo es alcanzable si el formato de transporte pasa de un blob único a NDJSON** (una operación por línea, cada una JSON válido independiente). Esta decisión de formato de transporte no fue tomada durante este research y queda pendiente para la fase de implementación. Mientras no se decida, `PARTIAL_COMPLETION` debe tratarse como equivalente a `INSUFFICIENT_CONTEXT_WINDOW` a efectos prácticos (la Capa 3 lo detectará como `truncation_detected: true`, sin operaciones recuperables).

---

## F.3 Especificación del Contrato D + Integración OpenCode

### 3.1 Contrato D — schema base (origen: `bsip_response_contrato_d_v0_1.json`, PoC de investigación)

Este schema es el que se validó y ejecutó contra el harness de simulación original. Se reproduce completo, sin modificaciones, como base sobre la que se aplica la extensión `execution_hint` (§F.3.2):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "bsip-response-contrato-d-v0.1",
  "title": "BSIP-Response — Contrato D (Ejecutar) — borrador v0.1 de simulacion",
  "description": "Reconstruido desde la seccion 2 (borrador) de BSIP_Response_Spec_PoC_Disparo1_v1_0.md, unicamente para correr el harness de Synapse. No representa una decision de schema final por si solo -- ver extension execution_hint en 3.2 y envelope de control en 2.5 para el Baseline v0.1 completo.",
  "type": "object",
  "required": ["bsip_response_version", "intent_id", "turn_id", "operations"],
  "additionalProperties": true,
  "properties": {
    "bsip_response_version": { "type": "string" },
    "intent_id": { "type": "string", "minLength": 1 },
    "turn_id": { "type": "string", "minLength": 1 },
    "operations": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/operation" }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "model": { "type": "string" },
        "channel": { "type": "string", "enum": ["api", "web"] },
        "confidence_or_notes": { "type": "string" }
      }
    }
  },
  "$defs": {
    "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
    "safe_path": {
      "type": "string",
      "pattern": "^(?!/)(?!.*\\.\\.).+$"
    },
    "operation": {
      "type": "object",
      "required": ["op", "path"],
      "properties": {
        "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
        "path": { "$ref": "#/$defs/safe_path" },
        "content": { "type": "string" },
        "diff": { "type": "string" },
        "checksum_before": { "$ref": "#/$defs/sha256" },
        "checksum_after": { "$ref": "#/$defs/sha256" }
      },
      "allOf": [
        {
          "if": { "properties": { "op": { "const": "create" } } },
          "then": { "required": ["content"] }
        },
        {
          "if": { "properties": { "op": { "const": "edit" } } },
          "then": { "required": ["content"] }
        },
        {
          "if": { "properties": { "op": { "const": "patch" } } },
          "then": { "required": ["diff"] }
        },
        {
          "if": { "properties": { "op": { "const": "delete" } } },
          "then": {}
        }
      ]
    }
  }
}
```

### 3.2 Extensión Baseline v0.1 — bloque `execution_hint`

**Motivación:** en el harness de simulación original, el mapeo de `op` a herramienta concreta de OpenCode (`patch` vs. `write` vs. `bash`) y sus flags de aplicación estaban **hardcodeados en el adapter** (`opencode_adapter_mock.py`), no en el contrato. Esto significaba que OpenCode no podía tomar decisiones informadas por operación, y no existía ningún mecanismo de auto-verificación tras aplicar un cambio. El Baseline v0.1 mueve esa decisión al propio Contrato D:

```json
{
  "$defs": {
    "execution_hint": {
      "type": "object",
      "description": "Metadatos por operacion para que OpenCode sepa exactamente como procesar, validar e implementar la modificacion sin ambiguedad ni heuristica local.",
      "required": ["tool"],
      "properties": {
        "tool": {
          "type": "string",
          "enum": ["patch", "write", "bash"],
          "description": "Herramienta concreta de OpenCode a invocar para aplicar esta operacion."
        },
        "apply_flags": {
          "type": "string",
          "description": "Flags exactos a pasar a la herramienta (ej. '-p0' para patch)."
        },
        "verify_command": {
          "type": "string",
          "description": "Comando de verificacion local que OpenCode debe ejecutar inmediatamente despues de aplicar la operacion, antes de darla por cerrada (ej. 'pytest tests/test_formatting.py')."
        },
        "on_conflict": {
          "type": "string",
          "enum": ["abort", "retry_full_rewrite"],
          "description": "abort: detener el turno y reportar fallo si la aplicacion o la verificacion fallan. retry_full_rewrite: reintentar la operacion usando 'content' completo (si esta disponible) en vez de 'diff', como fallback ante fallo de aplicacion del diff."
        }
      }
    }
  }
}
```

**Integración:** `execution_hint` se agrega como propiedad opcional dentro de `#/$defs/operation` del Contrato D (§F.3.1). Operación combinada de ejemplo:

```json
{
  "op": "patch",
  "path": "src/utils/formatting.py",
  "diff": "--- a/src/utils/formatting.py\n+++ b/src/utils/formatting.py\n@@ ...",
  "checksum_before": "fa36c17620fe5c53c1f6ddbf14930f56ec77bca68e6b8d26f528648f2a8bbb20",
  "checksum_after": "c535ce19040e2493c0d23bb2f373909f08130dbeab8b003e28b6f4febb9c5f66",
  "execution_hint": {
    "tool": "patch",
    "apply_flags": "-p0",
    "verify_command": "pytest tests/test_formatting.py",
    "on_conflict": "abort"
  }
}
```

### 3.3 Loop de auto-verificación de OpenCode

Secuencia obligatoria por operación, a ejecutar por OpenCode en orden:

1. Leer `checksum_before` (si está presente) y verificar contra el archivo real en disco antes de tocar nada. Si no coincide, tratar como conflicto de drift — no aplicar, comportarse según `on_conflict`.
2. Aplicar la operación usando exactamente `execution_hint.tool` + `execution_hint.apply_flags`. No sustituir por heurística local del adapter (esto es lo que corrige respecto del PoC original).
3. Ejecutar `execution_hint.verify_command`, si está presente.
   - Si el comando sale con código 0 → operación confirmada, continuar con la siguiente.
   - Si sale con código distinto de 0 → seguir `on_conflict`:
     - `abort`: detener el turno completo, reportar el fallo con el comando ejecutado y su salida.
     - `retry_full_rewrite`: si la operación tiene `content` disponible (además de `diff`), reintentar usando `content` completo en vez de `diff`, y volver a correr `verify_command` una sola vez más antes de abortar.
4. Confirmar `checksum_after` contra el archivo resultante en disco. Discrepancia aquí, incluso con `verify_command` exitoso, se reporta como advertencia (no aborta el turno, pero se registra en `execution_report.json`, ver §F.4.2).

---

## F.4 Cadena de Responsabilidad de Recuperación (Headless Recovery Flow)

### 4.1 Diagrama de flujo en secuencia textual

```
[Turno N en ejecución]
        │
        ▼
¿La IA de frontera completó el BSIP-Response del turno sin control_status
de alerta, y brain intent parse --strict no detectó truncamiento?
        │
   ┌────┴─────┐
  SÍ           NO  (control_status = INSUFFICIENT_CONTEXT_WINDOW, o
   │               truncation_detected = true en Capa 3)
   ▼                          │
[stage → merge]               ▼
[Turno completo]     [brain intent recover]
                      Capa de Infraestructura:
                        - Libera candados del intent interrumpido
                        - Persiste el estado exacto en execution_report.json
                          (operaciones aplicadas + checksums + delta pendiente)
                                  │
                                  ▼
                      [GapEngine / GapAnalyzer]
                      Módulo headless en core/intent/:
                        - Lee execution_report.json directamente (sin UI)
                        - Determina exactamente qué operaciones del turno
                          interrumpido quedaron sin aplicar
                        - Construye el payload de continuidad conteniendo
                          únicamente ese delta remanente
                                  │
                                  ▼
                      [continuity]
                        - Dispara un nuevo intent tipo 'dev'
                        - Carga el payload construido por GapEngine
                        - Ejecuta en sesión fresca (mismo proveedor u otro,
                          según decisión de canal — ver nota de dependencia
                          con AITAP, PENDIENTE)
```

### 4.2 Especificación del artefacto `execution_report.json`

**Nota de reconciliación de nombres, marcada explícitamente:** el árbol canónico de artefactos de pipeline (`bloom_project_tree.txt`) documenta, dentro de cada `.pipeline/.{fase}/.response/`, los archivos `.raw_output.txt` y `.report.json` — no un archivo llamado literalmente `execution_report.json`. Este documento **no decide** si `execution_report.json` es (a) un nombre nuevo para el artefacto ya existente `.report.json`, extendido con los campos de abajo, o (b) un archivo hermano nuevo dentro de la misma carpeta `.response/`. Se deja como decisión de implementación pendiente, y se especifican a continuación los campos obligatorios que el artefacto — cualquiera sea su nombre final — debe contener para que `GapEngine` pueda operar sin ambigüedad.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "execution-report-v0.1",
  "title": "Execution Report — artefacto de estado para GapEngine — Baseline v0.1",
  "type": "object",
  "required": [
    "intent_id",
    "turn_id",
    "provider",
    "channel",
    "operations_applied",
    "operations_pending",
    "control_status_received"
  ],
  "properties": {
    "intent_id": { "type": "string" },
    "turn_id": { "type": "string" },
    "provider": { "type": "string", "description": "Identificador del proveedor de IA que generó el turno (ej. 'claude', 'gemini')." },
    "channel": { "type": "string", "enum": ["api", "web"], "description": "Canal por el que se envió el turno interrumpido." },
    "control_status_received": {
      "type": "string",
      "enum": ["INSUFFICIENT_CONTEXT_WINDOW", "PARTIAL_COMPLETION", "TRUNCATED_UNDETECTED"],
      "description": "TRUNCATED_UNDETECTED: el modelo no emitio control_status, la interrupcion se infirio via Capa 3 (parse --strict)."
    },
    "operations_applied": {
      "type": "array",
      "description": "Operaciones del Contrato D que se aplicaron y verificaron con exito antes de la interrupcion.",
      "items": {
        "type": "object",
        "required": ["op", "path", "checksum_before", "checksum_after"],
        "properties": {
          "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
          "path": { "type": "string" },
          "checksum_before": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "checksum_after": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "verify_command_result": { "type": "string", "enum": ["passed", "failed", "not_run"] }
        }
      }
    },
    "operations_pending": {
      "type": "array",
      "description": "Delta remanente: operaciones que el BSIP-Response original planeaba (si se conoce el conteo) o infería necesarias, y que no llegaron a aplicarse.",
      "items": {
        "type": "object",
        "required": ["path"],
        "properties": {
          "op": { "type": "string", "enum": ["create", "edit", "patch", "delete"] },
          "path": { "type": "string" },
          "known_intent": { "type": "string", "description": "Descripcion, si esta disponible, de que se esperaba que hiciera esta operacion pendiente." }
        }
      }
    },
    "timestamp": { "type": "string", "format": "date-time" }
  }
}
```

### 4.3 Comportamiento de `GapEngine` — sin UI ni intervención humana

1. Se invoca automáticamente al finalizar `brain intent recover` sobre un intent marcado como interrumpido (no requiere invocación manual del ingeniero).
2. Lee el artefacto de estado (§F.4.2) directamente del filesystem del intent — no pasa por ningún canal de navegador, webview, ni requiere handshake Synapse.
3. Valida que `operations_pending` sea no vacío; si está vacío pero `control_status_received` indica interrupción, registra una advertencia (posible inconsistencia entre lo reportado por el modelo y lo verificado por `parse --strict`) pero no bloquea.
4. Construye un `payload.json` nuevo, con el mismo formato que consume `brain intent build-payload`, conteniendo únicamente el contexto necesario para resolver `operations_pending` — no reenvía el intent original completo.
5. Entrega ese payload a `continuity`, que lo empaqueta como un nuevo `intent dev` y lo deja listo para `submit`.

---

## F.5 Mapeo de Impacto en Archivos de `brain`

Basado en la estructura real relevada en `brain_tree.txt`. Se marca cada archivo como **NUEVO** o **MODIFICADO**, y se referencia la sección de este documento que lo justifica.

### 5.1 `core/intent/` (lógica de negocio)

| Archivo | Estado | Justificación |
|---|---|---|
| `core/intent/gap_engine.py` | **NUEVO** | Implementa `GapEngine`/`GapAnalyzer` (§F.4.3). Mismo nivel de responsabilidad que `merge_manager.py`, `recovery_manager.py`, `response_parser.py`, `staging_manager.py`, `validation_manager.py` ya existentes en este directorio. |
| `core/intent/recovery_manager.py` | **MODIFICADO** | Debe persistir el artefacto `execution_report.json` (o extender `.report.json`, según se resuelva la nota de §F.4.2) con los campos de la §F.4.2, y disparar `gap_engine.py` al finalizar la liberación de candados. |
| `core/intent/response_parser.py` | **MODIFICADO** | Debe reconocer y validar el envelope de control (§F.2.5) como primer bloque del `BSIP-Response`, antes de intentar parsear `operations`. Debe implementar la clasificación de fallos de la Capa 3 (`truncation_detected`, `likely_cause`). |
| `core/intent/staging_manager.py` | **MODIFICADO** | Debe ejecutar el loop de auto-verificación de OpenCode (§F.3.3) por operación, incluyendo lectura de `execution_hint` y manejo de `on_conflict`. |
| `core/intent_manager.py` | **MODIFICADO — bloqueante** | `_create_directory_structure()` no crea `.response/.staging/` bajo `.pipeline/.refinement/.turn_X/` (confirmado contra el árbol canónico `bloom_project_tree.txt`, que sí documenta esa carpeta de forma simétrica a `.briefing/` y `.execution/`). Esto **bloquea** el flujo de recuperación para interrupciones que ocurren durante una fase de `.refinement/` (turnos 2+ de un mismo intent) — es un prerequisito, no una mejora opcional, y debe corregirse antes de que `GapEngine` pueda operar sobre intents interrumpidos en refinamiento. |

### 5.2 `core/context_planning/` (Capa 1 del protocolo Anti-EOT)

| Archivo | Estado | Justificación |
|---|---|---|
| `core/context_planning/payload_builder.py` | **MODIFICADO** | Debe incorporar la estimación determinística de tokens de entrada (§F.2.2) antes de finalizar el `payload.json`. |
| `core/context_planning/provider_windows.json` (o similar, config nueva) | **NUEVO** | Tabla de ventanas de contexto conocidas por proveedor/modelo, consumida por `payload_builder.py`. No existe hoy como artefacto de configuración. |
| `core/context_planning/gemini_router.py` | **MODIFICADO (posible)** | Evaluar si la curación de contexto que ya realiza (previa a `build-payload`) debe recibir el resultado del veredicto de Capa 1 para reducir alcance automáticamente ante un `WARN`/`FAIL`. |

### 5.3 `commands/intent/` (capa CLI)

| Archivo | Estado | Justificación |
|---|---|---|
| `commands/intent/recover.py` | **MODIFICADO** | Exponer el disparo de `GapEngine` como parte del flujo de `recover`, y/o un flag explícito si se decide que no sea automático incondicionalmente. |
| `commands/intent/continuity.py` | **NUEVO** | No existe como comando hoy (`brain intent list` no lo menciona). Implementa el tercer eslabón de la cadena (§F.4.1): recibe el payload de `GapEngine` y dispara el nuevo `intent dev`. |
| `commands/intent/parse.py` | **MODIFICADO** | Exponer los nuevos campos de `.parse_report.json` (`truncation_detected`, `likely_cause`) generados por la Capa 3, ya soportado en parte por el flag `--output-report` existente. |
| `commands/intent/build_payload.py` | **MODIFICADO** | Exponer verificación de Capa 1 como parte del comando, con salida clara de `PASS`/`WARN`/`FAIL`. |

### 5.4 Schema (`synapse-simulator` / Contrato D)

| Archivo | Estado | Justificación |
|---|---|---|
| `bsip_response_contrato_d_v0_2.json` (o nombre equivalente versionado) | **NUEVO** | Combina el Contrato D base (§F.3.1) con `execution_hint` (§F.3.2) y el envelope de control (§F.2.5) en un único schema formal versionado, reemplazando al borrador `v0_1` usado solo para el harness de investigación. |
| Entrada nueva en el schema de `synapse-simulator` para turnos de submit/response de BSIP | **NUEVO** | Fuera del alcance de código de `brain` — vive en la capa de extensión Chrome. Necesaria para que `synapse-simulator` pueda simular el ciclo completo, incluyendo el envelope de control. No se detalla su implementación en este documento (pertenece a la investigación de `synapse-simulator`, no reabierta acá). |

---

## F.6 Estado de cierre

Baseline v0.1 formalmente concluido para los cuatro pilares descritos en §F.0. Las dependencias marcadas explícitamente como **PENDIENTE** en este documento (tabla de ventanas de contexto por proveedor, decisión NDJSON vs. blob único, nombre final de `execution_report.json`, y la tensión de taxonomía `Harness`/AITAP) no bloquean el inicio de la implementación de los componentes que no dependen de ellas, pero deben resolverse antes de dar por cerrados los puntos correspondientes de §F.2.5, §F.4.2 y §F.5.4.

---

*BLOOM — BISP: Documento Único de Referencia · v2.0 · Septiembre 2026*
*Fusiona, sin alterar decisiones: `BLOOM_BISP_Session_Decisions_v1_2` (Parte A), `ING_Intent_Spec_v1_1`
(Parte B), `DIS_Intent_Spec_v1_0` (Parte C), `BLOOM_BISP_Companion_Integration_v2_0` (Parte D),
`BLOOM_Intent_Types_Gap_Analysis_v1_0` (Parte E) y `SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline_v0_1`
(Parte F). `BLOOM_BISP_Session_Decisions_v1_1.md` queda retirado de la carpeta: su contenido íntegro vive
en la Parte A desde la primera consolidación. Los tipos de intent dentro de `TYPES/` quedan fuera de esta
fusión hasta la próxima sesión de revisión.*
