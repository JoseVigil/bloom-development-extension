# Orrery — Presupuesto de canales y reserva de interacción v0.1

| Campo | Valor |
|---|---|
| Documento | `docs/ANALYSIS/ORRERY/VISUAL/Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` (copia en Project BTIPS: `ANALYSIS/ORRERY/VISUAL/Orrery_Channel_Budget_Interaction_Reservation_v0_1.md`) |
| Escena de verificación | `docs/ANALYSIS/ORRERY/VISUAL/escena_gris/index.html` (copia en el Project en la misma ruta relativa) |
| Tipo | **Research vigente, no normativo.** Subordinado a Vocabulario v1.1, Constitución v1.1, Decisiones v1.1 y Experience Model v1.0. No es Visual Architecture, ni Interaction Grammar, ni design system |
| Estado | Borrador para revisión de José |
| Fecha | 2026-10-13 |
| Encargo | "ENCARGO — ORRERY CHANNEL BUDGET & INTERACTION RESERVATION v0.1" (José, 2026-10-13) |
| Antecedente | `Orrery_Morphological_Spatial_Language_Research_v0_1.md` (research vigente, aprobado por José el 2026-10-13) |
| Referencia física | `main` @ `8b8101a`; documentos normativos leídos del árbol de trabajo |
| Autoridad de diseño | José Vigil (única) |
| No hace | No asigna formas ni colores a Entidades, Relaciones, Lentes ni Anotaciones. No diseña el dispositivo N:M. No define Interaction Grammar. No mide rendimiento. No modifica código, contratos ni documentos normativos |

### Decisiones de José que rigen este trabajo

| ID | Decisión | Efecto en este documento |
|---|---|---|
| **DJ-CR1** | La contención del Espacio se limita a árboles con Fuente (Tenant › Organization › Project, y pertenencia de Domains y Genes al Project). Domain↔Gene (N:M) no se expresa como contención: requiere otro dispositivo. | §9 (requisito); escena T3 |
| **DJ-CR2** | "Dos Lentes no comparten el mismo canal de codificación" (EM §5.4.2) se lee como distinto *tipo* de canal; hace falta un tope explícito de Lentes simultáneas. | §8 |
| **DJ-CR3** | Las animaciones ambientales del onboarding no se trasladan a Orrery: el movimiento en reposo no está disponible. | §5 |
| **DJ-CR4** | Orrery opera con la paleta actual, sin extensión. | §5 |
| **DP-a** | No se versiona el EM. Se registra como nota que el ejemplo del EM §4.3.1, el de CT-06 y la frase "Gene ⊂ Domain ⊂ Project" quedan inaplicables, como pendiente para la próxima versión del EM. | §13, X-1 |
| **DP-b** | El tope se aplica a las Lentes **visibles simultáneamente en el Espacio**, no a las activas. Las que exceden siguen activas y pasan a indicación o Superficie, con aviso en la capa O. Evaluar frente a rechazar la activación y recomendar una, como hipótesis. | §8.4 |
| **DP-c** | El acento de la paleta no se usa para interacción. | §6 |
| **DP-d** | Si el presupuesto da 1 o 2 Lentes, se reporta tal cual, con una sensibilidad de cuánto cambiaría el tope si se liberara el tono, sin asignar colores. | §8.3 |
| **DP-e** | En la escena, el Gene aparece contenido sólo en su Project, sin Domain padre. La pertenencia N:M se muestra en la lista de Superficie. La conexión neutra "marca de prueba" va como interruptor apagado por defecto. | §12; escena T3 |
| **DP-f** | La escena vive en `docs/…/escena_gris/` y no toca `installer/` ni contratos. **Exigencia:** debe demostrar que todos los estados del inventario se distinguen sin color usando sólo los tipos de canal asignados; si alguno no se distingue, se reporta como falla. | §12 |

> **Marcas de evidencia** (como en el research anterior):
> - **[NORMA]** se apoya en un documento normativo, citado como `Vocab §x`, `C-n`, `D-n` o `EM §x`.
> - **[RES]** se apoya en el research morfológico v0.1 (`R§x`, principios G-n, invariantes DV-n, condiciones T-n, criterios K-n).
> - **[ESC]** se observó en la escena gris, bajo la configuración indicada.
> - **[LIT]** literatura verificada (ver el Anexo A del research).
> - **[HIP]** hipótesis de este documento.
>
> **Regla de lectura.** Las siluetas, texturas y adjuntos que usa la escena son **marcas de prueba arbitrarias**. Sólo materializan un *tipo* de canal para comprobar que se distingue. No son propuesta de forma.

---

## 1. Resumen ejecutivo

1. **El presupuesto da un tope de 2 Lentes visibles a la vez en el Espacio: una robusta y otra marginal.** Es una hipótesis a validar con personas.
   - **Lente A, robusta:** se identifica por **ranura de adherencia** (posición fija relativa a la marca de la Entidad), la variante del canal de identidad más fuerte, la región espacial.
   - **Lente B, marginal:** se identifica por **orientación**. El giro se detecta de un vistazo, pero tiene pocos valores y es poco efectivo.
   - **Por qué no hay más:** después de reservar la interacción, no queda ningún otro tipo de canal de identidad libre:
     - la silueta ya codifica el tipo de Entidad;
     - la textura, la Procedencia;
     - la luminancia, la interacción y la atenuación;
     - el tono está acotado por DJ-CR4 y DP-c;
     - el movimiento en reposo está excluido (DJ-CR3);
     - el tamaño no es confiable en perspectiva.

   Se reporta tal cual (DP-d).

2. **Sensibilidad (§8.3).** Si se liberara el tono para identificar Lentes, el tope pasaría a 3, con dos robustas. Si además se admitiera usar la forma en las marcas adjuntas (relajar G-1 por clase de marca), pasaría a 4. Ninguna de las dos se propone.

3. **Reserva de interacción (§6).** Indicación, Foco y Anchor ocupan tipos de canal que **ninguna Lente ni la Procedencia usa**: el contorno exterior de la marca (corchetes, anillo grueso y doble anillo), el encuadre de cámara, la guía vertical local y una firma temporal propia (efímera, de sesión y persistente). Los cambios que llegan de una Fuente nunca tocan esos canales y no se animan. El acento de la paleta no se usa (DP-c).

4. **Exceso de Lentes (§8.4).** Se recomienda, como hipótesis, **la opción de José**:
   - la Lente que excede el tope sigue activa y no se dibuja en el Espacio;
   - la capa O la lista como "activa · no visible (tope)", un estado distinto de "activa sin datos";
   - la indicación muestra su estado para la Entidad indicada, como pide EM §4.4;
   - la Superficie muestra todas sus filas;
   - qué Lentes son visibles lo decide la persona; por defecto, el orden fijo por clase de Proyección (EM §5.4.3).

   Rechazar la activación es más simple, pero niega un acto de la persona y deja fuera del alcance la información que ella pidió.

5. **N:M (§9).** El dispositivo de pertenencia múltiple tiene que poder afirmar "este Gene pertenece a estos Domains" con la Procedencia de la Relación. **No** puede afirmar contención, exclusividad, orden ni jerarquía, ni producir pertenencia por cercanía. En la escena (T3), el Gene está contenido sólo en su Project y la pertenencia vive en la Superficie. La conexión de prueba **chocó con los bordes de región** cuando éstos se dibujaban como línea (falla F-6). Eso fija un requisito: **ningún borde de región puede dibujarse con la misma marca que una conexión.**

