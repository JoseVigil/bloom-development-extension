# Orrery — Encargo del cowork "Experience Model" v0.1

| Campo | Valor |
|---|---|
| Documento | `Orrery_Experience_Model_Assignment_v0_1.md` |
| Tipo | Encargo autocontenido para un nuevo cowork (no es research, no es diseño) |
| Estado | BORRADOR para revisión de José |
| Fecha | 2026-10-10 |
| Base normativa | Vocabulario v1.0 · Constitución v1.0 · D-1/D-2/D-3 v1.0 (incl. D-3.b) |
| Commit físico de referencia | `78bbaad` (último contraste físico verificado; el cowork debe re-verificar HEAD) |
| Autoridad de diseño | José (única) |
| Repositorio | `/home/jose/repos/bloom-development-extension` (paths relativos a esa raíz salvo indicación) |

> **Para el cowork que recibe este encargo.** La investigación fundacional de Orrery está cerrada. No vuelvas a investigar qué es Orrery ni a rediseñar su ontología. Tu trabajo es derivar **cómo se experimenta** Orrery a partir de la base normativa y contrastarlo con lo que existe físicamente. Terminás entregando un **Experience Model para revisión**. No escribís UI/UX v0.2, no definís Interaction Grammar, no tocás código ni contratos.

---

## 1. Propósito

Abrir la transición desde la base normativa de Orrery hacia su **Modelo de Experiencia**: una descripción precisa, verificable y trazable de qué percibe, comprende y puede hacer una persona en Orrery, en qué orden, con qué información y bajo qué actos humanos.

El Experience Model es la capa intermedia entre la norma ya cerrada y la futura arquitectura UI/UX v0.2. Su función es que ninguna decisión visual posterior pueda introducirse sin haber respondido antes la regla de diseño:

> **¿Qué término o fenómeno válido estoy haciendo perceptible y qué acto humano estoy habilitando?**

Si una propuesta no puede responder eso, no entra, por atractiva que sea. El objetivo explícito es que Orrery no termine siendo un visualizador 3D espectacular y semánticamente falso.

Orden normativo en el que se inserta este trabajo (de la sección "Orden normativo de ORRERY" del Vocabulario):

```
Vocabulario → Constitución → D-1/D-2/D-3 → [Experience Model] → arquitectura UI/UX → vertical slices → implementación
```

El Experience Model no está todavía aprobado como eslabón normativo. Lo que produzca el cowork es una propuesta para que José decida si lo incorpora y cómo.

---

## 2. Pregunta central

> **¿Cómo experimenta una persona el Territorio de su Contexto confirmado, y el Trabajo y la Gravity que ocurren sobre él, de forma que cada cosa que percibe sea un término o fenómeno válido con su Fuente y Procedencia visibles, y cada acto que realiza sea deliberado, distinguible y trazable?**

Hipótesis de trabajo, **no aprobada**, que el cowork debe validar, corregir o simplificar:

```
entrar → orientarse → percibir → explorar → hover → enfocar → comprender → anclar → declarar → decidir → observar → atender → retornar
```

El cowork debe tratar cada eslabón como una pregunta: ¿existe como fase distinta?, ¿qué término normativo o fenómeno la sostiene?, ¿qué acto humano habilita?, ¿qué evidencia física hay de que pueda ocurrir hoy? Puede fusionar, separar, reordenar o eliminar fases. Debe justificar cada cambio.

---

## 3. Estado normativo de partida

### 3.1 Documentos normativos (leer completos, en este orden)

1. `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_0.md`
2. `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_0.md`
3. `docs/ANALYSIS/ORRERY/Orrery_Decisiones_Arquitectonicas_D1_D2_D3_v1_0.md`

Copias en el Project BTIPS: `ANALYSIS/ORRERY/` con los mismos nombres.

### 3.2 Principio rector

> El Territorio permanece. El Trabajo ocurre sobre el Territorio. Las Lentes permiten percibir lo que ocurre y aplica sobre él. Las Superficies permiten comprenderlo y actuar.

### 3.3 Resumen operativo de la norma (no sustituye la lectura completa)

**Términos centrales (Vocabulario v1.0):**

- **Territorio.** El "dónde": Tenant › Organization › Project (› Repository) › Domain › Gene. Mandate, Session y NUCLEUS **no** son Territorio.
- **Espacio.** Representación navegable del Territorio. Es el motor de Orrery.
- **Entidad.** Elemento con identidad `(fuente, tipo, id)`.
- **Relación.** Hecho existente y verificado. Un `semantic_candidate` no es Relación. `DOMAIN_MANDATE` no es Relación.
- **Fuente.** Clases: autoridad canónica, registro, copia, proyección, índice, cache, dato visual. El Source Authority Profile V1 está pendiente.
- **Trabajo.** Mandate, Session, Action, Intent, resultados, Postulate. Ocurre **sobre** el Territorio y se *sitúa*; no *pertenece*.
- **Lente.** Mecanismo de lectura puro: toma una Proyección referenciada a Entidades y la hace perceptible mediante Anotaciones en el Espacio. No es información, Fuente, autoridad, persistencia ni significado.
- **Superficie.** Superficie de Workspace Core para comprender y actuar.
- **Contexto.** Organization + Project confirmados, con evidencia.
- **Foco.** Atención efímera.
- **Anchor.** Selección deliberada.
- **Location / LocationSnapshot.** Ubicación capturada.
- **Términos de soporte.** Proyección, Anotación, Navigation State (Contexto + Foco + Anchors), Captura, Procedencia, Régimen, Atención (la clasifica el sistema responsable, no Orrery), Situar.

**Constitución v1.0 (C-1..C-17), en una línea cada una:**

| ID | Invariante |
|---|---|
| C-1 | Representación ≠ verdad. |
| C-2 | Nada se muestra con más autoridad que su Fuente; *desconocido* ≠ *ninguno*. |
| C-3 | Orrery no crea Territorio. |
| C-4 | Territorio, Trabajo y Gravity son disjuntos; situar ≠ pertenecer. |
| C-5 | La identidad territorial es independiente del Trabajo. |
| C-6 | El Espacio recibe sólo Territorio + Anotaciones. |
| C-7 | Una Lente sólo lee. |
| C-8 | Una Anotación refiere a una Entidad existente y no porta significado propio. |
| C-9 | Navegar ≠ capturar. |
| C-10 | Sólo un acto deliberado ancla; el Foco nunca se captura. |
| C-11 | Una Location dice dónde, no por qué, y es inmutable. |
| C-12 | Lo mostrado como verificado, el anclaje, la Captura y los actos dependen de Contexto confirmado. No condiciona la existencia de nada. |
| C-13 | Una Superficie nunca es autoridad; los actos aplican a la versión/digest exacto. |
| C-14 | Nada se convierte en decisión sin acto humano deliberado. |
| C-15 | La estructura normativa de Gravity (Postures, spine, precedencia, Masa) vive sólo en nodos spine NUCLEUS / ORGANIZATION / PROJECT / MANDATE / SESSION, nunca en Domain/Gene. Sus efectos, aplicabilidad, conflictos y consecuencias sobre Trabajo situado sí pueden hacerse perceptibles en Entidades vía Proyección → Lente → Anotación con Procedencia. Orrery no calcula ni edita Gravity. La Masa explica, no decide. |
| C-16 | Las colisiones son tri-estado y nunca se confirman por similitud. |
| C-17 | Orrery no interpreta propósito ni decide Atención; la actividad nunca cambia lugar ni modo por sí sola. |

**Decisiones:**

- **D-1 = A2.** "Orrery" nombra la experiencia que articula Espacio + Lentes + Superficies con sujeto territorial. Profiles, Settings y Account no son Orrery.
- **D-2 = R-B.** Dos regímenes:
  - **Régimen Orrery:** el Espacio ocupa el escenario; Superficies persistentes y colapsables sobre él; modo foco sólo con HUD.
  - **Régimen Panel.**
- **D-3 = N-B.**
  - El Espacio representa el Territorio navegable del Contexto confirmado y el Navigation State gobierna.
  - Navegar, anclar y capturar son actos distintos.
  - Una LocationSnapshot se crea sólo por Captura explícita.
  - Reabrir una Location es una Proyección/Anotación sobre el Territorio actual.
- **D-3.b.** Un Domain confirmado en un Mandate pero aún no canónico es una Entidad con Procedencia "declarada por un Mandate". No es anclable en LocationSnapshot v0.1.

### 3.4 Conflictos ya registrados (no se resuelven en este cowork; se usan como casos)

- **Documentales.**
  - A-1: "foco principal" de ASM.
  - A-2: Contexto no verificado.
  - A-3: nombres de Lentes.
  - A-4: Source Authority Profile V1 ausente.
  - A-5: identidad de Relación.
  - A-6: regla 1:1.
  - A-7: cadena de Locations en el Ledger.
  - A-8: términos del borrador de research.
