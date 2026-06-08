# BTIPS · GENES
## El ADN del Mandate — Especificación Conceptual v2.0

> *"Un gen es la memoria viva de lo que un mandate necesita para existir en el código."*

---

## Tabla de Contenidos

1. [Contexto y Problema](#1-contexto-y-problema)
2. [La Hipótesis Central](#2-la-hipótesis-central)
3. [Definición: ¿Qué es un Gen?](#3-definición-qué-es-un-gen)
4. [La Relación Mandate → Genes](#4-la-relación-mandate--genes)
5. [Herencia de Mandates](#5-herencia-de-mandates)
6. [Estructura en el Pipeline](#6-estructura-en-el-pipeline)
7. [Dinámica: Cómo Vive un Gen](#7-dinámica-cómo-vive-un-gen)
8. [El Punto de Inserción Natural: `merge`](#8-el-punto-de-inserción-natural-merge)
9. [Vectorización: Qué, Por Qué y Solo Eso](#9-vectorización-qué-por-qué-y-solo-eso)
10. [Conexión con BISP](#10-conexión-con-bisp)
11. [Gen Huérfano](#11-gen-huérfano)
12. [Lo que los Genes Resuelven](#12-lo-que-los-genes-resuelven)
13. [Separación de Responsabilidades (Definitiva)](#13-separación-de-responsabilidades-definitiva)
14. [Integración con el Ecosistema BTIPS](#14-integración-con-el-ecosistema-btips)
15. [Próximos Pasos](#15-próximos-pasos)

---

## 1. Contexto y Problema

El ecosistema BTIPS opera sobre tres capas que deben mantenerse alineadas:

| Capa | Qué representa | Dónde vive |
|---|---|---|
| **Governance** | Mandates, reglas, políticas | `.nucleus/` |
| **Intención** | Intents dev/doc, planes, contexto | `.intents/` |
| **Realidad** | Archivos de código, filesystem | `.project/tree.bl` |

Existe una grieta estructural entre estas capas: **la capa de realidad no tiene un vínculo dinámico con la capa de governance**. El `tree.bl` guarda todo el universo de archivos. La documentación de continuidad intenta capturar qué archivos usa cada módulo. Pero ese registro es estático, se desactualiza, y obliga a reconstruir el contexto cada vez que se retoma un mandate.

**El resultado**: desinformación acumulada, documentación desalineada del código, y un overhead cognitivo creciente que amenaza la sostenibilidad del sistema a escala.

---

## 2. La Hipótesis Central

> Un mandate es una acción vinculante que define que un conjunto de funcionalidades va a necesitar de un árbol de archivos — no todos los archivos, solo un conjunto finito, concreto y relacionado entre sí para cumplir una función.

Si podemos capturar ese conjunto de manera dinámica y vincularlo directamente al mandate, eliminamos la necesidad de que la documentación de continuidad lleve ese peso. La documentación vuelve a hacer lo que mejor hace: describir intención y decisiones. El gen lleva el registro de la realidad del filesystem.

---

## 3. Definición: ¿Qué es un Gen?

Un **Gen** es la proyección viva de un mandate sobre el filesystem real.

No es una lista de archivos escrita a mano. No es documentación. Es una **entidad funcional con identidad propia** que representa exactamente qué archivos forman el cuerpo operativo de un mandate en cada momento del tiempo.

### Tres propiedades fundamentales

**Scope**
El conjunto preciso de archivos que componen el gen en este momento. No el árbol completo del proyecto. Solo los archivos que trabajan en conjunto para cumplir la función que el mandate define. La precisión del scope es lo que lo diferencia de cualquier otra forma de indexación.

**Linaje**
Cada cambio en el scope queda registrado como un delta. El gen no reemplaza su estado anterior: lo acumula. El linaje permite saber cómo creció el gen, qué archivos se incorporaron, cuáles se eliminaron, y en qué momento del ciclo de vida del mandate ocurrió cada cambio. El origen de cada delta es siempre un intent concreto — no una edición manual, no una suposición.

**Función**
El gen lleva consigo una descripción semántica de para qué existe ese conjunto de archivos. No es solo una ruta de directorio. Es la razón funcional por la que esos archivos coexisten bajo un mismo mandate. Esta función es el único campo del gen que entra a vectorización.

---

## 4. La Relación Mandate → Genes

Un mandate puede tener **múltiples genes**. Cada gen cumple una función intrínseca distinta dentro del mandate, pero todos le pertenecen.

```
Mandate: "Sistema de Pagos"
├── Gen A: procesamiento y validación de transacciones (backend)
├── Gen B: interfaz de checkout y estados de error (frontend)
└── Gen C: webhooks y configuración de providers (infraestructura)
```

Cada gen es independiente en su scope pero comparte el mandate como origen. Esto provee granularidad: al retomar el mandate, se puede invocar solo el gen relevante para el intent en curso, sin cargar el contexto completo de todos los archivos del mandate.

---

## 5. Herencia de Mandates

Un mandate no siempre nace desde cero. La realidad del desarrollo es que los mandates se retoman, se extienden, y se construyen unos sobre otros. La herencia formaliza esto.

### Definición

Un **mandate hijo** puede declarar uno o más **mandates padre**. Al hacerlo, hereda automáticamente los genes de esos padres como punto de partida. No los copia: los **referencia**. Esa distinción es crítica.

```
Mandate Padre A: "Autenticación Base"
└── Gen A1: sesiones y tokens
└── Gen A2: middleware de rutas protegidas

Mandate Padre B: "Gestión de Usuarios"
└── Gen B1: perfil y preferencias
└── Gen B2: roles y permisos

Mandate Hijo C: "Panel de Administración"
├── hereda ref → Gen A1 (sesiones y tokens)
├── hereda ref → Gen B2 (roles y permisos)
└── Gen C1: interfaz de administración (nuevo, propio)
```

### Por qué referencias y no copias

Si un gen del padre evoluciona — porque un intent posterior modifica su scope —, el hijo ve ese cambio automáticamente. No hay sincronización manual. No hay versiones divergentes del mismo gen viviendo en lugares distintos.

### Potencial acumulativo

Con el tiempo, los mandates más maduros acumulan genes ricos y precisos. Cada mandate hijo que hereda de ellos arranca con un contexto mucho más completo que cualquier intent podría construir desde cero. **La madurez del sistema se acumula en los genes.**

### El problema de autoridad en herencia múltiple

Cuando un mandate hijo hereda genes de dos padres y esos genes tienen **archivos en común**, aparece una pregunta de autoridad: ¿quién define el estado canónico de ese archivo?

La respuesta es: **el mandate hijo tiene autoridad sobre los archivos que sus propios intents tocan**. Los genes heredados son de solo lectura hasta que el hijo los extiende con un delta propio. En ese momento, el gen del hijo diverge del padre y el sistema registra la bifurcación en el linaje. El padre no se ve afectado.

Esto debe resolverse por diseño antes de la implementación, no después.

### Estructura de herencia en `mandate.json`

```json
{
  "mandate_id": "uuid-hijo",
  "name": "Panel de Administración",
  "parent_mandates": [
    {
      "mandate_id": "uuid-padre-A",
      "inherited_genes": ["gen-id-A1"],
      "inheritance_mode": "read_reference"
    },
    {
      "mandate_id": "uuid-padre-B",
      "inherited_genes": ["gen-id-B2"],
      "inheritance_mode": "read_reference"
    }
  ],
  "own_genes": ["gen-id-C1"]
}
```

`inheritance_mode` puede ser `read_reference` (el gen del padre se usa pero no se modifica) o `fork` (el hijo crea su propia copia del gen y diverge intencionalmente).

---

## 6. Estructura en el Pipeline

Los genes viven dentro del mandate, en `.mandates/`. No en la documentación de continuidad. No en el tree. En el mandate mismo, porque son parte de su identidad.

```
.mandates/
└── .{mandate-id-uuid}/
    ├── mandate.json            ← incluye parent_mandates y own_genes
    ├── mandate_state.json
    └── .genes/
        └── .{gen-id-uuid}/
            ├── gen.json            ← identidad, función semántica, embedding_ref
            ├── gen_state.json      ← scope vivo: archivos actuales con hashes
            └── .history/
                └── .delta_{N}/
                    ├── delta.json      ← qué cambió, cuándo, bajo qué intent
                    └── snapshot.json   ← estado completo del scope en ese momento
```

### Contenido de `gen.json`

```json
{
  "gen_id": "uuid",
  "mandate_id": "uuid",
  "name": "nombre-descriptivo-del-gen",
  "function": "descripción semántica de la función que cumple este conjunto de archivos",
  "created_at": "timestamp",
  "created_by_intent": "intent-id-uuid",
  "status": "active | dormant | orphan | forked",
  "forked_from": null,
  "embedding_ref": "chroma://nucleus-org/genes/{gen-id}/function"
}
```

El campo `embedding_ref` apunta al vector de la función en ChromaDB. Es el único campo del gen que tiene representación semántica. Todo lo demás es estructura JSON pura.

### Contenido de `gen_state.json`

```json
{
  "gen_id": "uuid",
  "scope": [
    {
      "path": "ruta/relativa/al/archivo.ext",
      "md5": "hash",
      "last_seen_in_intent": "intent-id-uuid",
      "added_at": "timestamp"
    }
  ],
  "last_updated": "timestamp",
  "delta_count": 3
}
```

### Contenido de `delta.json`

```json
{
  "delta_index": 3,
  "intent_id": "uuid",
  "timestamp": "timestamp",
  "trigger": "merge | reconciliation | fork",
  "changes": {
    "added": ["ruta/nuevo/archivo.ext"],
    "modified": ["ruta/archivo/modificado.ext"],
    "removed": []
  },
  "reason": "descripción del por qué estos archivos cambiaron en este intent"
}
```

El campo `trigger` registra si el delta fue generado por un `merge` de intent, por una reconciliación con el tree, o por una bifurcación de herencia.

---

## 7. Dinámica: Cómo Vive un Gen

### Nacimiento
Un gen nace cuando un intent ejecutado bajo un mandate llega al paso `merge` y aplica archivos al disco. El `MergeManager` ya conoce exactamente qué archivos fueron escritos. Con esa información, el sistema propone la creación del gen con los archivos involucrados y una función inferida del objetivo del intent. El usuario confirma o ajusta la función semántica.

### Crecimiento
Con cada intent subsiguiente bajo el mismo mandate que alcanza `merge`:
1. Se coteja el scope actual del gen contra los archivos que el merge aplicó.
2. Los archivos ya en el scope con hash distinto → **delta de modificación**.
3. Los archivos nuevos que pertenecen funcionalmente al gen → **extensión del scope**.
4. Si los archivos nuevos no encajan en ningún gen existente → **propuesta de gen nuevo**.

### Reconciliación con el Tree
Cuando el `tree.bl` se actualiza:
- El sistema corre una reconciliación entre el tree y todos los `gen_state.json` activos.
- Archivos eliminados del tree que estaban en un scope → delta automático de remoción.
- Archivos nuevos en el tree → evaluación semántica contra genes existentes via ChromaDB.

### Invocación
Cuando se crea un nuevo intent bajo un mandate que ya tiene genes, el sistema carga los `gen_state.json` relevantes como punto de partida del contexto. El intent hereda el scope del gen. No hay redescubrimiento. No hay reconstrucción manual del contexto.

---

## 8. El Punto de Inserción Natural: `merge`

Este es uno de los hallazgos más concretos de esta especificación.

El pipeline de brain tiene 12 pasos. El gen no necesita participar en todos. El momento exacto en que un gen debe actualizarse es **después del `merge`**, porque:

- El `MergeManager` ya ejecutó la escritura al disco.
- Ya sabe exactamente qué archivos fueron aplicados, cuáles fueron creados, cuáles modificados.
- El intent está en estado `finalized` o a punto de estarlo.
- Los hashes reales del filesystem están disponibles en ese momento.

No hay mejor fuente de verdad que el `MergeManager` post-ejecución. Cualquier otro punto del pipeline trabaja con estimaciones o planes. El `merge` trabaja con la realidad.

```
brain intent pipeline
    │
    ├── create → hydrate → plan → build-payload → lock → submit
    │
    ├── download → parse → stage → validate
    │
    ├── merge  ← AQUÍ el gen se actualiza
    │       └── MergeManager conoce archivos escritos → delta al gen
    │
    └── finalize → unlock
```

El gap G2 identificado en `brain_intent_state.md` — BISP desconectado del pipeline principal — se resuelve en el mismo punto. El `merge` es el lugar donde tanto el gen como BISP deben conectarse automáticamente.

---

## 9. Vectorización: Qué, Por Qué y Solo Eso

### Qué se vectoriza

**Solo el campo `function` del `gen.json`.**

Nada más. Las relaciones de herencia son JSON estructural. El scope es JSON estructural. El linaje de deltas es JSON estructural. Las relaciones exactas no se buscan por similitud, se consultan por identidad. Vectorizar relaciones estructurales agrega complejidad sin beneficio y puede introducir ruido peligroso en un sistema de governance.

### Por qué se vectoriza la función

La función del gen es el único campo que tiene una consulta semántica legítima:

> "¿Qué genes ya existen en el sistema que cubren funcionalidad similar a lo que estoy por construir?"

Esta consulta es la base de dos capacidades fundamentales:

1. **Herencia sugerida automáticamente**: antes de que un usuario declare herencia manualmente, el sistema puede sugerir "el gen X del mandate Y tiene una función similar a la que estás definiendo". Eso convierte la herencia de un acto manual en un acto asistido.

2. **Detección de duplicación**: si dos genes en mandates distintos tienen funciones con similitud coseno muy alta, el sistema puede alertar que podrían estar cubriendo el mismo territorio funcional, previniendo fragmentación silenciosa.

### Dónde vive el vector

En la colección de genes de ChromaDB, dentro del nucleus:

```
.bloom/.nucleus-{org}/.cache/chroma/
└── {nucleus-genes}/          ← colección dedicada a genes
    └── {gen-id}/function     ← un embedding por gen
```

Es una colección separada de la colección de intents. Los genes son entidades de governance, no artefactos de trabajo. Mezclar sus vectores contaminaría las consultas semánticas de intents.

### Stack técnico

Consistente con BISP: `ollama/nomic-embed-text` local. Costo cero en tokens. Soberanía total del conocimiento en el nucleus.

---

## 10. Conexión con BISP

Los genes y el BISP no son sistemas paralelos. Son **capas complementarias del mismo pipeline**.

### La conexión en el `merge`

```
brain intent merge
    │
    ├── MergeManager aplica archivos al disco
    │
    ├── [BISP] vectoriza payload e index.json en ChromaDB (intents collection)
    │       → habilita: brain bisp semantic similar
    │
    └── [GENES] actualiza gen_state.json con los archivos aplicados
            → genera delta con intent_id como origen
            → si función nueva: vectoriza en genes collection
```

Ambos se disparan en el mismo evento. Ambos usan la misma infraestructura (Ollama + ChromaDB). Pero escriben en colecciones distintas y sirven propósitos distintos.

### La conexión en el `plan`

El BISP en Fase 3 del roadmap usa ChromaDB para rankear archivos semánticamente en el `context_plan`. Los genes extienden esto: cuando el `plan` se ejecuta bajo un mandate con genes activos, el scope del gen es el universo de archivos candidatos para el ranking semántico.

En lugar de rankear contra todos los archivos del proyecto, el plan rankea contra **el scope del gen**. Esto reduce el ruido semántico, respeta el token budget con mayor precisión, y le da al modelo exactamente los archivos que son relevantes para la función del mandate.

```
brain intent plan (con genes activos)
    │
    ├── carga gen_state.json del mandate
    ├── scope del gen → universo de archivos candidatos
    ├── Ollama genera embedding del objetivo del intent
    ├── ChromaDB rankea dentro del scope del gen
    └── context_dev_plan.json generado con ranking semántico acotado
```

### La conexión en el Marketplace

Cada BISP que viaja en un Mandate package lleva sus embeddings de intents. Con genes, el package también lleva el `gen_state.json` y el `gen.json` de cada gen propio del mandate. El consumer del marketplace no solo ve qué hace el mandate: puede ver sobre qué base funcional está construido y qué archivos necesitará en su propio codebase.

---

## 11. Gen Huérfano

Un gen entra en estado `orphan` cuando:

- Su mandate fue cerrado o archivado, pero sus archivos siguen siendo modificados en el proyecto.
- Sus archivos fueron absorbidos por otro mandate sin que el gen original haya sido actualizado.
- Un mandate padre fue archivado y el hijo no declaró explícitamente `fork` sobre los genes heredados.

Un gen huérfano es una señal de alerta de primer nivel: hay código vivo que perdió su mandate de origen. Detectar genes huérfanos es detectar deuda técnica antes de que se acumule en silencio.

El sistema debe surfacear genes huérfanos en el `health-dashboard.json` del nucleus, no dejarlos enterrados en el filesystem.

---

## 12. Lo que los Genes Resuelven

| Problema anterior | Con Genes |
|---|---|
| Reconstruir contexto de archivos cada vez que se retoma un mandate | El gen tiene el scope actualizado, se invoca directamente |
| La documentación de continuidad carga con la lista de archivos | Los genes llevan ese peso; la doc vuelve a ser solo intención |
| No hay trazabilidad de qué archivos cambiaron bajo qué mandate | El linaje de deltas registra cada cambio con su intent de origen |
| Un intent nuevo bajo un mandate existente empieza desde cero | El intent hereda el scope del gen correspondiente |
| Deuda técnica invisible (código sin dueño) | Genes huérfanos la hacen visible antes de que se acumule |
| Mandates que se repiten re-descubren el mismo contexto | La herencia propaga genes entre mandates sin costo |
| El plan rankea contra todo el proyecto | El plan rankea solo dentro del scope del gen — menos ruido, mejor resultado |
| El BISP vectoriza pero el gen no tiene conciencia del filesystem | El merge conecta ambos en el mismo evento |

---

## 13. Separación de Responsabilidades (Definitiva)

Esta es la distinción más importante que los genes establecen:

> **La documentación de continuidad describe intención y decisiones.**
> **Los genes describen la realidad del filesystem.**
> **BISP describe el conocimiento semántico de los intents.**

Tres capas distintas. Tres responsabilidades distintas. Mezclarlas es lo que genera la desinformación acumulada. Separarlas es lo que hace el sistema sostenible a escala.

---

## 14. Integración con el Ecosistema BTIPS

```
NUCLEUS
└── Mandate
    ├── parent_mandates → genes heredados (read_reference | fork)
    └── own_genes
        └── Gen (scope + linaje + función)
                 │
                 ├── alimenta ──→ Intent Plan (scope como universo candidato)
                 │
                 ├── se actualiza desde ──→ MergeManager (post-merge)
                 │
                 ├── se reconcilia con ──→ .project/tree.bl
                 │
                 ├── función vectorizada en ──→ ChromaDB (genes collection)
                 │
                 └── expone ──→ health-dashboard.json (genes huérfanos, deltas)

PROJECT
└── Intent
    ├── hereda scope de ──→ Gen activo del mandate
    ├── genera delta en ──→ Gen (via MergeManager post-merge)
    └── vectoriza payload en ──→ ChromaDB (intents collection, via BISP)
```

---

## 15. Próximos Pasos

### Conceptuales (antes de tocar código)

1. **Definir el protocolo de autoridad en herencia múltiple**: cuándo un archivo en conflicto entre dos genes heredados dispara un fork automático vs. una alerta manual.
2. **Definir el ciclo de vida del gen en herencia**: qué pasa con los genes heredados cuando el mandate padre se archiva o se extiende.
3. **Definir el threshold de similitud para sugerencia de herencia**: a qué score de similitud entre funciones el sistema propone una herencia vs. solo informa.

### Estructurales (cuando los pipelines se actualicen)

4. **Actualizar `bloom_nucleus_tree.txt`**: incorporar `.genes/` dentro de `.mandates/`, y la colección `{nucleus-genes}` en `.cache/chroma/`.
5. **Actualizar `bloom_project_tree.txt`**: incorporar referencia a `gene_id` activo en el contexto de intents dev, visible en el `briefing.json`.

### De implementación (cuando brain esté listo)

6. **Hook post-merge en brain**: el `MergeManager` dispara actualización del gen y vectorización BISP en el mismo evento.
7. **Comando `brain gene`**: CLI para listar genes de un mandate, ver su scope, ver su linaje, y gestionar herencia.
8. **Reconciliación automática con tree.bl**: cuándo se dispara, quién la ejecuta, cómo se resuelven ambigüedades.
9. **Surfacing de genes huérfanos en health-dashboard**: alerta visible, no enterrada.

---

## Decisiones Pendientes

Estas decisiones deben tomarse antes de la implementación, no durante:

| Decisión | Opciones | Consideración |
|---|---|---|
| Threshold de similitud para sugerencia de herencia | 0.75 / 0.80 / 0.85 | Alto para evitar falsas sugerencias de herencia |
| Autoridad en conflicto de herencia múltiple | Fork automático / Alerta manual | Manual es más seguro en governance |
| Frecuencia de reconciliación con tree.bl | Post-merge / Post-finalize / Scheduled | Post-merge es el momento más preciso |
| Colección ChromaDB de genes | Por nucleus / Por mandate | Por nucleus permite cross-mandate lookup |
| Exportación de genes en Mandate package | Solo gen.json / gen.json + gen_state.json | gen_state incluye scope: más útil para el consumer |

---

*BTIPS Research — Genes v2.0*
*Incorpora: herencia de mandates, vectorización precisa, conexión con BISP, punto de inserción via merge.*
*Fuente de verdad para toda implementación futura. Iterar con datos concretos de brain.*
