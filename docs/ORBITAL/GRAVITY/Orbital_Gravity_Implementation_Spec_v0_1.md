# Orbital · Gravity — Implementation Spec v0.1

## Persistencia en Grafo, Resolución por Turno y Arbitraje Centralizado sin `cor`

**Tipo:** Especificación preliminar de implementación — inicio de nueva fase de investigación
**Estado:** Borrador v0.1 — exploratorio, no normativo todavía. No reemplaza ni fija los addenda ya cerrados del Mandate Universal Schema (`v1.0.0` a `v1.2.0`); los extiende hacia el resto de la jerarquía Gravity.
**Fecha:** 2026-08-28
**Dominio:** Orbital · Gravity · Nucleus · Grafo de Coordinación
**Fuente conceptual:** `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md` (documento fundacional revisado), en particular §8–§10 (jerarquía), §22 (promoción), §26 (arquitectura consolidada) y §34 (frontera de diseño, que deja explícitamente sin resolver "el mecanismo de resolución de conflictos" — este documento aborda esa deuda puntual, no el resto de la frontera)
**Depende de:** `BLOOM_Mandate_Universal_Schema_v1_0_0/v1_0_1/v1_1_0/v1_2_0.md` (nivel Mandate y herencia de sub-Mandates, que este documento no reabre), `COR_Intent_Spec_v1_0.md`/`BSIP-009` (canal exclusivo de promulgación de ley global), `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8 (Capability Seam, loop turno a turno)

---

## 0. Encuadre — qué resuelve este documento y qué no

El documento fundacional deja tres huecos explícitos en su §34: gramática definitiva de Gravity, UI de Paladin, y **mecanismo de resolución de conflictos**. Este v0.1 se ocupa exclusivamente del tercero, y de dos preguntas de implementación que son su consecuencia directa: dónde persiste Gravity una vez que existen niveles por encima del Mandate (Organización, Proyecto), y cómo Orbital consulta ese contexto en cada turno sin romper nada de lo ya firmado en los addenda de Mandate.

**Restricción de diseño que gobierna todo lo que sigue, tal como se acordó antes de escribir esto:** ninguna forma de coordinación horizontal entre Mandates —hermanos, o sin relación de parentesco— se resuelve entre pares. Toda coordinación que no sea pura jerarquía de herencia (ya resuelta en `v1.2.0`) se apoya en Nucleus como árbitro único. Esto no es una preferencia de estilo: es la misma invariante que ya sostiene todo lo anterior — *la autoridad nunca se distribuye, aunque el acceso sí* — aplicada ahora a un caso que hasta hoy no teníamos formalizado: qué pasa cuando dos unidades de trabajo *no relacionadas por herencia* convergen sobre el mismo territorio.

---

## 1. El Grafo de Gravity — modelo de persistencia

### 1.1 Por qué un grafo y no una lista plana

La jerarquía del documento fundacional (Nucleus → Organización → Proyecto → Mandate → Sesión) ya no es una lista de niveles — es una estructura con ramificación real: una Organización tiene múltiples Proyectos, un Proyecto tiene múltiples Mandates, un Mandate puede tener sub-Mandates delegados (`v1.2.0`), y cada Mandate agéntico puede tener múltiples Sesiones a lo largo de su ciclo de vida. Una lista plana no puede representar esto sin perder la información de *por qué camino* una postura llegó a aplicar en un turno dado. Un grafo sí.

### 1.2 Tipos de nodo

```text
GravityNode
├── NUCLEUS          — singleton, raíz absoluta. Uno por instalación.
├── ORGANIZATION      — uno por organización (ya existe como concepto en BTIPS; nuevo como nodo Gravity)
├── PROJECT           — uno por proyecto, hijo de exactamente una Organization
├── MANDATE           — hijo de exactamente un Project; puede tener sub-Mandates (v1.2.0)
└── SESSION           — hijo de exactamente un Mandate; efímero
```

Cada nodo (excepto `NUCLEUS`) tiene exactamente un padre estructural — esto es un árbol, no un grafo arbitrario, con una única excepción funcional descrita en §1.4 (herencia de sub-Mandates, que ya es un DAG acotado por `max_depth: 2`).

Propiedades comunes a todo nodo:

```jsonc
{
  "nodeId":      "string — uuid4",
  "nodeType":    "enum — NUCLEUS | ORGANIZATION | PROJECT | MANDATE | SESSION",
  "parentId":    "string | null — null únicamente para NUCLEUS",
  "gravityPostures": [ /* mismo schema de gravityPostures[] ya fijado en v1.1.0 §2.1 */ ],
  "status":      "enum — active | superseded",
  "createdAt":   "string — ISO 8601",
  "signedBy":    "string — autoridad que firmó este nodo (ver §1.3 por nivel)"
}
```

### 1.3 Quién firma cada nivel — y dónde entra `cor`

Esta tabla es la pieza que faltaba para que "coordinación sin depender de `cor`" no se lea como "gobernanza sin autoridad": `cor` sigue siendo el único canal para los dos niveles superiores; todo lo demás tiene autoridad propia, delegada, más liviana.

| Nivel | Quién firma el nodo | Requiere `cor` | Análogo ya existente |
|---|---|---|---|
| `NUCLEUS` | Constitutivo — no se firma, es dado (Nivel 0 de `v1.1.0`) | N/A | Invariantes de protocolo |
| `ORGANIZATION` | Operador humano con autoridad organizacional, vía canal privilegiado de Nucleus | **Sí, siempre** | Ley global — Nivel 1 de `v1.1.0` |
| `PROJECT` | Humano con autoridad de proyecto (Architect/Master, según roles ya definidos en BTIPS) | No | Nuevo — criterio de alcance intermedio, análogo en espíritu a `gravityPostures` de Mandate pero con alcance mayor |
| `MANDATE` | El humano que firma el Mandate al crearlo | No | Ya existente — `v1.1.0` §2 |
| `SESSION` | Se captura en vivo, durante la conversación, sin firma formal previa | No | Ya existente conceptualmente — Session Gravity del documento fundacional §8 |

La consecuencia directa: **`cor` sigue siendo, sin excepción, el único camino hacia `ORGANIZATION` y `NUCLEUS`.** Todo lo que este documento agrega —resolución por turno, arbitraje— ocurre *por debajo* de esa frontera. No se propone ni se necesita ningún mecanismo nuevo que toque `cor`; se formaliza, en cambio, todo el espacio de coordinación que **no** requiere tocar la ley global para funcionar.

### 1.4 Tipos de arista

```text
PARENT_OF        — estructural, entre niveles consecutivos (Organization→Project→Mandate→Session)
DELEGATES_TO      — Mandate → sub-Mandate (v1.2.0), acota capability_seam por subconjunto
INHERITS_FROM     — dirección inversa conceptual de DELEGATES_TO para gravityPostures: el hijo referencia
                    de solo lectura las posturas del padre (mismo patrón de inheritedGravityPostures de v1.2.0,
                    generalizado ahora a cualquier par de niveles consecutivos, no solo Mandate↔sub-Mandate)
