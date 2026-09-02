# Orbital · Gravity — Gramática Formal y Parser de `gravityPostures[].expression`

## Especificación de Implementación v0.1 — de texto libre a AST evaluable, sin aplanar el criterio a regla de negocio

**Tipo:** Especificación de implementación
**Estado:** Borrador v0.1 — normativo para implementación; cierra el hueco que `Orbital_Gravity_Implementation_Spec_v0_1.md` §5 y `Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md` §8 dejaron nombrado y sin resolver ("la gramática formal de `gravityPostures[].expression` sigue sin fijarse")
**Fecha:** 2026-08-29
**Dominio:** Orbital · Gravity · Nucleus · Conductor Workspace Core
**Fuentes normativas (abreviaturas usadas en todo el documento):**

| Abreviatura | Documento |
|---|---|
| **Cor** | `Corolario — La persona como fuente de Gravity.md` |
| **Orb** | `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md` |
| **Impl** | `Orbital_Gravity_Implementation_Spec_v0_1.md` |
| **Persistencia** | `Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md` |
| **Mandate v1.2.0** | `BLOOM_Mandate_Universal_Schema_v1_2_0.md` |
| **UX** | `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` |
| **Client** | `Paladin_Client_Object_Model_v0_1.md` |
| **API** | `NUCLEUS_API_Contracts_Consolidado_v0_1.md` |

**Nota de nomenclatura vigente.** Los documentos **UX** y **Client** conservan
`Paladin` en sus nombres porque son fuentes históricas. El consumidor cliente
real al que esta especificación se refiere es **Conductor Workspace Core**, la
superficie post-onboarding de la aplicación Electron Bloom Workspace. En este
documento, `Paladin` no nombra un runtime, un paquete ni un artefacto de
deployment actual.

**Depende de, sin reabrir:** el gesto de postulación (**UX** §1, decisión ya tomada: Alternativa A, control retroactivo), el mecanismo de `exception` (**Mandate v1.2.0** R-19), el modelo de persistencia del Grafo de Gravedad y su decisión de filesystem extendido (**Persistencia** §2), la clasificación cliente/backend de objetos de Paladin (**Client**), y el catálogo cerrado de `reason_code` existentes (**API** §2.3.1). Ninguna de estas decisiones se reabre — donde este documento las extiende, la extensión se marca explícitamente como tal, siguiendo la misma disciplina que **Persistencia** §7 ya aplicó sobre `GravityNode`.

---

## 0. Encuadre — qué resuelve este documento y qué no

**Impl** §5 y **Persistencia** §8 dejan, cada uno, la misma frase casi textual: *"la gramática formal de `gravityPostures[].expression` sigue sin fijarse — este documento no la necesita para especificar [lo que sí especifica]"*. Este documento cierra exactamente esa deuda, y solo esa: la gramática formal del campo `expression` (ya fijado como `string` desde **Mandate v1.1.0**/`v1.2.0`, sin cambio de tipo ni de ubicación), el parser que la produce, la representación estructurada (AST) que consume el resto del sistema, y el contrato de evaluación que un evaluador necesitaría implementar contra esa representación.

**No reabre:**
- El gesto de postulación en Conductor Workspace Core, originado en la fuente histórica **UX** §1 — este documento asume que el modo de escritura de una Postura ya está activo cuando la gramática se aplica; no diseña cómo se activa ese modo.
- El mecanismo de `exception` en sí (**Mandate v1.2.0** R-19) — ya está cerrado como decisión de negocio; este documento solo le da forma sintáctica parseable.
- El arbitraje entre Mandates en colisión ni la detección de colisiones (**Impl** §3 completo) — el AST que este documento define es *consumible* por ese mecanismo (§5 lo deja explícito), pero rediseñarlo queda fuera.
- Ninguna superficie de comando administrativo para Gravity — ya descartada, no se reconsidera aquí.
- El schema del objeto `gravityPostures[]` como un todo (`postureId`, `appliesTo[]`, `authoredBy`, `verifiable`, `promotable`, `promotedTo`, `status`, `promotedFrom` de **Persistencia** §5.3) — este documento gobierna exclusivamente el contenido del campo `expression` dentro de ese objeto, y toca el campo `verifiable` únicamente como cruce de validación semántica (§5, §6), nunca como redefinición de su tipo o su rol.

### 0.1 Estado real del campo que esta gramática gobierna

Igual que **Persistencia** §0.2 confirmó para el Grafo de Gravedad completo, no existe hoy ningún `gravityPostures[].expression` persistido contra el cual migrar — todos los ejemplos citados en el corpus (`grv_2b91` en **Mandate v1.2.0** §5, los ejemplos de prosa en **Orb** §15–18) son texto libre ilustrativo, nunca datos reales en un `node.json`. Esto es la misma libertad de diseño que **Persistencia** §0.2 explota: no hay compatibilidad hacia atrás que preservar sobre datos reales. Sí existe, en cambio, una restricción real que preservar — la que **Persistencia** §0.2 marca como límite de esa libertad: el resto del sistema (`reason_code`, `posture_ref`, `origin`, `appliesTo[]`) sí tiene forma ya fijada, y esta gramática debe encajar en ella sin pedirle que cambie.

---

## 1. La tensión de diseño — resuelta explícitamente

**Cor** ("La postura no es una regla de negocio") fija la distinción que gobierna toda decisión de este documento:

> "Una regla tradicional suele expresar una condición operacional: *Si ocurre A, hacer B.* Una postura puede expresar algo más profundo [...] La segunda expresión contiene **criterio**." (Cor)

Y **Orb** §18 lo confirma desde el lado del lenguaje:

> "Gravity podría convertirse en una nueva forma de escribir especificaciones imperativas [...] Eso no constituye necesariamente Gravity [...] La primera forma describe trayectoria. La segunda describe campo." (Orb §18)

Una gramática formal que exigiera reducir cada `expression` a un predicado booleano evaluable produciría exactamente lo que ambos documentos advierten: convertiría cada Postura en `si A entonces B`, aplanando de vuelta a regla de negocio el mismo criterio que Cor describe como sobreviviente a la implementación concreta. El ejemplo que ninguna gramática puede permitirse perder es `grv_2b91` (**Mandate v1.2.0** §5): *"el fallback debe probarse con al menos dos patrones de fallo distintos [...] no alcanza con simular solo uno"* — una exigencia real, con estructura parcial (una cuenta mínima, una categoría), pero cuyo cumplimiento depende de un juicio humano sobre qué cuenta como "patrón de fallo distinto". No es casualidad que el propio corpus marque ese ejemplo `"verifiable": false`: el sistema ya reconoce, en el schema existente, que no toda Postura es mecánicamente verificable — esa distinción ya estaba ahí antes de que existiera esta gramática.

