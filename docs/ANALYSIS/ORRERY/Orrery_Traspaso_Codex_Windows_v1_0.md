# Orrery — Traspaso a Codex (Windows) v1.0

| Campo | Valor |
|---|---|
| Documento | `docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Windows_v1_0.md` (ubicación propuesta) |
| Tipo | **Acta de traspaso. No es norma.** Ante cualquier divergencia entre este documento y un documento fuente, **manda el documento fuente** |
| Fecha | 2026-10-17 |
| Autoridad de diseño | José Vigil (única) |
| Destino | Codex en Windows, repo `C:\repos\bloom-development-extension` |
| Origen | Sesiones de cowork ORRERY (claude.ai, Project BTIPS), 2026-10-10 a 2026-10-17 |
| Referencia física al escribir | Mac: `main` @ `d8a35359b7e1dcb4fc4b0121a536ee47d1eef25b`. El Estado Base registraba `8b8101a`; el Experience Model, `3bd723b` |

Todas las rutas de este documento son relativas a la raíz del repo y usan formato Windows (`docs\...`). Lo marcado **[SOLO PROJECT]** no está en el repo: hay que traerlo antes de empezar (§9).

---

## 0. Cómo usar este documento

1. Antes de abrir Codex, completar la **lista de verificación previa** (§10): sincronizar el repo, traer los archivos [SOLO PROJECT] y comprobar los hashes.
2. Darle a Codex este archivo como primera lectura y el **prompt inicial** de §14.
3. Codex lee la **lista de lectura** (§8) en el orden indicado y devuelve un resumen de estado. Recién después recibe instrucciones.

---

## 1. Reglas de trabajo (vigentes, no negociables)

| # | Regla | Fuente |
|---|---|---|
| R-1 | **Código de Orrery congelado.** No se toca `installer\conductor\workspace\core\orrery\` hasta nueva decisión de José | D-4; Estado Base §8.1 |
| R-2 | **Estado operativo:** no se lee `.bloom` ni `BloomNucleus` sin que José indique archivo y campo concretos. En Windows: `C:\repos\eias-repos\.bloom` (sic; en Linux era `elias-repos`, diferencia registrada como posible hallazgo de portabilidad, sin normalizar) | Estado Base §8.2 |
| R-3 | **Repo y Project:** no se escribe ningún archivo sin una lista exacta aprobada por José. José hace git y push | Estado Base §8.3 |
| R-4 | **Sin Interaction Grammar (gestos concretos), contratos ni implementación de Orrery** hasta nueva decisión | Estado Base §8.4 |
| R-5 | **La norma no se edita hacia atrás.** Todo cambio normativo es una versión nueva; la anterior sólo recibe la marca de reemplazo | Estado Base §8.5; Vocab §7 |
| R-6 | Una tecnología o decisión descartada **desaparece** de los documentos activos; la trazabilidad histórica, si hace falta, vive aparte | Preferencia de José |
| R-7 | No usar la palabra "bootstrap" en nombres nuevos | Preferencia de José |
| R-8 | Toda afirmación lleva su marca de estado: [NORMA], [DJ], [DOC], [EVID-T], [EVID-H], [HIP], [PEND], [FN] (ver §12) | Convención del frente |
| R-9 | Todo elemento visual responde: **¿qué término o fenómeno válido hago perceptible y qué acto humano habilito?** | EM §2.1 |
| R-10 | Lo histórico o reemplazado **nunca** se usa como autoridad | Estado Base §3 |

---

## 2. Qué es Orrery (síntesis, no reemplaza la norma)

**Principio fundacional** (Vocab §0): *El Territorio permanece. El Trabajo ocurre sobre el Territorio. Las Lentes permiten percibir lo que ocurre y aplica sobre él. Las Superficies permiten comprenderlo y actuar.*

- **Orrery** (D-1, alternativa A2) es la experiencia de Workspace Core que articula el **Espacio** (motor de representación), las **Lentes** y las **Superficies de Workspace Core** cuyo sujeto es el Territorio o algo situado en él.
- **Territorio:** Tenant › Organization › Project (› Repository), y dentro del Project, Domains y Genes con sus Relaciones ratificadas. Mandate, Session, NUCLEUS **no** son Territorio (V-Q2).
- **Espacio:** representación navegable del Territorio. Sólo recibe Territorio y Anotaciones (C-6).
- **Lente:** mecanismo que lee una Proyección referida a Entidades y produce Anotaciones. No persiste, no decide relevancia (C-7).
- **Foco** (efímero, Navigation State) ≠ **Anchor** (deliberado). Navegar ≠ capturar: la **LocationSnapshot** sólo nace de una **Captura** explícita (C-9, C-10, D-3).
- **Régimen** (D-2, R-B): Régimen Orrery (Espacio a escenario completo + Superficies persistentes y colapsables + modo foco con HUD) y Régimen Panel (lo no territorial).
- **Gravity** se percibe sólo como Anotación sobre Organization/Project o sobre la Entidad donde está situado el Trabajo afectado; nunca como geometría territorial. Cuatro estados distinguibles: ninguno, confirmada, indecidible, desconocido (C-15, C-16, EM §6).
- **Regla de cobertura** (DJ-7): la ausencia de Anotación sólo vale *ninguno* si la Proyección declara cobertura suficiente; si no, es *desconocido*.

---

## 3. Orden normativo y capas de autoridad

```text
Vocabulario normativo → Constitución → Decisiones arquitectónicas (D-1…D-4)
                      → Experience Model → Arquitectura UI/UX → Vertical slices → Implementación
