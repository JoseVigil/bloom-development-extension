# Wisdom — Investigación de Persistencia y Mecanismo de Handshake (v0.1)

**Tipo:** Investigación de arquitectura (no implementación, no decide por vos)
**Estado:** Borrador v0.1
**Fecha:** 2026-08-29
**Encargo explícito:** *"Necesito ver cómo vamos a trabajar el tema de Wisdom... Wisdom es el repositorio o futuro marketplace de los mandatos, y es muy importante. [...] Metamorph tiene la prioridad porque va a ser el principal medio, pero Mandates es importante. Cómo los guardamos, qué información tienen localmente, qué se guarda para poder persistir la información más importante, y por qué."*
**Alcance:** esto es investigación secundaria — no compite con ni retrasa el trabajo de Cloudflare/Metamorph de `Backend_Cloudflare_Arquitectura_v0_1.md`. El objetivo es dejar registrado, con evidencia y sin inventar nada no confirmado, qué existe hoy sobre Wisdom, qué falta, y qué se puede hacer ya mismo a bajo costo para no cerrarse puertas.
**Fuentes revisadas (11 documentos, más los 4 de la sesión anterior):**
`Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md`, `Corolario___La_persona_como_fuente_de_Gravity.md`, `PALADIN_FOUNDATION_AND_PRELIMINARY_ROADMAP_v0_1.md`, `AGENDA_MAESTRA.md`, `Bloom_Conductor_Core_UI_Contexto_para_Codex.md`, `BLOOM_Estado_Consolidado_Takeaway_v1.md`, `BLOOM_Mandate_Package_Spec_v1_0_0.md`, `BLOOM_Cognitive_Evidence_Model_v1_0_0.md`, `Mandate_Domain_Spec_v1.0.0.md`, `BTIPS_Mandates_Agenticos_Spec_Unificada.md`, `BLOOM_Mandate_Universal_Schema_v1_2_0.md`.

---

## 0. Resumen ejecutivo

Wisdom está **bien definido en su filosofía** y **no definido en absoluto en su mecánica**. Existe una cadena conceptual clara y consistente entre los documentos de Gravity (Persona → Experiencia → Criterio → Postura → Gravity → Wisdom), y un principio de diseño explícito ("la sabiduría pertenece a quien la produce") que va a condicionar cualquier diseño técnico que se haga después. Pero ningún documento de los 11 revisados define: un schema o artefacto llamado `wisdom`, dónde se guarda, quién tiene autoridad de escritura, qué lo promueve desde Gravity, quién firma esa promoción, ni un protocolo de handshake entre organizaciones. Lo más cercano que existe construido es el **Mandate Package Spec** (formato de exportación/importación entre organizaciones) y el **Cognitive Evidence Model** (agregación de evidencia con privacidad), pero ningún documento declara que uno de estos dos sea Wisdom — de hecho el propio Cognitive Evidence Model es explícito en que su objeto (`cognitive_evidence`) vive en un archivo separado del Mandate y nunca se mezcla con él.

Esto confirma, con lectura directa de los 11 documentos, el mismo diagnóstico que traía tu reporte pegado: los bloqueadores que señalaba (schema de Wisdom, ownership, promoción, `publisherKeyRef`, anti-replay, qué queda central vs. qué queda solo en Nucleus) siguen sin resolver en la documentación existente. No es un gap de mi lectura — es un gap real del proyecto.

---

## 1. Lo que sí está definido: la cadena conceptual Gravity → Wisdom

`Orbital___Fundamentos...md` (§23, "De Gravity a Wisdom") y `Corolario___La_persona_como_fuente_de_Gravity.md` coinciden en la misma progresión:

```
PERSONA → EXPERIENCIA → CRITERIO → POSTURA (postulación) → GRAVITY (aplicación + evidencia) → WISDOM
```

Puntos confirmados por ambos documentos:

- **Postura** es la unidad humana de Gravity — no es una regla de negocio, es la posición de una persona ante un criterio. `Corolario` la distingue explícitamente de una regla codificada.
- **Masa** (mass) es el factor de influencia computado de una postura — cuánto pesa esa posición en el sistema.
- **Gravity** es lo que resulta cuando una postura se aplica repetidamente y deja evidencia.
- **Wisdom** es lo que resulta de Gravity ya aplicado y evidenciado repetidas veces — es decir, es una etapa *posterior* a Gravity, no un sinónimo de Gravity ni de evidencia cruda.
- **Principio XVI** (`Orbital`, §28, "Principios Fundacionales"): *"La sabiduría pertenece a quien la produce"* — Wisdom no puede quedar cautiva de un proveedor de IA. Esto es una restricción de diseño explícita y va a condicionar cualquier decisión de "qué guarda el backend central vs. qué se queda en Nucleus": el documento fundacional ya se posiciona a favor de que el originador retenga control, no de centralizar.

