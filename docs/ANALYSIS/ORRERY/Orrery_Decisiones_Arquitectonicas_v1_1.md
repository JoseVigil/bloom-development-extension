# Orrery — Decisiones arquitectónicas v1.1 (D-1, D-2, D-3, D-3.b y D-4)

**Estado:** normativo. Reemplaza a `Orrery_Decisiones_Arquitectonicas_D1_D2_D3_v1_0.md`, que permanece como versión histórica. D-1, D-2, D-3 y D-3.b aprobadas por José Vigil el 2026-10-10 según las recomendaciones de este documento (A2, R-B, N-B y representación del Domain confirmado en un Mandate con Procedencia *declarada por un Mandate*); su texto no cambia en esta versión. D-4 aprobada por José Vigil el 2026-10-11.
**Fecha:** 2026-10-11 (v1.0: 2026-10-10).
**Cambios de v1.1 respecto de v1.0:** se agrega D-4 (compatibilidad con Workspace Core); se actualizan las fuentes normativas a Vocabulario v1.1, la tabla final de decisiones aprobadas y la referencia al eslabón siguiente (Experience Model v1.0). D-1, D-2, D-3 y D-3.b se conservan sin cambios de contenido.
**Autoridad:** José Vigil.
**Fuentes normativas obligatorias:** `docs/ANALYSIS/ORRERY/Orrery_Vocabulario_Normativo_v1_1.md` y `docs/ANALYSIS/ORRERY/Orrery_Constitucion_v1_0.md`. Eslabón normativo siguiente: `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v1_0.md`. Los términos con mayúscula inicial tienen el significado del vocabulario; las referencias C-n remiten a la Constitución.
**No hace:** no modifica código, schemas ni contratos; no actualiza la arquitectura UI/UX; no diseña vertical slices.

**Método.** Para cada decisión: (1) problema y alternativas presentes en el corpus, con la causa de que antes no pudiera resolverse; (2) filtro constitucional; (3) alternativas válidas; (4) recomendación con consecuencias conceptuales, de UX y físicas separadas; (5) qué decisión anterior se reemplaza, se reinterpreta o se preserva. Sólo se presentan alternativas que el corpus sostiene.

---

## D-1 — ¿Qué nombra "Orrery"?

### 1. Problema

El corpus usa "Orrery" para tres cosas distintas:

| Uso | Fuente | Qué designa |
|---|---|---|
| (a) La interfaz principal del workspace, donde el Paladín observa e interviene | `Orrery_Research_Brief_Interfaz_Principal_v0_1.md` §0–§1 ("la interfaz principal del workspace… no un dashboard más"); `Glosario_Contexto_Cognituum_para_Cowork.md` ("la interfaz visual/operativa donde el Paladín observa e interviene"); ADR ASM §6 ("Orrery inicia solicitudes y presenta estado y decisiones"); encargo de octubre ("el espacio de trabajo visual de Cognituum") | Una experiencia completa |
| (b) El navegador del territorio | `Orrery_LocationSnapshot_v0.md` (invariante "Orrery describe dónde está el usuario"); `Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md` §3 ("Orrery es, ante todo, un navegador espacial de Locations"); UI Contenedora v0.1 §0 ("ninguna decisión puede convertir a Orrery en un visor de mandatos/postulates/gravity") | El motor del dónde |
| (c) Un modo y un paquete | UI Contenedora v0.1 §2.1 ("Régimen Espacial — Orrery en pantalla completa"); `installer/conductor/workspace/core/orrery` | El régimen y el código del motor |

**Por qué no pudo resolverse antes.** Sin los términos Espacio, Lente y Superficie, el invariante escrito para (b) —que el motor no contenga lógica de Mandates ni de Gravity— se leía como si aplicara a (a), y la experiencia pedida en (a) parecía violarlo. El vocabulario v1.0 separa las piezas y C-6 fija la frontera del Espacio con independencia del nombre.

