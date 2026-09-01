# BLOOM — Mandate Universal Schema v1.2.0

## Addendum de Extensión — Herencia de Gravity en Sub-Mandates Delegados

**Tipo:** RFC / Addendum de extensión
**Estado:** Decisión tomada — incorporación formal al contrato universal de Mandate
**Fecha:** 2026-08-27
**Dominio:** Nucleus · Modelo Universal de Mandate · Gravity · Delegación
**Extiende a:** `BLOOM_Mandate_Universal_Schema_v1_0_0.md`, `v1_0_1.md`, `v1_1_0.md` (todos permanecen vigentes sin cambios)
**Depende de:** `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8 (herencia de `capability_seam` en sub-Mandates: `padre ⊇ hijo`, `max_depth: 2`), `v1_1_0.md` (definición de `governance.gravityPostures[]`, modelo de tres niveles)

---

## Nota de naturaleza de este documento

`v1.1.0` dejó abierto, en su §7, un punto concreto: cómo conviven `gravityPostures[]` con la delegación de sub-Mandates ya especificada para el `capability_seam`. Este addendum lo cierra, siguiendo el mismo principio de diseño que dirigió toda la conversación previa: **el seam se hereda por subconjunto (el hijo puede tener menos); Gravity se hereda por adición obligatoria (el hijo no puede tener menos, solo más)**. La asimetría no es arbitraria — el seam acota *lo que se puede hacer*; Gravity acota *cómo se debe decidir dentro de lo que se puede hacer*. Reducir lo primero es delegar con menos poder. Reducir lo segundo sería delegar con menos criterio — exactamente lo que un sub-Mandate, al ejecutar una porción más acotada del trabajo del padre, no debería poder hacer.

---

## Registro de cambios

| Versión | Cambios |
|---|---|
| v1.0.0 – v1.1.0 | Ver addenda previos. |
| **v1.2.0** | **Extensión.** Herencia de `gravityPostures[]` en sub-Mandates: bloque `inheritedGravityPostures[]` de solo lectura, invariante de no-contradicción (R-17/R-18), etiquetado `origin: "own" \| "inherited"` en la traza del Orbital Agentic State (`orbital_agentic_state.json`), y nota cruzada formal para `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8. |

---

## 1. Principio: herencia por adición obligatoria

Un sub-Mandate delegado nunca *copia* las posturas Gravity de su padre — las **referencia**. La referencia es de solo lectura: el sub-Mandate no puede excluir, editar ni relajar ninguna postura heredada. Lo único que un sub-Mandate puede aportar por cuenta propia es **más** criterio, nunca menos.

Esto es simétrico, pero no idéntico, a cómo ya funciona el `capability_seam`:

| | `capability_seam` | `gravityPostures[]` |
|---|---|---|
| Dirección de la herencia | Por subconjunto — `hijo ⊆ padre` | Por adición — `hijo ⊇ padre` (en criterio, no en acceso) |
| Qué puede cambiar el hijo | Reducir alcance (menos paths, menos presupuesto) | Agregar posturas propias, nunca contradecir las heredadas |
| Verificación de conformidad | Nucleus valida `hijo.scope ⊆ padre.scope` al firmar | Nucleus valida que ninguna postura propia del hijo contradiga una heredada, al firmar |
| Profundidad | `max_depth: 2`, ya fijado | Hereda transitivamente hasta la misma profundidad — sin mecanismo nuevo |

---

## 2. `mandate.json` — `governance.inheritedGravityPostures[]`

Extensión del BLOQUE 3 (§2 de `v1.1.0`):

```jsonc
"governance": {

  "inheritedGravityPostures": [
    {
      "postureId":          "string — el mismo postureId de la postura en el Mandate padre. No se duplica el contenido.",
      "sourceMandateId":  "string — mandateId del padre (o ancestro, si max_depth: 2 y la postura viene del abuelo) del que proviene.",
      "primitive":        "string — copiado por conveniencia de lectura, nunca la fuente de verdad. La fuente de verdad es siempre mandate.json del sourceMandateId.",
      "appliesTo":        "string[] — igual que en el origen; puede resultar en la práctica ya acotado por el capability_seam más chico del sub-Mandate, sin que eso requiera reescribir la postura."
    }
  ],

  "gravityPostures": [
    // posturas propias de este sub-Mandate — mismo schema de v1.1.0 §2.1
    // invariante nueva: ninguna puede contradecir una postura en inheritedGravityPostures[]
  ]

}
```