6. ***Desconocido* frente a *ninguno* (§10).** Funciona en tres niveles:
   - **Modo a (Lente mayormente cubierta):** se marca *desconocido* y la ausencia vale *ninguno*.
   - **Modo b (Lente mayormente no cubierta):** hay una declaración global en la capa O; la ausencia vale *desconocido* y se marca explícitamente "evaluado, sin filas".
   - **Agregados:** toman el peor caso (DV-2).

   En el territorio T4 (Gravity entera en *desconocido*), **el Espacio solo no distingue "nada evaluado" de "todo evaluado sin colisiones"**: la diferencia la lleva únicamente la declaración de la capa O. Cumple el EM §5.6, que admite la declaración global, pero se registra como límite (§12.4).

7. **Escena gris, K-5 (sin color):** cumple en todas las capturas, con **croma máximo 0** en todos los píxeles una vez neutralizados los controles nativos del navegador.

8. **Escena gris, K-3 (densidad):** cumple con condiciones. En N2 y en vista general, los canales de cada Entidad (textura, adjuntos) quedan por debajo del umbral de lectura, y sólo se leen la silueta y la presencia; se recuperan al acercar la cámara. En N3, la agregación por Project y tipo es legible si el recuento se da **por Project** en la escala lejana y **por tipo** al acercarse; un recuento por tipo en la escala lejana satura el texto.

9. **Escena gris, K-2 (aplanamiento):** en las cuatro configuraciones, **el equivalente plano transmite lo mismo y es igual o más legible.** La profundidad no aporta información en esta escena. El presupuesto no depende de la tercera dimensión, lo que es coherente con EM §4.7.

10. **Escena gris, K-14 y K-20:** cumplen, con los límites de §12.4.

11. **Fallas registradas (DP-f).** Siete: F-1 a F-7. Cuatro se corrigieron en la escena y quedan como requisito (F-4 a F-7). Tres son límites del presupuesto que la Visual Architecture deberá resolver:
    - **F-1:** a tamaño N2, Foco y Foco + Anchor se confunden.
    - **F-2:** a tamaño N2, las texturas de Procedencia T2, T3 y T4 se confunden.
    - **F-3:** a tamaño N2, el estado de una Lente agregado a la marca necesita una lectura serial (no se detecta de un vistazo).

12. **Contradicciones (§13).** Dos requieren decisión de José:
    - **X-3:** el EM §5.6 pide marca de Procedencia por Anotación en el Espacio, y el presupuesto sólo alcanza para distinguir Fuente débil de no débil; las cinco clases quedan en la indicación y la Superficie.
    - **X-6:** el estado detallado del Trabajo situado (EM §5.2, Lente P-W1) queda en la indicación y la Superficie; el Espacio muestra sólo su presencia.

---

## 2. Corpus leído

| Documento | Capa | Lectura |
|---|---|---|
| `Orrery_Estado_Base_v1_0.md` | Índice | Completa |
| `Orrery_Vocabulario_Normativo_v1_1.md` | Norma | Completa |
| `Orrery_Constitucion_v1_1.md` | Norma | Completa |
| `Orrery_Decisiones_Arquitectonicas_v1_1.md` | Norma | Completa |
| `EXPERIENCE/Orrery_Experience_Model_v1_0.md` | Norma | Completa |
| `EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Evidencia aplicada | Completa |
| `VISUAL/Orrery_Morphological_Spatial_Language_Research_v0_1.md` | Research vigente | Completa (es de este mismo frente) |
| `docs/PALETTE/# 🎨 Bloom Color Palette.md` | Restricción | Completa |

**Cómo se leyó.** Los ocho se leyeron completos en esta misma sesión de trabajo (entre el 2026-10-11 y el 2026-10-13). Antes de redactar, el 2026-10-13, se verificó que ninguno cambió desde esa lectura (fecha de modificación y tamaño idénticos), así que no se releyeron. No se consultaron las imágenes de referencia.

---

## 3. Método

1. **Demanda.** Inventario de todo lo que la norma exige distinguir (§4).
2. **Oferta.** Catálogo de los tipos de canal disponibles, con las restricciones de DJ-CR3, DJ-CR4 y DP-c, y su confiabilidad según la cámara (§5).
3. **Reserva.** Primero se reservan los canales de interacción (§6).
4. **Ubicación.** Cada dimensión se ubica según T-1..T-7 y EM §4.4/§4.7: siempre en el Espacio, sólo en la indicación, sólo en la Superficie, o en la capa O (§7.1).
5. **Asignación.** Matriz de dimensión por tipo de canal, comprobando que ningún canal tenga dos significados (G-1) (§7.2).
6. **Tope de Lentes.** Se deriva de los tipos de canal que quedan libres, con su sensibilidad (§8).
7. **Requisitos** de N:M y de *desconocido* frente a *ninguno* (§9, §10).
8. **Cámara.** Opciones y consecuencias (§11).
9. **Verificación** en la escena gris sobre los cuatro territorios, con capturas automáticas en Chromium sin interfaz gráfica (PlayCanvas 2.22.1, el mismo build del CDN servido localmente) y una medición del croma por píxel para K-5 (§12).

**Definición de trabajo.** Un *tipo de canal* es una variable visual (posición o región, forma, textura, orientación, luminancia, tono, movimiento, tamaño, conexión, texto) aplicada a una clase de marca. Siguiendo G-1, cada tipo de canal tiene **un único significado en toda la vista**, sea cual sea la marca sobre la que se aplique. Ésta es la lectura conservadora; relajarla se trata como sensibilidad (§8.3).

---

## 4. Inventario de dimensiones (§4.1 del encargo)

"Sin color" indica si la norma exige que la dimensión sea perceptible sin depender del color. El EM §4.6.4 lo exige para **todo estado** ("Ningún estado se codifica sólo con color"); C-8 lo exige para el significado de las Anotaciones.