### 2. Filtro constitucional

| Alternativa | Sostén en el corpus | Resultado |
|---|---|---|
| **A1.** Orrery = el Espacio (motor) | Uso (b) y (c) | **Válida.** C-6 rige al Espacio. |
| **A2.** Orrery = la experiencia que articula Espacio + Lentes + Superficies de Workspace Core cuyo sujeto es el Territorio o algo situado en él | Uso (a) | **Válida**, siempre que C-6 se aplique a su componente Espacio y C-13 a sus Superficies. |
| **A3.** Orrery = Espacio + Lentes (la capa de percepción), con las Superficies fuera de Orrery | Septiembre: Orrery como régimen espacial con los paneles en otro régimen y overlays de capas consumidoras encima (UI Contenedora v0.1 §2.1–§2.2) | **Válida.** No viola invariantes. |
| Orrery = toda Workspace Core (incluidas Profiles, Settings, cuenta) | No hay fuente que lo sostenga | No se presenta como alternativa. |

Ninguna alternativa queda descartada por la Constitución: el problema es de alcance, no de validez.

### 3. Comparación de las alternativas válidas

| Criterio | A1 (motor) | A2 (experiencia) | A3 (percepción) |
|---|---|---|---|
| Coherencia con el propósito declarado de Orrery (uso a) | Baja: la experiencia queda sin nombre | Alta | Media: excluye "comprender y actuar", que el principio fundacional asigna a las Superficies |
| Coherencia con el principio fundacional (percibir **y** comprender/actuar sobre el Territorio) | Parcial | Completa | Parcial |
| Riesgo de que Orrery acumule lógica de Trabajo o Gravity | Bajo | Bajo: lo contiene C-6, no el nombre | Bajo |
| Necesidad de renombrar documentos previos | Media (ASM ADR, brief, encargo) | Media (Location-first v0.2, UI Contenedora v0.1) | Alta (ambos grupos) |
| Ciclo SEE → UNDERSTAND → DECIDE → EXECUTE → OBSERVE dentro de Orrery | No | Sí | Sólo SEE/OBSERVE |

### 4. Decisión: A2

**Decisión.** *Orrery* nombra la experiencia de Workspace Core que articula el Espacio, las Lentes y las Superficies de Workspace Core cuyo sujeto es el Territorio o algo situado en él. El motor se denomina **Espacio** (término normativo). Las Superficies de Workspace Core sin sujeto territorial (perfiles, configuración, cuenta) pertenecen a Workspace Core, no a Orrery.

**Consecuencia conceptual.**
- El invariante de septiembre "Orrery describe dónde, no interpreta para qué" queda distribuido así: el Espacio y la Location sólo dicen dónde (C-6, C-11); Orrery entero no interpreta propósito ni decide Atención (C-17).
- Orrery puede contener la percepción del Trabajo y de Gravity (por Lentes) y la comprensión y acción sobre ellos (por Superficies), sin que nada de eso entre al Espacio como objeto propio (C-6).
- Que una Superficie pertenezca a Orrery depende de su sujeto (Territorio o algo situado en él), no de su ubicación en pantalla.

**Consecuencia de UX.** La persona vive Orrery como un lugar de trabajo, no como un visor que se abre y se cierra para "ver en 3D". Inspección, decisión y observación ocurren dentro de Orrery.

**Consecuencia física.** Ninguna inmediata. El paquete `installer/conductor/workspace/core/orrery` implementa el Espacio; su nombre de carpeta queda como deuda terminológica, sin renombre obligatorio. Componentes futuros deben nombrarse por su término normativo (Espacio, Superficie, Lente), no "Orrery" a secas.

### 5. Efecto sobre decisiones anteriores