Ningún documento de los 11 va más allá de esto — no hay una definición operacional de "cuándo una Gravity se convierte en Wisdom" (¿un umbral de repeticiones? ¿una aprobación humana? ¿un puntaje de confianza?). Es una laguna real, no algo que yo no haya encontrado.

---

## 2. Lo más cercano que existe construido — y por qué no es Wisdom todavía

### 2.1 Mandate Package Spec (`BLOOM_Mandate_Package_Spec_v1_0_0.md`)

Es el documento más concreto de los 11 en términos de mecánica de intercambio entre organizaciones. Define:

- Anatomía completa de un paquete exportable: `manifest.json`, `mandate.json`, `compliance.linter.json`, `cognitive_assets/` (`embeddings.json`, `gene_blueprints/`), `integrity/` (`checksum.sha256`, `signature.json`).
- Flujo de export (`nucleus mandate publish`) e import (`nucleus mandate install`) en 7 pasos cada uno.
- Una lista explícita de **qué NO viaja en el paquete**: `mandate_state.json` (estado mutable de ejecución), `similarMandates[]`/`linkedGenes[]` con IDs reales, `dependencies.genes[]`, rutas absolutas y credenciales, el `signedAt` real.
- **Invariantes I-7 a I-12** que gobiernan integridad y qué se generaliza antes de exportar.

**El gap que el propio documento reconoce (Pendiente P-1):** el formato de `publisherKeyRef` — cómo se identifica y distribuye la clave pública del publicador — está **sin definir**. Es exactamente el corazón de cualquier "handshake": sin esto, no hay forma de que una organización que importa un Mandate verifique de forma confiable quién lo firmó. Este es el bloqueador más concreto y más citado de los que trae tu reporte, y lo confirmo de primera mano: el documento lo deja abierto explícitamente, no es una inferencia mía.

### 2.2 Cognitive Evidence Model (`BLOOM_Cognitive_Evidence_Model_v1_0_0.md`)

Define cómo se agrega evidencia entre Nucleus de forma anónima:

- `cognitive_evidence` vive **solo** en `epoch_N.json` — **invariante I-13: nunca en `mandate.json`**. Esto es una separación de diseño explícita y ya construida en la especificación (no en código confirmado, pero sí en el spec).
- k-anonymity ≥ 20 Nucleus distintos por celda, con tope de 20% de contribución de un solo Nucleus (I-16).
- Presupuesto de privacidad diferencial (epsilon) por tiempo de vida del dataset (I-17).
- `generalizationLevel` nunca se publica externamente (I-18).
- Clustering de embeddings en dos niveles — solo se indexan centroides, nunca el dato crudo (§2.1).
- Búsqueda y path-finding son **locales**, después de descargar el epoch completo — **no hay llamadas en vivo por query al agregador (I-23)**. Esto es directamente relevante a tu pregunta de "qué se guarda localmente": según este documento, el Nucleus descarga el epoch completo y opera localmente sobre él, no consulta en cada búsqueda.
- `reuseHistory`/`evolution` son arrays de solo-append (I-24).

**Por qué esto no es "Wisdom" todavía:** en ningún punto del documento se declara equivalencia entre `cognitive_evidence` y "Wisdom". Es una pieza de infraestructura de privacidad y agregación — muy relevante como *mecanismo* que Wisdom probablemente va a necesitar (anonimización, agregación entre organizaciones, control de qué se generaliza), pero el documento nunca hace ese salto conceptual él mismo. Tratarlos como sinónimos sería inventar una decisión que el proyecto no tomó todavía.

### 2.3 Gravity inheritance en sub-Mandates (`BLOOM_Mandate_Universal_Schema_v1_2_0.md`)

Define reglas R-17 a R-21 sobre cómo un sub-Mandate hereda `governance.inheritedGravityRules[]` de su Mandate padre, con validación de no-contradicción al firmar (R-18), mecanismo de excepción nombrada (R-19), unión transitiva a profundidad máxima 2 (R-20), y que `promotable`/`promotedTo` queda ligado únicamente al `sourceMandateId` (R-21).