| ID | Dimensión | Valores | Fuente normativa | Sin color |
|---|---|---|---|---|
| **D-1** | Tipo de Entidad | 6: Tenant, Organization, Project, Repository, Domain, Gene | Vocab §2.3; EM §4.4 | Sí |
| **D-2** | Procedencia de la Entidad | 5 (verificado, declarado por un Mandate, propuesto, proyección, no verificable) + simulado | Vocab §3.5; C-2; EM M9, §5.6 | Sí |
| **D-3** | Clase de Fuente | 7 (autoridad canónica, registro, copia, proyección, índice, cache, dato visual); en el Espacio, al menos débil frente a no débil | Vocab §2.5; EM §5.6, CT-12 | Sí |
| **D-4** | Estado interactivo | 4 + combinación: reposo, indicación, Foco, Anchor, Foco + Anchor | EM §4.1, §4.5, §4.6.3; C-10 | Sí |
| **D-5** | Conjunto de candidatos de desambiguación | 1 activo entre n | EM §4.3.2, M11 | Sí |
| **D-6** | Identidad de Lente | Hasta 8 Proyecciones (P-W1, P-W2, P-W3, P-G1, P-G2, P-A1, P-L1, P-I1) | EM §5.2, §5.4.2 | Sí |
| **D-7** | Cobertura por Lente y por Entidad | 3: con filas, ninguno, desconocido | DJ-7; EM §5.6 | Sí |
| **D-8** | Estado de colisión | 4: ninguno, confirmada, indecidible, desconocido | C-16; EM §6.3 ("sin depender del color") | Sí (explícito) |
| **D-9** | Resolución de Location reabierta | 8: resolved, changed, stale, missing, unauthorized, ambiguous, unsupported, unverifiable | EM §7.5, M23 | Sí |
| **D-10** | `missing` alojado en un ancestro | Identidad y Procedencia de la referencia, distintas de las del ancestro | DJ-9 | Sí |
| **D-11** | Atención | Presente o ausente (con recuento) | Vocab §3.7; C-17; EM §7.4, M6, M22 | Sí |
| **D-12** | Contexto | 6 estados del contrato (verified, incomplete, stale, revoked, conflict, not_evaluable); en la experiencia, confirmado frente a no confirmado | Vocab §2.9; C-12; EM §3.5, §8.1, M30 | Sí |
| **D-13** | Relación frente a Anotación entre Entidades frente a guía | 3 | Vocab §2.4; EM §5.8 (L4, L5) | Sí |
| **D-14** | Pertenencia en árbol frente a pertenencia N:M | 2 dispositivos | DJ-CR1; Vocab §2.4 | Sí |
| **D-15** | Agregado frente a Entidad individual (con recuento, cobertura, Atención y Procedencia más débil) | 2, más los atributos | EM §5.4.4, M21; DV-1..DV-6 | Sí |
| **D-16** | Anclabilidad (admisible frente a no admisible, p. ej. D-3.b `unsupported`) | 2 | D-3.b; EM CT-09 | Sí |
| **D-17** | Atenuación declarada (estado de vista) | 2 | EM §5.4.5 | Sí |
| **D-18** | Estado de cada Lente en el inventario | 4: inactiva, activa visible, activa sin datos, activa no visible por tope | EM §5.3.2; DP-b | Sí |
| **D-19** | Estado detallado de una fila de Trabajo situado (fases, etapas) | Abierto, según la Fuente | EM §7.3; Escenarios R-2 | Sí |
| **D-20** | Régimen y modo foco | 2 + 1 | D-2 | Sí |

---
## 5. Oferta: tipos de canal disponibles

| ID | Tipo de canal (clase de marca) | Efectividad como identidad o magnitud | Confiable con cualquier cámara | Disponible | Motivo |
|---|---|---|---|---|---|
| **C1** | Contención: región de área con escalón de luminancia | La región espacial es el canal de identidad más efectivo (L-4 [LIT]) | No, si la cámara llega a ver las regiones de canto (§11) | Sí | Aporte propio del Espacio (EM §4.7); sólo para árboles (DJ-CR1) |
| **C2** | Silueta de la marca de la Entidad, orientada a la cámara | Forma: el canal de identidad menos efectivo (L-4) | Sí, si la marca mira a la cámara | Sí | — |
| **C3** | Textura de relleno de la marca de la Entidad | Textura (Bertin, L-1); de pocos valores, se degrada con el tamaño | Sí (orientada a la cámara) | Sí | — |
| **C4** | Contorno exterior de la marca: corchetes, anillo grueso, doble anillo | Forma del contorno; detectable de un vistazo si es el único que cambia | Sí | **Reservado** | Interacción (§6) |
| **C5** | Encuadre y transición de cámara | Movimiento con causa, G-b (L-13 [LIT]) | — | **Reservado** | Foco (Vocab §2.10) |
| **C6** | Firma temporal (efímera, de sesión, persistente) | — | — | **Reservado** | Interacción |
| **C7** | Ranura de adherencia: posición fija relativa a la marca, calculada en el espacio de la pantalla | Región espacial (la variante más fuerte) | Sí (calculada en el espacio de la pantalla) | Sí | — |
| **C8** | Orientación (giro) de la marca adjunta | El giro se detecta de un vistazo (L-4), pero tiene pocos valores | Sí (orientada a la cámara) | Sí | — |
| **C9** | Nivel de relleno de la marca adjunta (lleno, medio, hueco, barra interior) | Pocos valores | Sí | Sí | — |
| **C10** | Discontinuidad del trazo | Pocos valores; lejos se ve continuo (R§6.2 P6 [RES]) | Parcial | Sí | Una sola semántica: "no afirmado por una autoridad" |
| **C11** | Luminancia baja | Magnitud | Sí | Sí, con un único significado | Atenuación declarada |
| **C12** | Texto | Preciso; no se detecta de un vistazo | Sí (en el espacio de la pantalla) | Sí | Nombres, recuentos, capa O |
| **C13** | Conexión (línea) | La conexión agrupa con fuerza [LIT, registro secundario] | Parcial (cruces en 3D) | Sí | Relación y Anotación entre Entidades |
| — | Tono (acento, error) | Segundo canal de identidad (L-4); más capacidad que el movimiento (L-11) | — | **No** | DJ-CR4 + DP-c: dos valores con significado ya fijado (estado activo del sistema, error) |
| — | Movimiento en reposo | Tercer canal de identidad (L-4) | — | **No** | DJ-CR3; compite con la lectura (L-12) |
| — | Tamaño como categoría | Magnitud; se confunde con la profundidad en perspectiva | No | **No** | Reservado a la extensión estructural de C1 (EM §4.7); la Masa nunca (EM §6.8) |
| — | Profundidad como categoría | Magnitud débil (L-4) | No | **No** | EM §4.7: ningún fenómeno sólo en 3D |

---

## 6. Reserva de canales de interacción (§4.3 del encargo)

Se reserva **antes** de cualquier otra asignación. La semántica indicación → Foco → Anchor del Experience Model **no se modifica**.

| Estado | Canales reservados | Firma temporal | Distinción frente a un cambio de la Fuente | Pequeña, superpuesta u ocluida | Alta densidad |
|---|---|---|---|---|---|
| **Indicación** (fenómeno, DJ-5) | C4: corchetes de esquina alrededor de la marca. Guía vertical local hacia el plano de referencia. Etiqueta mínima en pantalla (C12) con nombre, tipo, Procedencia y estado de las Lentes no visibles (EM §4.4) | **Efímera**: aparece y desaparece con el puntero o el cursor de teclado, sin transición | Ningún cambio de la Fuente toca C4 ni produce guías | La etiqueta va en el espacio de la pantalla y se ve aunque la marca esté ocluida. Recorrido de candidatos por teclado (Tab) | Un solo candidato activo; la etiqueta nombra al agregado si se indica un agregado |
| **Foco** | C4: anillo grueso de máxima luminancia. C5: la cámara se orienta con una transición continua. Etiqueta persistente. Cadena de ancestros en la capa O | **De sesión**: persiste hasta otro acto de Foco | Es la **única animación del sistema**, y sólo ocurre por un acto de la persona (C-17) | La cámara lo lleva a primer plano | El acercamiento recupera la legibilidad de los demás canales (§12.3) |
| **Anchor** | C4: doble anillo concéntrico. Listado en la capa O | **Persistente** hasta el acto inverso | Ningún cambio de la Fuente produce doble anillo | Siempre listado en la capa O, aunque esté ocluido | Los Anchors son pocos por naturaleza |
| **Foco + Anchor** | C4: anillo grueso + doble anillo exterior | — | — | — | **F-1**: a tamaño N2 se confunde con el Foco solo (§12.4) |