| Decisión anterior | Efecto |
|---|---|
| UI Contenedora v0.1 §0 "regla de frontera: ninguna decisión puede convertir a Orrery en un visor de mandatos/postulates/gravity" | **Reinterpretada**: rige al Espacio (C-6). |
| LocationFirst v0.2 §3 "Orrery es, ante todo, un navegador espacial de Locations" | **Reinterpretada**: describe al Espacio y su relación con Location. |
| Brief, Glosario, ADR ASM §6, encargo de octubre | **Preservados**. |
| Gateway UX v0.1 y UI Contenedora v0.1 §3 "entrar/salir de Orrery" | **Reinterpretados** como entrar/salir del Régimen en que el Espacio ocupa el escenario (ver D-2). |

---

## D-2 — Régimen de convivencia entre Espacio y Superficies de Workspace Core

### 1. Problema

Con D-1 = A2, las Superficies de Workspace Core con sujeto territorial son parte de Orrery. Hay que decidir cómo conviven con el Espacio en pantalla.

| Fuente | Posición |
|---|---|
| UI Contenedora v0.1 §2.1–§2.2 y v0.2 §1 | Dos regímenes exclusivos; el espacial al 100% del viewport; sólo HUD de orientación encima; contenido de capas consumidoras como overlay modal con cierre explícito; "no existe un tercer régimen híbrido". Implementado en `+layout.svelte`. |
| `Investigacion_Orrery_VisorMandatos_Postulates_GatewayUX_v0_1.md` §0 | Orrery como "sección 3D de navegación dentro del Core UI actual", sin reemplazar el shell. |
| Research Resultados §2.1, §2.3 | Separación HUD/MFD (ambiental vs. intervención); overlay lateral no destructivo (Kubernetes Lens); foco no destructivo (Datadog). |
| Paladin UX §1.4 | El panel de postulación es inline, no modal: "la conversación permanece visible detrás, porque la Postura nace de ella". |
| Borrador de investigación §7.3 | Espacio en el escenario completo con Superficies flotantes colapsables y un modo foco. |

**Por qué no pudo resolverse antes.** La exclusividad de septiembre era el mecanismo para impedir que Orrery acumulara lógica de mandatos "por presión de conveniencia de UI" (v0.1 §2.1). Sin C-6, C-7 y C-13, el layout era la única protección de esa frontera. Ahora la protección es constitucional y el layout puede decidirse por su efecto sobre la experiencia.

### 2. Filtro constitucional

| Alternativa | Sostén | Resultado |
|---|---|---|
| **R-A.** Exclusivo: Espacio a pantalla completa; Superficies sólo en otro régimen o como overlays modales | UI Contenedora v0.1/v0.2; código actual | **Válida.** |
| **R-B.** El Espacio ocupa todo el escenario de Orrery; las Superficies de Workspace Core son capas persistentes y colapsables sobre él, sin redimensionarlo; un modo foco deja sólo el HUD de orientación | Research Resultados (HUD/MFD, overlay no destructivo); Paladin UX §1.4; borrador de investigación §7.3 | **Válida**, siempre que las Superficies no inyecten objetos en el Espacio (C-6). |
| **R-C.** Disposición en paneles: el Espacio es una región del layout de Workspace Core junto a otras | VisorMandatos §0 ("sección 3D dentro del Core UI"); estructura actual `.main-container` con panel derecho | **Válida.** |

Ninguna alternativa viola la Constitución. El modo foco de R-B reproduce R-A como estado dentro del mismo régimen; no es una alternativa separada.

### 3. Comparación

| Criterio | R-A | R-B | R-C |
|---|---|---|---|
| Decidir con el Territorio a la vista (anclar mientras se compone, C-10) | No: la Superficie modal tapa el Espacio en el momento de decidir | Sí | Sí |
| Foco no destructivo (Research §2.3) | Parcial | Sí | Sí |
| Escala del Espacio | Máxima | Máxima (no se redimensiona) | Reducida y variable |
| Continuidad del Navigation State al pasar de percibir a comprender o actuar | Se interrumpe | Se conserva | Se conserva |
| Costo físico respecto del código actual | Nulo | Medio | Medio |
| Riesgo de que las Superficies se perciban como parte del motor | Bajo | Bajo con C-6 | Bajo |