- **Físicos.**
  - F-1: el `nodeType` de LocationSnapshot admite NUCLEUS/MANDATE/SESSION.
  - F-2: arista `DOMAIN_MANDATE`.
  - F-3: DOMAIN/GENE anidados bajo MANDATE en GravityGraph.
  - F-4: `GeneRef` bajo `.mandates`.
  - F-5: prototipo orrery.
  - F-6: `localLocation`.
  - F-7: `regimeStore.lastVisitedAnchor`.
- **Deudas terminológicas.** D-T1..D-T5.

El detalle de cada conflicto está en el Vocabulario y la Constitución. El cowork los lee allí, no los reformula.

### 3.5 Estado físico conocido (verificado en `78bbaad`; re-verificar)

Esto es punto de partida, no verdad. El cowork lo re-verifica contra HEAD antes de apoyarse en ello.

**Workspace Core.**
- Electron (`installer/conductor/workspace/main_conductor.js`) carga la webview SvelteKit `webview/app` (por defecto `http://localhost:5173`).
- El preload `installer/conductor/workspace/core/preload_core.js` expone `window.onboarding`, `window.nucleus`, `window.intelligenceSupply` y `window.confirmedContext`.
- Control Plane Fastify en `:48215/api/v1`; WebSocket en `:4124`.

**Orrery físico.**
- Paquete `installer/conductor/workspace/core/orrery` (PlayCanvas 2.22.1, integrado en commit `126ebb7`).
- `fromLocationSnapshot` es un stub que lanza error.
- `regimeStore` siempre usa `fromSimulatedData()`.
- `tsc --noEmit` falla con TS2305 en `Position3` (DIS-12).

**Contexto.**
- `bloom.confirmed-context/v1` sale de `nucleus authority context-read`.
- No tiene consumidores en la UI.

**Superficies de lectura que no existen.**
- No hay comandos de lectura de Gravity, Gene, Location ni Domain.
- `reconcileStructuralProjection` no está exportado.
- `internal/gene` no tiene llamador externo.

**Gravity.**
- `ResolveActive` exige MandateID + SessionID + IntentType. La Activity está registrada pero ningún workflow la usa.
- `ComputeMasa` devuelve 1–3.
- `gravity []GravityRef` está vacío en Genesis.

**Mandate.**
- Contrato v1–v3: un domain, una acción `run_intent gen`, artefacto `domain_definition.json`.
- Fases de MandateBuildWorkflow: ingest → cluster → validate → signed → completed.
- Señales: `validate`, `approve(digest)`, `activate(digest)`.
- Desalineación de eventos: el cliente espera `domains_proposed`, `build:signed` y `action:all_complete`, que nadie publica.

**Actos CLI existentes.**
- `nucleus mandate build domains list|confirm|reject`, `approve` y `activate` (con attestation).
- No hay pause/resume.

**Brain.**
- Sólo existen los intents ING y DIS.
- ASM, AssemblyRequest y Postulate no están implementados.

**Impact, Monitor y Ledger.**
- Impact `impact/1` existe como material sin consumidor.
- Monitor es un esqueleto.
- `ledgerStore` usa MOCK_FEED.

**Aceptación E2E de Mandate Genesis.**
- **Pendiente** según la fuente canónica del Programa MANDATE y AGENDA_MAESTRA.
- El "E2E hecho" del Tablero v0.50 está reemplazado.

Consecuencia para el cowork: **gran parte de lo que la experiencia necesita no existe físicamente**. Eso no autoriza a inventarlo. Lo que no existe se registra como **requisito de información** (§11) y no como diseño de contrato.

---

## 4. Preguntas de investigación

Cada pregunta tiene un ID que se usa en el manifest (§8) y en los casos (§6).

### Secuencia y escenario

- **P-01 · Secuencia.** ¿Qué fases de la hipótesis entrar…retornar son reales y distintas? ¿Cuáles son el mismo fenómeno con dos nombres? ¿Falta alguna (por ejemplo "esperar", "recuperar contexto", "descartar")?
- **P-02 · Primera entrada.** Tras Genesis y con Contexto confirmado, ¿qué Territorio, Trabajo y efectos de Gravity existen *físicamente* para percibir en los primeros minutos? ¿Qué debería poder entender y hacer la persona con eso?
- **P-03 · Orientación.** ¿Qué necesita una persona para saber "dónde estoy, en qué Contexto, con qué autoridad"? ¿Qué es Superficie y qué es Espacio en esa orientación?

### Percepción espacial (eje A)

- **P-04 · Hover como concepto.** ¿Es el hover un concepto de experiencia necesario? ¿Cómo se relaciona con Foco, Anchor y Navigation State? ¿Debe proponerse como término, o queda como mecanismo de interacción sin estatus normativo?
- **P-05 · Límites perceptibles.** ¿Qué es el "borde" de una Entidad en el Espacio? Cubre picking/raycasting, Entidades contenidas, próximas y solapadas, ambigüedad, qué parte de la morfología responde y cómo se desambigua.
- **P-06 · Información mínima en hover.** ¿Qué puede mostrarse sin convertir el hover en Superficie? Por ejemplo: identidad, tipo, Fuente y Procedencia, estado de verificación.
- **P-07 · Transiciones.**
  - ¿Qué distingue Hover → Foco y Foco → Anchor?
  - ¿Qué es efímero, qué pertenece al Navigation State y qué exige acto deliberado?
  - ¿Qué jamás puede entrar en una LocationSnapshot?

### Lentes (eje B)

- **P-08 · Activación y manifestación.** ¿Cómo se activa, se percibe y se desactiva una Lente? ¿Cómo sabe la persona qué Lentes están activas?
- **P-09 · Combinación y densidad.** ¿Se combinan las Lentes? ¿Bajo qué restricciones? ¿Cómo se evita la sobrecarga?
- **P-10 · Invariancia.** ¿Qué cambia perceptivamente con una Lente y qué permanece inmutable (identidad, posición, estructura territorial)?
- **P-11 · Procedencia visible.** ¿Cómo se hacen perceptibles la Fuente, la Procedencia y la autoridad de cada Anotación (C-2)? ¿Cómo se distingue *desconocido* de *ninguno*?
- **P-12 · Espacio vs Superficie.** ¿Dónde termina "percibir en el Espacio" y empieza "comprender en una Superficie"?
- **P-13 · Anti-segundo-territorio.** ¿Qué señales indican que una Lente se está convirtiendo en un modelo paralelo del Territorio, y cómo se impide?

### Gravity (eje C)

- **P-14 · Recorrido de colisión.** ¿Cómo pasa la persona de no saber a percibir la colisión, identificar lo afectado, comprender las Postures, conocer su origen y entender qué puede hacer?
- **P-15 · Tri-estado.** ¿Cómo se experimentan de forma distinta *no collision*, *confirmed* y *undecidable*? ¿Y la ausencia de evaluación (desconocido)?
- **P-16 · Contrato de información de Gravity.** ¿Qué información necesita Orrery, de qué sistema, con qué Procedencia, para hacer perceptible un efecto de Gravity sin calcularlo?
- **P-17 · Masa.** ¿Cómo se hace perceptible la Masa como explicación y no como decisión?

### Trabajo, actos y tiempo

- **P-18 · Trabajo situado.** ¿Cómo se percibe Trabajo (Mandate, Session, Action, Intent, resultado, Postulate) situado sobre una Entidad sin volverlo Territorio (C-4)?
- **P-19 · Declarar y decidir.** ¿Qué actos humanos existen físicamente hoy (confirm/reject domains, approve, activate)? ¿Desde dónde deberían ser accesibles? ¿Cómo se ata el acto a la versión/digest exacta (C-13, C-14)?
- **P-20 · Observar.** ¿Qué puede observar la persona sobre Trabajo en curso (eventos, Ledger, Monitor, Impact) y con qué autoridad?
- **P-21 · Atender.** ¿Cómo se presenta algo que requiere Atención sin que Orrery la decida y sin cambiar lugar o modo por sí solo (C-17)?
- **P-22 · Retornar.** ¿Qué experimenta la persona al volver a una Location cuyo Territorio cambió o cuya Entidad ya no existe (D-3)?

### Condiciones de borde

- **P-23 · Contexto no confirmado.** ¿Qué existe y qué se degrada si el Contexto no está confirmado (C-12)?
- **P-24 · Segundo escenario (Bloomaut).** ¿El modelo construido sobre Cognituum soporta la incorporación de nuevo Territorio, conocimiento y Trabajo sin reescribirse?

---

## 5. Los tres ejes obligatorios

Los tres ejes se investigan **en paralelo desde el inicio**. Ninguno es una feature que se añade después. En particular, Gravity no se agrega a una experiencia ya diseñada.

### Eje A — Percepción y navegación espacial

**Premisa.** El Espacio contiene Entidades con morfología, extensión y límites. La persona recorre el Territorio moviendo el puntero sobre ellas. Hover, Foco y Anchor no son lo mismo.

**Cadena a estudiar, sin asumir que es definitiva:**

```
percepción → hover → foco → anchor → captura
```