**Reglas de la reserva.**
- **RI-1.** C4, C5 y C6 no se usan para ninguna Lente, ni para la Procedencia, ni para cambios que lleguen de una Fuente.
- **RI-2.** El acento de la paleta no se usa para interacción (DP-c). La reserva usa sólo forma de contorno, luminancia máxima de contorno, cámara y tiempo.
- **RI-3.** Los cambios que llegan de una Fuente se aplican **sin animación**. El único movimiento de la escena es el de cámara causado por la persona; así, ninguna respuesta interactiva puede confundirse con un cambio del sistema. Lo que requiere a la persona es Atención y se convoca en la capa O (C-17; EM §7.4).
- **RI-4.** La guía vertical (línea de caída) pertenece a la reserva: sólo aparece para lo indicado, en Foco o anclado. Por eso nunca se confunde con una Relación (G-6).
- **RI-5.** **Corrección registrada (F-4).** La primera versión de la indicación usaba un anillo simple. Sobre una marca de Procedencia "no verificable" (sólo contorno), indicación y Anchor se veían ambos como anillos concéntricos. Se reemplazó la indicación por corchetes de esquina [ESC]. **Requisito:** la indicación no puede usar la misma geometría de contorno que el Anchor, porque la Procedencia también modifica el contorno de la marca.

---

## 7. Ubicación y asignación

### 7.1 Ubicación de cada dimensión (§4.2 del encargo)

**E** = siempre en el Espacio · **I** = sólo en la indicación · **S** = sólo en la Superficie · **O** = capa de orientación. Toda dimensión que está en E tiene además equivalente en S (EM §4.7).

| ID | Dimensión | Ubicación | Justificación |
|---|---|---|---|
| D-1 | Tipo de Entidad | **E** (contenedores por nivel de C1; hojas por C2) + I (texto) | EM M7; el tipo es parte de la indicación (EM §4.4). Con DJ-CR1, Domains y Genes son hojas del mismo Project y sólo un canal no estructural los distingue |
| D-2 | Procedencia de la Entidad | **E** (C3) + I + S; simulación: **O** | EM §5.6 exige marca en el Espacio; C-2 |
| D-3 | Clase de Fuente | En E sólo débil frente a no débil (C10 sobre adjuntos; C3 "no verificable" sobre Entidades); las 7 clases en **I** + **S** | T-1 (requiere lenguaje); CT-12 exige al menos que lo débil no use la codificación canónica |
| D-4 | Estado interactivo | **E** (reserva §6) + **O** (Foco, Anchors) | EM §4.6.3 |
| D-5 | Candidatos | **E** (uno indicado) + I | EM §4.3.2 |
| D-6 | Identidad de Lente | **E** para un máximo de 2 (C7, C8); el resto, **I** + **S** con aviso en **O** | DJ-CR2, DP-b |
| D-7 | Cobertura | **E** (C9) + **O** (declaración global) | DJ-7 |
| D-8 | Estado de colisión (Lente P-G2) | **E** en 3 clases de relleno + ausencia (§10) + S (fundamento) | EM §6.3 |
| D-9 | Resolución de Location (Lente P-L1) | **E** en 3 clases de relleno (afirmado: changed, stale, missing · indeterminado: ambiguous, unverifiable · desconocido: unsupported, unauthorized); los 8 en **I** + **S** | T-4 (más categorías que el canal disponible); EM §7.5 exige que `unverifiable` y `unsupported` nunca se lean como `missing`, y en este reparto quedan en clases distintas de `missing` [HIP: el agrupamiento debe validarse] |
| D-10 | `missing` alojado en un ancestro | **E** sólo como texto de recuento ("↳ n ref. degradada", C12) junto al ancestro, si P-L1 es visible; detalle en **S** | DJ-9 pide conservar explícitamente la identidad; el texto lo hace; ningún otro canal estaba libre |
| D-11 | Atención | **O** siempre (convocatoria con recuento) + E sólo si P-A1 es visible | C-17; EM §7.4 |
| D-12 | Contexto | **O**; en E se refleja como Procedencia "no verificable" en todas las Entidades | C-12 |
| D-13 | Relación / Anotación entre Entidades / guía | **E**: C13 continua / C13 + C10 discontinua / guía reservada (§6) | Vocab §2.4; L4, L5 |
| D-14 | Árbol frente a N:M | Árbol: **E** (C1). N:M: **S** (lista); en E sólo como marca de prueba apagada (DP-e) | DJ-CR1; §9 |
| D-15 | Agregado | **E**: C2 del tipo + C3 de la Procedencia más débil + C9 en el peor caso + C12 "×N"; miembros en **S** | DV-1..DV-6 |
| D-16 | Anclabilidad | **S** + aviso en **O** al intentar anclar | EM §4.4 excluye los actos de la indicación; la Superficie explica por qué no es anclable (p. ej. `unsupported`, D-3.b) |
| D-17 | Atenuación | **E** (C11) + **O** (declarada) | EM §5.4.5 |
| D-18 | Estado de Lente en el inventario | **O** | EM §5.3.2; DP-b |
| D-19 | Estado detallado de Trabajo | **S**; en E sólo presencia (C9 lleno) | T-1, T-3; Escenarios S1 (sin progreso inventado) |
| D-20 | Régimen y modo foco | **O** | D-2 |

### 7.2 Matriz de asignación y control de G-1

Cada tipo de canal tiene **un único significado**. ✔ indica el significado asignado; no hay ninguna otra fila que use el mismo canal.

| Canal | Significado único | Dimensiones que lo usan |
|---|---|---|
| C1 región | Pertenencia en árbol con Fuente | D-1 (contenedores), D-14 |
| C2 silueta | Tipo de Entidad hoja | D-1, D-15 (tipo del agregado) |
| C3 textura | Procedencia de la Entidad | D-2, D-12 (como "no verificable"), D-15 (más débil) |
| C4 contorno exterior | Estado interactivo | D-4, D-5 |
| C5 cámara | Foco | D-4 |
| C6 tiempo | Firma interactiva | D-4 |
| C7 ranura | Identidad de la Lente A | D-6 |
| C8 giro | Identidad de la Lente B | D-6 |
| C9 relleno del adjunto | Estado por Lente: afirmado / indeterminado / desconocido / evaluado-vacío | D-7, D-8, D-9, D-15 (peor caso), D-19 (presencia) |
| C10 discontinuidad | No afirmado por una autoridad (Fuente débil o propuesta) | D-3 (adjuntos), D-13 (Anotación entre Entidades) |
| C11 luminancia baja | Atenuación declarada | D-17 |
| C12 texto | Nombre o recuento | D-1, D-10, D-15, capa O |
| C13 conexión | Vínculo entre dos Entidades | D-13 |

**Comprobación.** Ningún canal tiene dos significados.

**Dos casos límite:**
- **C9 en distintas Lentes.** Las Lentes A y B comparten C9, pero C9 significa lo mismo en ambas (el estado de la fila), y lo que identifica a cada Lente es C7 o C8, no C9. Es consistente con la lectura (a) de DJ-CR2: las Lentes no comparten el canal **que las identifica**.
- **C10 en adjuntos y en conexiones.** Significa lo mismo en los dos casos: "no afirmado por una autoridad".

---

## 8. Presupuesto y tope de Lentes (§4.4 del encargo, DJ-CR2)

### 8.1 Canales de identidad disponibles para Lentes