### 4. Decisión: R-B, con dos regímenes

**Decisión.**

Workspace Core tiene dos Regímenes:

1. **Régimen Orrery:** el Espacio ocupa el escenario completo; las Superficies de Workspace Core de Orrery se presentan como capas persistentes y colapsables sobre el escenario, sin cambiar sus dimensiones; existe un modo foco en el que sólo queda el HUD de orientación.
2. **Régimen Panel:** las Superficies de Workspace Core sin sujeto territorial (perfiles, configuración, cuenta y otras páginas convencionales).

**Arquitectura estable (forma parte de la decisión).**

- El Espacio y las Superficies son capas distintas de la composición; ninguna Superficie se dibuja dentro del motor del Espacio, y ninguna Superficie entrega al Espacio algo que no sea Territorio o Anotación (C-6).
- Las Superficies funcionan aunque el Espacio no esté disponible (falla de render, hardware); el Espacio es representación, no condición de verdad ni de acción (C-1, C-13).
- Cambiar de Régimen conserva el Navigation State.
- Ninguna actividad del sistema cambia el Régimen ni el foco por sí sola (C-17).
- El HUD de orientación (Contexto, ubicación, retorno) existe siempre en el Régimen Orrery, también en modo foco.

**Decisiones visuales que quedan para la arquitectura UI/UX.** Posición, tamaño y orden de las Superficies; cuáles abren por defecto; comportamiento de colapso; gesto del modo foco; comportamiento en anchos reducidos; animaciones de transición; si Orrery es la pantalla inicial cuando hay Contexto confirmado.

**Consecuencia conceptual.** La frontera del Espacio deja de depender del layout y pasa a depender de la Constitución.

**Consecuencia de UX.** La persona percibe, comprende y decide sin abandonar el Territorio; quien quiera territorio puro tiene el modo foco.

**Consecuencia física.** `+layout.svelte` y `OrreryContainer.svelte` deberán pasar de alternar regímenes exclusivos a componer el escenario del Espacio con capas de Superficie. No se escribe ahora.

### 5. Efecto sobre decisiones anteriores

| Decisión anterior | Efecto |
|---|---|
| UI Contenedora v0.2 §1 (100% viewport; "nunca un layout compartido con paneles del régimen Panel") | **Reemplazada** en su segunda parte; **preservada** en que el Espacio ocupa el escenario completo. |
| UI Contenedora v0.1 §2.1 ("no existe un tercer régimen híbrido") | **Reemplazada**: el Régimen Orrery es la convivencia; el Régimen Panel queda para lo no territorial. |
| UI Contenedora v0.1 §2.2 (contenido de capas consumidoras sólo como overlay modal) | **Reemplazada**: las Superficies son persistentes y colapsables. |
| UI Contenedora v0.1 §2.2 (HUD de orientación superpuesto) | **Preservada**. |
| UI Contenedora v0.1 §2.3 (qué persiste al cruzar regímenes; el WebSocket no se pausa) | **Preservada**, reformulada como conservación del Navigation State. |
| Spec Core-Orrery §1.4 (contenedor hermano al 100%) | **Reinterpretada**: el contenedor del Espacio es el escenario del Régimen Orrery. |

---

## D-3 — Modelo de navegación del Espacio y relación con Location

### 1. Problema