**Debe cubrir como mínimo:**

1. Hit-testing / raycasting. Qué geometría se usa para picking frente a la geometría visible, y tolerancias.
2. Entidades contenidas (Gene dentro de Domain dentro de Project), próximas, solapadas o visualmente ambiguas. Oclusión.
3. Qué parte de la morfología responde al hover: núcleo, envolvente, etiqueta, Anotación.
4. Highlight y desambiguación. Ciclo entre candidatos, refinamiento progresivo, sincronía con la jerarquía en una Superficie.
5. Información mínima perceptible durante hover y su límite frente a una Superficie.
6. Transición Hover → Foco. ¿Qué la causa? ¿Es acto deliberado o no?
7. Transición Foco → Anchor. Acto deliberado (C-10).
8. Clasificación de estados:
   - puramente efímeros;
   - del Navigation State (Contexto + Foco + Anchors);
   - que requieren acto humano deliberado;
   - que jamás pueden entrar en una LocationSnapshot (Foco, hover, Lentes activas, Anotaciones, Trabajo, Gravity, Entidades D-3.b, y lo que el cowork encuentre).
9. Accesibilidad. Equivalente de teclado y no-puntero para recorrer, enfocar y anclar. El Espacio no puede ser la única vía de acceso a una Entidad.

**Restricciones:**
- No convertir Hover en término normativo automáticamente. Primero determinar si es necesario como concepto de experiencia. Si el cowork concluye que hace falta un término nuevo, lo **propone** con la forma del Vocabulario (qué es, función, qué NO es, de quién obtiene su verdad) y se detiene para decisión (§13).
- No diseñar el gesto concreto (click, doble click, tecla). Eso es Interaction Grammar, posterior.

**Física a contrastar:**
- `installer/conductor/workspace/core/orrery/src/{main,display,layout,locationTree}.ts`
- `regimeStore.ts`
- capacidades de picking de PlayCanvas 2.22.1 (documentación primaria)

### Eje B — Percepción mediante Lentes

**Punto de partida estricto.** Una Lente es un mecanismo de lectura que toma una Proyección referenciada a Entidades del Territorio y la hace perceptible mediante Anotaciones en el Espacio. No es información, Fuente, autoridad, persistencia ni significado (Vocabulario v1.0; C-6, C-7, C-8).

**Debe cubrir:**

1. Activación y manifestación. Cómo aparece, cómo se indica que está activa, cómo se retira. Qué la provoca: acto de la persona, Régimen o Superficie. Nunca la actividad por sí sola (C-17).
2. Combinación. ¿Se combinan? ¿Hay exclusiones? ¿Hay un orden de composición de Anotaciones sobre la misma Entidad?
3. Qué cambia y qué no. Las Anotaciones cambian. La identidad, la posición territorial y la estructura del Territorio no deberían cambiar; el cowork debe verificar esa hipótesis.
4. Cadena Lente ↔ Proyección ↔ Anotación ↔ Entidad. Quién produce la Proyección (otro sistema), qué hace la Lente (sólo lee) y a qué refiere la Anotación (Entidad existente).
5. Percibir en el Espacio vs comprender en una Superficie. Qué información se queda en la Anotación y cuál exige abrir una Superficie.
6. Densidad y sobrecarga. Límites, agregación, semantic zoom, progressive disclosure.
7. Procedencia visible por Anotación. Fuente, clase de Fuente, autoridad; *desconocido* vs *ninguno*.
8. Anti-segundo-modelo. Criterios para detectar y prohibir que una Lente reordene, cree o elimine Entidades o Relaciones.

**Restricciones:**
- No fijar nombres de Lentes por conveniencia visual (A-3 sigue abierto). Las Lentes se describen por **qué Proyección leen** y **qué fenómeno hacen perceptible**, no por un nombre de marca.
- No tratar `semantic_candidate` como Relación ni la similitud como confirmación.

### Eje C — Gravity como experiencia fundamental

**Premisas normativas.**
- Gravity no es Territorio. Las Postures no son Entidades territoriales (C-4, C-15).
- Ruta constitucional:

```
Gravity → Proyección → Lente → Anotación → Entidad
```

  preservando Fuente, Procedencia y autoridad.

**Caso obligatorio (CT-02, §6).** Una persona observa un Domain. Existe Trabajo situado allí. Gravity determina una colisión confirmada entre Postures relevantes. Hay que describir el recorrido completo:

| Paso | Pregunta |
|---|---|
| 0 | No sabe que existe la colisión. ¿Qué la hace perceptible sin que Orrery decida su Atención? |
| 1 | Percibe. ¿Qué fenómeno ve y sobre qué Entidad? |
| 2 | Identifica lo afectado. ¿Qué Trabajo situado y qué Entidades? |
| 3 | Comprende qué Postures intervienen. ¿Dónde (Superficie) y con qué lenguaje? |
| 4 | Conoce su origen. ¿En qué nodo spine (NUCLEUS/ORG/PROJECT/MANDATE/SESSION) se originan y con qué Procedencia? |
| 5 | Entiende qué puede hacer. ¿Qué actos humanos existen físicamente o están previstos y quién tiene autoridad? ¿Qué no puede hacer desde Orrery? |

**Restricciones (todas obligatorias). Orrery:**
- no calcula Gravity;
- no decide una colisión;
- no inventa autoridad;
- no transforma Postures en objetos del Territorio;
- no usa similitud como confirmación;
- distingue *no collision* / *confirmed* / *undecidable*, y además el caso *no evaluado / desconocido* (C-2);
- puede hacer perceptibles efectos de Gravity sobre Entidades respecto de Trabajo situado allí.

**Objetivo.** No diseñar "cómo se ve Gravity". Determinar:
1. el **contrato de experiencia**: qué debe poder percibir, comprender y hacer la persona en cada paso;
2. la **información necesaria**: qué datos, de qué sistema, con qué Procedencia, y si hoy existen físicamente.

**Física a contrastar:**
- `installer/nucleus/internal/gravity/*`: resolver, masa, structural_projection, detectores de ciclos de prioridad y umbral insatisfacible;
- `installer/nucleus/gravity/portable.go`;
- spec de colisiones (tres familias × tres estados);
- Paladin UX spec (seis señales de conflicto, icono de Masa);
- `ResolveActive` sin uso en workflows y `gravity []` vacío en Genesis.

Es casi seguro que **hoy no existe ningún flujo físico que produzca una colisión confirmada observable**. El cowork debe decirlo con evidencia y describir el caso como requisito, no fingir que existe.

---

## 6. Casos de prueba

Cada caso se recorre contra el Experience Model propuesto. Para cada uno el cowork reporta:
- qué percibe la persona;
- qué comprende;
- qué puede hacer;
- qué invariantes se ejercitan;
- qué información hace falta;
- si existe físicamente.

### Escenario primario

**CT-01 · Primera entrada post-Genesis.** Cognituum acaba de completar Genesis. Hay Contexto confirmado. La persona entra por primera vez a Orrery.
- Recorrer los primeros minutos: entrar, orientarse, percibir el Territorio disponible (Project, Domains confirmados, Genes si existen), percibir el Trabajo de Genesis situado, explorar, enfocar, anclar y capturar una Location.
- Distinguir lo que existe físicamente tras Genesis (por ejemplo `domain_definition.json`, Domains confirmados en Mandate) de lo que sería canónico.
- Invariantes: C-3, C-6, C-9, C-10, C-12, D-3, D-3.b.

### Caso obligatorio de Gravity

**CT-02 · Colisión confirmada sobre un Domain con Trabajo situado.** Recorrido completo del eje C. Invariantes: C-2, C-4, C-7, C-8, C-14, C-15, C-16, C-17.

**CT-03 · Colisión indecidible.** Mismo escenario, pero Gravity devuelve UNDECIDABLE. ¿Cómo se distingue de CONFIRMED y de "no evaluado"? ¿Qué puede hacer la persona? (C-2, C-16)

**CT-04 · Sin colisión vs no evaluado.** El Domain no tiene colisión, o Gravity nunca se evaluó (hoy `gravity []` está vacío en Genesis). La experiencia no puede confundir *ninguno* con *desconocido* (C-2).

**CT-05 · Similitud aparente.** Dos Postures "se parecen" o hay un `semantic_candidate` entre Entidades. Nada se muestra como colisión ni como Relación (C-16, Vocabulario: Relación).

### Percepción y navegación

**CT-06 · Entidades contenidas y solapadas.** Gene dentro de Domain dentro de Project, con oclusión parcial. ¿Qué responde al hover, cómo se desambigua y qué se enfoca? (eje A)

**CT-07 · Foco que intenta persistirse.** La persona enfoca una Entidad y cierra Orrery. ¿Qué se conserva y qué no? El Foco nunca se captura (C-10). Contrastar con F-7 `regimeStore.lastVisitedAnchor`.

**CT-08 · Intento de anclar Trabajo.** La persona intenta anclar un Mandate o una Session (conflicto F-1). La experiencia no puede ofrecer el anclaje de algo que no es Territorio (C-4, D-3).