### 1.1 Principio de resolución: envelope estructural + cláusula de criterio irreducible

La gramática que seccion 2 fija no intenta convertir cada expresión en un predicado. Separa, para **toda** expresión, dos partes con estatus deliberadamente distinto:

1. **Un envelope estructural** — mínimo, determinista, parseable sin ambigüedad — que identifica el primitivo, y que crece exactamente donde el corpus ya exige mecanización real: `threshold` necesita un predicado comparable porque **Impl** §3.3.1 dice literalmente *"si existe y es `verifiable`, se aplica automáticamente"*; `priority` necesita un orden entre categorías nombrado por el mismo motivo; `escalation` necesita un destino de escalamiento porque ese destino es, en sí, información estructural (a qué nivel de autoridad, **Impl** §1.3); `exception` necesita referenciar un `postureId` porque R-19 lo exige textualmente ("explícita, nombrada, y referencie el `postureId` heredado"). Fuera de eso, el envelope no impone nada.
2. **Una cláusula de criterio** (`::` seguido de texto libre) — nunca tokenizada, nunca reducida a estructura, preservada verbatim de principio a fin del sistema (§7). Es la parte de la expresión donde vive el "porque la experiencia acumulada demuestra que..." de Cor. Para `constraint`, `evidence` y `exception` esta cláusula es **obligatoria**: son, por evidencia del propio corpus (`grv_2b91` verificable:false; los ejemplos de `constraint` en **Orb** §18 sin ningún predicado cuantitativo; la justificación de excepción que R-19 exige explícitamente), los tres primitivos cuyo criterio real no es reducible a un envelope estructural completo. Para `threshold`, `priority` y `escalation` la cláusula es opcional: el envelope ya puede ser autosuficiente cuando la regla es puramente mecánica, pero nada impide adjuntar racional en lenguaje natural.

Esta asimetría no es arbitraria por sección — está calibrada primitivo por primitivo contra la evidencia real de expresividad que el corpus ya demuestra necesitar, no contra una preferencia de diseño de este documento.

---

## 2. Gramática formal

Notación EBNF (Wirth): `,` concatenación, `|` alternativa, `[ ]` opcional, `{ }` repetición cero-o-más, `"..."` literal, `(* ... *)` comentario.

### 2.1 Léxico

```ebnf
letter        = "a".."z" | "A".."Z" ;
digit         = "0".."9" ;
id_char       = letter | digit | "_" | "-" | "." | "/" ;

IDENT         = letter , { id_char } ;
   (* identificador libre elegido por el ingeniero: nombre de métrica, categoría de
      colisión, nivel de escalamiento, path. No hay catálogo fijo — de dónde saca su
      significado un IDENT concreto (p.ej. qué es "coverage_pct") queda fuera de esta
      gramática, es responsabilidad del evaluador real, ver §5. *)

POSTURE_REF      = "grv_" , { letter | digit | "_" } ;
   (* coincide con todo postureId ya usado en el corpus: grv_0af4, grv_2b91, grv_org_0091,
      grv_proj_0012, grv_sess_009, grv_0af4_escalation_generic *)

NUMBER        = digit , { digit } , [ "." , digit , { digit } ] ;

COMPARATOR    = "<=" | ">=" | "==" | "!=" | "<" | ">" ;
   (* maximal-munch: el lexer intenta los operadores de dos caracteres antes que los
      de uno solo, para no partir "<=" en "<" + "=" *)

CRITERION_TEXT = ? cualquier secuencia no vacía de caracteres Unicode ? ;
   (* todo lo que sigue al delimitador "::" hasta el final de la expresión, incluyendo
      espacios, puntuación, saltos de línea, y cualquier subcadena que luzca como un
      POSTURE_REF u otro token — nunca se re-tokeniza. Ver §2.1.1 *)
```

**2.1.1 Por qué `CRITERION_TEXT` no se tokeniza más allá de "::"**. Si la cláusula de criterio se tokenizara como el resto de la gramática, cualquier ingeniero que escribiera una frase con dos puntos, comillas o un operador de comparación dentro de su razonamiento (`"timeout de conexión y respuesta de Redis con error explícito"` ya usa dos puntos) rompería el parseo de exactamente la parte que la sección 1.1 declaró irreducible. `"::"` es el único delimitador estructural que separa envelope de criterio; una vez cruzado, el parser deja de intentar entender el texto — lo captura y lo devuelve íntegro (§4).

### 2.2 Envelope común

```ebnf
expression      = constraint_expr | threshold_expr | evidence_expr
                 | priority_expr  | escalation_expr | exception_expr ;

criterion       = "::" , CRITERION_TEXT ;

target_list     = "on" , IDENT , { "," , IDENT } ;

quantity        = NUMBER , [ IDENT ] ;    (* IDENT aquí funciona como unidad: "%", "ms", "casos" *)
```

### 2.3 `constraint`

```ebnf
constraint_expr = "constraint" , [ target_list ] , criterion ;
```

**Ejemplo** (reexpresando el invariante de **Orb** §18, "Preservar contrato público"):

```
constraint on contrato_publico ::
Preservar el contrato público — no renombrar ni remover campos existentes sin pasar
por deprecación explícita.
```

`target_list` es opcional porque no todo `constraint` tiene un blanco puntual — "no introducir una segunda fuente de verdad" (**Orb** §15) es un invariante de alcance general, sin `on` alguno que lo acote más.

### 2.4 `threshold`

```ebnf
threshold_expr  = "threshold" , IDENT , COMPARATOR , quantity , [ criterion ] ;
```

**Ejemplo:**

```
threshold coverage_pct >= 80 :: La cobertura de tests del módulo de fallback no debe
bajar de este piso tras la migración.
```

`threshold` es, de los seis primitivos, el que el corpus liga más directamente a evaluación automática — es el primitivo detrás del propio `reason_code` `GRAVITY_THRESHOLD_BREACHED` (**Mandate v1.2.0** §3, **API** §2.3.1) — por eso su envelope siempre trae un predicado comparable completo (métrica, comparador, cantidad), nunca opcional.

### 2.5 `evidence`

```ebnf
evidence_expr   = "evidence" , [ "min" , NUMBER , IDENT ] , criterion ;
```

**Ejemplo — reexpresión formal exacta de `grv_2b91`** (**Mandate v1.2.0** §5), sin perder ningún elemento del original:

```
evidence min 2 patrones_de_fallo_distintos ::
Además de grv_0af5, el fallback debe probarse con al menos dos patrones de fallo
distintos: timeout de conexión y respuesta de Redis con error explícito — no alcanza
con simular solo uno.
```