PROMOTED_FROM     — registra que una postura en un nodo de nivel superior se originó como postura postulada
                    en un nodo de nivel inferior (ver §1.5)
```

`INHERITS_FROM` generaliza R-17/R-18 de `v1.2.0` (que hasta ahora solo cubrían Mandate↔sub-Mandate) a los cuatro pares de niveles consecutivos: `Organization→Project`, `Project→Mandate`, `Mandate→Session`. La postura de no-contradicción (R-18, R-14) aplica igual en cada frontera: un nivel inferior nunca puede contradecir una postura heredada de uno superior, salvo `exception` explícita y nombrada.

### 1.5 Promoción — ya no es solo un diagrama conceptual

El documento fundacional describe la promoción (§22) como flujo conceptual: `Session → Mandate/Project Candidate → Project → Governance Candidate → cor → Nucleus/Organization`. Esto se materializa en el grafo como una arista `PROMOTED_FROM` que conecta el nodo de la postura nueva (en el nivel superior) con el `postureId` de origen (en el nivel inferior), preservando el linaje completo:

```jsonc
{
  "edgeType": "PROMOTED_FROM",
  "fromPostureId": "grv_0af4",          // la postura original, nivel Mandate
  "fromNodeId": "mnd_8f2a1c",
  "toPostureId": "grv_org_0091",        // la postura promovida, nivel Organization
  "toNodeId": "org_root",
  "promotedVia": "cor",              // único valor posible cuando toNodeId.nodeType ∈ {ORGANIZATION, NUCLEUS}
  "promotedBy": "human_operator",    // nunca "agent" — mismo invariante que R-13/R-16 de v1.1.0
  "occurredAt": "2026-09-15T10:00:00Z"
}
```

Si la promoción es entre `SESSION → MANDATE` o `MANDATE → PROJECT` (niveles que no requieren `cor`, según §1.3), `promotedVia` toma el valor del mecanismo humano correspondiente (`"mandate_signature"`, `"project_authority_signature"`) — nunca `"agent"`, en ningún nivel, sin excepción.

---

## 2. Resolución y consulta por turno — cómo Orbital inyecta contexto

### 2.1 El algoritmo de resolución

Antes de este documento, la inyección de contexto (`gravity_context_injected`, `v1.1.0` §3.2 y `v1.2.0` §3) solo recorría el par Mandate↔sub-Mandate. Ahora el recorrido es el camino completo desde `SESSION` hasta `NUCLEUS`:

```text
resolve_active_gravity(session_id):
    path ← walk_up(session_id → mandate → project → organization → nucleus)
    collected ← []
    for node in path (orden: NUCLEUS primero, SESSION último):
        for posture in node.gravityPostures where posture.status == "active":
            if posture.appliesTo matches current_turn.intent_type:
                collected.append(posture tagged with node.nodeType)
    return collected  # = "Resolved Active Gravity" del documento fundacional §10
