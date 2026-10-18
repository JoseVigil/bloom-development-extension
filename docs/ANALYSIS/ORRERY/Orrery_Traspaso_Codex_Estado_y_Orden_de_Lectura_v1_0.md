# Orrery — Traspaso a Codex: estado exacto y orden de lectura v1.0



| Campo | Valor |

|---|---|

| Documento | `docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Estado_y_Orden_de_Lectura_v1_0.md` |

| Para quién | Codex (Windows), que continúa el frente Orrery desde el punto exacto en que quedó |

| Escrito por | El cowork de Orrery en la nube, el 2026-10-17, al cerrar ese frente |

| Autoridad de diseño | José Vigil (única) |

| Tipo | **Documento índice y de traspaso. No es fuente normativa.** Ante cualquier divergencia entre este traspaso y un documento fuente, manda el documento fuente |

| Convención de rutas | Todas las rutas son relativas a la carpeta `docs\` del repositorio `bloom-development-extension`, con separador de Windows. En la copia Windows de José el repositorio está en `C:\repos\bloom-development-extension` |



---



## 0. Cómo usar este documento



1. Leé este traspaso completo antes de abrir cualquier otro archivo.

2. Ejecutá la verificación de §3 para saber qué archivos están en tu copia de `docs\` y cuáles faltan.

3. Leé los documentos en el orden de §4. Los de nivel 1 y nivel 2 se leen **completos**: no alcanza con buscar fragmentos.

4. El punto exacto donde quedó el trabajo está en §6, y lo que falta decidir, en §7. **No avances a la fase siguiente sin la aprobación explícita de José** (§2).

5. En §11 hay un texto listo para pegar como primer mensaje a Codex.



---



## 1. Qué es Orrery, en un párrafo



Orrery es la representación espacial navegable del **Territorio** de Cognituum (Tenant › Organization › Project › Domains y Genes) dentro de Workspace Core. El Territorio es el *dónde* y permanece; el **Trabajo** (Mandates, Sessions, Actions, Intents) ocurre sobre él. Las **Lentes** leen Proyecciones de otros sistemas (Nucleus, Gravity, Impact) y dibujan **Anotaciones** sobre las Entidades, sin cambiar el Territorio. Las **Superficies de Workspace Core** permiten comprender en detalle y actuar. El frente de este cowork pasó de la norma (vocabulario, constitución, decisiones, Experience Model) a la investigación visual y de interacción: qué primitivas espaciales usar, cuántos canales perceptuales hay, cuántas Lentes pueden verse a la vez, y cómo deben funcionar la Lente, la selección de lecturas y la indicación (el "hover").



---



## 2. Reglas de trabajo que Codex debe respetar



| # | Regla | Fuente |

|---|---|---|

| R-1 | **Orden normativo.** Vocabulario → Constitución → Decisiones arquitectónicas → Experience Model → Arquitectura UI/UX → vertical slices → implementación. Cada nivel se apoya en el anterior y no puede contradecirlo | `ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` §7 |

| R-2 | **Ningún documento redefine en silencio un término del Vocabulario.** Si una investigación muestra que una definición debe cambiar, se propone, José aprueba y se publica una versión nueva | Vocabulario v1.1 §7 |

| R-3 | **La norma no es retroactiva.** Los cambios normativos generan versiones nuevas; las anteriores sólo reciben la marca de reemplazo. **Nunca se sobrescribe un documento existente**: siempre una versión nueva | Estado Base §8 |

| R-4 | **Research no es norma.** Los documentos de `VISUAL\` e `INTERACTION\` son investigación. Sus recomendaciones no son decisiones hasta que José las aprueba, y aun aprobadas son decisiones de investigación, no norma | Encabezados de cada documento; DJ-I5, DJ-I7 |

| R-5 | **Código de Orrery congelado.** No se modifica `installer\conductor\workspace\core\orrery\` hasta nueva decisión de José | Estado Base §8.1 |

| R-6 | **Estado operativo protegido.** No se leen `.bloom` ni `BloomNucleus` sin que José indique archivo y campo concretos | Estado Base §8.2 |

| R-7 | **Git lo hace José.** Ninguna acción de git (commit, push, branch) salvo pedido explícito | `AGENTS.md` (raíz del repositorio) y preferencias de José |

| R-8 | **Autorización por tarea.** Un pedido concreto de implementación o corrección autoriza editar los archivos necesarios. Un pedido de investigar, proponer o planificar es de **sólo lectura**. Hay que consultar antes de ampliar el alcance o de introducir arquitectura o nombres nuevos | `AGENTS.md` (versión de octubre de 2026). **Leelo en la raíz del repositorio: manda sobre este resumen** |

| R-9 | **Sin Interaction Grammar, contratos ni implementación de Orrery** hasta nueva decisión | Estado Base §8.4 |

| R-10 | **Trazabilidad.** Cada hallazgo lleva su fuente y su estado: [NORMA], [DJ] o [DJ-I] (decisión de José), [DOC], [EVID-T] (técnica), [EVID-H] (humana, hoy inexistente), [HIP] o [PEND] | Convención de `INTERACTION\` |

| R-11 | **Condiciones fuera de norma [FN].** Sólo en un bloque exploratorio separado; ningún resultado autoriza un cambio normativo | DJ-I7 |

| R-12 | No usar la palabra "bootstrap" en nombres de rutas nuevas | Preferencia de José |

| R-13 | **Si algo no está fundamentado en la documentación vigente, se dice expresamente.** No se completa por inferencia | Instrucción reiterada de José en este frente |



**Atención con los identificadores repetidos.** Varios documentos usan las mismas siglas para cosas distintas. En particular, `F-1..F-7` del Vocabulario son conflictos de contratos físicos, mientras que `F-1..F-7` del presupuesto de canales son fallas de la escena gris. Los documentos de `INTERACTION\` siempre anteponen la fuente: `Vocab/F-7`, `CB/F-1`, `CB/X-3`, `CB/Q-1`.



---



## 3. Inventario de archivos y verificación



### 3.1 Qué viene en el paquete de traspaso



El paquete `Orrery_Traspaso_Codex_docs.zip` contiene una carpeta `docs\` que se copia sobre la raíz del repositorio. **No sobrescribe nada sin revisar**: si un archivo ya existe en tu copia, compará su hash SHA-256 con el de esta tabla. Si coincide, es el mismo archivo; si no, avisale a José antes de reemplazarlo.



| Ruta en `docs\` | Bytes | SHA-256 | Notas |

|---|---|---|---|

| `ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | 144404 | `a5ed3ccbc3b03eeeb64c25d426a9c667778d6de616618d50423d64833935d242` | Copia exacta. Puede existir ya en el repositorio si José la commiteó antes de que fallara el disco de Linux |