El fragmento estructurado (`min 2 patrones_de_fallo_distintos`) es información real y útil — permite, por ejemplo, que Conductor Workspace Core muestre "0/2 patrones cubiertos" mientras el ingeniero trabaja — pero **no** convierte la regla en mecánicamente verificable: qué cuenta como "un patrón de fallo distinto" sigue siendo juicio humano, exactamente como el propio `verifiable: false` de la fuente ya declara. El AST lo refleja explícitamente (§4): `predicateComputable` es `false` para todo nodo `evidence`, sin excepción, en esta versión de la gramática — la cuenta mínima es una ayuda de interfaz, no una condición que un evaluador pueda cerrar por sí solo.

### 2.6 `priority`

```ebnf
priority_order  = IDENT , "over" , IDENT , { "," , IDENT , "over" , IDENT } ;
priority_expr   = "priority" , priority_order , [ "for" , IDENT ] , [ criterion ] ;
```

**Ejemplo — reexpresión exacta del ejemplo de `priority` ya citado en Impl §3.3.1:**

```
priority hotfix over refactor for scope_collision ::
Ante conflicto de scope entre sub-Mandates de refactor y de hotfix, el hotfix tiene
precedencia.
```

`for scope_collision` es la clase de colisión a la que aplica esta precedencia — el mismo campo que el algoritmo de arbitraje de **Impl** §3.3 necesita para decidir, ante un `ArbitrationEvent`, si existe una `priority rule` aplicable (§5 deja explícito que ese consumo pertenece al mecanismo de arbitraje, no a este documento).

### 2.7 `escalation`

```ebnf
escalation_expr = "escalation" , "to" , IDENT , [ "for" , IDENT ] , [ criterion ] ;
```

**Ejemplo — reexpresión exacta del ejemplo de `escalation` ya citado en Orb §18:**

```
escalation to organization for signed_contract_change ::
Cualquier modificación a un contrato ya firmado requiere autoridad de Organization,
sin excepción.
```

`to organization` referencia un nivel de la jerarquía ya fijada (`nucleus | organization | project | mandate | session`, **Impl** §2.2) — no un `IDENT` arbitrario sin significado conocido por el resto del sistema.

### 2.8 `exception` (mecanismo de R-19)

```ebnf
exception_expr  = "exception" , "of" , POSTURE_REF , criterion ;
```

**Ejemplo — reexpresión del escenario que Mandate v1.2.0 R-19 describe en prosa:**

```
exception of grv_0af4 ::
Este sub-Mandate opera en un scope acotado al fallback de Redis y ya cuenta con
evidencia adicional (grv_2b91); el umbral genérico del padre puede relajarse a un
único patrón adicional de timeout, no dos.
```

`criterion` es obligatorio acá con más razón que en `constraint`/`evidence`: R-19 exige que la excepción sea "explícita, nombrada" — un `exception of grv_0af4` sin ninguna justificación en lenguaje natural sería, en espíritu, indistinguible de la "contradicción encubierta" que la misma regla R-19 existe para prevenir. La validación de que `grv_0af4` efectivamente exista y esté entre las reglas heredadas visibles para este nodo es una verificación **semántica**, no sintáctica — ocurre contra el Grafo de Gravedad real, nunca dentro del parser (§6).

### 2.9 Reglas de buena formación (validación estática, post-parseo, pre-semántica)

| Regla | Enunciado |
|---|---|
| WF-1 | `POSTURE_REF` debe matchear `^grv_[A-Za-z0-9_]+$` en toda posición donde aparece (hoy, solo `exception_expr`). |
| WF-2 | Toda `criterion` presente, tras recortar espacios en los extremos, debe tener longitud > 0. Una cláusula `::` seguida de nada o solo de espacios es un error de sintaxis, no una cláusula vacía válida. |
| WF-3 | `criterion` es obligatoria (su ausencia es error de sintaxis) para `constraint_expr`, `evidence_expr` y `exception_expr` — ver §1.1. Es opcional para `threshold_expr`, `priority_expr`, `escalation_expr`. |
| WF-4 | Ninguna palabra reservada (`constraint`, `threshold`, `evidence`, `priority`, `escalation`, `exception`, `on`, `over`, `for`, `to`, `of`, `min`) puede usarse como valor de un `IDENT` en posición de nombre libre (métrica, categoría, target). Si un ingeniero necesita ese literal, debe calificarlo (p. ej. `metric_priority` en vez de `priority` como nombre de métrica). |
| WF-5 | En `priority_order`, cada par declarado (`X over Y`) debe tener `X ≠ Y`. Pares repetidos no son error de sintaxis (son redundantes, no contradictorios) — se resuelven en tiempo de evaluación, no de parseo. |

### 2.10 Alcance textual — qué campo gobierna esta gramática y qué no toca

Esta gramática gobierna exclusivamente el contenido de `gravityPostures[].expression: string` (**Mandate v1.1.0**/`v1.2.0`, sin cambio de tipo). No define, valida ni interpreta `postureId`, `primitive` (el valor de este campo, `"constraint" | "threshold" | "evidence" | "priority" | "escalation" | "exception"`, debe ser consistente con el primitivo que la gramática detectó al parsear `expression` — ver WF cruzada en §6), `appliesTo[]`, `authoredBy`, `verifiable`, `promotable`, `promotedTo`, `status`, ni `promotedFrom` (**Persistencia** §5.3). El cruce con `verifiable` se trata en §5–§6 como validación semántica, nunca como parte de la gramática misma.

---

## 3. Arquitectura del parser

### 3.1 La restricción que ya gobierna esta decisión, sin que este documento la invente

El corpus ya resolvió, repetidamente, la misma pregunta de fondo que "¿parser en cliente, en servidor, o ambos?" plantea: **Orb** §15 cita como regla de ejemplo *"no introducir segunda fuente de verdad"*; **Persistencia** §2.1.7 la eleva a "principio rector explícito del sistema, no una preferencia de este documento"; **Persistencia** §3.2 la usa para retirar una capa de caché completa a mitad de documento cuando descubre que introduciría exactamente ese riesgo; **Persistencia** §4.1 la usa de nuevo para clasificar `gravity_resolution_cache` como "una aceleración, no una fuente de verdad". Dos implementaciones mantenidas a mano por separado — una en Conductor Workspace Core, otra en Nucleus — de "la misma" gramática son, estructuralmente, el mismo riesgo: pueden divergir en silencio (un texto que el cliente acepta y el servidor rechaza, o viceversa), y nadie lo notaría hasta que un ingeniero viera su Postura rebotada después de que el cliente ya la mostró como válida.

### 3.2 Dónde vive: ambos, con roles asimétricos — no simétricos