| Fuente | Posición |
|---|---|
| UI Contenedora v0.2 §2.2 | "El árbol de objetos jerárquicos que Orrery renderiza es una proyección 1:1 … de la LocationSnapshot recibida." |
| Spec Core-Orrery §2.1 e implementación | `OrreryTree` es el espejo de LocationSnapshot y es la fuente de la escena; hoy se alimenta con datos simulados. |
| Ledger Panel v0.1 §3.1 | La navegación es una "cadena de Locations visitadas". |
| Agenda 23-09 | Navigation State mutable y de sesión; LocationSnapshot captura verificable; Context, Focus y Anchors independientes. |
| LocationSnapshot v0.1 §F | La Location nace cuando la persona abre un Project y señala anchors; la captura es un acto con fases. |

**Por qué no pudo resolverse antes.** La regla 1:1 se formuló antes de distinguir Navigation State de LocationSnapshot. Exigía tener una Location para poder navegar, y llevaba a capturar en cada paso de navegación.

### 2. Filtro constitucional

| Alternativa | Resultado |
|---|---|
| **N-A.** Regla 1:1 literal: la escena es una LocationSnapshot recibida y cada cambio de foco produce otra | **Descartada.** Viola C-9 (navegar no captura; ninguna Location es requisito para navegar) y C-10 (el foco se capturaría). |
| **N-B.** El Espacio representa un modelo navegable del Territorio, obtenido de sus Fuentes y acotado por el Contexto confirmado; el Navigation State gobierna la navegación; la LocationSnapshot sólo nace de una Captura explícita | **Válida.** Conserva la intención de la regla 1:1 (no crear una jerarquía paralela) mediante C-3. |

El corpus no sostiene una tercera alternativa de modelo. La estrategia de carga del Territorio (todo el Contexto de una vez, o expansión progresiva alrededor del foco) es una variante física de N-B, no un modelo distinto, y queda para la arquitectura.

### 3. Decisión: N-B

**Modelo.**

1. **Lo que el Espacio representa.** Un modelo navegable del Territorio dentro del Contexto confirmado: sólo Entidades y Relaciones con su Procedencia (C-3, C-4). Lo no verificado se representa con su Procedencia, nunca como verificado (C-2). Trabajo y Gravity llegan sólo como Anotaciones (C-6).
2. **Navigation State.** Contiene Contexto (de su Fuente), Foco (cambia libremente), Anchors (conjunto que sólo cambia por acto deliberado) y la historia de focos de la sesión. La historia de focos no es una sucesión de Locations.
3. **Anclar.** Acto explícito sobre una Entidad admisible. Un Anchor permanece hasta que la persona lo quita. Enfocar o visitar nunca ancla (C-10).
4. **Capturar.** Acto explícito que toma Contexto + Anchors + evidencia estructural (ancestros comprobados, Relaciones, vecinos de un grado) y produce una LocationSnapshot. No incluye el Foco ni la declaración de lo que se quiere hacer (C-11). Cambiar los Anchors después produce otra captura.
5. **Representar una Location ya capturada.** La reapertura de una Location no reemplaza el Territorio: su contenido, comparado con el Territorio actual, se presenta mediante Proyección, Lente y Anotación, con el estado de resolución de cada referencia (C-8, C-11).
6. **Sin Contexto confirmado** no hay Territorio verificado, ni anclaje, ni Captura (C-12).

**Decisión D-3.b.** Un Domain cuya identidad fue confirmada por la persona dentro de un Mandate (`nucleus mandate build domains confirm`) y declarada en su contrato firmado, pero que todavía no existe en la fuente canónica de Domains, ¿se representa en el Territorio navegable?
- **Decisión:** sí, como Entidad con Procedencia *declarada por un Mandate*, nunca como canónica (C-2), y no anclable en una LocationSnapshot v0.1 hasta que el schema lo admita (se informa `unsupported`).
- **Fundamento:** la Fuente es un registro existente (el contrato firmado y el acto humano de confirmación), así que Orrery no crea Territorio (C-3). Gene v3.0 §2.6 define el Domain como identidad durable cuyo Mandate de origen aporta procedencia. Por eso el Domain no es Trabajo; el Mandate sólo se sitúa sobre él (C-4).
- **Alternativa:** representarlo sólo como Anotación de Trabajo sobre el Project hasta que exista la fuente canónica. Es válida, pero deja vacío el Territorio de un proyecto recién genesisado.