| `ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | 52943 | `a59cf8b13c18a8b4d05393d1d55c1ad40a0408e835b2fbf9b9921e20119a3609` | Ídem |

| `ANALYSIS\ORRERY\VISUAL\escena_gris\index.html` | 53118 | `40dd6ec517494d2144876fdaa0fb98d93607b8ead2592b887f417c133cf4244d` | Ídem |

| `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_1.md` | 83549 | `45f94d6651b556928ccc93ea58e1a1930ce0452e32aa56b30fcf70af70154334` | Copia exacta. **Nunca estuvo en el repositorio** |

| `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` | 91325 | `28810a618d89063ce5530f52862d1779dd74044f66c152b4c8e6c0e290e17b9d` | Ídem |

| `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` | 34965 | `8cee42e168057e74b8e57b299a8e5b031d0b3bd697ee9bf11f275f0adedc8790` | Ídem |

| `ANALYSIS\ORRERY\ENCARGOS\Encargo_Orrery_Morphological_Spatial_Language_Research_v0_1.md` | 22381 | `5307fd6fef34eeadfd2d3b7c212586a6d4c88baedbdbd49280337fbd9153dfe0` | Encargo original de José (2026-10-11), copia exacta del adjunto. **Nunca estuvo en el repositorio** |

| `ANALYSIS\ORRERY\ENCARGOS\Encargo_Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | 9695 | `2e40f75397ac54e1ce71f6901eb127a597483ccfef341ea4fd32cfde480a5cd5` | Encargo original de José (2026-10-13), ídem |

| `ANALYSIS\ORRERY\ENCARGOS\Encargo_Orrery_Guia_Investigacion_Interaccion_Lente_Foco_Hover_v0_1.md` | 21641 | `41ce046287dbc6e1c783250c0ca1e2aff52e79f60e9935edf95c5c1141eb6dca` | Guía de investigación de José (2026-10-16), ídem. Es "la guía" que citan los documentos de `INTERACTION\` |

| `ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Estado_y_Orden_de_Lectura_v1_0.md` | — | — | Este documento |

| `ANALYSIS\ORRERY\Verificar_Archivos_Orrery.ps1` | — | — | Script de verificación de §3.3 |



**La carpeta `ENCARGOS\` es nueva**: la creó este traspaso para que los encargos no se pierdan. José puede moverla. Los encargos llegaron como adjuntos `.txt`; sólo cambió la extensión, no el contenido.



**Imágenes de referencia.** El research morfológico se basó en `orrery_sample_1.png`, `orrery_sample_2.png`, `orrery_sample_3.png` (positivas) y `wrong_not_wanted.png` (negativa), que estaban en `/srv/share/SUNDAY/ORRERY_SAMPLES/` del equipo Linux. **No están en el paquete.** Si se perdieron con el disco, el research conserva su análisis completo (tablas R1–R12 y W1–W12).



**Saltos de línea.** Las nueve copias exactas conservan los saltos de línea LF originales; cambiarlos alteraría el hash. Codex y Git las leen sin problema en Windows. Este traspaso y el script usan CRLF.



**Por qué los documentos normativos no vienen en el paquete.** El cowork sólo podía leerlos desde el Project de claude.ai como texto, y reescribirlos a mano arriesgaba alterarlos. Están en el repositorio desde octubre de 2026 (el Experience Model registra su contraste en el commit `3bd723b` y el Estado Base, en `8b8101a`) y también en el Project BTIPS, desde donde José puede descargarlos.



### 3.2 Documentos que Codex necesita y dónde están



**Estado** es el estado del documento; **Repo** indica si debería estar en el repositorio; **Project** es la ruta de respaldo en el Project BTIPS de claude.ai.



| # | Ruta en `docs\` | Estado | Repo | Project (respaldo) |

|---|---|---|---|---|

| A1 | `ANALYSIS\ORRERY\Orrery_Estado_Base_v1_0.md` | Índice (no normativo) | Sí | `ANALYSIS/ORRERY/Orrery_Estado_Base_v1_0.md` |

| A2 | `ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` | **Normativo** | Sí | ídem |

| A3 | `ANALYSIS\ORRERY\Orrery_Constitucion_v1_1.md` | **Normativo** (C-1..C-17) | Sí | ídem |

| A4 | `ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_v1_1.md` | **Normativo** (D-1..D-4) | Sí | ídem |

| A5 | `ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v1_0.md` | **Normativo** | Sí | ídem |

| B1 | `ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | Research vigente (aprobado como research el 2026-10-13) | En el paquete | ídem |