- **Nucleus es la única autoridad de parseo.** El parseo + validación semántica (§6) debe ocurrir en el mismo punto donde **Mandate v1.2.0** R-18 valida no-contradicción al firmar un nodo, y donde **Persistencia** §2.4 fija que "Nucleus permanece como único escritor de cualquier `node.json`". Un `expression` que no parsea, o que parsea pero viola una regla semántica (§6), no debe llegar a persistirse — el parseo es una precondición normativa de la escritura atómica descripta en **Persistencia** §2.4, no un servicio aparte.
- **Conductor Workspace Core parsea también, pero como acelerador advisory, nunca como autoridad.** Esto es exactamente la misma categoría de objeto que **Client** ya define para `AutoridadDeAlcanceDelIngeniero` y `gravity_resolution_cache`: una copia que ayuda (feedback inmediato mientras el ingeniero escribe el criterio dentro del panel de postulación, **UX** §1.4) pero que nunca reemplaza la verificación real. Un texto que el parser del cliente acepta y el de Nucleus rechaza no es una inconsistencia tolerada en silencio — es, por diseño, resuelta siempre a favor de Nucleus, con el mismo principio que ya gobierna cualquier otra asimetría cliente/servidor de este sistema ("la autoridad nunca se distribuye, aunque el acceso sí", citado en **Impl** §0 y **Persistencia** §2.4).

**INVARIANT-GRAMMAR-001:** ningún `GravityNode.gravityPostures[]` persistido puede contener una `expression` que no parsee, bajo la gramática vigente en el momento de la firma, según el parser autoritativo de Nucleus. El parser de Conductor Workspace Core nunca es el árbitro de esta invariante — solo puede acelerar el momento en que el ingeniero descubre una violación, nunca decidirla.

**INVARIANT-GRAMMAR-002:** la validación semántica cruzada entre `verifiable` (campo del objeto) y `predicateComputable` (propiedad derivada del AST, §4) ocurre en el mismo punto y con el mismo mecanismo que R-18 — antes de la firma del nodo, nunca después, nunca como corrección posterior.

### 3.3 Punto de integración exacto

- **Nucleus:** dentro de la misma operación que ya firma un nodo `ORGANIZATION`/`PROJECT`/`MANDATE`/`SESSION` (**Persistencia** §2.4, §6.4) o que valida un sub-Mandate al firmarlo (**Mandate v1.2.0** R-18) — el parseo+validación de cada `expression` nueva o modificada en `gravityPostures[]` corre inmediatamente antes de esa firma, como un paso más de la misma validación conjunta que R-18 ya ejecuta, no como un servicio aparte con su propio ciclo de vida.
- **Conductor Workspace Core:** dentro del objeto `PosturaDraft` que **Client** §2 define históricamente como cliente-only y mutable hasta confirmar — específicamente sobre el campo `criterio` de ese borrador, mientras el panel inline originado en **UX** §1.4 está abierto. El resultado del parseo advisory es un dato **cliente-only y efímero**: nunca se envía a Nucleus como AST autoritativo, se descarta con el borrador si el ingeniero cierra sin confirmar y no sustituye la respuesta de Nucleus. La ubicación concreta de la invocación en la aplicación Electron se define en el anexo de Conductor Workspace Core; no está implementada en el estado actual.

**3.3.1 Estado de implementación al 2026-08-29.** Las fachadas puras Go
`gravity.Parse(string)` y TypeScript `parse(string)` existen y tienen pruebas
focalizadas. Todavía no existe un comando Cobra que exponga el parser, la
operación autoritativa de escritura/firma no invoca `gravity.Parse`, y
Conductor Workspace Core no importa ni empaqueta el parser TypeScript. Los dos
puntos anteriores describen el destino normativo de integración, no un flujo
productivo ya activo.

### 3.4 Tecnología — evaluación de opciones

**Evidencia de contexto — corregida, ya no hipotética.** El repositorio comparte tipos entre componentes (Batcave, Conductor, el backend nuevo de Cloudflare Workers) a través de una carpeta `contracts/` en TypeScript validada con Zod (`Backend_Cloudflare_Arquitectura_v0_1.md` §2–§3, documento del mismo proyecto) — ✅ confirmado, y Conductor Workspace Core corre sobre JavaScript/TypeScript dentro de Electron. Lo que la versión anterior de este documento marcaba como ⚠️ no confirmado — si el punto de validación/firma real de Nucleus corre sobre ese mismo runtime — ya está resuelto por evidencia directa, no por supuesto: el cowork de Persistencia del Grafo (Eje 1) implementó `installer/nucleus/internal/gravity/store.go` (escritura atómica de `node.json`, `CreateNode`, control de `nodeVersion`) y `resolver.go` (`ResolveActive`, la implementación real de `resolve_active_gravity`/`resolveActiveGravityActivity`, **Impl** §2.1, **Persistencia** §3.1) — ambos en **Go**, `package gravity`, verificados directamente contra el archivo real. **Los runtimes de Conductor Workspace Core y Nucleus difieren, confirmado — no es ya un escenario a evaluar entre dos.** Esto confirma el lenguaje objetivo Go, pero no implica que `Parse()` ya esté invocado en la operación de firma; ese wiring permanece pendiente según §3.3.1.