**CT-09 · Domain D-3.b.** Domain confirmado en Mandate y no canónico. Se percibe con Procedencia "declarada por un Mandate" y no es anclable en LocationSnapshot v0.1.

**CT-10 · Retorno a Location alterada.** La persona reabre una Location cuya Entidad cambió o desapareció. Es una Proyección/Anotación sobre el Territorio actual (D-3, C-11).

### Lentes

**CT-11 · Saturación de Lentes.** Varias Lentes activas sobre la misma zona. Densidad, composición, procedencia por Anotación, ausencia de segundo modelo (eje B).

**CT-12 · Anotación de Fuente débil.** Una Anotación proviene de una Fuente de clase cache, índice o dato visual. No se muestra con más autoridad que su Fuente (C-2). El Source Authority Profile V1 está ausente (A-4).

### Tiempo, Atención y actos

**CT-13 · Actividad en curso mientras la persona está en otro lugar.** Una Session o Action avanza en otro Domain. Nada cambia lugar ni modo por sí solo (C-17). ¿Cómo llega la necesidad de Atención si el sistema responsable la clasifica?

**CT-14 · Decidir sobre una versión exacta.** La persona aprueba o activa un Mandate. El acto se ata a un digest. ¿Qué pasa si el digest cambió entre percepción y acto? (C-13, C-14)

**CT-15 · Contexto no confirmado.** Se degradan la verificación, el anclaje, la Captura y los actos, pero no la existencia (C-12, A-2).

### Escenario secundario de validación (posterior al primario)

**CT-16 · Bloomaut.** Cognituum ya existe. Se incorpora Bloomaut y aparece nuevo Territorio, conocimiento y Trabajo. La persona lo recorre y empieza a gobernarlo. Valida que el modelo de CT-01 escala sin reescribirse.
- No sustituye CT-01.
- Se recorre sólo después de cerrar CT-01..CT-15.

---

## 7. Invariantes que no pueden reabrirse

El cowork **no** puede modificar, reinterpretar ni "flexibilizar":

1. Todos los términos y definiciones del Vocabulario Normativo v1.0, incluida la sección "Orden normativo de ORRERY".
2. C-1..C-17 de la Constitución v1.0, con las redacciones ajustadas de C-12 y C-15.
3. D-1 (A2), D-2 (R-B), D-3 (N-B) y D-3.b.
4. La regla de diseño de §1.
5. La disciplina epistemológica de §10.

**Si el cowork encuentra que una norma impide una experiencia necesaria:**
- No la reinterpreta.
- Registra un **conflicto norma ↔ experiencia** con evidencia y alternativas.
- Se detiene para decisión de José (§13).

**Lo que sí permanece abierto y el cowork puede proponer:**
- la secuencia de experiencia;
- el estatus de Hover;
- cómo se manifiestan las Lentes (sin nombrarlas);
- el contrato de experiencia de Gravity;
- los requisitos de información.

**Lo que el cowork no resuelve:**
- los conflictos A-1..A-8 y F-1..F-7;
- el Source Authority Profile V1;
- la identidad de Relación;
- los contratos de Location, Gravity o Gene.

Sólo los usa como casos y registra cómo afectan la experiencia.

---

## 8. Manifest jerarquizado de fuentes

**Convenciones:**
- Paths relativos a la raíz del repo, salvo `[Project]`, que indica un doc que sólo vive en el Project BTIPS (ruta del Project).
- Todos los paths de repo listados fueron verificados como existentes el 2026-10-10.
- **Autoridad**: N = normativa · F = física · H = histórica/orientativa · C = contexto.
- **Reempl.**: "sí" = contiene decisiones reemplazadas; leer sólo como historia y nunca como autoridad.

### A — Normativo obligatorio (leer completo, primero)

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| A1 | `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_0.md` | ORRERY | Términos, conflictos A/F, orden normativo. Toda propuesta se expresa en estos términos. | N (máxima) | Todas | no |
| A2 | `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_0.md` | ORRERY | C-1..C-17: límites duros de la experiencia; ejemplos y violaciones. | N | Todas | no |
| A3 | `docs/ANALYSIS/ORRERY/Orrery_Decisiones_Arquitectonicas_D1_D2_D3_v1_0.md` | ORRERY | Alcance de Orrery, Regímenes, Navigation State, D-3.b; "Consecuencias derivadas" para el siguiente trabajo. | N | P-03, P-07, P-12, P-22, CT-01, CT-07..10 | no |
| A4 | `docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` | ORRERY / Location | Cierre material de Location: qué es una Location y qué contiene. Base de "qué jamás entra en una LocationSnapshot". Subordinado a A1–A3 en semántica. | N (Location, subordinada a A1–A3) | P-07, P-22, CT-08, CT-09, CT-10 | verificar contra A1 (F-1, F-6) |
| A5 | `docs/ANALYSIS/ORRERY/LOCATION/Orrery_LocationSnapshot_v0.md` | ORRERY / Location | Contrato LocationSnapshot v0.1 (origen de F-1). | N para Location; contradicción registrada con A1 | P-07, CT-08 | parcialmente (F-1) |
| A6 | `docs/ANALYSIS/GRAVITY/COLISIONES/Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md` | Gravity / Orbital | Tres familias (territorial, jerárquica, horizontal) × tres estados (NO_COLLISION / CONFIRMED / UNDECIDABLE). Define qué es una colisión antes de pensar su experiencia. | N para la semántica de colisión (Gravity es dueño) | P-14, P-15, P-16, CT-02..05 | no conocido; verificar implementación |
| A7 | `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md` | Genes | Gene como entidad; las curvas son relaciones; candidato ≠ ratificado. Fija qué es Territorio en el nivel más fino. | N para Gene | P-05, P-18, CT-06, CT-09 | no (v2.0 sí está reemplazada; ver E) |
| A8 | `docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md` | MANDATE | Estado canónico del programa: E2E de Genesis **pendiente**. Define qué Trabajo existe tras Genesis. | N para el estado del programa | P-02, P-19, CT-01 | reemplaza al Tablero v0.50 |
| A9 | `docs/CONTROL/AGENDA_MAESTRA.md` (sección "Estado coordinado ORRERY / Location") | CONTROL | Gate: el contraste físico debe hacerse con datos genuinos; estado coordinado de Orrery. | N de coordinación | P-02, §10 | no |
| A10 | `docs/CONTROL/AGENDA_FOLLOWUP.md` | CONTROL | ASM termina en AssemblyResult. PostulateProposal pertenece a un proceso soberano posterior. Monitor e Impact están separados. | N de coordinación (corrige al BISP) | P-18, P-20, P-21 | no |

### B — Autoridad física / implementación actual

Prevalece sobre cualquier research para **hechos físicos**. Re-verificar contra HEAD.

**B.1 Workspace Core y Contexto**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas |
|---|---|---|---|---|---|
| B1 | `installer/conductor/workspace/main_conductor.js` | Conductor / Workspace Core | Ventana `createWorkspaceWindow`, carga de `workspace_url`. Contenedor real de la experiencia. | F | P-01, P-03 |
| B2 | `installer/conductor/workspace/core/preload_core.js` | Workspace Core | APIs expuestas a la webview (`onboarding`, `nucleus`, `intelligenceSupply`, `confirmedContext`): qué información está realmente al alcance de la UI. | F | P-03, P-16, P-23 |
| B3 | `installer/conductor/workspace/core/ipc/confirmed-context-handlers.js` | Workspace Core / Nucleus authority | Lectura de `bloom.confirmed-context/v1`. Base física del Contexto (C-12). | F | P-03, P-23, CT-15 |
| B4 | `webview/app/src/lib/confirmedContext.ts` | Webview | Cliente del Contexto confirmado; confirma que no hay consumidores de UI. | F | P-23 |
| B5 | `webview/app/src/routes/+layout.svelte` | Webview | Estructura real de Workspace Core: dónde podrían vivir Regímenes y Superficies. | F | P-03, P-12 |
| B6 | `webview/app/src/lib/stores/regimeStore.ts` | Webview / Orrery | Régimen actual, siempre `fromSimulatedData()`, `lastVisitedAnchor` (F-7). | F | P-07, CT-07 |
| B7 | `webview/app/src/lib/components/OrreryContainer.svelte` | Webview / Orrery | Montaje del Espacio en Workspace Core. | F | P-01, P-12 |
| B8 | `webview/app/src/lib/stores/{mandateStore,ledgerStore,tabs,websocket}.ts` | Webview | Qué Trabajo y qué eventos llegan a la UI. `ledgerStore` usa MOCK_FEED. | F | P-18, P-20, P-21 |
| B9 | `webview/app/src/lib/components/{Sidebar,ProjectsPanel,MandateTab,LedgerPanel,IntelligenceSupplyView}.svelte` | Webview | Superficies existentes y lo que muestran hoy. | F | P-12, P-19, P-20 |
| B10 | `webview/app/src/lib/bootstrap/genesisLaunch.ts` y `webview/app/src/lib/api.ts` | Webview / Onboarding | Transición `pending_genesis_launch` → Genesis; cliente del Control Plane. | F | P-02, CT-01 |
| B11 | `installer/native/config/onboarding/onboarding_steps.json` y `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js` | Onboarding | Pasos reales hasta `mandate_genesis`: qué ya pasó cuando la persona entra por primera vez. | F | P-02, CT-01 |