**Consecuencia conceptual.** Navegar, anclar y capturar son tres operaciones distintas. Location deja de ser la fuente de la escena y pasa a ser una evidencia que se produce y se reabre.

**Consecuencia de UX.** La persona puede explorar libremente sin generar registros. Anclar es un gesto visible y reversible antes de capturar. Una Location reabierta se ve sobre el Territorio actual, mostrando qué cambió. El foco inicial, la escala semántica y los gestos quedan para la arquitectura UI/UX.

**Consecuencia física.**
- `OrreryTree`/`locationTree.ts` deja de ser la fuente de la escena; se conserva como forma cliente de la captura y de la reapertura.
- Hace falta un modelo de lectura del Territorio distinto de LocationSnapshot.
- `regimeStore` debe separar Foco y Anchors (F-7).
- El productor de Location (A1) se invoca sólo desde la Captura.

Nada de esto se escribe ahora.

### 4. Efecto sobre decisiones anteriores

| Decisión anterior | Efecto |
|---|---|
| UI Contenedora v0.2 §2.2, regla 1:1 | **Reemplazada** en su literalidad (C-9); su intención —un solo árbol, sin jerarquía paralela ni re-anidado— queda **preservada** por C-3. |
| Spec Core-Orrery §2.1 (`OrreryTree` como fuente de la escena) | **Reinterpretada**: forma de la captura, no de la escena. |
| Spec Core-Orrery §1.6 (Entrada B degrada a A si no hay evidencia de binding, sin fabricar una Location) | **Preservada** (C-12). |
| UI Contenedora v0.1 §3.3 (foco inicial determinístico) | **Preservada** como UX; "anchor raíz" se lee como foco inicial (D-T3). |
| Gateway UX v0.1 §5.2 (restituir `origin_anchor_ref` al salir) | **Reinterpretada**: es el foco de origen, no un Anchor. |
| Ledger Panel v0.1 §3.1 ("cadena de Locations visitadas") | **Reemplazada**: el rastro de navegación es historia de focos del Navigation State. |
| LocationSnapshot v0.1 (contrato de captura) | **Preservado**, salvo los conflictos ya registrados (F-1). |

---

## D-4 — Compatibilidad con Workspace Core

**Aprobada por José Vigil el 2026-10-11.** Formaliza el contrato de compatibilidad registrado por José en `ANALYSIS/ORRERY/EXPERIENCE/Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` §4 (Project BTIPS).

### 1. Problema

Workspace Core ya integra el paquete del Espacio (`installer/conductor/workspace/core/orrery`, commit `126ebb7`) mediante una interfaz técnica concreta. Esa integración transporta estructuras nacidas antes de la norma (`OrreryTree`, `locationTree.ts`, datos simulados) que no corresponden al modelo de Orrery fijado por el Vocabulario, la Constitución, D-3 y el Experience Model. Sin una decisión explícita caben dos errores opuestos: romper la integración existente para adoptar el modelo nuevo, o consolidar la estructura heredada como si fuera el modelo.

### 2. Filtro constitucional

- C-1, C-2 y C-6: lo simulado no puede presentarse como Territorio ni como Fuente.
- C-9 y C-10: `anchors[0]` y el "último visitado" no pueden funcionar como Foco ni como Anchor del modelo.
- C-3: el árbol de compatibilidad no puede ser la estructura canónica del Territorio.
- D-3: el modelo navegable del Territorio y el Navigation State son distintos de la forma de captura.

### 3. Decisión

**Interfaz técnica transitoria que se conserva.**