| Criterio | (A) Recursive descent a mano | (B) Generador PEG (p. ej. peggy/nearley) | (C) ANTLR4 |
|---|---|---|---|
| Ajuste a la forma real de esta gramática (dispatch LL(1) por palabra clave inicial + una cola de texto libre sin tokenizar) | Sobrado — 6 producciones de nivel superior, cada una resuelta por un solo token de lookahead | Sobrado también, con una capa de generación que esta gramática no necesita para resolver ambigüedad (no hay ninguna) | Muy sobrado — ANTLR resuelve gramáticas con ambigüedad real, backtracking, LL(*); esta gramática no la tiene |
| Riesgo de divergencia cliente/servidor si ambos corrieran el **mismo** runtime (escenario descartado por evidencia — ver arriba) | Ninguno — un solo módulo TypeScript, importado literalmente igual por cliente y servidor, mismo patrón que `contracts/` ya usa hoy para `OwnershipSchema`/`BatcaveConfigSchema` | Ninguno tampoco, pero agrega una etapa de build (compilar `.pegjs`/`.ne` a código) sin beneficio real sobre (A) en este escenario | Ninguno tampoco, pero agrega un toolchain de codegen (Java) para un problema que un solo módulo ya resuelve en este escenario |
| Riesgo de divergencia dado que los runtimes **difieren** (escenario confirmado — TypeScript en Conductor Workspace Core, Go en `installer/nucleus/internal/gravity/`) | Alto — exige mantener dos implementaciones escritas a mano en dos lenguajes, exactamente el riesgo que §3.1 señala | Medio — el archivo de gramática se comparte como texto, pero la sintaxis de acciones semánticas de cada generador PEG no es portable entre herramientas de distinto lenguaje; "mismo archivo" no garantiza "mismo parser" | Bajo — un único archivo `.g4` genera parsers para múltiples lenguajes objetivo (incluye TypeScript/JavaScript y Go) desde la misma definición formal; es la herramienta diseñada específicamente para este problema |
| Control fino sobre mensajes de error (necesario para §6: distinguir en forma un error de sintaxis de las seis señales de conflicto de **UX** §3.2) | Total — cada punto de fallo en el parser a mano decide su propio mensaje y posición | Alto pero indirecto — depende de las capacidades de reporte de errores del generador elegido | Medio — el reporte de errores por defecto de ANTLR es genérico; personalizarlo a la forma exacta que §6 exige requiere un `ErrorListener` a medida, trabajo adicional no trivial |
| Dependencias/tooling nuevo introducido | Ninguna — es código TypeScript ordinario | Una dependencia de build nueva | Un toolchain de codegen (Java en build time) + runtime ANTLR por lenguaje objetivo |
| Costo de extender la gramática cuando aparezcan nuevos primitivos (**Orb** §29 deja la lista de primitivos explícitamente abierta: `decision`, `risk`, `authority`, `tolerance`, `invariant`, `scope`, `inherit`, `override`, `expire`, `promote`, entre otros, como hipótesis todavía no confirmadas) | Bajo — agregar una producción nueva es agregar una función nueva al dispatcher | Bajo — agregar una regla nueva al archivo de gramática | Bajo — agregar una alternativa nueva a la regla `expression` del `.g4` |

**3.4.1 Decisión.** Se recomienda **(C) ANTLR4**, con el archivo `.g4` como artefacto canónico versionado, generando parser para TypeScript (destinado a Conductor Workspace Core) y para Go (destinado a Nucleus, dentro del mismo paquete `gravity` donde ya viven `store.go` y `resolver.go`) desde la misma definición formal. Aplicando directamente el criterio de la fila "Riesgo de divergencia dado que los runtimes difieren" de la tabla anterior — que es, confirmado, el escenario real — (C) es la única de las tres opciones con garantía real de semántica de parseo idéntica entre ambos lenguajes: mismo `.g4`, mismo generador, sin dos implementaciones mantenidas a mano que puedan divergir en silencio, exactamente el riesgo que §3.1 ya identificó como el mismo patrón que este corpus viene rechazando repetidamente (**Orb** §15, **Persistencia** §2.1.7/§3.2/§4.1). Se descarta **(A)**: un módulo único ya no es posible como tal — Go no puede importar un módulo TypeScript, así que "recursive descent a mano" implicaría, en la práctica, dos implementaciones separadas escritas a mano en dos lenguajes, precisamente la segunda fuente de verdad que (A) existía para evitar bajo el supuesto de runtime compartido que ya no aplica. Se descarta **(B)** por el motivo que la tabla ya adelantaba: un archivo de gramática PEG compartido entre un generador para JS/TS y uno para Go no garantiza parseo idéntico, solo texto de gramática compartido — una falsa sensación de fuente única sin la garantía real que (C) sí ofrece.

**3.4.2 Confirmación del dato — ya no condición, hecho verificado.** El módulo de persistencia/resolución real en Nucleus está confirmado en código: `installer/nucleus/internal/gravity/store.go` y `resolver.go` existen y están escritos en Go (`package gravity`; `Store.CreateNode`, `Store.ReadNode`, `Store.ResolveActive`). Conductor Workspace Core corre en Electron sobre JavaScript, con TypeScript como fuente compartida en `contracts/`. Con ambos runtimes confirmados y distintos, el artefacto canónico es el `.g4` de ANTLR4 versionado, que genera el parser Go junto a `store.go`/`resolver.go` y el parser TypeScript destinado a ser integrado desde `contracts/`. La existencia de ambos parsers está confirmada; sus consumidores productivos permanecen pendientes según §3.3.1.

### 3.5 Nota de notación — por qué §4/§5/§6.3.1 no dependen de esta corrección

Las interfaces en TypeScript de §4 (`GravityExpressionAST`), §5 (`GravityEvaluationContext`/`GravityEvaluator`) y §6.3.1 (`GravityExpressionRejection`) son notación de contrato — el AST, el contexto de evaluación y el objeto de rechazo son, en los tres casos, formas JSON (§4 ya lo dice explícitamente: "todas serializables a JSON [...] consistente con el resto del sistema, que ya es JSON de punta a punta"), descritas ahí en sintaxis TypeScript por legibilidad, del mismo modo en que **Impl** y **Persistencia** describen `GravityNode`/`ArbitrationEvent` en bloques `jsonc` en vez de en el lenguaje real que los implementa. Ninguna de las tres secciones asume ni requiere que el código que las produce o consume esté escrito en TypeScript: el mismo shape es igual de expresable como `struct` de Go con tags `json:"..."` — que es, de hecho, exactamente el patrón que `resolver.go` ya usa hoy para `ResolveResult`/`ResolvedPosture` (`json:"collected"`, etc.), verificado en el mismo archivo citado arriba. No hace falta ni se propone ninguna corrección a §4, §5 o §6 por este motivo — la corrección de esta sección es exclusivamente sobre qué tecnología *genera* los parsers en cada lado (§3.4), nunca sobre la forma del contrato que ambos deben producir.

---

## 4. Estructura de salida — el AST canónico

El parser produce una de seis formas de nodo, todas serializables a JSON (consistente con el resto del sistema, que ya es JSON de punta a punta — `node.json`, `orbital_agentic_state.json`, los DTOs de **API**). El AST es la representación que el resto del sistema (resolución de Gravity, cálculo de Masa, futura detección de conflictos) consume — nunca vuelve a re-parsear el `string` original para leer un primitivo, un target o un predicado.