| Tipo de canal de identidad | Estado | Por qué |
|---|---|---|
| Región espacial / ranura (C7) | **Libre**, se asigna a la Lente A | — |
| Orientación (C8) | **Libre**, se asigna a la Lente B | Marginal: pocos valores y poca efectividad |
| Tono | No disponible | DJ-CR4, DP-c |
| Movimiento | No disponible | DJ-CR3 |
| Forma | Ocupada | Tipo de Entidad (C2) |
| Textura | Ocupada | Procedencia (C3) |
| Luminancia | Ocupada | Interacción (máxima) y atenuación (baja) |
| Tamaño | No confiable | Perspectiva; reservado a la extensión estructural |
| Conexión (C13) | Sólo sirve para Lentes **relacionales** (Anotaciones entre dos Entidades) | — |

### 8.2 Tope [HIP, a validar]

| Clase de Lente | Tope visible simultáneo en el Espacio |
|---|---|
| Lentes que anotan **sobre** una Entidad | **2**: 1 robusta (A, ranura) + 1 marginal (B, giro) |
| Lente **relacional** (Anotaciones entre dos Entidades) | **+1**: se identifica por conexión discontinua (C13 + C10) |

**Recomendación operativa provisional:** validar con personas si la Lente B, que se identifica sólo por orientación, se reconoce sin aprenderlo. Si no se reconoce, el tope efectivo es **1 + 1 relacional**.

### 8.3 Sensibilidad (DP-d; sin asignar colores)

| Supuesto | Tope de Lentes sobre Entidad | Robustas | Costo |
|---|---|---|---|
| Presupuesto actual (DJ-CR3, DJ-CR4, DP-c, G-1 por vista) | **2** | 1 | — |
| Se libera el tono para identificar Lentes (decisión posterior de José sobre la paleta) | **3** | 2 (ranura, tono) | Requiere extender la paleta, revisar la regla "el acento indica" (CR-4 del research) y mantener redundancia sin color, porque el tono no puede ser el único portador (EM §4.6.4) |
| Se libera el tono **y** se admite la forma en las marcas adjuntas (relajar G-1 por clase de marca) | **4** | 2 | Riesgo de que el adjunto se confunda con una Entidad pequeña (R§4 W4); búsqueda por conjunción (L-10) |
| Se admite movimiento en reposo para una Lente | +1 | 0 | Contradice DJ-CR3 y C-17 en espíritu; satura en N1 (R§6.7). **No recomendado** |

La literatura sugiere que, aun con canales libres, la capacidad atencional para categorías simultáneas es baja ("un par de categorías a la vez", L-11). **Un tope de 2 o 3 es coherente con la percepción y no sólo con la escasez de la paleta.**

### 8.4 Cuando la persona activa más Lentes que el tope

| Opción | Qué pasa | A favor | En contra | Cumplimiento normativo |
|---|---|---|---|---|
| **O-1 (DP-b): activa, no visible** | La Lente sigue activa. No se dibuja en el Espacio. La capa O la lista como "activa · no visible (tope)". La indicación muestra su estado para la Entidad indicada. La Superficie muestra todas sus filas | Respeta el acto de la persona. La información sigue alcanzable. No oculta sin decirlo | Introduce un cuarto estado en el inventario, que debe distinguirse de "activa sin datos" (EM §5.3.2). La ausencia de sus Anotaciones en el Espacio no puede leerse como *ninguno*: sólo es seguro si la capa O lo dice siempre | EM §5.3.2 (inventario perceptible), §5.4.4 (no ocultar sin decirlo), C-2: **cumple si la capa O es persistente** |
| **O-2: rechazar la activación** | No se puede activar una tercera Lente sin desactivar otra; aviso con causa | Más simple. El inventario coincide con lo visible | Niega un acto de la persona. Lo que la Lente diría queda fuera del alcance de la indicación y de la Superficie | Cumple formalmente. Tensa EM §5.4.1 ("se combinan; no hay exclusión normativa") |

**Recomendación [HIP]: O-1**, con tres condiciones:
1. **Elección de lo visible.** Qué Lentes son visibles lo decide la persona con un acto explícito. Sin ese acto, rige el orden fijo por clase de Proyección (EM §5.4.3); nunca la relevancia (C-17).
2. **Aviso persistente.** El aviso "no visible (tope)" está siempre en la capa O, no es una notificación pasajera.
3. **Indicación.** La indicación incluye el estado de las Lentes no visibles para la Entidad indicada (verificado en la escena [ESC]: "… · P-L1: afirmado · P-A1: desconocido").

---
## 9. Requisito del dispositivo de pertenencia N:M (§4.5 del encargo, DJ-CR1)

Se define como **requisito**, no como forma.

### 9.1 Qué debe poder afirmar

| ID | Requisito | Fundamento |
|---|---|---|
| NM-1 | "Esta Entidad Gene pertenece a esta Entidad Domain", para **cada** Relación Domain↔Gene ratificada, aunque haya varias por Gene | Gene v3.0 §2.6, inv. 13; Vocab §2.4 |
| NM-2 | La Procedencia de cada Relación (ratificada; o proyección, si viene de GravityGraph) | C-2; Vocab §3.5 |
| NM-3 | Que la pertenencia se puede recorrer en los dos sentidos: los Domains de un Gene y los Genes de un Domain | Vocab §2.4 (navegable) |
| NM-4 | Que se mantiene con el Gene agregado: un agregado de Genes debe poder decir a qué Domains pertenecen sus miembros, sin perder el recuento | DV-1, DV-5 |

### 9.2 Qué no debe afirmar

| ID | Prohibición | Fundamento |
|---|---|---|
| NM-5 | Contención: ni el Gene dentro del Domain ni el Domain como contenedor | DJ-CR1 |
| NM-6 | Exclusividad: un Gene no pertenece a "un" Domain principal | Gene v3.0 ("Domain no se almacena como campo singular dentro del Gene") |
| NM-7 | Orden o jerarquía entre los Domains de un Gene | C-3 |
| NM-8 | Pertenencia por cercanía, por alineación o por superposición accidental | G-2; Vocab §2.4 |
| NM-9 | Pertenencia a partir de una propuesta (`semantic_candidate`): una propuesta es Anotación entre Entidades, no Relación | EM §5.8 (L5) |

### 9.3 Convivencia con la contención de árboles (G-3)

| ID | Requisito |
|---|---|
| NM-10 | La pertenencia N:M **no usa C1** (región o contención). La pertenencia en árbol no usa el canal del dispositivo N:M |
| NM-11 | **Ningún borde de región se dibuja con la misma marca que una conexión.** Evidencia: con los bordes de región dibujados como línea fina, la conexión de prueba N:M se confundía con ellos (**F-6** [ESC], configuración `rl=1&nm=1`). Al representar la región sólo por el escalón de luminancia de su área, la confusión desapareció |
| NM-12 | Si el dispositivo N:M usa una conexión (C13), debe ser distinguible, sin color, de la Anotación entre Entidades (C10) y de la guía reservada (§6). Hoy C13 continua cumple ese papel para toda Relación, de modo que el N:M sería una Relación entre otras, que es exactamente lo que es (Vocab §2.4) |

### 9.4 Comportamiento en alta densidad

| ID | Requisito |
|---|---|
| NM-13 | En N2 y N3 la pertenencia N:M **no se dibuja completa en reposo**. Se revela para la Entidad indicada o en Foco y vive completa en la Superficie (T-6) |
| NM-14 | Un agregado no dibuja las pertenencias N:M de sus miembros. La Superficie las lista (DV-5) |
| NM-15 | Si se dibuja para una Entidad en Foco, el agrupamiento de conexiones sólo se admite si cada Relación sigue siendo recuperable en la Superficie (R§10.2) |