| Elemento | Alcance |
|---|---|
| Alias `$orrery` | Resolución del paquete desde la webview (`webview/app/svelte.config.js`). |
| `mountOrreryScene(container, tree, resolveDisplay?, positionHints?)` | Monta una única escena en el elemento recibido y devuelve un `OrreryHandle`. Se conserva la firma vigente completa, incluidos los parámetros opcionales. |
| `OrreryHandle.update(tree, resolveDisplay?, positionHints?)` | Actualiza la instancia existente; nunca monta una segunda escena. |
| `OrreryHandle.destroy()` | Libera la escena y sus recursos. |
| Funcionamiento embebido | Sin servidor propio; corre dentro de Workspace Core. |
| Viewport | El Espacio es dueño únicamente del viewport que recibe. |
| Límites de control | El Espacio no controla la navegación de Core, las tabs, Onboarding ni Genesis. |

**Reservas semánticas.** `OrreryTree`, `locationTree.ts`, `anchors[0]`, `ancestors`, `simulated`, `fromSimulatedData()` y el resolver de presentación simulado por defecto son **legado y compatibilidad**, no el modelo de Orrery:

1. No se amplía su uso.
2. El código nuevo de Workspace Core no depende de ellos como Foco inicial, estructura canónica del Territorio, modelo de Procedencia ni Fuente productiva.
3. Que un parámetro de la interfaz tenga hoy el tipo `OrreryTree` no convierte a ese tipo en modelo: es la carga de compatibilidad que la interfaz transporta mientras exista.

**Dirección.** Workspace Core → adaptador de compatibilidad → nuevo modelo de Orrery/Espacio, con Territorio, Espacio, Navigation State, Foco, Anchor y LocationSnapshot separados según el Experience Model v1.0 y D-3. Esta decisión **no diseña el adaptador**.

**Problemas de integración de Workspace Core.** `DevIntentView.svelte` y el reconocimiento de tipos de `$orrery` en TypeScript son problemas de Workspace Core. El paquete del Espacio no se modifica para compensarlos.

### 4. Consecuencias

**Conceptual.** Se separan la interfaz técnica (estable mientras dure la transición) y el modelo (normativo). La compatibilidad no otorga autoridad semántica a la estructura heredada.

**De UX.** Ninguna directa. La arquitectura UI/UX no puede tomar `OrreryTree`, `anchors[0]` ni los datos simulados como base de decisiones de experiencia.

**Física.** Ninguna inmediata. El frente de código de Orrery sigue congelado hasta nueva decisión. El diseño del adaptador queda como trabajo derivado no autorizado.

### 5. Efecto sobre decisiones anteriores

| Decisión o documento | Efecto |
|---|---|
| D-2, consecuencia física (componer Espacio y Superficies) | **Preservada.** Se hará detrás de la interfaz conservada. |
| D-3, consecuencia física (separar representación del Territorio y forma de captura) | **Preservada y ordenada:** ocurre del lado del modelo nuevo, alcanzado mediante el adaptador. |
| "Consecuencias derivadas → Prototipo Orrery" de este documento | **Preservadas**, subordinadas a D-4: no autorizan cambios en el paquete mientras siga congelado. |
| Spec y Cierre de Integración Formal Core–Orrery v1.0 (Project) | **Preservados** como descripción de la interfaz técnica; **reinterpretados** en lo semántico: `OrreryTree` es compatibilidad, no modelo. |

---

## Consecuencias derivadas

Trabajos que quedan determinados por D-1, D-2, D-3 y D-4. Ninguno queda autorizado por este documento. Los trabajos sobre el paquete del Espacio quedan además sujetos al congelamiento vigente (D-4).

### Arquitectura UI/UX v0.2

- Releer el borrador v0.1 con el vocabulario v1.0, la Constitución y estas decisiones (A-8). Cambiar los nombres de lentes para que no coincidan con nombres de información; "Atención" deja de ser lente o región derivada y se alimenta de señales clasificadas.
- Definir el Régimen Orrery y el Régimen Panel (D-2), y qué Superficies de Workspace Core pertenecen a Orrery según su sujeto (D-1).
- Especificar las operaciones navegar, anclar, capturar y reabrir (D-3) con sus gestos, el foco inicial y la escala semántica.
- Resolver las decisiones visuales dejadas abiertas en D-2.