| B2 | `ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | Research, borrador para revisión de José | En el paquete | ídem |

| B3 | `ANALYSIS\ORRERY\VISUAL\escena_gris\index.html` | Escena de verificación técnica (evidencia, no diseño) | En el paquete | ídem |

| B4 | `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` | Research **vigente** de interacción (con DJ-I6..I9) | En el paquete | ídem |

| B5 | `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` | **Borrador para aprobación** de José | En el paquete | ídem |

| B6 | `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_1.md` | Histórica (reemplazada por v0.2) | En el paquete | ídem |

| C1 | `ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` | Evidencia aplicada (no normativa) | Sí | ídem |

| C2 | `ANALYSIS\ORRERY\EXPERIENCE\Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` | Acta de estado | **Sólo Project** | ídem |

| C3 | `ANALYSIS\ORRERY\Orrery_Experience_Model_Assignment_v0_1.md` | Acta (encargo del EM) | Sí | ídem |

| C4 | `ANALYSIS\ORRERY\LOCATION\ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` | Contrato de otro sistema (Location) | Sí | No está en el Project |

| C5 | `ANALYSIS\ORRERY\LOCATION\Orrery_LocationSnapshot_v0.md` | Contrato candidato (Location) | Sí | No está en el Project |

| C6 | `PALETTE\# 🎨 Bloom Color Palette.md` | Restricción de diseño | Sí | No está en el Project |

| C7 | `CONTROL\AGENDA_MAESTRA.md` (sección "Estado coordinado ORRERY / Location") | Control | Sí | No está en el Project |

| C8 | `MANDATE\GENESIS\Genesis_E2E_Correccion_B1_B2_y_Camino_Cloud_Gobernado_v1_0.md` | Dependencia del Genesis E2E | **Sólo Project** | `MANDATE/GENESIS/…` |

| C9 | `MANDATE\GENESIS\Genesis_Camino_Cloud_Gobernado_B3_B4_Diseno_v0_1.md` | Dependencia del Genesis E2E | **Sólo Project** | `MANDATE/GENESIS/…` |

| D1 | `ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_0.md` | **Histórico** | Sí | ídem |

| D2 | `ANALYSIS\ORRERY\Orrery_Constitucion_v1_0.md` | **Histórico** | Sí | ídem |

| D3 | `ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_D1_D2_D3_v1_0.md` | **Histórico** | Sí | ídem |

| D4 | `ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v0_1.md` | **Histórico** | Sí | ídem |

| D5 | `ANALYSIS\ORRERY\UI\Investigacion_Propuesta_Arquitectura_UIUX_Orrery_WorkspaceCore_v0_1.md` | **Histórico** (borrador con términos reemplazados, `Vocab/A-8`) | Sí | ídem |

| D6 | `ANALYSIS\ORRERY\UI\` (UI Contenedora v0.1 y v0.2, Gateway UX, Ledger Panel, LocationFirst v0.2, Integración UI v0.3, VisorMandatos, Verificación UI contenedora) | **Histórico**; se leen a través del Vocabulario vigente | Sí | `ANALYSIS/ORRERY/UI/…` |

| D7 | `ANALYSIS\ORRERY\UI\Spec_Implementacion_Integracion_Core_Orrery_v1_0.md` y `Cierre_Implementacion_IntegracionFormal_Core_Orrery_v1_0.md` | Implementación del prototipo; leer con D-4 | **Sólo Project** | `ANALYSIS/ORRERY/UI/…` |

| D8 | `ANALYSIS\GRAVITY\ORBITAL\Orrery_Research_Resultados_v0_1.md`, `Orrery_Research_Brief_Interfaz_Principal_v0_1.md`, `Glosario_Contexto_Cognituum_para_Cowork.md` | **Histórico** (septiembre de 2026) | Sí | `ANAYSIS/GRAVITY/ORBITAL/ORRERY/…` (en el Project la carpeta está escrita "ANAYSIS") |



**Lo que no hay que leer por ahora:** el código de `installer\conductor\workspace\core\orrery\`, que está congelado (R-5). Si hace falta contrastar algo físico, se pide autorización a José.



### 3.3 Verificación en Windows



Desde la raíz del repositorio, en PowerShell:



```powershell

powershell -ExecutionPolicy Bypass -File .\docs\ANALYSIS\ORRERY\Verificar_Archivos_Orrery.ps1