```

| Eslabón | Documento vigente | Estado |
|---|---|---|
| Vocabulario | `docs\ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` | Normativo |
| Constitución | `docs\ANALYSIS\ORRERY\Orrery_Constitucion_v1_1.md` | Normativo (C-1..C-17, idénticos a v1.0) |
| Decisiones | `docs\ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_v1_1.md` | Normativo (D-1, D-2, D-3, D-3.b, D-4) |
| Experience Model | `docs\ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v1_0.md` | Normativo desde 2026-10-11 |
| Arquitectura UI/UX | **Sin documento vigente** | Primer entregable previsto: Visual Architecture / Visual Experience v0.1 |
| Vertical slices | — | No iniciado |
| Implementación | — | Código congelado |

| Capa | Qué incluye | Cómo se usa |
|---|---|---|
| Norma | Los cuatro eslabones de arriba | Nada posterior puede contradecirlos |
| Evidencia aplicada | `EXPERIENCE\Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Subordinada al EM; dependencias del E2E vigentes |
| Research vigente (no normativo) | `VISUAL\` e `INTERACTION\` (§5) | Guía la fase visual; nunca prevalece sobre la norma |
| Interfaz técnica transitoria | D-4: `$orrery`, `mountOrreryScene`, `OrreryHandle.update`, `destroy` | Estable durante la transición; no es modelo |
| Legado | `OrreryTree`, `locationTree.ts`, `anchors[0]`, `ancestors`, `simulated`, `fromSimulatedData()` | No se amplía; no sirve de base para decisiones |
| Histórico | Vocab v1.0, Constitución v1.0, Decisiones D1_D2_D3 v1.0, EM v0.1, todo `UI\` de septiembre, `GRAVITY\ORBITAL\` | Sólo como historia, leído con el vocabulario vigente |
| Actas | Assignment del EM; Informe de actualización de estado; este documento | Registran; no son norma |

---

## 4. Cronología de lo hecho

| Fecha | Hito | Resultado |
|---|---|---|
| 2026-09 | Research Orrery, integración formal Core–Orrery (commit `126ebb7`), propuestas de UI contenedora, Gateway UX, Ledger | Hoy histórico; la integración física sobrevive como interfaz transitoria (D-4) |
| 2026-10-10 | Vocabulario v1.0, Constitución v1.0, D-1/D-2/D-3/D-3.b v1.0 | Base normativa |
| 2026-10-10 | Encargo y corpus priorizado del Experience Model | EM v0.1 |
| 2026-10-11 | Escenarios de Trabajo Activo v0.1 (evidencia aplicada); Informe de actualización de estado (Project) | — |
| 2026-10-11 | Vocabulario v1.1 (V-Q12, V-Q13), Constitución v1.1 (referencial), Decisiones v1.1 (+D-4), **Experience Model v1.0 normativo** (DJ-7..DJ-11), Estado Base v1.0 | **Cierre de la fase conceptual** |
| 2026-10-13 | Research morfológico y espacial v0.1 | Aprobado por José como research vigente |
| 2026-10-13 | Presupuesto de canales y reserva de interacción v0.1 + escena gris de verificación | Borrador para revisión de José |
| 2026-10-16 | Investigación de interacción (Lente, selección de lecturas, indicación) v0.1 → **v0.2** con DJ-I6..I9 | Research vigente |
| 2026-10-16 | Protocolo experimental de interacción v0.1 | **Borrador para aprobación**; prototipo no construido |
| 2026-10-17 | Verificación del repo en el Mac contra el Project; este traspaso | Ver §9 y §10 |

---

## 5. Estado actual por frente

### 5.1 Norma (cerrada)

Decisiones cerradas: V-Q1..V-Q13 · C-1..C-17 · D-1 (A2) · D-2 (R-B) · D-3 (N-B) · D-3.b · D-4 · DJ-1..DJ-11. Detalle en Estado Base §5.

Lo más usado en la fase visual:

| ID | Contenido |
|---|---|
| DJ-5 | El hover es el **fenómeno "indicación"**, sin estatus normativo; no cambia Navigation State, cámara ni Superficie |
| DJ-7 | Regla de cobertura (ninguno sólo con cobertura declarada; si no, desconocido) |
| DJ-8 | Foco desde una Superficie territorial = mismo Foco; orienta el Espacio; no crea Anchor |
| DJ-9 | Referencia `missing`: el ancestro sólo es soporte espacial; la referencia conserva identidad y Procedencia |
| DJ-10 | "Sin criterio declarado" es cobertura/aplicabilidad, no un estado de colisión |
| DJ-11 | EM-C01, RI-G12, dueño de Atención y Source Authority Profile abiertos, no bloqueantes |
| EM §4.4 | Contenido exacto de la indicación: nombre, tipo, marca de Procedencia, verificación, marca de simulación, **recuento** de Anotaciones por Lente; "y nada más" |
| EM §4.7 | Contención y extensión son lo único propio del Espacio; ningún fenómeno puede ser perceptible sólo en 3D |

### 5.2 Frente VISUAL (research)

**Research morfológico v0.1** — vigente (aprobado 2026-10-13). Aporta: 22 primitivas en 7 familias con fichas de 10 preguntas; densidades N0–N3; principios gramaticales **G-1..G-10**; invariantes de degradación **DV-1..DV-6**; condiciones de traspaso a Superficie **T-1..T-7**; anti-patrones **AP-1..AP-18**; criterios de evaluación **K-1..K-20**; recomendaciones **REC-1..REC-14**; restricciones materiales de PlayCanvas **M-1..M-6**; hipótesis 3D **H-3D-1..3** (no adoptadas); contradicciones **CR-1..CR-11**.

Decisiones de José sobre ese research (2026-10-13):

| ID | Decisión |
|---|---|
| DM-1..DM-5 | Corpus aprobado; EM §4.7 es límite normativo; ejemplos de forma de la norma son ilustrativos; consulta web autorizada; sin diagramas |
| **DJ-CR1** | La contención del Espacio sólo para árboles con Fuente (Tenant › Org › Project, y pertenencia de Domains/Genes al Project). Domain↔Gene (N:M) requiere **otro dispositivo** |
| **DJ-CR2** | "Dos Lentes no comparten canal" (EM §5.4.2) = distinto **tipo** de canal; hace falta un tope explícito de Lentes simultáneas |
| **DJ-CR3** | Las animaciones ambientales del onboarding no se trasladan a Orrery: sin movimiento en reposo |
| **DJ-CR4** | Orrery opera con la paleta actual, sin extensión |

**Presupuesto de canales v0.1** — borrador para revisión. Decisiones de José que lo rigen: DJ-CR1..4 y **DP-a..DP-f**:

| ID | Decisión |
|---|---|
| DP-a | No se versiona el EM ahora; el ejemplo de EM §4.3.1, CT-06 y "Gene ⊂ Domain ⊂ Project" quedan inaplicables, pendiente para la próxima versión del EM (X-1) |
| DP-b | El tope se aplica a Lentes **visibles** en el Espacio, no a las activas |
| DP-c | El acento de la paleta no se usa para interacción |
| DP-d | Si el presupuesto da 1–2 Lentes, se reporta tal cual, con sensibilidad |
| DP-e | En la escena, el Gene contenido sólo en su Project; N:M en la Superficie; conexión de prueba apagada por defecto |
| DP-f | La escena debe demostrar que todos los estados se distinguen sin color |

Resultados principales [HIP / EVID-T, sin personas]:
- **Tope: 2 Lentes visibles** (A por ranura de adherencia, robusta; B por giro, marginal) + 1 relacional por conexión discontinua.
- Canales asignados C1..C13 (matriz §7.2 del documento); reserva de interacción **RI-1..RI-5** (indicación = corchetes; Foco = anillo grueso + cámara; Anchor = doble anillo; cambios de Fuente sin animación).
- Opción recomendada ante exceso de Lentes: **O-1** (activa, no visible, aviso persistente en capa O).
- Requisitos del dispositivo N:M **NM-1..NM-15**; cobertura en modos a / b / declaración global.
- Escena gris: K-5 cumple (croma 0); K-2: el plano es igual o más legible en todas las configuraciones; fallas **F-1..F-3 abiertas** (Foco vs Foco+Anchor a tamaño N2; texturas de Procedencia T2/T3/T4 a N2; lectura serial de conjunciones); **F-4..F-7 corregidas** y convertidas en requisitos.
- Contradicciones **X-1..X-6**; preguntas **Q-1..Q-10**; recomendaciones **VA-1..VA-10**.

### 5.3 Frente INTERACTION (research)

**Investigación v0.2** (reemplaza a v0.1). Distingue operacionalmente Lente, estado de Lente, **selección de lecturas** (nombre provisional, DJ-I1; *no* se llama "Foco" porque Foco ya es término normativo), inventario, indicación, Foco y Superficie. Mapa de las 28 preguntas de la guía; 10 contradicciones IX-C1..C10; 7 incertidumbres IX-U1..U7; modelo de estados (regiones R1..R9, transiciones TR-01..TR-26, invariantes INV-1..INV-7); matriz de decisiones IX-D1..IX-D15; hallazgos HX-1..HX-18.

Decisiones de investigación de José (no normativas):

| ID | Decisión |
|---|---|
| DJ-I1 | "Selección de lecturas" sólo como nombre provisional de investigación |
| DJ-I2 | El **recuento** por Lente (EM §4.4) es la referencia; mostrar estado por Lente es la variante experimental **V-EST** |
| DJ-I3 | Archivos nuevos sin tocar fuentes ni la escena gris original |
| DJ-I4 | No se cierra el protocolo ni se construye el prototipo hasta revisión |
| DJ-I5 | Ninguna recomendación se vuelve decisión sin aprobación explícita |
| **DJ-I6** | "Activa sin datos" = estado de la Lente sin Fuente/Proyección; las Entidades quedan en *desconocido*. Evaluado con cobertura y sin filas = *ninguno*. Sin "no aplica". P-G2 respeta la cobertura declarada |
| **DJ-I7** | Condiciones fuera de norma sólo en un **bloque exploratorio separado [FN]**; V-EST es [FN]; ningún resultado autoriza un cambio normativo |
| **DJ-I8** | Jerarquía de errores N1 (interpretación falsa de estado/cobertura) / N2 (atribución, contexto, control) / N3 (eficiencia, preferencia); clasificación por creencia expresada; dominancia; umbrales fijados antes de las sesiones |
| **DJ-I9** | Comparar cámara **m1** (movimiento mínimo) vs **m3** (reencuadre); m0 sólo [FN]; m2 fuera de la primera ronda; m1 es hipótesis con criterios de refutación previos |

**Protocolo experimental v0.1** — borrador para aprobación. Bloques B0–B7 + BX [FN]; dos sesiones por participante; 6 participantes objetivo; umbrales U-N1a..c, U-N2a..g, U-Q1; márgenes de comparación; rúbrica de clasificación; hipótesis preregistradas H-m1, H-E1, H-L3, H-AUS, H-Q1; requisitos del prototipo PR-1..PR-15; tratamientos propuestos I-1..I-13 para incompatibilidades.

---

## 6. Pendientes

### 6.1 Decisiones de José (sin pruebas)

| ID | Tema | Dónde |
|---|---|---|
| **Aprobación del protocolo** | A-1..A-6, en especial los umbrales de §6; perfil y disponibilidad de participantes | Protocolo §0, §3, §12 |
| CB/X-3 (≡ IX-D10) | Procedencia por Anotación en el Espacio: marca binaria vs liberar un canal vs versionar EM §5.6. **Ojo IX-C2:** la opción "detalle en la indicación" excede EM §4.4 | Presupuesto §13; IX v0.2 §4 |
| CB/X-6 (≡ IX-D10) | Estado del Trabajo situado: sólo presencia en el Espacio vs reservar un canal. Misma advertencia IX-C2 | Ídem |
| CB/Q-5 (≡ IX-D12) | Política de cámara CA-1 libre / CA-2 acotada / CA-3 cenital con inclinación por acto | Presupuesto §11 |
| CB/F-2 (Q-6) | Procedencia ordinal de tres clases a distancia | Presupuesto §12.4 |
| CB/Q-2 | Agrupar los 8 estados de Location en 3 clases de relleno | Presupuesto §7.1 |
| CB/Q-7 | ¿Se extiende la paleta para liberar el tono? (hoy DJ-CR4 dice que no) | Presupuesto §8.3 |
| IX-D5 | Al desactivar una Lente visible, ¿una no visible pasa a visible? (la norma impone "no", EM §5.3.3) | IX v0.2 §4 IX-C6 |
| IX-D7 | ¿Puede no haber Foco? | IX-C7 |
| IX-D13 | ¿El modo foco oculta también las Anotaciones? | IX-C8 |
| IX-D1 | Nombre definitivo de la selección de lecturas (en A-3, Arquitectura UI/UX) | — |

### 6.2 Decisiones que se cierran con evidencia (pruebas con personas)

IX-D2 (recuento vs V-EST) · IX-D4 (tope y O-1, incluye CB/Q-1 Lente B) · IX-D6 (resultado m1 vs m3) · IX-D9 (comparar dos Entidades) · IX-D14 (concepto visible de lecturas; diferido a 2.ª ronda) · IX-D15 (marcas persistentes vs bajo demanda).

### 6.3 Deuda normativa registrada (para una futura versión, no editar hacia atrás)

| ID | Qué | Efecto |
|---|---|---|
| X-1 (DP-a) | EM §4.3.1 ejemplo de Domain/Genes, CT-06 y "Gene ⊂ Domain ⊂ Project" inaplicables por DJ-CR1 | Próxima versión del EM |
| HX-17 | V-EST excede EM §4.4 ("y nada más") | Sólo [FN]; adoptarlo exigiría versión del EM |
| IX-C2 | El presupuesto de canales extendió la indicación más allá de EM §4.4 (O-1 condición 3, X-3a, X-6; la escena muestra estado en lugar de recuento) | Reformular X-3/X-6 |
| IX-C10 | Desambiguación Domain/Gene depende de proximidad, no de contención | Próxima versión del EM |

### 6.4 Dependencias del Genesis E2E (no se cierran sin una corrida real)

CT-01 como recorrido genuino ([NO OBSERVADO]); EM-C14/15/16; EM-C17, S1–S10, R-2; corrección de V-1 (comando real `nucleus mandate build --project … --project-id … --docs …`); lectura de E1–E11 sólo tras el E2E. Condiciones previas: B3/B4 (suministro cloud gobernado) en revisión; Project gobernado de Cognituum inexistente; corpus de `--docs` pendiente. Fuentes [SOLO PROJECT]: `MANDATE\GENESIS\Genesis_E2E_Correccion_B1_B2_y_Camino_Cloud_Gobernado_v1_0.md`, `MANDATE\GENESIS\Genesis_Camino_Cloud_Gobernado_B3_B4_Diseno_v0_1.md`. Observado en HEAD: `bc823c9 fix(genesis): persist domain candidates and resolve Brain path` (corrección B1).

### 6.5 Abiertos no bloqueantes

A-1..A-8, F-1..F-7 (Vocab §4.4–§4.5), D-T1..D-T5, EM-C01..C20, RI-G12, dueño de Atención (EM-C06), Source Authority Profile V1 (A-4).

---

## 7. Punto exacto de continuación

El frente está **entre el research de interacción y la Arquitectura UI/UX**. El siguiente paso depende de José, en este orden sugerido:

1. **Revisar y aprobar (o corregir) el protocolo v0.1** — sin eso no se construye el prototipo comparativo ni hay sesiones.
2. **Decidir IX-D5, IX-D7, IX-D13 e IX-D10** (el protocolo hoy las maneja excluyéndolas o con la opción que impone la norma).
3. **Decidir CB/X-3, X-6, Q-5 y F-2** (entrada fija para la Visual Architecture, CB/VA-2).
4. Con eso: **construir el prototipo comparativo** (`docs\ANALYSIS\ORRERY\INTERACTION\prototipo_comparativo\index.html`, a partir de una **copia** de la escena gris; Protocolo §11 PR-1..PR-15), verificarlo técnicamente, piloto, sesiones.
5. En paralelo o después: **preparar el encargo de Orrery Visual Architecture / Visual Experience v0.1** (Estado Base §9 y §9.1; REC-1..14; VA-1..10).

Nada de lo anterior autoriza tocar código de `installer\`.

---

## 8. Lista de lectura para Codex (en orden)

### 8.1 Obligatorio — antes de cualquier trabajo

| # | Archivo | Por qué |
|---|---|---|
| 1 | `docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Windows_v1_0.md` (este) | Contexto y reglas |
| 2 | `docs\ANALYSIS\ORRERY\Orrery_Estado_Base_v1_0.md` | Índice: qué documento manda en cada tema |
| 3 | `docs\ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` | Términos |
| 4 | `docs\ANALYSIS\ORRERY\Orrery_Constitucion_v1_1.md` | Invariantes C-1..C-17 |
| 5 | `docs\ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_v1_1.md` | D-1..D-4 |
| 6 | `docs\ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v1_0.md` | Eslabón normativo de experiencia |
| 7 | `docs\ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | Research vigente (lenguaje morfológico) |
| 8 | `docs\ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | Presupuesto de canales (borrador) |
| 9 | `docs\ANALYSIS\ORRERY\VISUAL\escena_gris\index.html` (hoy `index_1.html` en el repo, ver §10) | Escena gris; leer el comentario inicial y los parámetros |
| 10 | `docs\ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` **[SOLO PROJECT]** | Research de interacción vigente |
| 11 | `docs\ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` **[SOLO PROJECT]** | Protocolo para aprobar |

### 8.2 Contexto aplicado — leer antes de trabajar el eje correspondiente

| Archivo | Para qué |
|---|---|
| `docs\ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Evidencia aplicada; actos reales de Genesis; dependencias E2E |
| `docs\ANALYSIS\ORRERY\EXPERIENCE\Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` **[SOLO PROJECT]** | Acta: congelamiento, D-4, estado del E2E |
| `docs\ANALYSIS\ORRERY\Orrery_Experience_Model_Assignment_v0_1.md` | Encargo rector del EM (acta) |
| `docs\ANALYSIS\ORRERY\LOCATION\ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` | Contrato de Location |
| `docs\ANALYSIS\ORRERY\LOCATION\Orrery_LocationSnapshot_v0.md` | Contrato LocationSnapshot v0.1 (origen de F-1) |
| `docs\ANALYSIS\ORRERY\UI\Spec_Implementacion_Integracion_Core_Orrery_v1_0.md` **[SOLO PROJECT]** | Interfaz técnica integrada (leída por D-4) |
| `docs\ANALYSIS\ORRERY\UI\Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` **[SOLO PROJECT]** | Alcance real de la integración |
| `docs\GENES\COGNITUUM_GENE_CONCEPT_v3_0.md` | Domain↔Gene N:M (base de CR-1 / DJ-CR1) |
| `docs\ANALYSIS\GRAVITY\COLISIONES\Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md` | Semántica de colisiones |
| `docs\ANALYSIS\GRAVITY\PALADIN\Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` | Señales de conflicto y Masa |
| `docs\PALETTE\# 🎨 Bloom Color Palette.md` | Restricción de color (DJ-CR4) |
| `docs\DESIGN\# BTIPS Foundational UX-UI Design Doctrine Prompt v0.1.md` | Doctrina (subordinada a la norma) |
| `docs\CONTROL\AGENDA_MAESTRA.md` (sección "Estado coordinado ORRERY / Location") | Coordinación |
| `docs\MANDATE\MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md` | Estado del programa; E2E pendiente |