**Alcance real:** esto gobierna herencia **dentro de la misma organización** (Mandate padre → sub-Mandate). No dice nada sobre cómo Gravity o Wisdom se comparten **entre** organizaciones, que es el caso que te importa para el Marketplace. Es la pieza más cercana a un mecanismo de "promoción", pero está resuelta solo para el caso de un mismo origen.

---

## 3. La UI ya tiene un lugar para Wisdom — pero es un stub vacío

`Bloom_Conductor_Core_UI_Contexto_para_Codex.md` confirma que existe un ítem de navegación "Wisdom" en el sidebar de Conductor, descrito como un explorador de Mandates clasificados por **Pillars** (Security/Infrastructure/Governance). El propio documento deja registrada la pregunta abierta: *"falta confirmar si el campo 'Pillar' ya existe en el schema de mandate del backend o hay que agregarlo."*

Esto importa para tu pregunta de "qué se persiste": si Wisdom en la UI va a clasificar por Pillar, ese campo tiene que existir en algún lado del schema — hoy no existe confirmado en ningún documento de Mandate que revisé (`Mandate_Domain_Spec_v1.0.0.md`, `BLOOM_Mandate_Universal_Schema_v1_2_0.md`). Es un cabo suelto concreto, no solo conceptual.

---

## 4. Tabla de gaps (confirmado vs. sin definir)

| Pregunta | Estado | Evidencia |
|---|---|---|
| ¿Existe un schema/artefacto propio llamado "Wisdom"? | ❌ No definido | Ningún documento de los 11 lo declara |
| ¿Dónde se guarda Wisdom y quién tiene autoridad de escritura? | ❌ No definido | — |
| ¿Qué promueve una Gravity a Wisdom (umbral, aprobación, puntaje)? | ❌ No definido | `Orbital` §23 describe la progresión conceptual, no el criterio operacional |
| ¿Quién aprueba/firma esa promoción? | ❌ No definido | — |
| ¿Reglas de ownership, export, revocación, transferencia? | 🟡 Parcial | `PALADIN_FOUNDATION...md` §13 lista "¿Cómo se adquiere, promueve, exporta o retiene Wisdom?" como una de 12 preguntas de gobernanza **abiertas explícitamente**; §8 marca "Borrado o cambio de ownership" como riesgo **Crítico** para Mandates/Wisdom/evidencia |
| ¿`cognitive_evidence` es lo mismo que Wisdom / Gravity reusable? | ❌ No, explícitamente separado | `BLOOM_Cognitive_Evidence_Model_v1_0_0.md` I-13: vive solo en `epoch_N.json`, nunca en `mandate.json`; no se equipara a Wisdom en ningún punto |
| ¿Protocolo de clave pública para `publisherKeyRef`? | ❌ No definido (bloqueador confirmado) | `BLOOM_Mandate_Package_Spec_v1_0_0.md`, Pendiente P-1 |
| ¿Endpoints, versionado, idempotencia, anti-replay del handshake? | ❌ No definido | No hay ningún endpoint HTTP de Marketplace/Wisdom descrito en ningún documento — el Mandate Package Spec define archivos e invariantes, no una API |
| ¿Qué queda en el servidor central vs. qué queda solo en Nucleus? | 🟡 Parcial | Confirmado para Mandate/evidencia (§2.1, §2.2 arriba); no confirmado para Wisdom en sí, porque Wisdom como artefacto no existe todavía |
| ¿Campo "Pillar" para clasificar Wisdom en la UI? | ❌ No confirmado en el schema | `Bloom_Conductor_Core_UI_Contexto_para_Codex.md` deja la pregunta abierta explícitamente |

---

## 5. Lo que sí se puede responder hoy: qué información se guarda dónde, y por qué

Aunque Wisdom como artefacto no está definido, la pregunta de fondo que hiciste — *"qué información tienen localmente, qué se guarda para persistir lo más importante"* — sí tiene una respuesta parcial y concreta, porque el Mandate Package Spec y el Cognitive Evidence Model ya resolvieron esa separación para las piezas que sí existen:

**Se queda solo en Nucleus, nunca sale (por diseño, no por omisión):**
- `mandate_state.json` — estado mutable de ejecución (Mandate Package Spec).
- Evidencia cruda antes de agregación/k-anonimización — el Cognitive Evidence Model solo permite que salga la versión ya agregada en `epoch_N.json`, nunca el dato fuente.
- IDs reales de `similarMandates[]`/`linkedGenes[]`, `dependencies.genes[]`, rutas absolutas, credenciales, `signedAt` real.
- `generalizationLevel` (I-18) — el nivel de generalización aplicado nunca se publica, solo el resultado ya generalizado.