**B.2 Orrery físico (prototipo integrado)**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas |
|---|---|---|---|---|---|
| B12 | `installer/conductor/workspace/core/orrery/src/main.ts` | Orrery | `mountOrreryScene`, cámara, input, picking actual si existe. | F (prototipo; F-5) | P-04..07 |
| B13 | `installer/conductor/workspace/core/orrery/src/{display,layout,locationTree}.ts` | Orrery | Morfología, extensión y layout de Entidades (`OrreryTree`): base del hit-testing y la contención. | F (prototipo) | P-05, P-10, CT-06 |
| B14 | `installer/conductor/workspace/core/orrery/src/data.ts` y `src/adapters/{fromSimulatedData,fromLocationSnapshot}.ts` | Orrery | Qué datos recibe el Espacio. Lo simulado no es evidencia; `fromLocationSnapshot` es un stub que lanza error. | F (con advertencia) | P-02, C-6 |
| B15 | `installer/conductor/workspace/core/orrery/{package.json,tsconfig.json}` | Orrery | PlayCanvas 2.22.1; fallo TS2305 (DIS-12). | F | P-05 |

**B.3 Control Plane y eventos**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas |
|---|---|---|---|---|---|
| B16 | `src/types/ws-events.ts` y `src/types/gen-state.types.ts` | Control Plane | WsEventMap: desalineación de eventos esperados vs publicados. Límite físico de "observar". | F | P-20, P-21, CT-13 |
| B17 | `src/api/routes/mandates.routes.ts` y `src/api/handlers/create-mandate.handler.ts` | Control Plane | Actos expuestos por API. | F | P-19 |

**B.4 Nucleus: Gravity, Gene, Mandate, autoridad**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas |
|---|---|---|---|---|---|
| B18 | `installer/nucleus/internal/gravity/{model,resolver,masa,structural_projection,store}.go` | Gravity | Qué calcula Gravity: `ResolveActive` (MandateID + SessionID + IntentType), Masa 1–3, proyección estructural no expuesta. | F | P-14..17, CT-02..04 |
| B19 | `installer/nucleus/internal/gravity/{priority_cycle_detector,threshold_unsatisfiable_detector}.go` | Gravity | Detectores reales: ¿qué tipos de conflicto existen físicamente? Contrastar con A6. | F | P-14, P-15 |
| B20 | `installer/nucleus/gravity/portable.go` | Gravity | `Criterion` portable: forma de la información de Postures. | F | P-16 |
| B21 | `installer/nucleus/internal/gene/{model,store,materializer}.go` | Genes | Gene físico; el store no tiene llamador externo. | F | P-02, CT-06 |
| B22 | `installer/nucleus/internal/orchestration/mandatecontract/contract.go` | MANDATE | Contrato v1–v3: un domain, una acción `run_intent gen`, `gravity []GravityRef`. | F | P-02, P-18, CT-04 |
| B23 | `installer/nucleus/internal/orchestration/temporal/workflows/{mandate_build_workflow,mandate_execution_workflow}.go` y `.../temporal/worker.go` | MANDATE / Temporal | Fases, señales `validate`/`approve(digest)`/`activate(digest)`, eventos publicados; si la Activity de Gravity se usa. | F | P-19, P-20, CT-14 |
| B24 | `installer/nucleus/internal/orchestration/commands/{mandate_authority_cmd,mandate_build_domains_cmd}.go` | MANDATE | Actos humanos reales (confirm/reject domains, approve, activate con attestation). | F | P-19, CT-14 |
| B25 | `installer/nucleus/internal/governance/authority_command.go` | Governance | `context-read` y autoridad. | F | P-03, P-23 |
| B26 | `installer/help/nucleus_help.json` | Nucleus CLI | Inventario de comandos: confirma la ausencia de lectura de Gravity, Gene, Location y Domain. | F | P-16, §11 |

**B.5 Brain, ejecución, AITAP, Monitor, Impact**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas |
|---|---|---|---|---|---|
| B27 | `brain/core/intent_types.py` y `brain/core/intent/gen_domain.py` | Brain | Sólo ING y DIS; cómo se genera `domain_definition.json` = {purpose, boundaries, concepts, decisions, sources}. | F | P-02, P-18 |
| B28 | `installer/execution/contracts/v1/*.schema.json` | Execution | `cognituum.execution/v1`: sequence, paused/resumed/cancelled (staging). Qué estados de Trabajo serían observables. | F | P-18, P-20 |
| B29 | `installer/aitap/contracts/v2/inference-accounting-event.schema.json` | AITAP | Información perceptible de inferencia (proveedor, local/remoto, coste). Sólo si se hace perceptible en la experiencia. | F | P-11, P-20 |
| B30 | `installer/impact/internal/contracts/contract.go` y `installer/impact/README.md` | Impact | `impact/1`: findings, coverage, indeterminacy, reevaluateWhen. Material sin consumidor; posible Fuente de "consecuencias". | F | P-14, P-20, P-21 |
| B31 | `installer/monitor/README.md` | Monitor | Esqueleto (`status`). Límite de "observar". | F | P-20 |

**B.6 Tests**

Un test que pasa describe comportamiento físico con más fuerza que un doc. El cowork debe **localizar y leer** los tests de:
- `installer/nucleus/internal/gravity/`
- `internal/gene/`
- `orchestration/mandatecontract/`
- `orchestration/temporal/workflows/`
- `installer/conductor/workspace/core/orrery/`
- `webview/app/`

No se listan uno por uno porque deben enumerarse contra HEAD.

### C — Research y decisiones históricas necesarias

Leer para entender por qué se llegó a la norma, qué ya se descartó y qué preguntas quedaron abiertas. **Ninguno es autoridad.** Toda conclusión que se tome de aquí debe re-expresarse en términos de A1.

**C.1 Orrery**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| C1 | `docs/ANALYSIS/ORRERY/UI/Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md` | ORRERY | Research de UI/UX que originó Vocabulario, Constitución y Decisiones. Tiene inventario físico y patrones externos. | H; sus términos se releen por A1 (A-8) | P-01, P-03, P-08..13 | sí, términos de borrador |
| C2 | `docs/ANALYSIS/GRAVITY/ORBITAL/Orrery_Research_Resultados_v0_1.md` | ORRERY / Orbital | Zoom semántico, Gravity como overlay separado, lenguaje humano por defecto, HUD/MFD, overlay no destructivo (Kubernetes Lens), foco no destructivo (Datadog). Insumo directo para los ejes A, B y C. | H | P-08..13, P-14, P-17 | parcial: "overlay" → re-expresar como Lente/Anotación |
| C3 | `docs/ANALYSIS/GRAVITY/ORBITAL/Orrery_Research_Brief_Interfaz_Principal_v0_1.md` | ORRERY / Orbital | Preguntas originales del research de interfaz. | H | P-01 | sí |
| C4 | `docs/ANALYSIS/GRAVITY/ORBITAL/Glosario_Contexto_Cognituum_para_Cowork.md` | Orbital | Glosario previo. Útil para detectar términos que A1 reemplazó. | H | — | sí: A1 prevalece |
| C5 | `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md` | ORRERY | Reorientación location-first: antecedente de D-3. | H | P-07, P-22 | parcial |
| C6 | `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_Integracion_UI_Entrada_Salida_v0_3.md` | ORRERY | Puntos de entrada y salida de Orrery en la UI (P-01: entrar y retornar). | H | P-01, P-22 | parcial |
| C7 | `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_Verificacion_UIContenedora_PuntosEntrada_LocationFirst_v0_1.md` | ORRERY | Verificación física de puntos de entrada. | H con evidencia F fechada | P-01 | re-verificar |
| C8 | `docs/ANALYSIS/ORRERY/UI/Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` | ORRERY | Cómo se pensó ver Mandates y Postulates: riesgo de volver Territorio al Trabajo (C-4). | H | P-18 | sí, contrastar con C-4 |
| C9 | `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_Orrery_GatewayUX_Onboarding_TransicionEspacial_v0_1.md` | ORRERY / Onboarding | Transición onboarding → Espacio: antecedente directo de CT-01. | H | P-02, CT-01 | parcial |
| C10 | `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_Orrery_UIContenedora_ModeloInteraccion_IntegracionFormal_v0_2.md` | ORRERY | Modelo de interacción previo. Leer la v0.2; la v0.1 sólo si hace falta. | H | P-01, P-07 | sí, anterior a D-2 |
| C11 | `docs/ANALYSIS/ORRERY/UI/Propuesta_Diseno_LedgerPanel_CapaAuditoriaTrazabilidad_v0_1.md` | ORRERY / Ledger | Ledger como capa de trazabilidad. Relación con A-7. | H | P-20, P-22 | parcial (A-7) |
| C12 | `[Project] ANALYSIS/ORRERY/UI/Spec_Implementacion_Integracion_Core_Orrery_v1_0.md` y `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` | ORRERY | Qué se integró físicamente en `126ebb7` y con qué alcance. | H con evidencia F fechada | P-02, B12–B15 | re-verificar |
| C13 | `[Project] ANALYSIS/GRAVITY/LOCATION/Investigacion_Already_Orrery_Location_Infraestructura_v0_1..v0_3` | ORRERY / Location | Infraestructura de Location ya existente. Leer la última versión. | H | P-07, P-22 | sí, versiones previas |

