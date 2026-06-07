# BTIPS · GENES
## El ADN del Mandate — Especificación Conceptual v1.0

> *"Un gen es la memoria viva de lo que un mandate necesita para existir en el código."*

---

## 1. Contexto y Problema

El ecosistema BTIPS opera sobre tres capas que deben mantenerse alineadas:

| Capa | Qué representa | Dónde vive |
|---|---|---|
| **Governance** | Mandates, reglas, políticas | `.nucleus/` |
| **Intención** | Intents dev/doc, planes, contexto | `.intents/` |
| **Realidad** | Archivos de código, filesystem | `.project/tree.bl` |

Existe una grieta estructural entre estas capas: **la capa de realidad no tiene un vínculo dinámico con la capa de governance**. El `tree.bl` guarda todo el universo de archivos. La documentación de continuidad intenta capturar qué archivos usa cada módulo. Pero ese registro es estático, se desactualiza, y obliga a reconstruir el contexto cada vez que se retoma un mandate.

**El resultado**: desinformación acumulada, documentación desalineada del código, y un overhead cognitivo creciente que amenaza la sostenibilidad del sistema.

---

## 2. La Hipótesis Central

> Un mandate es una acción vinculante que define que un conjunto de funcionalidades va a necesitar de un árbol de archivos — no todos los archivos, solo un conjunto finito, concreto y relacionado entre sí para cumplir una función.

Si podemos capturar ese conjunto de manera dinámica y vincularlo directamente al mandate, eliminamos la necesidad de que la documentación de continuidad lleve ese peso. La documentación vuelve a hacer lo que mejor hace: describir intención y decisiones. El nuevo concepto lleva el registro de la realidad del filesystem.

---

## 3. Definición: ¿Qué es un Gen?

Un **Gen** es la proyección viva de un mandate sobre el filesystem real.

No es una lista de archivos escrita a mano. No es documentación. Es una **entidad funcional con identidad propia** que representa exactamente qué archivos forman el cuerpo operativo de un mandate en cada momento del tiempo.

### Tres propiedades fundamentales

**Scope**
El conjunto preciso de archivos que componen el gen en este momento. No el árbol completo del proyecto. Solo los archivos que trabajan en conjunto para cumplir la función que el mandate define. La precisión del scope es lo que lo diferencia de cualquier otra forma de indexación.

**Linaje**
Cada cambio en el scope queda registrado como un delta. El gen no reemplaza su estado anterior: lo acumula. El linaje permite saber cómo creció el gen, qué archivos se incorporaron, cuáles se eliminaron, y en qué momento del ciclo de vida del mandate ocurrió cada cambio.

**Función**
El gen lleva consigo una descripción semántica de para qué existe ese conjunto de archivos. No es solo una ruta de directorio. Es la razón funcional por la que esos archivos coexisten bajo un mismo mandate. Esa función es lo que permite invocar el gen de manera precisa sin tener que releer la documentación.

---

## 4. La Relación Mandate → Genes

Un mandate puede tener **múltiples genes**. Cada gen cumple una función intrínseca distinta dentro del mandate, pero todos pertenecen a él.

```
Mandate: "Sistema de Pagos"
├── Gen A: procesamiento y validación de transacciones (backend)
├── Gen B: interfaz de checkout y estados de error (frontend)
└── Gen C: webhooks y configuración de providers (infraestructura)
```

Cada gen es independiente en su scope pero comparte el mandate como origen. Esto provee granularidad: al retomar el mandate, se puede invocar solo el gen relevante para el intent que se va a ejecutar, sin cargar el contexto completo de todos los archivos del mandate.

---

## 5. Estructura en el Pipeline

Los genes viven dentro del mandate, en `.mandates/`. No en la documentación de continuidad. No en el tree. En el mandate mismo, porque son parte de su identidad.