```

El orden de recorrido (`NUCLEUS` primero) no es arbitrario: es lo que permite que la validación de no-contradicción (§1.4) se aplique en el mismo sentido en que ya se aplica en `v1.1.0`/`v1.2.0` — una postura de nivel inferior se valida *contra* el conjunto ya acumulado de niveles superiores, nunca al revés.

### 2.2 `origin` extendido

`v1.2.0` §3 definía `origin: "own" | "inherited"`, acotado a la relación Mandate↔sub-Mandate. Se extiende a:

```jsonc
"origin": "enum — nucleus | organization | project | mandate_own | mandate_inherited | session"
```

`mandate_own` y `mandate_inherited` preservan exactamente la distinción ya fijada en `v1.2.0` (postura propia del Mandate vs. heredada de un Mandate padre); los tres valores nuevos (`nucleus`, `organization`, `project`) cubren los niveles que este documento agrega.

### 2.3 Traza de turno — ejemplo

```jsonc
{
  "turn": 4,
  "intent_draft": { "type": "mrg" },
  "gravity_context_injected": [
    { "postureId": "grv_org_0044", "origin": "organization" },
    { "postureId": "grv_proj_0012", "origin": "project" },
    { "postureId": "grv_0af4", "origin": "mandate_own" },
    { "postureId": "grv_sess_009", "origin": "session" }
  ],
  "nucleus_decision": "signed",
  "result": "pass"
}
```

Esto es, en los términos del documento fundacional §25, lo que responde la tercera pregunta de trazabilidad: no solo *qué hizo la IA* y *bajo qué criterio*, sino *bajo qué criterio interpretó lo que el humano le dijo* — cada capa que contribuyó a esa interpretación queda nombrada, no colapsada en un solo contexto anónimo.

### 2.4 Relación con schema filtering — sin cambios de mecanismo

La inyección al Agent Loop sigue el mismo patrón ya aprobado (`BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8.2.3, patrón 1): se le muestra al modelo solo el subconjunto de `Resolved Active Gravity` relevante al intent que está por proponer, nunca la totalidad del grafo. Lo único que cambia es el tamaño del conjunto candidato a filtrar — antes venía solo del Mandate y su seam; ahora viene de los cinco niveles.

---

## 3. Arbitraje centralizado — coordinación sin `cor`

Acá está el mecanismo que faltaba. Es deliberadamente distinto de `cor` en naturaleza: no promulga ley, no es persistente más allá del conflicto que resuelve, y su output normal es efímero — salvo que la recurrencia lo convierta en candidato a promoción (§1.5), momento en el cual sí, eventualmente, puede terminar cruzando la frontera de `cor`.