**C.2 Gravity, Paladín y Session**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| C14 | `docs/ANALYSIS/GRAVITY/PALADIN/Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md` | Gravity / Paladín | Breadcrumb chips, seis señales de conflicto, icono de Masa. Insumo principal de CT-02. | H (spec UX no aprobada para Orrery) | P-14, P-15, P-17 | contrastar con C-15/C-16 |
| C15 | `docs/ANALYSIS/GRAVITY/MODELS/Paladin_Client_Object_Model_v0_1.md` | Gravity / Paladín | Modelo de objetos del cliente de Postures: qué información podría recibir una Superficie. | H | P-16 | — |
| C16 | `docs/ANALYSIS/GRAVITY/MODELS/Orbital___Fundamentos_de_Coordinacion_Gravity_e_Interaccion_Gobernada.md` | Orbital / Gravity | Fundamentos de Gravity e interacción gobernada: por qué la colisión importa a una persona. | H/C fundacional | P-14, P-19 | — |
| C17 | `docs/ANALYSIS/GRAVITY/MODELS/Corolario___La_persona_como_fuente_de_Gravity.md` | Gravity | La persona como fuente de Gravity: origen de Postures en el recorrido de CT-02 (paso 4). | H/C | P-14 paso 4 | — |
| C18 | `docs/ANALYSIS/GRAVITY/GRAFO/Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md` | Gravity | Frontera semántica y Procedencia de GravityGraph. Base para la ruta Gravity → Proyección. | H (cierre) | P-11, P-16 | verificar vs F-3 |
| C19 | `docs/ANALYSIS/GRAVITY/GRAFO/GravityGraph_DOMAIN_GENE_Contrato_Propuesto_v0_1.md` y `Investigacion_GravityGraph_DomainGene_Relacion_v0_1.md` | Gravity | Propuesta de DOMAIN/GENE en GravityGraph. Origen de F-3 y F-4; caso de C-15. | H | P-16, CT-02 | contrastar con C-15 |
| C20 | `docs/ANALYSIS/GRAVITY/GRAFO/Orbital_Gravity_Persistencia_Grafo_Implementation_Spec_v0_1.md` | Gravity | Persistencia del grafo. | H | P-16 | verificar vs B18 |
| C21 | `docs/ANALYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md` y `Gravity_SESSION_MandateGenesis_Handoff_Investigacion_v0_1.md` | Gravity / Session | Session como nodo spine en Genesis: por qué `ResolveActive` exige SessionID. | H | P-14, P-18 | — |
| C22 | `docs/ANALYSIS/GRAVITY/API/NUCLEUS_API_Contracts_Consolidado_v0_1.md` y `NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md` | Nucleus | Contratos API previstos frente a la verdad física. Usar la auditoría para saber qué no existe. | H (la auditoría tiene evidencia F fechada) | P-16, §11 | sí, la consolidada en partes |
| C23 | `docs/ORBITAL/GRAVITY/Orbital_Gravity_Implementation_Spec_v0_1.md` | Gravity | Spec de implementación de Gravity. | H | P-16 | verificar vs B18 |

**C.3 Mandate, Genesis y ASM**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| C24 | `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md` | MANDATE | Auditoría del mecanismo de eventos. Explica la desalineación de B16. | H con evidencia F | P-20 | — |
| C25 | `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md` | MANDATE | Roadmap de Genesis: qué está previsto tras la primera entrada. | H | P-02 | estado: A8 prevalece |
| C26 | `docs/GENESIS/BLOOM_Genesis_Intent_Gen_Design_v1_0.md` | Genesis | Diseño del intent GEN: qué produce Genesis y qué ve la persona al final. | H | P-02, CT-01 | verificar vs B27 |
| C27 | `docs/MANDATE/BLOOM_Mandate_Universal_Schema_v1_2_0.md` | MANDATE | Schema universal previsto de Mandate (Action, Intent, Session). | H | P-18 | verificar vs B22 |
| C28 | `docs/BSIP/TYPES/ASM_Intent_Spec_v1_0.md` y `docs/ANALYSIS/BSIP/ASM/{ASM_Location_Research_v0_2,ASM_PRE_MANDATE_EXECUTION_ADR_v0_1,ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1}.md` | Brain / ASM | Assembler y su uso de Location (A-1 "foco principal"). No implementado. | H | P-07, P-18 | A-1 abierto; A10 prevalece |
| C29 | `docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md` (Parte G) | Brain / BISP | Semántica de intents y Postulate. | H | P-18 | sí: PostulateProposal reemplazado por A10 |
| C30 | `docs/BSIP/TYPES/ING_Intent_Spec_v1_1.md` y `DIS_Intent_Spec_v1_0.md` | Brain | Los únicos intents implementados: qué Trabajo real puede situarse hoy. | H con F en B27 | P-18 | — |
| C31 | `docs/AGENTIC/BTIPS_Mandates_Agenticos_Spec_Unificada.md` | MANDATE | Mandates agénticos: actos humanos previstos. | H | P-19 | verificar |

**C.4 UI previa y Workspace Core**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| C32 | `docs/ANALYSIS/UI/Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` y `Cierre_Investigacion_Auditoria_Estado_UI_Puente_CoreUIRedesign_v1_0.md` | UI | Estado auditado de la UI y puente al rediseño. | H con evidencia F fechada | P-03, P-12 | re-verificar |
| C33 | `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Workspace_Core_UI_01.md` | Workspace Core | Concepción original de Workspace Core. | H | P-03 | sí: F-05 reemplazado |

**C.5 AITAP y onboarding (Project)**

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| C34 | `[Project] AITAP/LLM_LOCAL/Propuesta_Contratos_Milestones_Vertical_LocalFirst_Inteligencia_v0_3.md` | AITAP | Qué información de inteligencia local/remota podría ser perceptible. Leer v0.3; v0.1 y v0.2 son historia. | H | P-11, P-20 | sí, versiones previas |
| C35 | `[Project] ANALYSIS/CONDUCTOR/ONBOARDING/*` (sobre todo los Cierres más recientes) | Onboarding | Qué se garantiza al terminar el onboarding (identidad, roles, invitaciones): precondiciones de CT-01. | H con evidencia F | P-02, P-23 | según fecha |

### D — Evidencia de interacción / prototipos

| # | Path | Sistema | Por qué leer | Autoridad | Preguntas | Reempl. |
|---|---|---|---|---|---|---|
| D1 | `installer/conductor/workspace/core/orrery/` (ejecutar con `index.html` + Vite) | Orrery | Único prototipo interactivo real. Observar cámara, picking, contención, densidad y panel de simulación (route/marker/timeline). Es evidencia de **interacción**, no de semántica (F-5). | F de interacción | P-04..07, P-10, CT-06 | panel de simulación: no normativo |
| D2 | `docs/DESIGN/# BTIPS Foundational UX-UI Design Doctrine Prompt v0.1.md` | Diseño | Doctrina UX/UI fundacional: tono, densidad, principios. | H/C | P-09, P-11 | subordinada a A1–A3 |
| D3 | `docs/PALETTE/# 🎨 Bloom Color Palette.md` | Diseño | Restricciones cromáticas para codificar estado, Procedencia y tri-estado sin depender sólo del color. | C | P-11, P-15 | — |
| D4 | `docs/DESIGN/FUNCTIONAL_DESIGN_GUIDE_BTIPS.docx` | Diseño | Guía funcional. Consultar si D2 no alcanza. | C | P-12 | verificar vigencia |
| D5 | C14 (Paladin UX spec) como evidencia de patrón | Paladín | Breadcrumb chips y señales de conflicto: patrón candidato para CT-02. | H | P-14 | — |

### E — Contexto secundario (consultar sólo si hace falta)