```



El script lista cada archivo de §3.2 como `OK` o `FALTA` y calcula el SHA-256 de las nueve copias exactas del paquete para compararlo con la tabla de §3.1. **No modifica nada.** Si falta un archivo marcado "Sólo Project", José lo descarga del Project BTIPS y lo coloca en la ruta indicada.



---



## 4. Orden de lectura



### Nivel 1 — Norma (leer completa, en este orden)



| Paso | Archivo | Qué buscar | Tiempo de lectura aproximado |

|---|---|---|---|

| 1 | `ANALYSIS\ORRERY\Orrery_Estado_Base_v1_0.md` | Qué documento manda en cada tema, qué está cerrado y abierto, restricciones y punto de partida autorizado de la fase visual (§9.1) | Corto |

| 2 | `ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` | Los términos (§2–§3), las cuatro cadenas (§4.1), conflictos A-x, F-x y D-T (§4.4–§4.6), orden normativo (§7) | Medio |

| 3 | `ANALYSIS\ORRERY\Orrery_Constitucion_v1_1.md` | Invariantes C-1..C-17. Para este frente pesan sobre todo C-2, C-7, C-8, C-9, C-10, C-15, C-16 y C-17 | Medio |

| 4 | `ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_v1_1.md` | D-1 (alcance), D-2 (Regímenes, Superficies como capas, modo foco, HUD), D-3 (navegar, anclar y capturar), D-3.b, D-4 (compatibilidad con Workspace Core) | Medio |

| 5 | `ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v1_0.md` | **El más importante para este frente.** §0 (decisiones DJ-1..DJ-11), §3 (fases E1–E11), §4 (indicación, Foco, Anchor, picking, accesibilidad), §5 (Lentes, combinación, cobertura, invariancia, criterios L1–L8), §6 (Gravity: cuatro estados), §10 (matriz fenómeno → acto), §11 (casos CT-01..CT-16) | Largo |



### Nivel 2 — Research de este frente (leer completo, en este orden)



| Paso | Archivo | Qué buscar |

|---|---|---|

| 6 | `ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | Primitivas espaciales, gramática (principios G-n), anti-patrones (AP-n), criterios K-n, contradicciones CR-1..CR-11. Base de todo lo visual |