### 9.5 Qué se transfiere a la Superficie

La lista completa de pertenencias, con Procedencia y vigencia; la navegación hacia cada Domain o Gene (Foco por DJ-8). En T3, la escena muestra esa lista como **"PERTENENCIA N:M"**, y para el Gene en Foco, sus dos Domains [ESC].

---

## 10. *Desconocido* frente a *ninguno* (§4.6 del encargo)

### 10.1 Tres niveles

| Nivel | Comportamiento requerido | Canal | Verificado en la escena |
|---|---|---|---|
| **Entidad individual, modo a** (la Proyección cubre al menos la mitad de las Entidades en alcance [HIP: umbral]) | *Desconocido* = adjunto hueco. *Ninguno* = ausencia, legítima porque la cobertura está declarada (DJ-7) | C9 | T2, Lente P-W1; T1, P-W1 y P-W2 |
| **Entidad individual, modo b** (cubre menos de la mitad) | Declaración global en la capa O ("no evaluado en x/y; ausencia = desconocido"). *Desconocido* = ausencia. Lo evaluado sin filas se marca explícitamente con un adjunto "evaluado sin filas". Lo afirmado y lo indecidible se marcan como siempre | C9 + capa O | T2, Lente P-G2 |
| **Agregado** | Peor caso: si algún miembro es *desconocido*, el agregado muestra *desconocido* (DV-2). Si no, afirmado; si no, indecidible; si no, ninguno. Recuento exacto por estado en la Superficie | C9 + C12 + S | T2 N3 |
| **Declaración global** (cobertura nula) | La capa O dice "SIN COBERTURA: no evaluado en ninguna Entidad (desconocido global)" y en el Espacio no hay ninguna marca de esa Lente | O | T1 y T4, Lente P-G2 |

**Por qué hay dos modos.** Si se marcara cada Entidad *desconocida* cuando casi todas lo son, la marca cubriría el Territorio entero y dejaría de informar (R§13.2 Q9). Invertir la convención en el modo b (marcar lo evaluado, no lo desconocido) mantiene el número de marcas proporcional a la excepción. La convención vigente de cada Lente se declara **siempre** en la capa O; nunca queda implícita.

### 10.2 Gravity: hoy sólo *desconocido* es verdad

Hoy, para todo Mandate Genesis, el único estado veraz es *desconocido* (EM CT-04; Escenarios S10). Por eso la configuración por defecto de la Lente P-G2 es la **declaración global**, sin marcas por Entidad. Cuando exista una Proyección de Gravity con cobertura (RI-G6, RI-G7), la Lente pasará al modo b, y después al modo a, sin cambiar los canales.

### 10.3 Aplicación de DV-1..DV-6

| Invariante | Cómo lo cumple el presupuesto | En la escena |
|---|---|---|
| DV-1 recuento | Texto "×N" en el agregado, y en la escala lejana un recuento por Project | Sí, N3 |
| DV-2 cobertura | Relleno de peor caso | Sí |
| DV-3 Atención | Recuento en la capa O siempre; adjunto de P-A1 sólo si P-A1 es visible | Sí. **Límite:** si P-A1 excede el tope, la Atención de un agregado se ve sólo en la capa O y en la Superficie |
| DV-4 Procedencia más débil | Textura del miembro más débil | Sí |
| DV-5 recuperabilidad | Al poner el Foco en un Project se expande ese Project; miembros en la Superficie | Sí |
| DV-6 determinismo | Agregación por Project y tipo, generación con semilla fija | Sí |

---

## 11. Política de cámara (§4.7 del encargo)

| Opción | Descripción | Efecto sobre los canales | Evidencia |
|---|---|---|---|
| **CA-1 · libre** | Órbita sin límite de elevación, hasta el horizonte | C2, C3, C8 y C12 se mantienen, porque miran a la cámara. **C1 se degrada**: a baja elevación las regiones se ven de canto y la contención deja de leerse; además crece la oclusión | [ESC] con elevación de 8°: las regiones colapsan en franjas y las marcas se superponen |
| **CA-2 · acotada** | Elevación mínima [HIP: alrededor de 30° sobre el plano]; giro horizontal libre; zoom libre | C1 se mantiene legible; la oclusión es moderada; el tamaño sigue sin ser confiable (perspectiva) | [ESC] con elevaciones entre 40° y 50° (vista por defecto): la contención se lee |
| **CA-3 · cenital de orientación + inclinación por acto** | La vista base es cenital (ortográfica). La persona puede inclinarla y volver por un acto (nunca automáticamente, C-17) | **Todos los canales son confiables**, y en la vista cenital el tamaño vuelve a ser confiable. Pierde la ganancia hipotética de la profundidad cinética (H-3D-1) | [ESC] **K-2**: la vista plana fue igual o más legible en todas las configuraciones |

**Consecuencias para el presupuesto.**
- El presupuesto **no depende de la cámara**, salvo por C1. Todos los canales de identidad (C2, C7, C8) y de estado (C3, C9, C10) se calculan en el espacio de la pantalla o en marcas orientadas a la cámara.
- CA-1 es compatible sólo si se acepta que la contención se lea mal en las vistas rasantes.
- La decisión es de José.

---

## 12. Escena gris: resultados

### 12.1 Qué es

Un único archivo HTML con PlayCanvas 2.22.1 por CDN. Muestra:
- los cuatro territorios;
- T2 en cuatro densidades;
- vista 3D orbitable, vista plana cenital ortográfica, o las dos a la vez;
- las Lentes P-W1, P-W2, P-G2, P-L1, P-A1 y P-W3 (relacional), con tope de 2;
- la capa O (Contexto, Foco, Anchors, Atención, atenuación, inventario de Lentes con su convención de cobertura);
- una Superficie (sujeto, Procedencia, anclabilidad, Anotaciones de **todas** las Lentes activas, pertenencia N:M, miembros de agregados);
- un **catálogo de estados** que dibuja cada valor del inventario con la misma función de dibujo que usa la escena, a dos tamaños: el de N0 y el de N2.

Interacción: indicación por puntero y por teclado (Tab), Foco por clic o Enter, Anchor con la tecla A.

Los datos son sintéticos y se generan con semilla fija. No usa `OrreryTree`, `data.ts` ni código de `installer/` (D-4).

### 12.2 Verificación del inventario sin color (DP-f)

Medición: croma por píxel (máximo − mínimo de R, G y B) sobre las capturas de la escena y del catálogo.

**Resultado: croma máximo 0 en todos los píxeles** [ESC]. En la primera pasada aparecieron entre 300 y 700 píxeles con croma: eran las casillas de verificación nativas del navegador, no la escena. Se neutralizaron.