```typescript
// Nodo base — común a las seis formas
interface GravityExpressionNodeBase {
  grammarVersion: "gravity-expr/0.1";
  primitive: "constraint" | "threshold" | "evidence"
           | "priority"   | "escalation" | "exception";
  raw: string;                    // el texto original completo, verbatim — ver §7
  criterion: string | null;       // cláusula "::", verbatim, recortada de espacios extremos
  predicateComputable: boolean;   // ver §4.1 — propiedad derivada, no declarada
}

interface ConstraintNode extends GravityExpressionNodeBase {
  primitive: "constraint";
  targets: string[] | null;       // de target_list, si estaba presente
  predicateComputable: false;     // constraint nunca es mecánicamente evaluable en v0.1 — ver §1.1/§2.3
}

interface ThresholdNode extends GravityExpressionNodeBase {
  primitive: "threshold";
  metric: string;
  comparator: "<" | "<=" | ">" | ">=" | "==" | "!=";
  quantity: { value: number; unit: string | null };
  predicateComputable: true;
}

interface EvidenceNode extends GravityExpressionNodeBase {
  primitive: "evidence";
  requirement: { minCount: number; kind: string } | null;  // de "min N IDENT", si estaba presente
  predicateComputable: false;     // ver §2.5 — el conteo mínimo no cierra la condición por sí solo
}

interface PriorityNode extends GravityExpressionNodeBase {
  primitive: "priority";
  order: Array<{ higher: string; lower: string }>;
  collisionClass: string | null;  // de "for IDENT", si estaba presente
  predicateComputable: true;
}

interface EscalationNode extends GravityExpressionNodeBase {
  primitive: "escalation";
  escalateTo: string;
  triggerClass: string | null;    // de "for IDENT", si estaba presente
  predicateComputable: true;
}

interface ExceptionNode extends GravityExpressionNodeBase {
  primitive: "exception";
  exceptionOf: string;            // POSTURE_REF — el postureId heredado al que hace excepción (R-19)
  predicateComputable: false;
}

type GravityExpressionAST =
  | ConstraintNode | ThresholdNode | EvidenceNode
  | PriorityNode   | EscalationNode | ExceptionNode;
```

### 4.1 `predicateComputable` — propiedad derivada, no campo declarado

`predicateComputable` no lo elige el ingeniero ni lo escribe el parser por conveniencia: es una función pura de la forma del AST (`f(primitive) → boolean`, sin dependencia de los valores concretos capturados), fijada por primitivo en esta versión de la gramática:

| Primitivo | `predicateComputable` | Motivo |
|---|---|---|
| `threshold` | `true` | Comparador + cantidad ya cierran una condición evaluable sin juicio adicional — es, además, el primitivo detrás de `GRAVITY_THRESHOLD_BREACHED` (§5). |
| `priority` | `true` | El orden entre categorías es una relación bien definida — **Impl** §3.3.1 ya lo trata como automáticamente aplicable cuando es `verifiable`. |
| `escalation` | `true` | El destino de escalamiento es una referencia estructural cerrada al enum de niveles ya fijado. |
| `constraint` | `false` | El propio corpus (**Orb** §18) nunca ejemplifica un `constraint` con predicado cuantitativo — su naturaleza es de invariante cualitativo. |
| `evidence` | `false` | `grv_2b91` es la prueba directa: incluso con una cuenta mínima estructurada, el corpus lo declara `verifiable: false` (§2.5). |
| `exception` | `false` | Su contenido operativo es la justificación (§2.8), no una condición — la única parte estructural es la referencia, que la validación semántica resuelve, no un evaluador de predicados. |

Esta tabla es, en sí, el mecanismo concreto de la resolución de tensión de §1.1: la gramática permite que el sistema sepa, sin ambigüedad y sin re-parsear texto, cuáles Posturas puede evaluar solo y cuáles debe siempre presentar como criterio a interpretar por un humano o por el modelo dentro del campo semántico (**Orb** §5, "Contextualized Meaning").

---

## 5. Contrato de evaluación

Esta sección define la **interfaz** que un evaluador necesitaría implementar — no lo implementa. El contrato cubre exclusivamente el caso de incumplimiento verificable que ya tiene `reason_code` fijado (`GRAVITY_THRESHOLD_BREACHED`, **Mandate v1.2.0** §3, re-citado en **API** §2.3.1); el consumo del mismo AST por el mecanismo de arbitraje (**Impl** §3, `priority_posture`/`escalation_posture` como estrategias de `ArbitrationEvent`) es un consumidor **distinto**, fuera de alcance de este documento (§8) — el contrato de abajo no lo rediseña, solo asegura que el AST que produce sea consumible por ambos sin re-parsear.

```typescript
interface GravityEvaluationContext {
  postureId: string;
  origin: "nucleus" | "organization" | "project"
        | "mandate_own" | "mandate_inherited" | "session";   // Impl §2.2
  ast: GravityExpressionAST;              // ya parseado, nunca el string crudo — ver §7
  verifiableDeclared: boolean;            // campo `verifiable` del objeto gravityPostures[]
  turn: { intentType: string };           // suficiente para el filtrado ya fijado por appliesTo — Impl §2.1
  metrics: Record<string, number>;        // valores medidos disponibles para este turno;
                                           // de dónde vienen queda fuera de este contrato — es
                                           // responsabilidad del evaluador real (fuera de alcance, §8)
}

type GravityEvaluationOutcome =
  | { status: "not_applicable" }
      // ast.predicateComputable === false, o verifiableDeclared === false:
      // esta Postura nunca produce un breach automático, por diseño (§4.1) —
      // sigue disponible como criterio dentro de Resolved Active Gravity,
      // nunca como gate mecánico.
  | { status: "satisfied" }
  | { status: "breached";
      reasonCode: "GRAVITY_THRESHOLD_BREACHED";
      postureId: string;
      postureRef: string }
      // postureRef == postureId — mismo campo, mismo nombre que ya usa Mandate v1.2.0 §3
      // ("el posture_ref apunta al postureId heredado"), sin acuñar un nombre nuevo
  | { status: "indeterminate"; reason: string };
      // p. ej. la métrica que threshold necesita no está en metrics{} para este turno

interface GravityEvaluator {
  evaluate(ctx: GravityEvaluationContext): GravityEvaluationOutcome;
}
```

**5.1 Invariante de consistencia.** Para cualquier `ctx` donde `ctx.ast.predicateComputable === false` o `ctx.verifiableDeclared === false`, `evaluate(ctx)` debe devolver `{ status: "not_applicable" }` de forma determinista — nunca `"breached"`. Esto no es una recomendación de implementación: es la forma en que este contrato garantiza, estructuralmente, que `constraint`/`evidence`/`exception` (y cualquier `threshold`/`priority`/`escalation` que el ingeniero haya marcado `verifiable: false` a propósito) nunca puedan disparar un rechazo automático de turno — su función es informar la interpretación (**Orb** §5, §10), no bloquearla mecánicamente.

**5.2 Por qué no hay un `status` de "conflicto qualitativo".** Un evaluador podría, en principio, querer señalar "esta Postura no verificable parece tensionar con la acción propuesta". Ese juicio pertenece al modelo dentro del Agent Loop, interpretando `Resolved Active Gravity` como contexto semántico (**Orb** §5–§10) — no a este contrato de evaluación mecánica, que solo existe para el caso `verifiable: true` con `reason_code` ya fijado. Formalizar ese juicio cualitativo en este contrato sería, otra vez, el mismo aplanamiento que §1 descarta.