### LocationSnapshot

- Revisar el schema antes de materializarlo: sacar NUCLEUS, MANDATE y SESSION de anchors, ancestros y vecinos (F-1); decidir si una Entidad con Procedencia *declarada por un Mandate* es admisible (según D-3.b, hoy no anclable en v0.1); reconciliar el "foco principal" de ASM como Anchor principal (A-1).
- El productor (A1) se invoca sólo desde la Captura; la reapertura (A4) se expresa como Proyección y Anotación sobre el Territorio actual.

### Gravity/Genes

- Consulta al dueño de Gravity y Genes sobre F-2 (`DOMAIN_MANDATE` como proyección de situación, no como Relación del Territorio), F-3 (anidamiento de DOMAIN/GENE bajo MANDATE sólo como procedencia) y F-4 (`GeneRef`).
- Pedido de lectura de Domains y Genes (y de Domains confirmados en Mandates, si se aprueba D-3.b) para alimentar el modelo navegable del Territorio.
- Lectura de Gravity situable sobre nodos de spine y de sus efectos sobre el Trabajo situado en Entidades (C-15).

### Ledger/Navigation State

- Reescribir el documento de Ledger Panel: el Ledger es Fuente o Proyección de eventos explicada por una Superficie de Workspace Core; el rastro de navegación pertenece al Navigation State (A-7).
- Definir el Navigation State (Contexto, Foco, Anchors, historia de focos) y qué conserva al cambiar de Régimen.

### Prototipo Orrery

- Separar en el paquete del Espacio la representación del Territorio de la forma de captura (`OrreryTree`).
- Retirar del Espacio los objetos de Trabajo y Gravity como ítems propios y el panel de simulación (C-6, F-5); marcar como simulado todo dato visual (C-2).
- Separar Foco y Anchors en `regimeStore` (F-7).
- Corregir el error de tipos de `Position3` que impide `tsc --noEmit`.

### Primer vertical slice

- Queda determinado su marco: Régimen Orrery con Espacio sobre el modelo navegable del Territorio del Contexto confirmado; Superficies de Workspace Core persistentes; Trabajo percibido por Anotaciones; anclar y capturar como operaciones explícitas, aun si la Captura sólo puede producirse como borrador local mientras no exista el productor de Location.
- Su alcance concreto, archivos y criterios de aceptación se definen después de la arquitectura UI/UX v0.2.

---

## Decisiones aprobadas

| ID | Decisión | Resolución aprobada |
|---|---|---|
| D-1 | Qué nombra Orrery | A2: la experiencia que articula Espacio, Lentes y Superficies de Workspace Core con sujeto territorial |
| D-2 | Régimen de convivencia | R-B: Régimen Orrery (Espacio en el escenario completo con Superficies persistentes y colapsables, y modo foco) + Régimen Panel para lo no territorial |
| D-3 | Modelo de navegación y relación con Location | N-B: el Espacio representa un modelo navegable del Territorio; Navigation State gobierna; la LocationSnapshot sólo nace de la Captura |
| D-3.b | Domain confirmado en un Mandate y aún no canónico | Representarlo como Entidad con Procedencia *declarada por un Mandate*, no anclable en v0.1 |
| D-4 | Compatibilidad con Workspace Core | Conservar la interfaz técnica vigente (`$orrery`, `mountOrreryScene`, `update`, `destroy`, embebido, viewport recibido, sin control de Core) como transición; `OrreryTree`, `locationTree.ts`, `anchors[0]`, `ancestors`, `simulated` y `fromSimulatedData()` son legado, no modelo; dirección Core → adaptador → nuevo modelo, sin diseñar el adaptador |