| 7 | `ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | Inventario de dimensiones D-1..D-20, canales C1..C13, reserva de interacción RI-1..RI-5, tope de 2 Lentes (§8), O-1 (§8.4), requisitos N:M, *ninguno* frente a *desconocido* (§10), cámara CA-1..CA-3 (§11), resultados de la escena y fallas F-1..F-7 (§12), contradicciones X-1..X-6 (§13), preguntas Q-1..Q-10 (§14) |

| 8 | `ANALYSIS\ORRERY\VISUAL\escena_gris\index.html` | Abrirla en un navegador (§9 de este traspaso) y leer el comentario inicial del código |

| 9 | `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` | Mapa de las 28 preguntas (§3), contradicciones IX-C1..IX-C10 (§4), incertidumbres IX-U1..IX-U7 (§5), jerarquía de errores N1/N2/N3 (§5.2), modelo de estados y transiciones (§6), matriz de decisiones IX-D1..IX-D15 (§7), hallazgos HX-1..HX-18 (§9), cambios respecto de v0.1 (§11) |

| 10 | `ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` | **Borrador pendiente de aprobación.** Incompatibilidades I-1..I-13 (§2), condiciones (§4), tareas (§5), umbrales (§6), rúbrica (§7), hipótesis (§8), requisitos del prototipo PR-1..PR-15 (§11). Leer junto con §7.2 de este traspaso, que registra sus defectos conocidos |



### Nivel 3 — Consulta cuando haga falta



`EXPERIENCE\Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` (evidencia aplicada), `Orrery_Experience_Model_Assignment_v0_1.md`, `EXPERIENCE\Orrery_Actualizacion_Estado_Cowork_ExperienceModel_y_GenesisE2E_v1_0.md` (sólo en el Project), los contratos de Location (C4, C5), la paleta (C6) y la Agenda (C7).



### Nivel 4 — Histórico (no es autoridad)



D1–D8 de §3.2. Sólo se leen como historia y a través del Vocabulario vigente. **No recuperan autoridad por conveniencia** (Estado Base §3).



---



## 5. Conceptos que hay que tener claros antes de seguir



| Concepto | Definición operativa | Fuente |

|---|---|---|

| **Territorio / Espacio** | El Territorio es el *dónde* (Entidades y Relaciones). El Espacio es su representación navegable | Vocab §2.1, §2.2 |

| **Lente** | Mecanismo que lee una Proyección referida a Entidades y produce Anotaciones. No es información, no persiste, no decide relevancia | Vocab §2.7; C-7 |

| **Proyección P-*** | Lectura derivada de una Fuente, organizada por Entidad. Ocho: P-W1 (trabajo situado), P-W2 (resultados), P-W3 (propuestas), P-G1 (criterio por nivel), P-G2 (efectos de Gravity sobre trabajo), P-A1 (Atención), P-L1 (resolución de Location), P-I1 (Impact) | EM §5.2 |

| **Anotación** | Lo que una Lente dibuja sobre una Entidad. Nunca es Entidad ni lleva significado propio | Vocab §3.2; C-8 |

| **Indicación** | Lo que coloquialmente se llama "hover". Fenómeno efímero **sin estatus normativo**. Muestra exactamente el contenido de EM §4.4 (nombre, tipo, Procedencia, verificación, simulación y **recuento por Lente**), "y nada más". No ofrece actos | DJ-5; EM §4.1, §4.4 |

| **Foco** | Término normativo: atención efímera de navegación. Determina hacia dónde va la cámara y de qué habla la Superficie. **No significa "elegir una lectura"** | Vocab §2.10; DJ-8 |

| **Selección de lecturas** | **Nombre provisional de investigación**, sin valor normativo, para el conjunto de Lentes activas y cuáles son visibles. Es estado de vista del cliente | DJ-I1; EM §4.5, §5.3.4 |

| **Anchor** | Entidad elegida deliberadamente como punto desde el cual se decide o actúa. Entra en la Captura | Vocab §2.11; C-10 |

| **Superficie de Workspace Core** | Donde se comprende en detalle y se actúa. Su sujeto sigue al Foco | Vocab §2.8; D-2 |

| **Capa O** | Capa permanente de orientación: Contexto, Foco, Anchors, inventario de Lentes y convocatorias de Atención | EM §3.2, §5.3.2 |

| **Cobertura** | Por Lente y por Entidad: *con filas*, ***ninguno*** (evaluado, cobertura declarada, sin filas) o ***desconocido*** (no cubierto, no evaluado o Fuente no disponible). La ausencia de marca sólo vale *ninguno* con cobertura declarada | DJ-7; EM §5.6 |

| **"Activa sin datos"** | Estado de la Lente, no un valor por Entidad: no hay Fuente o Proyección disponible, y todas las Entidades quedan en *desconocido* | DJ-I6 |

| **Gravity: cuatro estados** | *ninguno*, confirmada, indecidible y *desconocido*. Hoy, para todo Mandate Genesis, el único estado verdadero es *desconocido* | C-16; EM §6.3, CT-04 |

| **Canales C1..C13** | Tipos de canal perceptual con un único significado en toda la vista. C4, C5 y C6 están reservados para la interacción | CB §5, §7.2 |

| **Tope de Lentes** | Hipótesis: **2 visibles a la vez** (Lente A por ranura, Lente B por giro). Si la B no se reconoce sin aprendizaje (Q-1), el tope efectivo es 1 + 1 relacional | CB §8 |

| **O-1** | Hipótesis: una Lente que excede el tope sigue activa, no se dibuja y la capa O lo dice | CB §8.4 |

| **[FN]** | Condición experimental fuera de norma. Sólo en el bloque exploratorio | DJ-I7 |

| **N1 / N2 / N3** | Gravedad de errores en las pruebas: N1, interpretación falsa del estado o de la cobertura; N2, atribución, contexto y control; N3, eficiencia y preferencia | DJ-I8 |

| **m1 / m3** | Orientación de la cámara al enfocar: m1, movimiento mínimo; m3, reencuadre. m0 (fija) sólo como [FN] | DJ-I9 |



---



## 6. Qué se hizo y dónde quedó exactamente



### 6.1 Cronología del frente



| Fecha | Hecho | Resultado | Estado |

|---|---|---|---|

| 2026-10-10 / 11 | Otro cowork consolida la norma: Vocabulario v1.1, Constitución v1.1, Decisiones v1.1 y Experience Model v1.0 | Fase conceptual cerrada (Estado Base §9) | Normativo |

| 2026-10-11 / 13 | Encargo "Orrery Morphological / Spatial Language Research v0.1" (en `ENCARGOS\`). José aprobó el corpus y la consulta web | `VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | **Aprobado por José como research vigente, no normativo** (2026-10-13) |