| Dimensión | Valores comprobados en el catálogo (N0 / N2) | Resultado |
|---|---|---|
| D-1 tipo (C2) | Domain, Gene, Repository + contenedores por nivel | Se distinguen en N0 y en N2 |
| D-2 Procedencia (C3) | T1..T5 | N0: se distinguen. N2: verificado (lleno) y no verificable (vacío) se distinguen; **T2, T3 y T4 se confunden (F-2)** |
| D-3 Fuente débil (C10) | Afirmado, indecidible y desconocido, cada uno débil y no débil | Se distinguen en N0; en N2 el discontinuo se ve, pero hay que buscarlo |
| D-4 interacción (C4) | Reposo, indicación, Foco, Anchor, Foco + Anchor, sobre textura llena y sobre textura vacía | N0: se distinguen. N2: **Foco y Foco + Anchor se confunden (F-1)** |
| D-6 identidad de Lente (C7, C8) | A frente a B | Se distinguen en N0 y en N2 |
| D-7, D-8, D-9 estado por Lente (C9) | Afirmado, indecidible, desconocido, evaluado sin filas, para A y para B | Se distinguen en N0; en N2 se distinguen con lectura serial (F-3) |
| D-13 Relación / propuesta / guía | Continua, discontinua, guía sólo bajo interacción | Se distinguen |
| D-15 agregado | Silueta + "×N" | El texto lo distingue |
| D-17 atenuación (C11) | Normal frente a atenuado | Se distinguen |
| Combinación máxima sobre una marca | C2 + C3 + C4 + C7 + C8 + C9 + C10 | Cada dimensión es identificable, pero sólo leyéndola por separado (F-3) |

### 12.3 Resultados por territorio y criterio

| Territorio | K-2 aplanamiento | K-3 densidad | K-5 sin color | K-14 *desconocido* ≠ *ninguno* | K-20 sin segunda ontología |
|---|---|---|---|---|---|
| **T1 · mínimo CT-01** (4 Entidades) [NO OBSERVADO] | Cumple: el plano transmite lo mismo; la profundidad no aporta | N0: todo etiquetado; el territorio **se ve escaso, sin relleno** (K-19) | Cumple | Cumple: P-W1 y P-W2 cubiertas (en el Project, la ausencia vale *ninguno*); P-G2 sin cobertura, declarada en la capa O | Cumple: el Domain está contenido sólo en el Project; no hay relaciones inventadas |
| **T2 · denso** [HIP], de N0 a N3 | Cumple: en todas las densidades el plano es igual o más legible; la perspectiva sólo agrega oclusión | N0–N1: todos los canales se leen. N2: en la vista general sólo se leen silueta y presencia; al acercarse se recupera todo (lectura condicionada por la escala). N3: la agregación por Project y tipo funciona **con recuento por Project en la escala lejana**; el recuento por tipo satura el texto | Cumple | Cumple: modo a (P-W1) y modo b (P-G2) declarados en la capa O; agregados en el peor caso | Cumple, con una nota: el layout en grilla dentro de cada Project ordena las hojas por tipo; la alineación resultante corresponde a un atributo real (el tipo) y no afirma relaciones |
| **T3 · Gene en dos Domains** | Cumple | N0 | Cumple | No aplica | **Cumple**: el Gene está contenido sólo en el Project; su pertenencia N:M está en la Superficie; la conexión de prueba está apagada por defecto. Con la conexión encendida y bordes de región como línea, **F-6** |
| **T4 · Gravity entera en *desconocido*** | Cumple | N1–N2 | Cumple | **Cumple sólo a través de la capa O**: el Espacio es idéntico con "nada evaluado" y con el contraste "todo evaluado sin colisiones"; la diferencia está únicamente en la declaración de la capa O. EM §5.6 lo admite (declaración global). **Límite registrado** | Cumple |

### 12.4 Fallas y límites registrados (DP-f)

| ID | Tipo | Qué no se distingue | Dónde | Estado | Mitigación o requisito |
|---|---|---|---|---|---|
| **F-1** | Límite | Foco frente a Foco + Anchor a tamaño N2 | Catálogo, columna pequeña | Abierto | La cámara acerca el Foco (C5), así que a tamaño de Foco se distingue. La capa O lista los Anchors. La Visual Architecture debe asegurarlo también a tamaño pequeño (EM §4.6.3) |
| **F-2** | Límite | Procedencia T2, T3 y T4 (declarado, propuesto, proyección) a tamaño N2 | Catálogo; T2 N2 en vista general | Abierto | Opciones a decidir: (a) en el Espacio, a distancia, reducir la Procedencia a tres clases ordinales (verificado / declarado-propuesto-proyección / no verificable) y dar el detalle en la indicación; (b) mostrar la textura sólo por encima de un tamaño mínimo |
| **F-3** | Límite | Una marca con todas las dimensiones a la vez se lee dimensión por dimensión, no de un vistazo | Catálogo, "combinación máxima" | Esperado (búsqueda por conjunción, L-10) | Ninguna decisión crítica puede depender de leer una conjunción de un vistazo: lo crítico va en la capa O (Atención) |
| **F-4** | Corregida | Indicación con anillo simple frente a Anchor, sobre una marca de contorno solo | Catálogo (primera versión) | Corregida: corchetes de esquina | RI-5 |
| **F-5** | Corregida | Adherencia: en N2 un adjunto quedaba a igual distancia de su Entidad que de la vecina; en N3, la expansión de un Project superponía las marcas | T2 N2; T2 N3 con un Project expandido | Corregida: el tamaño de la marca y el desplazamiento del adjunto se acotan a la celda de la Entidad | **Requisito:** el desplazamiento del adjunto tiene que ser menor que la mitad de la separación mínima entre marcas; la expansión estructural tiene que redistribuir el espacio |
| **F-6** | Corregida | Borde de región dibujado como línea frente a conexión | T2 con la Lente P-W3 y la prueba N:M | Corregida: la región se dibuja sólo como área con escalón de luminancia (se puede reproducir con `rl=1`) | NM-11 |
| **F-7** | Corregida | Valor "evaluado sin filas" dibujado como barra suelta frente al guion de una conexión discontinua | T2 con la Lente P-W3 | Corregida: contorno con barra interior | **Requisito:** ningún valor de C9 puede parecerse a un segmento de C10 o de C13 |
| **L-K14** | Límite | En el Espacio, "nada evaluado" frente a "todo evaluado sin colisiones" | T4 | Admitido por EM §5.6 | La declaración de la capa O tiene que ser persistente y estar junto a la Lente |
| **L-DJ9** | Límite | Una referencia `missing` alojada en un ancestro sólo se percibe por un texto de recuento, y sólo si P-L1 es visible | T2 | Abierto | Si P-L1 excede el tope, sólo la Superficie lo muestra |

### 12.5 Qué no demuestra la escena

- **Diseño ni forma.** Las marcas de prueba son arbitrarias.
- **Legibilidad con personas.** Ninguna persona la usó. Las distinciones se juzgaron en capturas.
- **Rendimiento ni picking real de PlayCanvas.** El picking es una proyección manual a la pantalla; el `Picker` no se probó (PA-5).
- **La experiencia de Orrery.** No hay Régimen, Superficies reales, actos ni datos reales.
- **Estereoscopía ni H-3D-1.** La comparación 3D/plano se hizo con una cámara fija para cada captura, sin medir trazado de caminos con movimiento.
- **Paleta real.** La escena usa grises neutros; los neutros de la paleta tienen un leve tinte frío (X-5).

### 12.6 Cómo reproducir

Abrir `escena_gris/index.html` en un navegador con conexión. Los parámetros de URL están documentados en el comentario inicial del archivo. Las configuraciones citadas en este documento son:

| Configuración | Para qué |
|---|---|
| `?T=T1&cat=2` | Catálogo completo |
| `?T=T2&N=N2&V=split` | Vista 3D y plana a la vez |
| `?T=T2&N=N3&V=split&focus=p0_0` | N3 con un Project expandido |
| `?T=T3&nm=1&focus=p0_0_g0` | Gene en dos Domains, con la marca de prueba N:M |
| `?T=T4&V=split&eval=1` | Contraste de cobertura de Gravity |
| `?T=T2&N=N1&lenses=P-W1,P-G2,P-W3&nm=1&rl=1&dist=0.45` | Falla F-6 |
| `?T=T1&focus=p0_0_d0&anchor=p0_0&ind=org0` | Los tres estados interactivos a la vez |