```
.mandates/
└── .{mandate-id-uuid}/
    ├── mandate.json
    ├── mandate_state.json
    └── .genes/
        └── .{gen-id-uuid}/
            ├── gen.json            ← identidad y función semántica del gen
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
  "status": "active | dormant | orphan"
}
```

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
  "changes": {
    "added": ["ruta/nuevo/archivo.ext"],
    "modified": ["ruta/archivo/modificado.ext"],
    "removed": []
  },
  "reason": "descripción del por qué estos archivos cambiaron en este intent"
}
```

---

## 6. Dinámica: Cómo Vive un Gen

### Nacimiento
Un gen nace la primera vez que un intent ejecutado bajo un mandate toca archivos del filesystem. El sistema propone la creación del gen con los archivos involucrados y una función inferida. El usuario o el sistema de governance confirma o ajusta la función semántica.

### Crecimiento
Con cada intent subsiguiente bajo el mismo mandate:
1. Se coteja el scope actual del gen contra los archivos que el intent va a tocar.
2. Los archivos ya en el scope se actualizan si su hash cambió → **delta**.
3. Los archivos nuevos que semánticamente pertenecen a la función del gen se proponen para incorporación → **extensión del scope**.
4. Si los archivos nuevos no encajan en ningún gen existente, se propone la creación de un gen nuevo.

### Reconciliación con el Tree
Cuando el `tree.bl` se actualiza (archivos agregados, renombrados, eliminados):
- El sistema corre una reconciliación entre el tree y todos los `gen_state.json` activos.
- Archivos eliminados del tree que estaban en un scope → se marcan como removidos en el gen con un delta automático.
- Archivos nuevos en el tree → se evalúa si pertenecen semánticamente a algún gen existente.

### Invocación
Cuando se crea un nuevo intent bajo un mandate que ya tiene genes, el sistema carga los `gen_state.json` relevantes como punto de partida del contexto. El intent hereda el scope del gen. No hay redescubrimiento. No hay reconstrucción manual del contexto.

---

## 7. Gen Huérfano

Un gen entra en estado `orphan` cuando:

- Su mandate fue cerrado o archivado, pero sus archivos siguen siendo modificados en el proyecto.
- Sus archivos fueron absorbidos por otro mandate sin que el gen original haya sido actualizado.

Un gen huérfano es una señal de alerta de primer nivel: hay código vivo que perdió su mandate de origen. Detectar genes huérfanos es detectar deuda técnica antes de que se acumule en silencio.

El sistema debe surfacear genes huérfanos en el health dashboard del nucleus, no dejarlos enterrados en el filesystem.

---

## 8. Lo que los Genes Resuelven

| Problema anterior | Con Genes |
|---|---|
| Reconstruir contexto de archivos cada vez que se retoma un mandate | El gen tiene el scope actualizado, se invoca directamente |
| La documentación de continuidad carga con la lista de archivos | Los genes llevan ese peso; la doc vuelve a ser solo intención |
| No hay trazabilidad de qué archivos cambiaron bajo qué mandate | El linaje de deltas registra cada cambio con su intent de origen |
| Un intent nuevo bajo un mandate existente empieza desde cero | El intent hereda el scope del gen correspondiente |
| Deuda técnica invisible (código sin dueño) | Genes huérfanos la hacen visible antes de que se acumule |

---

## 9. Separación de Responsabilidades (Definitiva)

Esta es la distinción más importante que los genes establecen:

> **La documentación de continuidad describe intención y decisiones.**
> **Los genes describen la realidad del filesystem.**

Son dos capas distintas que no deben mezclarse. Mezclarlas es lo que genera la desinformación acumulada. Separarlas es lo que hace el sistema sostenible a escala.

---

## 10. Integración con el Ecosistema BTIPS

```
NUCLEUS
└── Mandate
    └── Genes (scope + linaje + función)
             │
             ├── alimenta ──→ Intent Context (codebase.json)
             │
             ├── se reconcilia con ──→ .project/tree.bl
             │
             └── expone ──→ health-dashboard.json (genes huérfanos, deltas)

PROJECT
└── Intent
    ├── hereda scope de ──→ Gen activo del mandate
    └── genera deltas en ──→ Gen (via pipeline response)
```

---

## 11. Próximos Pasos

Estos son los hitos que siguen lógicamente a esta definición conceptual:

1. **Actualizar `bloom_nucleus_tree.txt`** para incorporar `.genes/` dentro de `.mandates/`.
2. **Actualizar `bloom_project_tree.txt`** para incorporar referencias a gene-ids en los contextos de intents dev.
3. **Definir el protocolo de reconciliación** entre tree.bl y gen_state.json (cuándo se dispara, quién lo ejecuta, cómo se resuelven ambigüedades).
4. **Definir la UI del health dashboard** para surfacear genes huérfanos y deltas recientes.
5. **Diseñar el mecanismo de invocación** de genes en el pipeline de intent briefing.

---

*BTIPS Research — Sesión de definición conceptual · Genes v1.0*
*Este documento es la fuente de verdad inicial del concepto. Toda implementación futura parte de aquí.*