| # | Path | Sistema | Por qué / cuándo | Autoridad | Reempl. |
|---|---|---|---|---|---|
| E1 | `docs/CALL_TO_ACTION/PALADIN_COMMAND_RESPECT_POSITIONING_02.md` | Paladín / Estrategia | Sólo para validar el **propósito humano**: qué debe sentir y lograr la persona. No para derivar funcionalidad. | C | — |
| E2 | `docs/INTERVIEWS/COGNITUUM_PALADIN_RESEARCH_SNAPSHOT.md` (§14, §18) | Investigación de usuarios | Orrery prioriza orientación y atención; importar flujos existentes es el problema del primer contacto. Valida CT-01. | C (evidencia de usuario) | — |
| E3 | `docs/STRATEGY/COGNITUUM_RESEARCH_RESULT_STRATEGY_1.md` §6–§9 | Estrategia | Posicionamiento. Sólo si una decisión de experiencia depende del propósito de producto. | C | — |
| E4 | `docs/ORBITAL/GRAVITY/Tablero_Seguimiento_Consolidado_v0_2.md` | Orbital | Historial de estado. **No** usar para estado actual. | H | sí: v0.50 "E2E hecho" reemplazado por A8 |
| E5 | `docs/GENES/BTIPS_GENES_CONCEPT_v2_0.md` | Genes | Sólo para entender términos antiguos en otros docs. | H | sí, reemplazado por A7 |
| E6 | `docs/GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md` y `GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md` | Genes | Si CT-06 o CT-09 necesitan saber cuándo un Gene es canónico. | H | verificar vs B21 |
| E7 | `docs/ANALYSIS/GRAVITY/GRAMMAR/Orbital_Gravity_Expression_Grammar_Parser_Spec_v0_1.md` | Gravity | Si P-14 paso 3 necesita mostrar el contenido de una Posture en lenguaje humano. | H | — |
| E8 | `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Core_UI_Contexto_para_Codex.md` | Workspace Core | Contexto previo para agentes. | C | parcial |
| E9 | `docs/ANALYSIS/GRAVITY/ORBITAL/Cowork_Instrucciones_Lanzamiento_Research_Orrery.md` | Orbital | Cómo se lanzó el research anterior. Referencia de forma, no de contenido. | C | sí |

### Lagunas conocidas (el cowork debe buscarlas y declararlas si no aparecen)

| Laguna | Impacto | Acción |
|---|---|---|
| Source Authority Profile V1 | No hay escala formal de autoridad por Fuente (A-4). P-11 y CT-12 quedan sin base normativa. | Trabajar con las clases de Fuente de A1 y registrar el requisito. |
| Tarea consolidada ORRERY `01a0a6d5-617d-7dd2-a316-f3e3c3107920` | Inaccesible en la sesión anterior. | Pedir a José si es necesaria. |
| Research "Orrery Postures vs Postulates" | No localizado. | Buscar; si no aparece, declarar. |
| Research ASM "working snapshot" y `ASM_Location_Research_v0_1` | No localizados. Sólo existe v0.2. | Usar C28. |
| Docs específicos de **Constellation**, **Attention/Atención**, **Assembler** (fuera de ASM), **Genesis Control**, **Monitor** (más allá del README) | No se encontraron docs dedicados por nombre en `docs/`. | Buscar por contenido (`grep`), no sólo por nombre. Si no existen, Atención (P-21) se trabaja sólo desde A1/A2 y se registra como requisito hacia el sistema responsable. |
| Estado operativo `/home/jose/repos/elias-repos/.bloom` y `/home/jose/.local/share/BloomNucleus` | Necesario para el gate de "datos genuinos" (A9). | **No leer** sin pedir a José archivo y campo concretos. |

---

## 9. Investigación externa recomendada

**Regla.** Las referencias externas aportan principios de interacción, evidencia empírica, patrones y anti-patrones. **No redefinen Cognituum.** Cada hallazgo externo que se use debe:
- traducirse a un término o fenómeno de A1;
- indicar qué acto humano habilita;
- citar la fuente primaria.

**Prioridad de fuentes:**
1. papers revisados (CHI, UIST, IEEE VIS/TVCG, 3DUI/IEEE VR, EuroVis/CGF, Human Factors);
2. libros de referencia;
3. documentación técnica primaria;
4. sistemas productivos observables;
5. blogs, sólo si no hay alternativa y marcados como tales.

Las referencias siguientes son **puntos de partida propuestos desde conocimiento previo, no verificados en esta sesión**. El cowork debe verificar cada cita (autores, año, venue) antes de usarla.

| # | Tema | Por qué importa | Puntos de partida sugeridos | Eje |
|---|---|---|---|---|
| X1 | Picking/selección en entornos 3D densos | Hit-testing, oclusión, tolerancia, refinamiento | Argelaguet & Andujar, *A survey of 3D object selection techniques for virtual environments* (Computers & Graphics, 2013). Vanacken, Grossman & Coninx, efectos de densidad y visibilidad en selección 3D (3DUI, 2007). Kopper et al., selección por refinamiento progresivo (3DUI, 2011). Elmqvist & Tsigas, *A Taxonomy of 3D Occlusion Management for Visualization* (TVCG, 2008). | A |
| X2 | Hover, focus, selection y target disambiguation | Separar hover/foco/anchor con precedentes | Grossman & Balakrishnan, *The Bubble Cursor* (CHI, 2005). Separación focus/selection en WAI-ARIA Authoring Practices (W3C, doc primaria). Patrones viewport ↔ outliner (Blender, Unity) como sistemas productivos. | A |
| X3 | Semantic zoom, overview+detail, focus+context | Densidad, niveles de Territorio, progressive disclosure | Furnas, *Generalized Fisheye Views* (CHI, 1986). Perlin & Fox, *Pad* (SIGGRAPH, 1993). Bederson & Hollan, *Pad++* (UIST, 1994). Cockburn, Karlson & Bederson, *A review of overview+detail, zooming, and focus+context interfaces* (ACM Computing Surveys, 2008). | A, B |
| X4 | Visualización de información espacial y 3D vs 2D | Evidencia sobre cuándo el 3D ayuda o perjudica (anti-espectacularidad) | Cockburn & McKenzie, memoria espacial en 2D vs 3D (CHI, 2002). Ware, *Information Visualization: Perception for Design*. Munzner, *Visualization Analysis and Design* (2014), en particular las advertencias sobre 3D. Shneiderman, *The Eyes Have It* (1996). | A, B |
| X5 | Navegación de grafos y sistemas complejos | Recorrer Territorio y Relaciones sin perder orientación | Herman, Melançon & Marshall, *Graph visualization and navigation in information visualization: a survey* (TVCG, 2000). van Ham & Perer, *Search, Show Context, Expand on Demand* (InfoVis, 2009). | A, B |
| X6 | Visualización de reglas, restricciones y conflictos | Colisiones de Postures y tri-estado | Reeder et al., *Expandable Grids for visualizing and authoring computer security policies* (CHI, 2008). Literatura de visualización de políticas y control de acceso. Sistemas productivos: Kubernetes Lens, herramientas de policy-as-code (doc primaria). | C |
| X7 | Visualización de incertidumbre e indecidibilidad | UNDECIDABLE vs desconocido vs ninguno (C-2, C-16) | MacEachren et al., *Visual semiotics & uncertainty visualization* (TVCG, 2012). Trabajos de Padilla y colegas sobre cognición de la incertidumbre. | B, C |
| X8 | Visualización de Procedencia | Procedencia visible por Anotación | Ragan et al., *Characterizing Provenance in Visualization and Data Analysis* (TVCG, 2016). W3C PROV-DM (doc primaria). Xu et al., survey de provenance de interacción (CGF, 2020). | B, C |
| X9 | Factores humanos, situation awareness y carga cognitiva | Secuencia percibir → comprender → anticipar; sobrecarga | Endsley, *Toward a theory of situation awareness in dynamic systems* (Human Factors, 1995): niveles percepción/comprensión/proyección, contraste directo con la hipótesis de P-01. Wickens, teoría de recursos múltiples y *proximity compatibility principle* (Wickens & Carswell, 1995). Sweller, carga cognitiva. | Todos |
| X10 | HUD/MFD y progressive disclosure | Modo foco con HUD (D-2); Superficies colapsables | Wickens & Long sobre atención basada en objeto vs espacio y *attention tunneling* en HUD (J. Exp. Psych.: Applied, 1995). Literatura aeronáutica de MFD. Nielsen sobre progressive disclosure (NN/g; secundario). | A, B |
| X11 | Interrupción y atención | Atender sin que Orrery decida (C-17) | McFarlane & Latorella, coordinación de interrupciones (HCI journal, 2002). Horvitz y colegas sobre sistemas conscientes de la atención. | C, P-21 |
| X12 | Documentación técnica primaria del motor | Qué permite físicamente el picking | PlayCanvas Engine 2.x: picking, raycast, layers, render del frame de picking. Comparar con three.js Raycaster y deck.gl picking sólo como referencia. | A |
| X13 | Sistemas productivos de referencia (observación, no copia) | Patrones reales de overlay no destructivo, foco y Procedencia | Kubernetes Lens, Datadog (service map), Grafana, Neo4j Bloom, Gephi, Cesium, Blender/Unity outliner ↔ viewport, Figma (hover vs selección). | A, B, C |

**Cuándo investigar.** X1, X2, X4, X9 y X12 **antes** de proponer la secuencia y el eje A. X6, X7 y X8 antes de cerrar CT-02..05. El resto, durante.