### 2.1 Reglas de invariancia — extensión de `v1.1.0` §2.2

| Regla | Descripción |
|---|---|
| **R-17** | `inheritedGravityPostures[]` se puebla **automáticamente** al crear el sub-Mandate, con la totalidad de `gravityPostures[]` (propias y heredadas) del Mandate padre — no es una selección editorial del humano que crea el sub-Mandate. No hay mecanismo de exclusión selectiva: heredar es todo o nada, igual que el seam nunca permite que un hijo *amplíe* el alcance del padre por omisión. |
| **R-18** | Ninguna postura en `gravityPostures[]` propia del sub-Mandate puede contradecir, relajar o crear una excepción no declarada explícitamente a una postura en `inheritedGravityPostures[]`. Nucleus valida esta no-contradicción al firmar el sub-Mandate — mismo mecanismo de validación conjunta que R-14 (`v1.1.0`), aplicado un nivel más abajo. Si detecta conflicto, rechaza la firma completa del sub-Mandate, no solo la postura nueva. |
| **R-19** | Una postura propia del sub-Mandate **puede** declarar una `exception` (primitivo ya existente en `v1.1.0` §3.1) a una postura heredada, siempre que la excepción sea explícita, nombrada, y referencie el `postureId` heredado al que hace excepción. Esto no es una contradicción encubierta: es el mecanismo formal para el único caso legítimo en que un sub-Mandate necesita apartarse de un criterio del padre — por ejemplo, un `threshold` que el padre fijó de forma genérica pero que el sub-Mandate, por operar en un scope más acotado y con evidencia adicional, puede justificar relajar puntualmente. La excepción es visible en la traza (§3), nunca implícita. |
| **R-20** | Con `max_depth: 2` (ya fijado para el seam), un sub-Mandate de segundo nivel hereda la **unión** de las posturas de su padre directo y las que ese padre ya había heredado del abuelo, deduplicadas por `postureId`. No hace falta un mecanismo nuevo de propagación — es transitivo por construcción, dado que cada `mandate.json` ya contiene su propio `inheritedGravityPostures[]` completo al momento de su firma. |
| **R-21** | `promotable`/`promotedTo` de una postura heredada siguen perteneciendo exclusivamente al Mandate de origen (`sourceMandateId`). Un sub-Mandate no puede marcar como `promotable` una postura que no es suya — solo puede señalar `promotable: true` en sus propias `gravityPostures[]`. |

---

## 3. Trazabilidad — etiquetado `origin` en Orbital Agentic State

Esta traza pertenece a `orbital_agentic_state.json`, contrato documental de ejecución agéntica todavía sin implementación en código. No modifica el contrato ni el ciclo de vida del `mandate_state.json` operacional de Nucleus. Los dos artefactos permanecen separados y su relación opcional se establece únicamente mediante el mismo `mandate_id`.

Cada entrada de `gravity_context_injected` en un turno (ver `v1.1.0` §5) debe indicar el origen de cada postura aplicada:

```jsonc
{
  "turn": 7,
  "intent_draft": { "type": "tst" },
  "gravity_context_injected": [
    { "postureId": "grv_0af4", "origin": "inherited", "sourceMandateId": "mnd_8f2a1c" },
    { "postureId": "grv_1c02", "origin": "own" }
  ],
  "nucleus_decision": "signed",
  "result": "pass"
}
```

Esto responde exactamente el mismo tipo de pregunta que ya motivó `governanceImpact.corEvents[]` en `v1.0.1`: no solo *qué* postura gobernó la decisión, sino *de qué Mandate vino ese criterio*. Sin este etiquetado, una auditoría sobre un sub-Mandate no podría distinguir un criterio que el propio sub-Mandate decidió aplicar de uno que heredó sin posibilidad de negociarlo — distinción que importa, por ejemplo, si más adelante se descubre que una postura heredada era la causa de una fricción recurrente: la corrección debe proponerse sobre el Mandate de origen (`sourceMandateId`), no sobre cada sub-Mandate que la heredó.

