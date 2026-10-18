# ENCARGO — ORRERY CHANNEL BUDGET & INTERACTION RESERVATION v0.1

## 0. Por qué existe este encargo

La investigación `Orrery_Morphological_Spatial_Language_Research_v0_1.md` quedó aprobada como **research vigente, no normativo**. Su hallazgo central es que el límite real del lenguaje de Orrery no es la forma sino el **presupuesto de canales perceptuales**: la norma exige distinguir muchas dimensiones a la vez (§10.4 del research) y la percepción y la paleta ofrecen muy pocos canales. Dibujar formas antes de resolver esto produciría propuestas que chocan con la norma.

Este encargo resuelve ese presupuesto **sin dibujar formas, colores ni escena final**. No es Visual Architecture.

---

## 1. Decisiones de José que rigen este encargo (2026-10-13)

| ID | Decisión | Efecto |
|---|---|---|
| **DJ-CR1** | La **contención** del Espacio se limita a **árboles con Fuente** (Tenant › Organization › Project, y pertenencia de Domains y Genes al Project). La relación **Domain↔Gene (N:M) no se expresa como contención**: requiere otro dispositivo de pertenencia. | Se define **como requisito**, no como forma (§4.5). Cierra CR-1 para este frente. No modifica el Experience Model ni Gene v3.0. |
| **DJ-CR2** | "Dos Lentes no comparten el mismo canal de codificación" (EM §5.4.2) se lee como **distinto *tipo* de canal** (lectura a). | Debe fijarse un **límite explícito de Lentes simultáneas** (§4.4). Cierra CR-2 para este frente. |
| **DJ-CR3** | Las animaciones ambientales del onboarding (anillos que pulsan, órbita, "respiración", barrido) **no se trasladan** a Orrery. | El movimiento en reposo no se asume disponible. |
| **DJ-CR4** | Orrery opera con la **paleta actual tal cual**. Cualquier extensión es una decisión posterior de José. | El presupuesto se calcula con un único acento de estado y un único color de error. No asignar colores nuevos. |

Estas decisiones no cambian la norma. Si el cowork considera que alguna requiere versionar un documento normativo, debe **registrarlo y detenerse**, no resolverlo.

---

## 2. Propósito

Producir el **presupuesto de canales perceptuales de Orrery**: qué dimensiones viven siempre en el Espacio, cuáles solo en la indicación, cuáles solo en una Superficie y cuáles en la capa de orientación (capa O), y con qué canales (por *tipo*, nunca por forma ni color concretos).

Pregunta central:

> **Dado lo que la norma exige distinguir y lo que la percepción y la paleta ofrecen, ¿qué puede estar siempre presente en el Espacio, qué debe revelarse bajo interacción y qué debe transferirse a una Superficie, sin que ningún canal tenga dos significados?**

---

## 3. Corpus y jerarquía de autoridad

Misma jerarquía que el encargo anterior: Vocabulario / Constitución / Decisiones vigentes → Experience Model vigente → Estado Base (índice) → evidencia aplicada y research vigente → históricos.

Lectura obligatoria completa, sin modificar:

- `Orrery_Estado_Base_v1_0.md`
- `Orrery_Vocabulario_Normativo_v1_1.md`
- `Orrery_Constitucion_v1_1.md`
- `Orrery_Decisiones_Arquitectonicas_v1_1.md`
- `EXPERIENCE/Orrery_Experience_Model_v1_0.md`
- `EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md`
- `VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md` (en particular §6.7, §7, §9, §10, §13, §14, §16, §18)
- `docs/PALETTE/# � Bloom Color Palette.md` (restricción de color)

Las imágenes del encargo anterior no son necesarias salvo para consultar un punto concreto.

---

## 4. Contenido requerido

### 4.1 Inventario de dimensiones

Inventario completo de todo lo que la norma exige distinguir perceptualmente. Como mínimo: tipo de Entidad, Procedencia (incluida simulación), clase de Fuente, indicación / Foco / Anchor, identidad de Lente, cobertura por Lente (con filas / ninguno / desconocido), estado de colisión (4), resolución de Location (8), Atención, Contexto confirmado / no verificable, Relación frente a Anotación entre Entidades.

Para cada dimensión: número de valores, fuente normativa, y si la norma exige que sea perceptible **sin color**.

### 4.2 Asignación de ubicación

Para cada dimensión, decidir (con justificación normativa) dónde vive:

**siempre en el Espacio · solo en la indicación · solo en una Superficie · en la capa O**

Siguiendo T-1..T-7 del research (§10.6) y el límite del EM §4.7: ningún fenómeno puede ser perceptible solo en 3D.

### 4.3 Reserva de canales de interacción

**Primero**, antes de asignar canal a cualquier otra dimensión, reservar canales para indicación, Foco y Anchor:

- ocupan canales que **ninguna Lente ni la Procedencia usa**;
- tienen firmas temporales distintas entre sí (efímera / de sesión / persistente);
- son distinguibles de un cambio originado en la Fuente;
- no pueden confundirse en alta densidad ni con geometrías pequeñas u ocluidas.