**Entregable externo.** Un anexo con cada fuente consultada. Para cada una: principio extraído, evidencia, término/fenómeno de A1 al que se traduce, acto humano que habilita, y anti-patrón que evita.

---

## 10. Método de contraste documentación ↔ implementación

### 10.1 Disciplina epistemológica (obligatoria y textual)

- **No asumir que documentación histórica describe la implementación actual.**
- **Para hechos físicos:** `code / schemas / tests / runtime evidence > research histórico`.
- **Para semántica de Orrery:** `Vocabulario Normativo → Constitución → D-1/D-2/D-3 → decisiones posteriores aprobadas`.
- **Una implementación física que contradiga una norma no modifica silenciosamente la norma:** es un conflicto que debe registrarse.
- **Una investigación antigua reemplazada no recupera autoridad porque su solución resulte conveniente.**
- **La ausencia de implementación no autoriza al cowork a inventarla.**

Reglas de trabajo adicionales:
- Si existen varias versiones de un mismo concepto, no se mezclan ni se promedian. Se identifica la vigente y las demás se citan como historia.
- Una tecnología descartada no se conserva como conocimiento activo.

### 10.2 Procedimiento

1. **Fijar referencia física.** Registrar el commit HEAD al empezar. Toda afirmación física lleva `path:línea@commit`.
2. **Por cada pregunta P-xx**, construir una fila con:
   - **Norma:** qué dicen A1–A3 (cita).
   - **Doc histórico:** qué dicen C/D/E (cita y estado de reemplazo).
   - **Físico:** qué existe en B (cita `path:línea@commit` o "no existe", con la búsqueda que lo demuestra).
   - **Veredicto:** `coincide` / `norma sin implementación` / `implementación contradice norma` / `doc contradice físico` / `indeterminado`.
3. **Ausencia demostrada.** "No existe" requiere evidencia de búsqueda: el `grep` o `find` usado y su alcance. No basta con no haberlo visto.
4. **Conflictos.** Cada contradicción nueva se registra con ID nuevo (`EM-Cxx`), sin resolverla, con evidencia y alternativas. Los conflictos A/F ya existentes se citan por su ID.
5. **Runtime.** Si una pregunta sólo puede responderse con ejecución (por ejemplo, observar el prototipo D1), se ejecuta en el workspace del cowork, no en la máquina de José. Si hace falta el estado operativo real, se pide a José archivo y campo concretos.
6. **Simulado ≠ evidencia.** Datos de `fromSimulatedData`, `MOCK_FEED` o fixtures son evidencia de interacción, nunca de semántica ni de existencia de datos reales.
7. **Nada se escribe en el repo** sin lista exacta de archivos aprobada por José. José hace git y push. No ejecutar git en el dispositivo de José.

---

## 11. Entregables esperados del futuro cowork

Un único documento principal para revisión más anexos. Destino propuesto, a confirmar por José antes de escribir:

`docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v0_1.md`

**Contenido mínimo del Experience Model:**

1. **Secuencia de experiencia validada.** La hipótesis de §2 corregida: cada fase con término o fenómeno de A1, acto humano habilitado, invariantes que la gobiernan y estado físico.
2. **Modelo de percepción espacial (eje A).**
   - Estatus propuesto de Hover.
   - Cadena percepción → … → captura corregida.
   - Tabla de estados efímeros / Navigation State / acto deliberado / nunca en LocationSnapshot.
   - Principios de picking y desambiguación (sin gestos concretos).
3. **Modelo de experiencia de Lentes (eje B).**
   - Activación, combinación, invariancia perceptiva, Procedencia visible.
   - Límite Espacio/Superficie.
   - Criterios anti-segundo-modelo.
   - Sin nombres de Lentes.
4. **Contrato de experiencia de Gravity (eje C).**
   - Recorrido de CT-02 paso a paso.
   - Diferenciación del tri-estado más "desconocido".
   - Rol de la Masa.
   - Lo que Orrery no hace.
5. **Matriz fenómeno → término → acto.** Toda cosa perceptible propuesta con su término o fenómeno válido y el acto que habilita (la regla de §1 aplicada de forma exhaustiva).
6. **Recorrido de casos CT-01..CT-16** con veredicto por caso.
7. **Requisitos de información.** Por cada requisito:
   - qué información necesita la experiencia;
   - sistema dueño;
   - Procedencia;
   - si existe físicamente (con cita).

   **Son requisitos, no contratos.** No se diseñan schemas ni APIs.
8. **Registro de conflictos nuevos** `EM-Cxx` (norma ↔ experiencia, norma ↔ físico, doc ↔ físico).
9. **Propuestas de término nuevo**, si las hay (por ejemplo Hover), con la forma del Vocabulario, marcadas como **pendientes de decisión**.
10. **Preguntas para José**, priorizadas.
11. **Anexo de investigación externa** (§9).
12. **Anexo de contraste** (tabla de §10.2 completa).

**Fuera de alcance (explícito):**
- UI/UX v0.2;
- Interaction Grammar;
- layout de pantallas y wireframes de alta fidelidad;
- nombres de Lentes;
- schemas, contratos y APIs;
- cambios de código;
- resolución de A-x, F-x o Source Authority Profile.

Se admiten esquemas de baja fidelidad sólo si ilustran un fenómeno y llevan la respuesta a la regla de §1.

---

## 12. Criterios de éxito

El Experience Model es aceptable para revisión si:

1. **Trazabilidad total.** Cada elemento perceptible propuesto responde la regla de §1. La matriz fenómeno → término → acto no tiene huecos.
2. **Cero violaciones constitucionales.** Ningún caso CT recorrido viola C-1..C-17 ni D-1..D-3.b. Cada tensión está registrada como conflicto, no resuelta en silencio.
3. **Hover resuelto como pregunta.** Hay una posición argumentada sobre su estatus, con evidencia interna y externa, sin haberse convertido en término normativo sin decisión.
4. **Gravity desde el inicio.** CT-02..CT-05 están recorridos completos. Se distinguen ninguno / confirmado / indecidible / desconocido. Ningún paso exige que Orrery calcule, decida o invente autoridad.
5. **Lentes sin segundo modelo.** Hay criterios verificables de que ninguna Lente reordena, crea ni elimina Territorio. No se fijaron nombres.
6. **Honestidad física.** Toda afirmación física está citada con `path:línea@commit`. Toda ausencia, demostrada. Lo simulado no se usó como evidencia de existencia.
7. **CT-01 útil.** Describe con precisión qué puede percibir, comprender y hacer una persona en sus primeros minutos **con lo que existe**, y qué falta, como requisitos.
8. **Bloomaut sin reescritura.** CT-16 valida el modelo o identifica qué partes no escalan.
9. **Fuentes externas traducidas.** Cada referencia externa se tradujo a A1 y ninguna redefine Cognituum.
10. **Detención correcta.** El cowork se detuvo en cada condición de §13 en lugar de decidir por José.

---

## 13. Condiciones para detenerse y pedir decisión a José

El cowork **se detiene, documenta y pregunta** (no decide) cuando:

1. Una experiencia necesaria parece exigir **modificar o reinterpretar** un término de A1, una invariante C-x o una decisión D-x.
2. Concluye que hace falta un **término normativo nuevo** (por ejemplo Hover) o eliminar uno existente.
3. La secuencia de experiencia exige un **acto humano que no existe** física ni normativamente, o un acto existente parece ejecutable desde un lugar que podría violar C-13 o C-14.
4. Para avanzar en un caso necesitaría **resolver** un conflicto A-1..A-8 o F-1..F-7, el Source Authority Profile V1 o la identidad de Relación.
5. Necesita **nombrar Lentes** para seguir.
6. Encuentra que **Gravity no puede proveer físicamente** la información mínima del recorrido de CT-02. Debe presentarse como hallazgo con alternativas (requisito hacia Gravity, reducción del alcance de la experiencia, o diferimiento), no resolverse.
7. Necesita **leer el estado operativo** (`/home/jose/repos/elias-repos/.bloom` o `/home/jose/.local/share/BloomNucleus`). Pide archivo y campo concretos.
8. Necesita **escribir en el repo o en el Project**. Presenta la lista exacta de archivos y espera aprobación.
9. Encuentra que el escenario primario CT-01 **no es alcanzable** porque la aceptación E2E de Genesis sigue pendiente y no hay datos genuinos. Debe proponer cómo continuar sin inventarlos.
10. Detecta que el trabajo empieza a derivar hacia **UI/UX v0.2, Interaction Grammar, contratos o código**.
11. Encuentra **dos versiones vigentes contradictorias** de un mismo concepto sin criterio de autoridad que las ordene.
12. Termina el Experience Model. Entrega para revisión y **no avanza automáticamente** a la fase siguiente.

---

*Fin del encargo. Este documento no ejecuta la investigación, no escribe UI/UX v0.2, no implementa, no modifica contratos y no resuelve Gravity, Location ni Hover.*