| 2026-10-13 | Encargo "Channel Budget & Interaction Reservation v0.1" (en `ENCARGOS\`), con las decisiones DJ-CR1..4 y DP-a..f. Exigencia de José: la escena debía demostrar que todos los estados se distinguen sin color | `VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` y `VISUAL\escena_gris\index.html`, verificada con capturas automáticas en Chromium y una medición de croma (máximo 0) | Borrador para revisión. **Pendientes de José: X-3, X-6 y Q-1..Q-10** |

| 2026-10-13 | Falla el disco del equipo Linux. Se intenta recuperar los archivos en la Mac (`docs\recuperados\orrery\primitivas-gramatica-espacial\`), pero la Mac no estaba vinculada a la sesión | Los tres archivos se le enviaron a José como adjuntos. **La copia en `docs\recuperados\` nunca se escribió** | — |

| 2026-10-15 | Explicaciones a José sobre qué es una Lente y cómo se enciende (sin documento) | — | — |

| 2026-10-16 | Guía de investigación "Lente · Foco · Hover v0.1" (en `ENCARGOS\`). Fases 1 y 2 | `INTERACTION\…_v0_1.md`: mapa de preguntas, contradicciones, incertidumbres, modelo de estados y matriz. Decisiones DJ-I1..I5 | Histórica (reemplazada) |

| 2026-10-16 | José aprueba DJ-I6..I9 | `INTERACTION\…_v0_2.md` (archivo nuevo, sin tocar la v0.1) y `INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` | v0.2 vigente; protocolo: **borrador** |

| 2026-10-16 / 17 | José pide, sin modificar archivos, una síntesis trazable del protocolo para decidir qué aprobar | Síntesis entregada por chat. **Su contenido no está en ningún archivo: se registra en §7.2 de este traspaso** | Pendiente de decisión de José |

| 2026-10-17 | José decide continuar en Codex sobre Windows | Este traspaso | — |



### 6.2 El punto exacto



**Fase:** 3 de 6 de la guía de investigación ("Comparar"). Las fases 1 y 2 están cerradas (IX v0.2).



**Último estado:** el protocolo experimental v0.1 es un **borrador**. José revisó la síntesis de §7.2 y **todavía no aprobó** §0 del protocolo, que comprende:

- los tratamientos de las incompatibilidades I-1..I-13;

- las condiciones;

- las tareas;

- los umbrales;

- la rúbrica;

- las hipótesis.



**No existe todavía:** el protocolo v0.2, el prototipo comparativo, el piloto ni ninguna sesión con personas. **No hay evidencia humana sobre Orrery** (CB §12.5; IX v0.2 HX-15).



**La próxima acción le corresponde a José, no a Codex:** decidir qué tratamientos, umbrales e hipótesis aprueba y definir los participantes (cuántos, perfil, una o dos sesiones). Hasta entonces, Codex sólo puede leer, responder preguntas y preparar propuestas que José pida.



**Secuencia prevista después de esa decisión** (cada paso requiere el anterior aprobado):

1. Protocolo v0.2 como **archivo nuevo**, con las decisiones de José y la corrección de los defectos de §7.2.

2. Aprobación de José del protocolo v0.2, incluidos los umbrales.

3. Prototipo comparativo como **archivo nuevo**: `ANALYSIS\ORRERY\INTERACTION\prototipo_comparativo\index.html`, que puede partir de una **copia** de la escena gris (el original no se toca), según los requisitos PR-1..PR-15 del protocolo.

4. Verificación técnica del prototipo (sin color, registro completo, transiciones del modelo de estados). **No es evidencia de comprensión.**

5. Territorios isomorfos con sus respuestas correctas y el guion de moderación.

6. Piloto con 1 o 2 personas (datos excluidos). Cualquier cambio queda registrado antes de las sesiones principales.

7. Sesiones, moderadas por José.

8. Análisis descriptivo e informe; después, recomendación (fase 5). La fase 6, transferir a la norma, sólo ocurre con aprobación expresa y por versiones nuevas.



---



## 7. Lo que está abierto



### 7.1 Decisiones que José tiene que tomar ahora (bloquean el protocolo v0.2)



| # | Decisión | Dónde está el detalle |

|---|---|---|

| 1 | Qué tratamientos de I-1..I-13 aprueba. Los que afectan la validez y deben resolverse antes de las sesiones: I-1, I-2, I-4 (base común de cámara), I-5, I-7, I-8, I-9 e I-12; I-13 es obligatorio por C-2. Los que pueden quedar pendientes: I-3, I-6, I-10 e I-11 | Protocolo §2; §7.2 de este traspaso |

| 2 | Qué umbrales aprueba, incluida la tolerancia de errores N1: **0 o 5%** | Protocolo §6; §7.2 |

| 3 | Qué hipótesis aprueba, en particular H-m1 con sus refutaciones r1–r4 | Protocolo §8 |

| 4 | Participantes: número, perfil y si son dos sesiones por persona | Protocolo §3, I-10 |



### 7.2 Defectos y debilidades conocidos del protocolo v0.1 (síntesis del 2026-10-16/17)



El protocolo v0.2 debe corregirlos o decirlos expresamente. **No están corregidos en el archivo v0.1**, por pedido de José de no modificarlo.



| # | Defecto o debilidad | Detalle | Qué debería pasar en la v0.2 |

|---|---|---|---|

| P-1 | **Los valores numéricos de los umbrales no tienen fundamento documental** | Que algo sea N1 o N2 está fundamentado (C-2, C-16, EM §5.4.2, C-17, DJ-I8). Pero 5%, 80%, 90%, "5 de 6", 10 puntos y 20% son propuestas del cowork, sin literatura citada | Marcarlos como criterios propuestos, sin fundamento, y que José los apruebe uno por uno |

| P-2 | **U-N2c y U-N2d dan el mismo corte** | Con 12 ensayos, 90% y 85% resultan ambos en "11 de 12" | Elegir uno de los dos o cambiar el número de ensayos |

| P-3 | **El denominador de U-N1b no está fijado** | Depende de cuántas Entidades con trabajo tenga cada Territorio, y eso todavía no está definido | Fijarlo al definir los Territorios, antes de aprobar el protocolo |

| P-4 | **Granularidad** | Con 12 ensayos por condición, cada ensayo vale 8,3 puntos: el margen de 10 puntos son 2 ensayos | Decirlo en el protocolo; considerar más ensayos por persona |

| P-5 | **H-m1 tiene poca base** | Descansa en 12 observaciones por condición. Los parámetros de m1 y m3 (margen seguro del 10% de la vista, marca al 15% de la altura, transición de 400 ms) son hipótesis sin fuente. r4 combina una prueba estática que no depende de la condición | Declarar los parámetros como [HIP] fijados antes del piloto; aclarar que la prueba estática sólo dice si `CB/F-1` existe |

| P-6 | **Cámara fuera de los bloques comparados, arbitraria** | B1 y B4 usan N-M3 y B6 usa N-M1, sin justificación | Unificar una sola orientación en todos los bloques que no comparan cámaras |

| P-7 | **I-8 tiene fundamento débil** | Tratar la leyenda del inventario como parte de la interfaz y no como explicación es una interpretación del cowork | Que José lo decida explícitamente |

| P-8 | **El perfil de participantes no está documentado** | "Experiencia técnica" fue una inferencia del cowork | Que José defina el perfil |

| P-9 | **La duración es estimada** | Los 95 minutos no se midieron | Medirla en el piloto |

| P-10 | **Q-1 se mide con una sola pregunta** por persona | No permite cerrar Q-1 de forma definitiva | Decirlo; Q-1 puede necesitar una prueba perceptual propia |



**Qué permite y qué no un estudio de 5–6 personas** (síntesis aprobada como enfoque, no como resultado):

- **Permite:** detectar problemas de comprensión graves y repetidos; ver si una condición falla claramente un criterio fijado de antemano; ver diferencias grandes y consistentes; observar comportamientos espontáneos.

- **No permite:** validación estadística ni generalización; detectar diferencias chicas (menos de 2 ensayos); estimar frecuencias de error; cerrar Q-1 de forma definitiva; comparaciones entre grupos (por eso E-3 se difiere); juzgar si la norma está bien o mal (DJ-I7).



### 7.3 Abiertos que no bloquean el protocolo



| Grupo | Ítems | Dónde |

|---|---|---|

| Interacción | IX-C2 / IX-D10 (reformular `CB/X-3` y `CB/X-6`, cuyas opciones de "indicación" quedan fuera de EM §4.4); IX-C6 / IX-D5 (promoción automática al desactivar); IX-C7 / IX-D7 (¿puede no haber Foco?); IX-C8 / IX-D13 (¿qué oculta el modo foco?); IX-D1 (nombre definitivo, A-3); IX-D12 (política de cámara `CB/Q-5`); IX-D2, D4, D9, D14 y D15 (se cierran con evidencia) | IX v0.2 §4, §7 |

| Presupuesto de canales | X-3 (Procedencia por Anotación), X-6 (estado de Trabajo), Q-1..Q-10, límites F-1, F-2 y F-3 | CB §12.4, §13, §14 |

| Norma y sistema | EM-C01 (recorrido de Gravity desconectado), EM-C04 (Postulate y "Declarar" indeterminados), EM-C06 (dueño de la señal de Atención), A-4 (Source Authority Profile V1), RI-G12; dependencias del Genesis E2E | Estado Base §6, §7; EM §13, §15 |

| Morfología | Contradicciones CR-1..CR-11 y preguntas PA-1..PA-13 | Research morfológico §16 y §17 |



---



## 8. Decisiones de José registradas en este frente



Ninguna es norma, salvo las que el Estado Base declara normativas.



| ID | Qué decide (resumen; el texto literal está en la fuente) | Fuente |

|---|---|---|

| V-Q1..V-Q13, C-1..C-17, D-1..D-4, DJ-1..DJ-11 | Normativas (consolidación conceptual) | Estado Base §5 |

| DJ-CR1 | La contención sólo para árboles con Fuente; Domain↔Gene (N:M) necesita otro dispositivo | CB, cabecera |

| DJ-CR2 | "Dos Lentes no comparten el mismo canal" se lee como distinto **tipo** de canal; hace falta un tope explícito | CB, cabecera |

| DJ-CR3 | No hay movimiento en reposo (no se trasladan las animaciones del onboarding) | CB, cabecera |

| DJ-CR4 | Paleta actual, sin extensión | CB, cabecera |

| DP-a..DP-f | No versionar el EM por el ejemplo de §4.3.1; tope de **visibilidad** y no de activación; el acento no se usa para la interacción; reportar el tope tal cual; N:M en la Superficie; la escena vive en `docs\` y debe demostrar todo sin color | CB, cabecera |

| DJ-I1 | "Selección de lecturas" sólo como nombre provisional de investigación | IX v0.2, cabecera |

| DJ-I2 | El recuento por Lente de EM §4.4 es la referencia; el estado por Lente (V-EST) es una variante experimental | IX v0.2 |

| DJ-I3 | Archivos nuevos; fuentes y escena gris intactas; trazabilidad | IX v0.2 |

| DJ-I4 | No cerrar el protocolo ni construir el prototipo sin revisión | IX v0.2 |

| DJ-I5 | Ninguna recomendación se vuelve norma sin aprobación explícita | IX v0.2 |

| DJ-I6 | "Activa sin datos" es un estado de la Lente: sin Fuente o Proyección, todo queda *desconocido*. Evaluado, con cobertura declarada y sin filas, es *ninguno*. **Sin "no aplica"**. P-G2 respeta la cobertura que declare la Fuente | IX v0.2 |

| DJ-I7 | Las condiciones [FN] van sólo en un bloque exploratorio separado; V-EST es [FN]; ningún resultado autoriza un cambio normativo | IX v0.2 |

| DJ-I8 | Jerarquía N1/N2/N3; los errores de control van en N2 salvo que produzcan una interpretación falsa del estado (N1); clasificación por creencia expresada; dominancia; umbrales fijados antes de las sesiones | IX v0.2 |

| DJ-I9 | Comparar m1 y m3; m0 sólo [FN]; m2 fuera de la primera ronda; m1 como hipótesis con refutaciones fijadas de antemano; medir continuidad, Foco y Foco frente a Anchor, incluido `CB/F-1` | IX v0.2 |

| (sin ID) | José reafirmó el 2026-10-16/17 que la v0.1 original y las fuentes normativas quedan intactas, y que IX v0.2 y el protocolo son documentos de investigación, no autorizaciones para modificar la norma ni para implementar | Mensaje de José; registrado aquí |



---



## 9. La escena gris



- **Qué es:** evidencia técnica, no diseño. Las siluetas, texturas y adjuntos son marcas de prueba arbitrarias que materializan los **tipos** de canal del presupuesto. Los datos son sintéticos, con semilla fija. No usa código de `installer\` (D-4).

- **Cómo abrirla en Windows:** doble clic en `docs\ANALYSIS\ORRERY\VISUAL\escena_gris\index.html` (Edge o Chrome). Necesita internet, porque carga PlayCanvas 2.22.1 desde `cdn.jsdelivr.net`.

- **Controles:** arrastrar orbita; la rueda hace zoom; clic pone el Foco; Tab mueve la indicación por teclado; Enter pone el Foco; A ancla o desancla; Esc quita el Foco.

- **Parámetros de URL** (agregarlos después de `index.html?`): `T=T1|T2|T3|T4`, `N=N0..N3`, `V=3d|top|split`, `cat=1|2` (catálogo de estados), `focus=<id>`, `anchor=<id>`, `ind=<id>`, `lenses=P-W1,P-G2,…`, `nm=1` (prueba N:M), `dim=1`, `ctx=0` (Contexto no confirmado), `eval=1` (contraste T4), `rl=1` (falla F-6), `gray=1`, `dist=<factor>`. Configuraciones citadas en CB §12.6.

- **Comportamientos de la escena que NO son norma:**

  - La etiqueta de indicación muestra el **estado** de las Lentes no visibles en lugar del **recuento** (IX-C2; es V-EST, [FN]).

  - Tab recorre todas las marcas y no distingue el recorrido de candidatos (IX-C9).

  - Esc deja la escena "sin Foco", un estado que la norma no define (IX-C7).

  - El prototipo comparativo debe corregir las tres cosas.

- **No se modifica.** El prototipo comparativo es un archivo nuevo (PR-1).



---



## 10. Errores que Codex no debe cometer



1. Usar "Foco" para referirse a elegir una lectura. Foco es otra cosa (Vocab §2.10).

2. Tratar O-1, el tope de 2 Lentes, V-EST, los umbrales del protocolo o los parámetros de m1 y m3 como aprobados o normativos.

3. Tratar una ausencia de marca como *ninguno* sin cobertura declarada (DJ-7, DJ-I6). En Gravity, hoy todo es *desconocido*.

4. Agregar "no aplica" como valor por Entidad (DJ-I6).

5. Dar a la indicación más contenido que el de EM §4.4 en el bloque normativo.

6. Mezclar resultados [FN] con los normativos o usarlos para justificar un cambio de norma (DJ-I7).

7. Sobrescribir un documento existente en lugar de crear una versión nueva.

8. Modificar la escena gris o el código de `installer\conductor\workspace\core\orrery\`.

9. Presentar los resultados de 5–6 personas como validación estadística.

10. Completar por inferencia algo que la documentación no fundamenta. Hay que decirlo.

11. Tomar el ejemplo de EM §4.3.1 ("Gene ⊂ Domain ⊂ Project") como aplicable: DJ-CR1 lo vuelve inaplicable (`CB/X-1`).

12. Hacer commits o push.



---



## 11. Primer mensaje sugerido para Codex



Copiar y pegar en Codex, con el repositorio abierto en `C:\repos\bloom-development-extension`:



```text

Vas a continuar el frente Orrery del proyecto Cognituum exactamente donde quedó.



1. Leé completo docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Estado_y_Orden_de_Lectura_v1_0.md

   y AGENTS.md en la raíz del repositorio. AGENTS.md manda sobre el traspaso en reglas de trabajo.

2. Ejecutá docs\ANALYSIS\ORRERY\Verificar_Archivos_Orrery.ps1 y decime qué archivos faltan

   y si algún hash no coincide. No modifiques nada.

3. Leé completos, en el orden de §4 del traspaso, los niveles 1 y 2.

4. Confirmame en qué punto exacto está el trabajo (§6.2) y qué decisiones me corresponden (§7.1),

   citando las fuentes. No avances a la fase siguiente ni crees archivos hasta que yo apruebe.



Reglas: no modifiques documentos existentes (las versiones nuevas son archivos nuevos);

no toques la escena gris ni el código de Orrery; no hagas git; si algo no está

fundamentado en la documentación vigente, decilo en lugar de completarlo.

```



---



*Fin del traspaso. Documento índice, no normativo. Ante divergencia, manda el documento fuente.*