**Sí viaja/persiste centralmente (lo que el Marketplace necesita para funcionar):**
- El Mandate Package completo: `manifest.json` + `mandate.json` firmado (inmutable) + `compliance.linter.json` + `cognitive_assets/` generalizados + `integrity/` (checksum + firma).
- El epoch agregado (`epoch_N.json`) — evidencia ya anonimizada, con presupuesto de privacidad diferencial aplicado y k-anonymity garantizada.

**Por qué esta separación es la correcta y por qué conviene mantenerla también para Wisdom:** es exactamente el patrón que pide el Principio XVI ("la sabiduría pertenece a quien la produce") — lo que se centraliza es siempre una versión ya generalizada/firmada, nunca el dato de origen ni el estado vivo. Cualquier diseño futuro de Wisdom que seguí este mismo patrón (Wisdom = versión promovida/generalizada, nunca el registro crudo de Gravity) va a ser consistente con lo que el proyecto ya construyó para Mandates y evidencia — no hace falta inventar una filosofía nueva, solo aplicar la misma que ya existe.

---

## 6. Qué hacer ahora, dado que Metamorph tiene prioridad

No recomiendo diseñar el schema de Wisdom todavía — sería inventar un mecanismo que el propio proyecto no ha decidido (schema, promoción, firma, ownership siguen abiertos en `PALADIN_FOUNDATION...md` §13, y ese documento es explícito en que es preliminar y no autoriza nada). Hacerlo ahora contradiría la disciplina de este proyecto de no inventar mecanismos no confirmados.

Sí hay dos cosas de costo casi nulo que conviene hacer *ahora*, mientras se construye el backend de Cloudflare (`Backend_Cloudflare_Arquitectura_v0_1.md`), para no tener que romper nada después:

1. **Reservar espacio en el esquema, no la lógica.** Al definir `mandates`/`mandateVersions` en D1 (§4 de la arquitectura Cloudflare), agregar dos columnas nullable desde el día uno: `pillar: text (nullable)` (resuelve la pregunta abierta de §3 de este documento) y `originType: text` (`"org_created" | "wisdom_promoted"`, nullable, default `"org_created"`). Ninguna lógica nueva — solo evita una migración rompiente el día que Wisdom se defina.
2. **Reservar namespace en R2, no el contenido.** Separar desde ya el prefijo `mandates/` del prefijo `wisdom/` en R2 (aunque `wisdom/` quede vacío por ahora). Esto refuerza a nivel de almacenamiento la misma separación que el Cognitive Evidence Model ya exige a nivel de archivo (I-13: evidencia nunca mezclada con el Mandate) — barato de hacer ahora, costoso de deshacer después si todo quedó en un solo prefijo.

Lo que explícitamente **no** haría todavía: diseñar `publisherKeyRef`, un endpoint de "promoción a Wisdom", o reglas de ownership/revocación — los tres siguen bloqueados por decisiones de gobernanza que `PALADIN_FOUNDATION...md` §13 ya lista como abiertas y que no son mías para resolver.

---

## 7. Pendientes / bloqueadores (lista concreta, cada uno con su fuente)

1. Definir el schema/artefacto de Wisdom en sí — hoy no existe. (Ningún documento revisado.)
2. Definir el criterio de promoción Gravity → Wisdom (umbral, aprobación, puntaje). (`Orbital §23` describe la progresión, no el criterio.)
3. Resolver las 12 preguntas de gobernanza de `PALADIN_FOUNDATION_AND_PRELIMINARY_ROADMAP_v0_1.md` §13, en particular "¿Cómo se adquiere, promueve, exporta o retiene Wisdom?".
4. Definir el formato de `publisherKeyRef` (Pendiente P-1 del Mandate Package Spec) — bloqueador central de cualquier handshake real.
5. Confirmar si el campo `Pillar` existe o hay que agregarlo al schema de Mandate (`Bloom_Conductor_Core_UI_Contexto_para_Codex.md`).
6. Diseñar endpoints/versionado/idempotencia/anti-replay del handshake — no hay ninguno descrito todavía en ningún documento.
7. Tratar explícitamente el riesgo "Crítico" de borrado/cambio de ownership de Mandates/Wisdom/evidencia (`PALADIN_FOUNDATION...md` §8) antes de que exista un mecanismo de escritura real.

---

*Fin del borrador v0.1. Este documento es investigación — no define el mecanismo de Wisdom, señala con evidencia qué existe y qué falta.*