Si un turno incumple una postura heredada con `verifiable: true`, el `reason_code` sigue siendo `"GRAVITY_THRESHOLD_BREACHED"` (`v1.1.0` §4), y `posture_ref` apunta al `postureId` heredado — el rechazo ocurre en el sub-Mandate, pero la traza dice con precisión que el criterio incumplido no nació ahí.

---

## 4. Nota cruzada para `BTIPS_Mandates_Agenticos_Spec_Unificada.md` §8

*(Texto a insertar en la spec de Mandates Agénticos, junto a la especificación existente de herencia del `capability_seam` — no reemplaza nada de lo ya escrito ahí, lo complementa.)*

> **Herencia de Gravity en sub-Mandates (ver `BLOOM_Mandate_Universal_Schema_v1_2_0.md`):** mientras el `capability_seam` se hereda por subconjunto (`hijo ⊆ padre`, un sub-Mandate solo puede tener igual o menor alcance que su padre), las posturas de `governance.gravityPostures[]` se heredan por adición obligatoria: un sub-Mandate incorpora automáticamente, de forma íntegra y de solo lectura, todo el criterio Gravity de su padre (`inheritedGravityPostures[]`), y solo puede añadir posturas propias adicionales — nunca contradecir ni relajar las heredadas, salvo mediante una `exception` explícita y nombrada. La profundidad de herencia sigue el mismo `max_depth: 2` ya fijado para el seam, sin mecanismo de propagación adicional.

---

## 5. Ejemplo — continuación del caso del rate-limiter

Retomando el Mandate de migración del rate-limiter (`v1.1.0` §5): supongamos que, dentro de ese Mandate, se delega un sub-Mandate acotado solo a la migración del *fallback* de degradación (la parte que cubre pérdida de conexión a Redis, `grv_0af5`).

```jsonc
// sub-Mandate — mandate.json, extracto
"governance": {
  "inheritedGravityPostures": [
    { "postureId": "grv_0af3", "sourceMandateId": "mnd_8f2a1c", "primitive": "constraint", "appliesTo": ["mrg"] },
    { "postureId": "grv_0af4", "sourceMandateId": "mnd_8f2a1c", "primitive": "threshold",  "appliesTo": ["tst", "mrg"] },
    { "postureId": "grv_0af5", "sourceMandateId": "mnd_8f2a1c", "primitive": "evidence",   "appliesTo": ["tst"] }
  ],
  "gravityPostures": [
    {
      "postureId": "grv_2b91", "primitive": "evidence",
      "expression": "Además de grv_0af5, el fallback debe probarse con al menos dos patrones de fallo distintos: timeout de conexión y respuesta de Redis con error explícito — no alcanza con simular solo uno.",
      "appliesTo": ["tst"], "authoredBy": "eng:jrivas",
      "verifiable": false, "promotable": false, "promotedTo": null
    }
  ]
}
```

`grv_2b91` no contradice a `grv_0af5` — la extiende con mayor especificidad, exactamente el patrón que R-18 exige. Un intento de declarar, en este sub-Mandate, algo como *"un solo patrón de fallo alcanza como evidencia"* sería rechazado por Nucleus al firmar, por contradecir directamente a `grv_0af5` heredada sin pasar por el mecanismo de `exception` de R-19.

---

## 6. Lo que este addendum no resuelve

- Qué ocurre si el Mandate padre se pausa o se aborta mientras un sub-Mandate en curso todavía depende de sus `gravityPostures[]` heredadas — la reconciliación de ciclo de vida entre padre e hijo en ese escenario es una decisión de runtime de Temporal, fuera del alcance de este addendum de schema.
- Herramienta de auditoría que, dado un `sourceMandateId`, liste todos los sub-Mandates que heredaron una postura específica — útil para el escenario de "esta postura heredada genera fricción recurrente" mencionado en §3, pero es tooling, no schema.

---

*Fin del addendum — v1.2.0 — Extiende a `v1.0.0`, `v1.0.1` y `v1.1.0`. Todos permanecen vigentes sin cambios.*