---

## 13. Contradicciones

| ID | Contradicción | Evidencia | Qué prevalece hoy | Decisión requerida |
|---|---|---|---|---|
| **X-1** | El ejemplo del EM §4.3.1 ("un Domain responde en su región no ocupada por sus Genes"), el de CT-06 y la frase "Gene ⊂ Domain ⊂ Project" son inaplicables con DJ-CR1. La regla 1 del §4.3.1 (responde la Entidad más específica bajo el punto) sigue vigente para los árboles | EM §4.3.1, §11 CT-06; DJ-CR1 | EM, con nota (DP-a) | **Pendiente para la próxima versión del EM** (DP-a); no se versiona ahora |
| **X-2** | EM §5.4.1 dice "Se combinan. No hay exclusión normativa entre Lentes"; el presupuesto impone un tope | EM §5.4.1; §8 | DP-b: el tope es de **visibilidad**, no de activación, así que no hay exclusión normativa | Ninguna, si se adopta O-1 (§8.4) |
| **X-3** | El EM §5.6 pide que cada Anotación lleve una marca de Procedencia perceptible en el Espacio (las cinco clases y la clase de Fuente: "Marca en el Espacio + texto en Superficie"). El presupuesto sólo alcanza para marcar "débil o no débil" en los adjuntos (C10); el resto queda en la indicación y la Superficie | EM §5.6; §7.1 D-3 | La norma; el presupuesto la cumple sólo en parte | **José:** (a) aceptar la marca binaria en el Espacio como cumplimiento de §5.6, con el detalle en la indicación; (b) liberar un canal (que costaría la Lente B); (c) versionar el EM §5.6 |
| **X-4** | EM §4.6.3 pide el Anchor "perceptiblemente distinto del Foco"; a tamaño N2 no lo es (F-1) | §12.4 | La norma | La Visual Architecture debe resolverlo; la mitigación por cámara y capa O podría no bastar |
| **X-5** | DJ-CR4 pide la paleta tal cual; sus neutros (`#080A0E`, `#0D1117`, `#131820`) tienen un leve tinte frío (croma de hasta 10 sobre 255). La escena usó grises neutros para que K-5 fuera medible | Paleta; §12.2 | DJ-CR4 | Ninguna inmediata: el tinte es uniforme y no codifica nada, así que no afecta K-5 en lo semántico. Registrar para la Visual Architecture |
| **X-6** | La Lente P-W1 hace perceptible "aquí ocurre trabajo **y en qué estado está**" (EM §5.2). El presupuesto da en el Espacio sólo la presencia (C9 lleno) y deja el estado (fase, etapa) en la indicación y la Superficie | EM §5.2, M15; §7.1 D-19 | La norma | **José:** aceptar la presencia en el Espacio y el estado en la indicación (T-1, T-3), o reservar un canal para el estado de Trabajo, a costa de la Lente B |

---

## 14. Preguntas abiertas

| ID | Pregunta | Depende de |
|---|---|---|
| Q-1 | ¿Se reconoce la Lente B (identificada por giro) sin aprendizaje? Define si el tope es 2 o 1 + 1 relacional | Prueba con personas |
| Q-2 | ¿Es válido agrupar los 8 estados de Location en 3 clases de relleno (§7.1, D-9)? | Revisión de José; contrato de Location |
| Q-3 | X-3: ¿marca binaria de Procedencia por Anotación en el Espacio? | José |
| Q-4 | X-6: ¿estado de Trabajo sólo en la indicación? | José |
| Q-5 | ¿Política de cámara CA-1, CA-2 o CA-3? | José |
| Q-6 | F-2: ¿Procedencia ordinal de tres clases a distancia? | José / Visual Architecture |
| Q-7 | ¿Se extiende la paleta para liberar el tono (sensibilidad §8.3)? | José |
| Q-8 | ¿Qué densidad real tendrán Cognituum y Bloomaut? Calibra N0–N3 y el umbral de los modos a/b | Genesis E2E (PA-1) |
| Q-9 | ¿Qué dispositivo cumple NM-1..NM-15? | Visual Architecture |
| Q-10 | ¿El `Picker` de PlayCanvas sostiene la reserva de interacción con marcas pequeñas e instanciadas? | Prueba técnica posterior (PA-5), sólo si se autoriza |

---

## 15. Recomendaciones para el encargo de Visual Architecture / Visual Experience

| ID | Recomendación |
|---|---|
| **VA-1** | Tomar este presupuesto como **entrada fija**: los tipos de canal por dimensión (§7.2), las reglas de reserva RI-1..RI-5 y la ubicación de cada dimensión (§7.1). Toda forma concreta debe materializar estos tipos de canal, no reemplazarlos |
| **VA-2** | Resolver **antes de los primeros marcos**: X-3 (Procedencia por Anotación), X-6 (estado de Trabajo), la política de cámara (Q-5) y la reducción ordinal de F-2 |
| **VA-3** | Diseñar un **presupuesto por escala**: qué canales están presentes en la vista general y cuáles aparecen al acercarse. En la escena, los canales de cada Entidad en N2 sólo se leen de cerca, y el recuento de N3 necesita dos niveles |
| **VA-4** | Resolver F-1 (Foco frente a Foco + Anchor a tamaño pequeño) sin usar el acento (DP-c) |
| **VA-5** | Elegir el dispositivo N:M contra NM-1..NM-15, y probarlo en T3 con la conexión de prueba y con bordes de región (F-6) |
| **VA-6** | Tratar las convenciones de cobertura (modo a / modo b / declaración global) como elementos de primera clase de la capa O |
| **VA-7** | Usar la escena gris como **banco de pruebas**: cada propuesta de forma debería poder sustituir las marcas de prueba y volver a pasar el catálogo, K-2, K-3, K-5, K-14 y K-20 |
| **VA-8** | Mantener los cambios que llegan de la Fuente **sin animación** (RI-3); el único movimiento es el de cámara causado por la persona |
| **VA-9** | Incorporar como requisitos F-4..F-7: la indicación no usa la geometría del Anchor; el adjunto queda dentro de la celda de su Entidad; ningún borde de región se dibuja como conexión; ningún valor de C9 se parece a un segmento de línea |
| **VA-10** | Validar con personas el tope de Lentes (Q-1) antes de cerrar el catálogo de Lentes (A-3) |

---

## Anexo A — Correspondencia con el encargo

| Sección del encargo | Dónde está |
|---|---|
| §4.1 Inventario | §4 |
| §4.2 Ubicación | §7.1 |
| §4.3 Reserva de interacción | §6 |
| §4.4 Presupuesto de Lentes | §8 |
| §4.5 Requisito N:M | §9 |
| §4.6 *Desconocido* / *ninguno* | §10 |
| §4.7 Cámara | §11 |
| §5 Territorios | §12.3 |
| §6 Escena gris | §12; `escena_gris/index.html` |
| §7 Criterios K-2, K-3, K-5, K-14, K-20 | §12.3 |
| §9 Contradicciones, preguntas, recomendaciones | §13, §14, §15 |

---

*Fin. Research no normativo. No asigna formas ni colores, no diseña el dispositivo N:M, no define Interaction Grammar y no modifica código, contratos ni documentos normativos.*