### 8.3 Sólo consulta (histórico, nunca autoridad)

`docs\ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_0.md`, `Orrery_Constitucion_v1_0.md`, `Orrery_Decisiones_Arquitectonicas_D1_D2_D3_v1_0.md`, `EXPERIENCE\Orrery_Experience_Model_v0_1.md`, todo `docs\ANALYSIS\ORRERY\UI\` de septiembre (incluido `Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md`, A-8), `docs\ANALYSIS\GRAVITY\ORBITAL\Orrery_Research_Resultados_v0_1.md`, `INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_1.md` **[SOLO PROJECT]**.

### 8.4 Código (no tocar; leer sólo si un encargo lo pide)

`installer\conductor\workspace\core\orrery\` (congelado) · `webview\app\src\lib\stores\regimeStore.ts` · `webview\app\src\lib\components\OrreryContainer.svelte` · `webview\app\src\lib\confirmedContext.ts` · `installer\nucleus\internal\gravity\` · `installer\nucleus\gravity\portable.go`.

---

## 9. Archivos que no están en el repo [SOLO PROJECT]

Verificado el 2026-10-17 en el Mac: `docs\ANALYSIS\ORRERY\INTERACTION\` **no existe** en el repo, y tampoco las actas y specs de abajo. Descargarlos desde el Project BTIPS (claude.ai) y guardarlos en estas rutas, con el mismo nombre:

| Ruta en el Project | Destino en el repo | Prioridad |
|---|---|---|
| `ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` | `docs\ANALYSIS\ORRERY\INTERACTION\` | **Obligatorio** |
| `ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Experiment_Protocol_v0_1.md` | `docs\ANALYSIS\ORRERY\INTERACTION\` | **Obligatorio** |
| `ANALYSIS/ORRERY/INTERACTION/Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_1.md` | `docs\ANALYSIS\ORRERY\INTERACTION\` | Histórico |
| `ANALYSIS/ORRERY/EXPERIENCE/Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` | `docs\ANALYSIS\ORRERY\EXPERIENCE\` | Recomendado |
| `ANALYSIS/ORRERY/UI/Spec_Implementacion_Integracion_Core_Orrery_v1_0.md` | `docs\ANALYSIS\ORRERY\UI\` | Recomendado |
| `ANALYSIS/ORRERY/UI/Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` | `docs\ANALYSIS\ORRERY\UI\` | Recomendado |
| `MANDATE/GENESIS/Genesis_E2E_Correccion_B1_B2_y_Camino_Cloud_Gobernado_v1_0.md` | `docs\MANDATE\GENESIS\` | Para el E2E |
| `MANDATE/GENESIS/Genesis_Camino_Cloud_Gobernado_B3_B4_Diseno_v0_1.md` | `docs\MANDATE\GENESIS\` | Para el E2E |
| `ANALYSIS/GRAVITY/LOCATION/Investigacion_Already_Orrery_Location_Infraestructura_v0_3_Addendum.md` | `docs\ANALYSIS\GRAVITY\LOCATION\` | Consulta |

---

## 10. Lista de verificación previa (Windows)

1. **Sincronizar.** Asegurar que en el Mac estén commiteados y pusheados `docs\ANALYSIS\ORRERY\` completo (Vocab/Constitución/Decisiones v1.1, EM v1.0, Estado Base y `VISUAL\`; el research morfológico registró que en `8b8101a` estaban sin commitear) y luego `git pull` en `C:\repos\bloom-development-extension`. HEAD del Mac al escribir: `d8a3535`.
2. **Traer los [SOLO PROJECT]** de §9.
3. **Escena gris:** en el repo se llama `escena_gris\index_1.html`, pero su propio encabezado, el presupuesto de canales y el protocolo la citan como `index.html`. Decisión de José: renombrar a `index.html` (recomendado para que las referencias resuelvan).
4. **Comprobar integridad** (PowerShell):

```powershell
cd C:\repos\bloom-development-extension
Get-FileHash -Algorithm SHA256 docs\ANALYSIS\ORRERY\VISUAL\escena_gris\index_1.html
Get-FileHash -Algorithm SHA256 docs\ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md
Get-FileHash -Algorithm SHA256 docs\ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md
Get-FileHash -Algorithm SHA256 docs\ANALYSIS\ORRERY\Orrery_Estado_Base_v1_0.md
```

| Archivo | SHA-256 esperado (copia del Mac = copia del Project) |
|---|---|
| `VISUAL\escena_gris\index_1.html` | `40DD6EC517494D2144876FDAA0FB98D93607B8EAD2592B887F417C133CF4244D` |
| `VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | `A59CF8B13C18A8B4D05393D1D55C1AD40A0408E835B2FBF9B9921E20119A3609` |
| `VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | `A5ED3CCBC3B03EEEB64C25D426A9C667778D6DE616618D50423D64833935D242` |
| `Orrery_Estado_Base_v1_0.md` | `65D8B9B83B486BAFE59D9BA810597D0E88049882258EA229D900A3ADCC33F310` |

Si Git en Windows convierte finales de línea (`core.autocrlf=true`), los hashes no coinciden aunque el contenido sea el mismo. Comprobar con `git config core.autocrlf`; si es `true`, comparar con `git diff` contra `origin/main` en lugar del hash.

5. **Escena gris en Windows:** se abre en el navegador con conexión (PlayCanvas 2.22.1 por CDN). Configuraciones de referencia: `?T=T1&cat=2` (catálogo), `?T=T2&N=N2&V=split`, `?T=T2&N=N3&V=split&focus=p0_0`, `?T=T3&nm=1&focus=p0_0_g0`, `?T=T4&V=split&eval=1`, `?T=T1&focus=p0_0_d0&anchor=p0_0&ind=org0`.

---

## 11. Restricciones físicas y entorno

- Repo Windows: `C:\repos\bloom-development-extension`. Workspace de organización en Windows: `C:\repos\eias-repos`.
- El estado local de Nucleus y el Backend persistente de Windows no viajan con Git: un Mandate instalado en Windows no está en el Mac, y viceversa.
- En Windows también se trabaja el frente Genesis Mandate con Codex: **no mezclar** ese frente con Orrery salvo por las dependencias del E2E (§6.4).
- Las afirmaciones físicas del EM están referidas a `3bd723b`; las del presupuesto de canales a `8b8101a`. Ninguna se recontrastó contra `d8a3535`.

---

## 12. Convenciones

**Marcas de estado:** [NORMA] documento normativo vigente · [DJ] decisión de José · [DJ-I] decisión de investigación (no norma) · [DOC] hecho documental no normativo · [EVID-T] evidencia técnica (no es comprensión humana) · [EVID-H] evidencia con personas (**hoy no existe ninguna para Orrery**) · [HIP] hipótesis · [PEND] decisión pendiente · [FN] condición fuera de norma, sólo en bloque exploratorio · [NO OBSERVADO] lo que debería existir tras Genesis y no se validó.

**Espacios de nombres que se repiten** (anteponer siempre la fuente):

| Prefijo | Documento | Atención |
|---|---|---|
| `Vocab/F-n` | Vocabulario | F-1..F-7 = conflictos de **contratos físicos** |
| `CB/F-n` | Presupuesto de canales | F-1..F-7 = **fallas de la escena gris** |
| `MR` | Research morfológico | CR-n, G-n, DV-n, T-n, K-n, AP-n, REC-n |
| `CB` | Presupuesto de canales | X-n, Q-n, VA-n, RI-n, NM-n, O-1/O-2 |
| `IX` | Interacción v0.2 | IX-C, IX-U, IX-D, S-, TR-, INV-, HX- |
| `EM` | Experience Model | EM-Cnn, RI-xx, CT-nn, P-xx (Proyecciones P-W1..P-I1) |

---

## 13. Qué no hacer

- No usar `OrreryTree`, `anchors[0]`, `data.ts` ni datos simulados como base de decisiones (D-4).
- No asignar formas ni colores definitivos fuera de un encargo de Visual Architecture.
- No llamar "Foco" a la selección de lecturas (IX-C1).
- No mostrar en la indicación más que EM §4.4 en condiciones normativas.
- No presentar *desconocido* como *ninguno*, ni una propuesta como confirmada (C-2, C-16).
- No mover la cámara, el Régimen ni el Foco por actividad del sistema (C-17).
- No modificar la escena gris original (DJ-I3): el prototipo parte de una copia.
- No editar documentos normativos: versionar con aprobación de José.

---

## 14. Prompt inicial sugerido para Codex

```text
Sos el agente principal de ORRERY en este repo (C:\repos\bloom-development-extension).
Antes de cualquier trabajo, leé en este orden la lista de docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Windows_v1_0.md §8.1
(empezando por ese archivo). Respetá las reglas de su §1: no escribir en el repo sin una lista exacta de archivos
aprobada por mí; yo hago git y push; el código de Orrery (installer\conductor\workspace\core\orrery\) está congelado;
la norma no se edita hacia atrás, sólo se versiona; no leer .bloom ni BloomNucleus sin que yo indique archivo y campo.
Ante divergencia entre el traspaso y un documento fuente, manda el documento fuente.
Verificá que existan los archivos de §8.1 y los de §9; si falta alguno, decímelo.
Devolveme un resumen de estado en no más de 20 líneas, con los pendientes de §6.1 y el punto de continuación de §7,
y esperá instrucciones.
```

---

*Fin del acta de traspaso. No es norma. Ante divergencia, manda el documento fuente.*