### 3.1 Cuándo se activa

El caso que motivó este documento: dos sub-Mandates hermanos (mismo padre, `max_depth: 2`), cada uno con `scope_paths` válidamente firmado como subconjunto del padre (`v1.2.0` R-18 ya lo garantiza respecto del padre), pero cuyos `scope_paths` se **superponen entre sí**. Nada en `v1.0.0`–`v1.2.0` valida esto, porque la validación de subconjunto siempre fue vertical (`hijo ⊆ padre`), nunca horizontal (`hermano_A ∩ hermano_B`).

Condición de disparo, verificada por Nucleus en `validate_and_sign` (mismo punto de verificación que toda otra invariante de seam):

```text
si intent_draft.target ∩ (scope_paths de cualquier Mandate/sub-Mandate activo, no relacionado
   por ancestría directa con el proponente) ≠ ∅:
       disparar arbitraje
```

Esto no se limita a hermanos de un mismo padre — cubre cualquier par de Mandates activos simultáneamente cuyo territorio colisione, tengan o no relación de parentesco.

### 3.2 Nucleus como árbitro único — invariante explícita

```text
INVARIANT-ARB-001: ningún conflicto de superposición se resuelve por negociación entre los
                   Agent Loops o Mandates involucrados. La resolución es exclusivamente de Nucleus.
INVARIANT-ARB-002: el árbitro es siempre la autoridad común más cercana en el grafo — el padre
                   común si existe (Mandate padre, o Project si los Mandates no comparten padre),
                   escalando hasta Nucleus si no hay autoridad común más específica disponible.
INVARIANT-ARB-003: el resultado de un arbitraje nunca modifica gravityPostures[] de ningún Mandate
                   ya firmado — es una resolución de secuencia/prioridad, no una reescritura de contrato.
```

`INVARIANT-ARB-002` es la formalización concreta de "sube a Nucleus, o a quien Nucleus ya delegó esa autoridad" que fijamos en la conversación previa a este documento — nunca a los pares.

### 3.3 Orden de resolución

Cuando se dispara un arbitraje, Nucleus resuelve en este orden, deteniéndose en el primero que aplique:

1. **¿Existe una `gravityPosture` de primitivo `priority` ya declarada en el ancestro común** que resuelva explícitamente este tipo de colisión? (Ej.: *"ante conflicto de scope entre sub-Mandates de refactor y sub-Mandates de hotfix, el hotfix tiene precedencia"*.) Si existe y es `verifiable`, se aplica automáticamente.
2. **¿Existe una `gravityPosture` de primitivo `escalation`** que indique que este tipo de colisión debe resolverse con intervención humana? Si existe, se activa (mismo mecanismo ya descrito para `GRAVITY_THRESHOLD_BREACHED`, `v1.1.0` §4).
3. **Default — sin postura aplicable:** Nucleus aplica la resolución más conservadora posible: pausa el segundo Mandate en llegar (por timestamp de la Action en conflicto), deja avanzar al primero, y notifica al humano con ambos `mandateId` y el `scope_path` en conflicto. Nunca ejecuta ambos en paralelo sobre territorio superpuesto, y nunca elige "el más importante" sin una postura o un humano que lo determine.

### 3.4 `ArbitrationEvent` — persistencia en el grafo

```jsonc
{
  "eventId": "string — uuid4",
  "conflictScope": "string[] — paths en colisión",
  "involvedMandateIds": ["mnd_a1", "mnd_b2"],
  "commonAuthorityNodeId": "string — nodeId del ancestro común que arbitró (o NUCLEUS si no había uno más específico)",
  "resolutionStrategy": "enum — priority_posture | escalation_posture | default_pause_and_notify",
  "appliedPostureId": "string | null — postureId de la gravityPosture usada, si strategy no fue default",
  "resolution": "enum — mandate_a_proceeds | mandate_b_proceeds | both_paused | rejected",
  "resolvedBy": "enum — nucleus_automatic | human_operator  // nunca 'agent'",
  "occurredAt": "string — ISO 8601"
}
```