La semántica hover → Focus → Anchor del Experience Model **no se modifica**.

### 4.4 Presupuesto de Lentes (DJ-CR2)

- Canales disponibles por *tipo*, considerando que el color está acotado por DJ-CR4 y que el movimiento en reposo no está disponible por DJ-CR3.
- Límite explícito de Lentes simultáneas, con su justificación y marcado como **hipótesis a validar**.
- Qué ocurre cuando la persona pide más Lentes que el límite (la respuesta debe ser explícita, sin ocultar sin decirlo).

### 4.5 Requisito del dispositivo de pertenencia N:M (DJ-CR1)

Definir como **requisito**, no como forma: qué debe poder afirmar y qué no debe afirmar un dispositivo de pertenencia múltiple Domain↔Gene; cómo debe convivir con la contención de árboles sin doble código (G-3); cómo se comporta en alta densidad; qué se transfiere a la Superficie.

### 4.6 *Desconocido* frente a *ninguno*

Comportamiento requerido de *desconocido* en tres niveles: Entidad individual, agregado y declaración global. Considerar que hoy *desconocido* es el único estado veraz para Gravity (EM CT-04; Escenarios S10). Aplicar DV-1..DV-6.

### 4.7 Política de cámara como decisión de lenguaje

Libre o acotada, vista de orientación, retorno, y su efecto sobre qué canales son confiables (tamaño en perspectiva, orientación, silueta). Presentar opciones con sus consecuencias; la decisión es de José.

---

## 5. Territorios de prueba

Todo se evalúa contra cuatro casos:

1. **Mínimo**: territorio de CT-01 (4–5 Entidades). Debe verse escaso, sin relleno (K-19).
2. **Denso hipotético**: Estado Base §9.1, en N2 y N3.
3. **Gene en dos Domains**: caso N:M (DJ-CR1).
4. **Gravity entera en *desconocido***.

---

## 6. Entregable de verificación visual

Una **escena mínima renderizable, en gris, sin estilo** (sin color de estado, glow, ambientación ni tipografía de diseño), cuyo único fin es **comprobar en pantalla** K-2 (aplanamiento), K-3 (densidad), K-5 (sin color) y K-14 (*desconocido* ≠ *ninguno*) sobre los cuatro territorios.

- Es **evidencia**, no propuesta de diseño, no vertical slice, no escena de Orrery.
- No asigna formas a Entidades, Relaciones ni Lentes: usa marcas genéricas y neutras.
- El medio (HTML, SVG, PlayCanvas mínimo u otro) se propone en el plan previo a escribir y lo autoriza José.
- Se registra explícitamente qué **no** demuestra.

---

## 7. Criterios de aceptación

Del research §18, son **puerta de aceptación** solo estos cinco:

- **K-2** Aplanamiento
- **K-3** Densidad N0–N3
- **K-5** Sin color
- **K-14** *Desconocido* frente a *ninguno*
- **K-20** Sin segunda ontología

Los otros quince criterios quedan como referencia. Tratar como **hipótesis, no como dato**: órdenes de magnitud de densidad, el límite de Lentes, H-3D-1..3 y las restricciones de PlayCanvas.

---

## 8. Antiobjetivos

No producir ni hacer:

- Visual Architecture / Visual Experience;
- formas, colores, paleta o iconografía para Entidades, Relaciones, Lentes, Anotaciones;
- asignaciones Entity→forma, Domain→forma, Gene→forma, Relation→arco, etc.;
- diseño del dispositivo N:M (solo su requisito);
- Interaction Grammar definitiva;
- design system, concept art, mockups finales;
- pruebas de rendimiento de PlayCanvas (PA-5, PA-6, M-3 quedan para después, solo si el presupuesto revela una dependencia);
- cambios de código, contratos o documentos normativos;
- hacer Orrery parecido a las referencias positivas, ni "lo contrario" de `wrong_not_wanted.png`.

---

## 9. Entregable documental

`docs/ANALYSIS/ORRERY/VISUAL/Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` y su copia en el Project.

Contenido mínimo: corpus leído; inventario (§4.1); asignación de ubicación (§4.2); reserva de interacción (§4.3); presupuesto y límite de Lentes (§4.4); requisito N:M (§4.5); *desconocido* / *ninguno* (§4.6); opciones de cámara (§4.7); resultados sobre los cuatro territorios; qué demuestra y qué no la escena gris; contradicciones; preguntas abiertas; recomendaciones para el posterior encargo de Visual Architecture. Marcas de evidencia como en el research anterior.

---

## 10. Condición de detención

Este encargo autoriza lectura y planificación. **Antes de escribir cualquier archivo**, devolver exclusivamente:

1. corpus que propone leer y por qué;
2. archivos exactos que propone crear (documento y escena gris) y ubicación;
3. medio propuesto para la escena gris y su justificación;
4. método concreto para construir el presupuesto de canales;
5. cualquier archivo existente que necesite modificar (por defecto, ninguno);
6. contradicciones, ambigüedades o impedimentos detectados, incluido si alguna decisión DJ-CR1..4 choca con la norma.

**Esperar autorización de José antes de escribir.**