---

## 6. Manejo de error de sintaxis

### 6.1 Por qué no es una séptima señal de conflicto

**UX** §3 fija, con disciplina explícita ("Orb §15 enumera [...] **seis** respuestas, no cinco"), exactamente seis señales para cuando un turno entra en conflicto con Gravity ya vigente: ⛔ Rechazado, ⚠️ Señalado, 🔁 Reinterpretado, ⬆️ Elevación pedida, 🔓 Excepción, 📝 Propuesta de cambio. Las seis comparten una premisa: existe ya una Gravity válida contra la cual el turno entra en tensión. Un error de sintaxis en `expression` ocurre **antes** de que exista esa premisa — la Postura todavía no logró convertirse en Gravity, así que no hay nada todavía con lo que un turno pueda entrar en conflicto. Tratarlo como una variante más de esas seis señales confundiría dos preguntas de naturaleza distinta: *"¿esto que escribiste es Gravity válida?"* (pregunta de esta sección) contra *"¿esto que pediste choca con la Gravity que ya rige?"* (pregunta que **UX** §3 ya resuelve). Por la misma razón que **UX** §3.3 exige que la reinterpretación (3) y la excepción (5) nunca compartan estilo entre sí — para que nadie confunda "se ejecutó lo pedido" con "se ejecutó una alternativa" — un error de sintaxis debe ser, en su forma, inconfundible con cualquiera de las seis: nunca usa sus íconos (⛔⚠️🔁⬆️🔓📝), nunca su color reservado, nunca su ubicación en el flujo de **UX** §5 (que empieza después de `resolve_active_gravity`, un paso que un `expression` sin parsear nunca alcanza).

### 6.2 Dónde ocurre en el flujo de UX §5, sin reabrirlo

El diagrama de estados de **UX** §5 entra a "POSTULACIÓN ACTIVA" (panel inline, criterio · alcance · confirmar) y de ahí, al confirmar, "el mensaje queda marcado permanentemente como Postura". El parseo+validación ocurre exactamente en ese paso de confirmación — es una condición previa a que ese marcado permanente ocurra, del mismo tipo que cualquier validación de formulario ordinaria, no un séptimo estado del diagrama de conflicto. Si falla, la postulación no se confirma y el panel permanece abierto con el error señalado — el mismo lugar donde ya vive `PosturaDraft.criterio` (**Client** §2), nunca una pantalla ni un flujo nuevo.

### 6.3 Dos clases, no una — y por qué la distinción importa

| Clase | Cuándo ocurre | Ejemplo |
|---|---|---|
| **Sintáctica** | El texto no matchea ninguna producción de §2 — token inesperado, palabra clave de primitivo ausente o mal escrita, `criterion` obligatoria ausente (WF-3), `POSTURE_REF` mal formado (WF-1) | `constraint on ::` (falta el nombre después de `on`) |
| **Semántica** | El texto parsea a un AST válido, pero viola una regla que solo el Grafo de Gravedad real (Nucleus) puede verificar | `verifiable: true` declarado en el objeto, pero `ast.predicateComputable === false` (viola INVARIANT-GRAMMAR-002); o `exception of grv_9999` donde `grv_9999` no existe entre las reglas heredadas visibles para este nodo (viola R-19) |

La distinción importa porque solo la primera es detectable enteramente en el cliente (Conductor Workspace Core no necesita el Grafo de Gravedad real para saber que `on` quedó sin argumento); la segunda exige, por diseño, la verificación autoritativa de Nucleus contra datos que el cliente nunca ve completos (**API** §3.1, misma justificación de opacidad que ya rige la exposición del grafo completo). Conductor Workspace Core puede dar una verificación *advisory* parcial de la segunda clase cuando el dato ya es visible en el breadcrumb resuelto de ese turno (**UX** §2.3 ya lista los `postureId` heredados aplicables) — pero nunca la trata como definitiva, mismo principio que §3.2 ya fija para el resto del parseo del lado del cliente.

**6.3.1 Forma de la respuesta — propuesta 🆕, no ratificada, siguiendo la misma disciplina de marcado que **API** §2.3.2/§2.3.4 usa para códigos sin respaldo textual todavía:**

```typescript
type GravityExpressionRejection =
  | { errorClass: "syntax";
      reasonCode: "GRAVITY_EXPRESSION_SYNTAX_ERROR";   // 🆕 — no forma parte del catálogo cerrado de API §2.3.1
      message: string;
      position: { offset: number; line: number; column: number };
      expectedTokens?: string[] }
  | { errorClass: "semantic";
      reasonCode: "GRAVITY_EXPRESSION_SEMANTIC_ERROR"; // 🆕 — ídem
      message: string;
      violatedRule: "verifiable_requires_computable_predicate"  // INVARIANT-GRAMMAR-002
                   | "exception_target_not_inherited";           // R-19
      postureRef?: string };                                        // el POSTURE_REF referenciado, si aplica
```

Ninguno de los dos `reason_code` se mezcla, sin marcar, dentro de la unión cerrada que **API** §2.3.1 ya fijó para el ciclo de vida de un turno (`INTENT_MISCLASSIFIED`, `SCOPE_VIOLATION`, `PATH_FORBIDDEN`, `BUDGET_EXCEEDED`, `COR_FORBIDDEN_FOR_AGENT`, `GRAVITY_THRESHOLD_BREACHED`) — son, estructuralmente, códigos de un momento distinto (autoría de una Postura, no evaluación de un turno ya firmado), y **INVARIANT-GRAMMAR-001** (§3.2) es precisamente la garantía de que, una vez que un turno corre, ninguno de estos dos códigos puede aparecer ya: toda `expression` persistida ya pasó este chequeo antes de la firma.

---

## 7. Fuente de verdad del AST

### 7.1 Aplicando el mismo principio que Persistencia §3.2

**Persistencia** §3.2 evaluó exactamente este tipo de pregunta para el contenido de `gravityPostures[]` en general, y se corrigió a sí mismo a mitad de documento al encontrarla: *"la versión inicial de este documento proponía cachear también el contenido de `gravityPostures[]` [...] Se retira esa capa de caché; el contenido se lee siempre fresco"* — con la justificación de que persistirlo en `orbital_agentic_state.json` "crearía una copia de las posturas paralela a `.bloom/.gravity/`, la segunda fuente de verdad que el propio sistema ya prohíbe". El AST de `expression` es, literalmente, contenido derivado de `gravityPostures[]` — el mismo razonamiento aplica sin necesidad de reabrirlo: **el `expression: string` ya persistido en `node.json` es la única fuente de verdad; el AST es siempre derivado, nunca persistido como campo aparte.**