Persiste como nodo propio en el grafo, referenciado desde ambos Mandates involucrados — análogo en espíritu a `governanceImpact.corEvents[]` (`v1.0.1` §2), pero **no** es un `corEvent`: no hay promulgación de ley, no hay `CorNucleusRecord`, no hay Zero-Read. Es un evento de coordinación ordinaria, visible para ambos Mandates afectados sin restricción especial de lectura, porque no expone ninguna postura constitucional — solo la resolución de un conflicto puntual de territorio.

### 3.5 Camino hacia la promoción, si la recurrencia lo justifica

Si `ArbitrationEvent` con `resolutionStrategy: "default_pause_and_notify"` se repite con un patrón reconocible (mismo tipo de colisión, mismo par de categorías de Mandate), eso es evidencia — en el sentido exacto de `v1.1.0` §3.1 y del documento fundacional §22-23 — de que una `gravityPosture` de `priority` debería postularse en el ancestro común, para que el arbitraje deje de necesitar intervención humana repetida. Si esa postura, además, resulta aplicable más allá de ese Proyecto, sigue el camino de promoción ya descrito (§1.5) hasta, eventualmente, `cor`. El arbitraje no reemplaza ese camino — es, en la práctica, su principal fuente de evidencia.

---

## 4. Ejemplo integrador

Dos sub-Mandates hermanos, hijos de `mnd_8f2a1c` (el Mandate del rate-limiter usado en los addenda anteriores): uno migra el fallback de degradación (`v1.2.0` §5), otro —creado después, sin que el primero supiera de su existencia— refactoriza el módulo de logging que ese mismo fallback también toca.

```jsonc
// Nucleus detecta, al firmar el intent dev del segundo sub-Mandate:
{
  "turn": 6,
  "mandate_id": "mnd_child_logging",
  "intent_draft": { "type": "dev", "target": "src/ratelimit/fallback_logger.py" },
  "nucleus_decision": "arbitration_triggered",
  "conflict_with": "mnd_child_fallback"
}

// Nucleus resuelve — no hay Posture de `priority` declarada, sí hay una Posture de `escalation` genérica del padre:
{
  "eventId": "arb_0192",
  "conflictScope": ["src/ratelimit/fallback_logger.py"],
  "involvedMandateIds": ["mnd_child_fallback", "mnd_child_logging"],
  "commonAuthorityNodeId": "mnd_8f2a1c",
  "resolutionStrategy": "escalation_posture",
  "appliedPostureId": "grv_0af4_escalation_generic",
  "resolution": "mandate_b_proceeds",  // el humano decide priorizar logging, ya iniciado antes de notar el choque
  "resolvedBy": "human_operator",
  "occurredAt": "2026-09-15T11:20:00Z"
}
```

Ninguno de los dos Agent Loops negoció nada entre sí. Ninguno supo siquiera que el otro existía hasta que Nucleus lo notificó a través del canal humano. La autoridad resolvió; los pares nunca tuvieron el poder de hacerlo por su cuenta.

---

## 5. Lo que este v0.1 no resuelve

Deliberadamente, siguiendo el mismo principio que el documento fundacional aplicó en su propia §34:

- La gramática formal de `gravityPostures[].expression` sigue sin fijarse — este documento no la necesita para especificar persistencia y arbitraje.
- El mecanismo exacto de firma para `PROJECT` (qué rol organizacional concreto, qué flujo de UI) no se especifica — se asume "autoridad de proyecto ya existente en BTIPS" sin mayor detalle.
- Qué pasa si el arbitraje mismo produce una tercera colisión (ej.: pausar el Mandate B genera una nueva colisión con un tercer Mandate) no está cubierto — es un caso de segundo orden que este v0.1 no explora todavía.
- La representación de Paladin de "bajo qué Gravity estoy trabajando ahora" (§14 del documento fundacional) no se aborda — es UI, no persistencia ni arbitraje, y queda fuera de este documento por diseño.
- La tecnología concreta de persistencia del grafo (motor de grafo dedicado vs. modelado relacional vs. filesystem extendido, en la línea de cómo ya vive `.bloom/`) no se decide aquí — este documento fija el modelo de datos, no la implementación física.

---

*Fin de la especificación preliminar v0.1 — primera pieza formal de la nueva fase de investigación sobre coordinación en Orbital sin dependencia de `cor` para el trabajo ordinario del sistema.*