### 7.2 Por qué el caso de rendimiento no alcanza el umbral que exigiría cachear

**Persistencia** §3.2 justifica no cachear el contenido de `gravityPostures[]` comparando el costo real: *"leer 4–6 archivos `node.json` por turno es órdenes de magnitud más barato que la propia llamada al modelo dentro de `propose_next_action`"*. Parsear un puñado de `expression` cortas (típicamente una o dos oraciones, según todos los ejemplos del corpus) con el parser de §3 es, a su vez, órdenes de magnitud más barato que el propio *file read* que ya se descartó cachear — no hay I/O, es cómputo puro sobre un string ya cargado en memoria. Si el argumento de **Persistencia** §3.2 fue suficiente para no cachear el contenido crudo, con más razón es suficiente para no cachear su derivado. No se acuña ninguna excepción de rendimiento en este documento.

### 7.3 La única forma de "caché" permitida — y por qué no es una segunda fuente de verdad

Una memoización estrictamente local a una sola invocación de `resolveActiveGravityActivity` (**Persistencia** §3.1) — evitar volver a parsear el mismo `expression` si aparece dos veces dentro del mismo `collected` de un mismo turno — no viola nada de lo anterior: vive y muere dentro de una única ejecución de Activity, nunca cruza un límite de replay de Temporal, nunca se persiste en `orbital_agentic_state.json` ni en `node.json`, y por lo tanto no puede quedar desincronizada de nada — se recalcula desde el mismo `expression` fuente en cada invocación siguiente. Esto es distinto en naturaleza del `gravity_resolution_cache` que **Persistencia** §4.1 sí persiste (la espina estructural, que sobrevive turnos) — este documento no propone nada equivalente para el AST.

### 7.4 `parse(expression) → AST` es una función pura — misma disciplina que compute_masa

**Persistencia** §5.4 fija `compute_masa` como *"función pura — sin I/O, sin parámetros de grafo"*, precisamente para poder invocarla dentro de la misma Activity que ya cargó los datos, sin abrir un nuevo problema de determinismo de replay (**Persistencia** §3.4). `parse(expression: string) → GravityExpressionAST` cumple exactamente la misma propiedad: dado el mismo string, produce siempre el mismo AST, sin I/O ni dependencia de estado externo. Puede invocarse dentro de `resolveActiveGravityActivity` (§3.1 de **Persistencia**) sin introducir ningún nuevo límite de Activity ni ninguna preocupación de no-determinismo — la única operación no determinista de esa Activity sigue siendo, exactamente como **Persistencia** §3.4 ya estableció, la lectura de filesystem, no el parseo posterior de lo ya leído.

### 7.5 Lo que queda deliberadamente sin resolver aquí

La evolución futura de la gramática (nuevos primitivos desde la lista todavía hipotética de **Orb** §29) plantea una pregunta real de compatibilidad — un `expression` válido bajo `gravity-expr/0.1` debería seguir parseando bajo una versión futura, o el sistema necesita un mecanismo de migración — pero, exactamente como **Persistencia** §0.2 aprovechó para el resto del Grafo de Gravedad, hoy no existe ningún `expression` real persistido: no hay nada que migrar todavía. Este documento fija `grammarVersion: "gravity-expr/0.1"` en el AST (§4) como el gancho que una futura decisión de versionado necesitaría, pero no diseña esa decisión — queda para cuando exista una segunda versión real de la gramática que la requiera, no antes.

---

## 8. Fuera de alcance de este documento

Siguiendo la misma disciplina que **Impl** §5 y **Persistencia** §8 aplican sobre sí mismos:

- **El evaluador real.** El contrato de §5 define la interfaz; ninguna implementación de `GravityEvaluator.evaluate()` —ni la fuente de las `metrics{}` que un `threshold` necesitaría para evaluarse— se especifica aquí.
- **El diseño o rediseño de la UI del gesto de postulación.** Ya cerrado en **UX** §1 (Alternativa A); este documento solo señala en qué objeto y en qué paso del flujo ya existente se integra el parseo (§3.3, §6.2), sin tocar tokens visuales, íconos nuevos, ni el mecanismo de activación del panel.
- **El mecanismo de arbitraje y la detección/tipificación de colisiones** (**Impl** §3 completo, Eje 2/4). El AST de §4 es consumible por ese mecanismo (los campos `collisionClass` de `PriorityNode` y `triggerClass` de `EscalationNode` existen precisamente para ese consumo), pero cuándo se dispara un arbitraje, cómo se resuelve, y cómo se notifica siguen exactamente donde **Impl** §3 y **API** §4.3 los dejaron.
- **Cualquier superficie de comando administrativo para Gravity** — ya descartada antes de este documento; no se reconsidera.
- **Versionado y compatibilidad hacia adelante de la gramática** ante nuevos primitivos (§7.5) — deliberadamente diferido hasta que exista una necesidad real, no antes.
- **Ratificación de los `reason_code` nuevos propuestos en §6.3.1** (`GRAVITY_EXPRESSION_SYNTAX_ERROR`, `GRAVITY_EXPRESSION_SEMANTIC_ERROR`) — marcados 🆕, con la misma disciplina de **API** §2.3.2 para códigos sin ratificar: se documentan como propuesta de este documento, no como hecho ya cerrado del catálogo de `reason_code`.
- **Un catálogo fijo de nombres de métrica, categoría de colisión o nivel de escalamiento** más allá del enum de niveles ya existente (`nucleus | organization | project | mandate | session`). Todo `IDENT` de métrica (`coverage_pct`), categoría (`scope_collision`) o unidad de evidencia (`patrones_de_fallo_distintos`) es libre, elegido por el ingeniero que postula — este documento no cierra un vocabulario controlado para ellos.

---

*Fin de la especificación de implementación v0.1. La gramática de §2 no reduce ninguna Postura a `si A entonces B`: `predicateComputable` (§4.1) es la garantía estructural de que `constraint`, `evidence` y `exception` permanecen, por diseño, como criterio interpretado dentro del campo semántico de Gravity (Orb §5, §10) — nunca como condición mecánica — mientras `threshold`, `priority` y `escalation` sí pueden alimentar el `reason_code` ya existente `GRAVITY_THRESHOLD_BREACHED` cuando el ingeniero los declara `verifiable`. Ninguna decisión ya cerrada de Cor, Orb, Mandate v1.0.0–v1.2.0, Impl, Persistencia, UX, Client o API fue reabierta — donde este documento se apoya en una de ellas, la cita señala exactamente cuál.*
