# Programa de documentación — Documento madre v0.7

**Estado:** documento madre del programa. Relevamiento y mapa de opciones. **No autoriza implementación ni toma decisiones de modelo.**
**Fecha:** 2026-11-07
**Autoridad:** José Vigil
**Ubicación:** `docs/ANALYSIS/BSIP/DOC/` en el repo (la ruta que fijó José).
**Reemplaza a:** `Programa_Documentacion_Documento_Madre_v0_6.md` (2026-11-05). v0.1 a v0.6 se conservan como versiones históricas y no se editan.
**Anexos:**
- `Programa_Documentacion_Registro_Documental_Mapa_Decision_v0_1.md` (mapa para decidir el registro documental).
- `Programa_Documentacion_Politica_Doc_por_Intent_Relevamiento_v0_1.md` (política de documentación por intent y responsabilidad de Impact; en adelante **PD**).
- `Programa_Documentacion_Plan_Ejecucion_v0_2.md` (plan de ejecución; en adelante **PE**). La v0.1 queda como histórica.
- `TRASPASOS/Traspaso_E0_Cancelada_v1_0.md`.
- Pedidos: `Programa_Documentacion_Encargo_Brain_Tramo1_v0_1.md`, `Programa_Documentacion_Pedido_MANDATE_Contrato_v0_1.md` y `Programa_Documentacion_Pedido_Impact_Colisiones_v0_1.md`.

**Cambios respecto de v0.6:**
- Se registran DJ-27 (cancelar E0; no se mide `dev` como condición previa) y DJ-28 (el sistema lanza `doc` después de cada intent, de cualquier tipo).
- P37 queda respondida en parte por DJ-28. Lo que falta pasa a P37-bis.
- Se cierran P42 (Project de prueba) y P44 (traspasos). P43 queda respondida para las pruebas, pero falta la forma permanente.
- Se agrega I-60 (dos ubicaciones de los archivos del programa) y se registran los hallazgos H-1 a H-5 del traspaso de E0.
- §19 se actualiza al plan v0.2.

**Cambios de v0.6 respecto de v0.5 (se conservan):**
- Se registran las respuestas de José a P34, P34-bis y P38 (DJ-23 a DJ-25), y se cierran esas tres preguntas.
- Con DJ-24 se cierra I-58, el choque interno de la política.
- P35 se deriva a MANDATE: José no la decide (DJ-26). La pregunta va en el pedido a MANDATE.
- P36, P37 y P39 siguen abiertas: José dejó sus opciones sin completar.
- Se agregan I-59 y las preguntas P40 a P46. P40 y P41 salen de las respuestas de José; P42 a P46, del plan de ejecución.
- Nueva §19: referencia al plan de ejecución.

**Nota sobre P34:** el mensaje de José trae una nota que dice que P34 "es la única que respondí en tu nombre sin que lo dijeras con esas palabras" y que se cambie antes de enviar si se quiere que el `doc` revise el Project entero. Como José envió el mensaje con esa respuesta, este documento la toma como decisión suya (DJ-23). Si no lo es, alcanza con reabrir P34; afecta a DJ-23, a T1.9 del encargo de Brain y a la compuerta G2 del plan.

**Cambios de v0.5 respecto de v0.4 (se conservan):**
- Se registra la política de documentación por intent como DJ-17 a DJ-22. Según José, está por encima de las decisiones anteriores.
- DJ-3 y DJ-15 se reordenan bajo esa política (§3). P31 a P33 se reformulan (§16).
- Se agregan las inconsistencias I-52 a I-58 (§12.3), entre ellas un choque interno de la política (I-58).
- Se agregan las preguntas P34 a P39. P34, el alcance de cada doc, quedó sin completar en el mensaje de José.
- Nueva §18: resumen del relevamiento de la política. El detalle está en el anexo PD.

**Cambios de v0.4 respecto de v0.3 (se conservan):**
- Se registran las respuestas de José a P19, P20 y P26, y un dato de diseño (DJ-13 a DJ-16).
- Se cierran P19, P20 y P26.
- Se agregan las inconsistencias I-50 (tiempo real frente a "al terminar un `dev`") e I-51 (orden de `doc` y `dev` en el Mandate v4).
- Se agregan las preguntas P27 a P33, que se desarrollan en el anexo.

**Cambios de v0.3 respecto de v0.2 (se conservan):**

**Cambios respecto de v0.2:**
- Se incorporan los dos insumos que faltaban: la respuesta de Genes sobre documentos compartidos, renombres y digests (en adelante **RG**) y el mensaje de José con los requisitos de `doc` (en adelante **MJ**). El contraste está en §0.
- P17 cerrada: la actualización viva reemplaza la exclusión de DJ-3. Las corridas disparadas por cambios entran al programa (DJ-12).
- Los requisitos de §4.1 se completan con lo que dice MJ: integridad en tiempo real y "el sistema tiene que saber todo".
- Se desarrollan las tres opciones de identidad que cumplen el requisito de renombres, con un ejemplo concreto cada una (§5.4). No se elige entre ellas.
- Se agregan la desconexión D-17 (validez de un documento compartido entre Genes, RG §2), la inconsistencia I-49 y las preguntas P25 y P26.

**Cambios de v0.2 respecto de v0.1 (se conservan):**
- El eje del programa pasa a ser la **actualización viva** y la **identidad documental**. En v0.1 eran fases finales (F5 y F6).
- Se corrige el alcance: el `docs/` del repositorio queda fuera del sistema.
- Se incorporan cuatro mapas nuevos: opciones de identidad documental (§5), detección de cambios y movimientos (§6), paridad entre `doc` y `dev` (§7) y fuentes de la nomenclatura (§8).
- Se incorporan el relevamiento de vinculación (`ANALYSIS/DOC/Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md`, en adelante **RV**) y la respuesta de Nucleus sobre Organization, Project, Repository e instalación (en adelante **RN**).
- Se asigna numeración definitiva a las inconsistencias N-01 a N-18 de RV (I-26 a I-43) y se agregan cinco nuevas (I-44 a I-48).

**Insumos:** RV, RN, RG y MJ. En v0.2, lo que se decía de Genes salía del contrato G1, del concepto v3 y del código del store. En §0 se contrasta contra RG.

### Marcas

| Marca | Significado |
|---|---|
| **IMPL** | Implementado (código citado) |
| **ESPEC** | Especificado en norma o contrato, sin código |
| **PROP** | Propuesto: research, ADR candidato, maqueta, documento no normativo |
| **NO EXISTE** | Ausencia comprobada en lo revisado |
| **LAGUNA** | No definido; se indica el dueño probable |
| **REAL** | Dato observado en una instalación de Darwin (tomado de RV) |

### Límites de la evidencia

- El código se leyó copiado desde el checkout de Darwin, sin shell ni Git. Las búsquedas negativas cubren lo copiado: `brain/{cli, commands, core, shared}`, `src/` de la extensión y los paquetes de `installer/nucleus` de authority, governance, core, gene, gravity, mandate*, orchestration, supervisor y tools.
- El estado operativo real se toma de RV. Esta sesión no lo leyó.
- Cuando dos fuentes chocan se muestran las dos y no se elige.

---

## 0. Contraste de v0.2 con RG y MJ

**Resultado:** ningún insumo contradice a v0.2. RG confirma lo que v0.2 decía de Genes y agrega tres cosas: no hay propagación de validez entre Genes, no hay watcher de bytes compartidos y no hay plan de unificar formatos de digest. MJ agrega dos matices a los requisitos.

| Afirmación de v0.2 | Qué dice el insumo | Resultado |
|---|---|---|
| El `asset_id` deriva de Project + Repository + ruta, sin `gene_id` (§5.1, X-4) | RG §1: "`project_id + repository_id + repository_relative_path`… no incluye `gene_id`" (G1 §4; `assets.go:49`) | Coincide |
| Un activo en varios Genes: técnicamente posible, sin regla (I-43) | RG §1: "No existe una política explícita. Está abierto"; el store no controla exclusividad | Coincide. Se actualiza I-43 |
| — (v0.2 no lo trataba) | RG §2: la KD se define por Gene y Revision; `document_requires_update` exige una Contribution para "ese mismo Gene"; no hay regla de propagación hacia otros Genes que referencien el mismo activo; no hay watcher que detecte cambios en bytes compartidos | **Nuevo.** Se registra como D-17 y P25 |
| Mover o renombrar produce otro `asset_id`; la Revision anterior conserva el activo viejo; no hay alias (§5.1) | RG §3: "cambiar Repository o ruta produce un `asset_id` nuevo, aunque los bytes sean idénticos"; hace falta una Contribution y una Revision nuevas; no existen identidad independiente de la ruta, operación de rename/move, alias ni registro de continuidad | Coincide |
| El `sha256` identifica versiones; un renombre sin edición coincidiría, pero eso sería inferencia (O2) | RG §3: "El SHA-256 del contenido puede demostrar igualdad de bytes, pero no continuidad de identidad" | Coincide |
| O2, columna Brain: "unificar formato (I-32)" | RG §4: Genes usa solo `sha256:<64 hex>`; no reconoce el hex sin prefijo como equivalente; "una normalización entre subsistemas requeriría una decisión de interoperabilidad nueva; no está prevista" | **Corrección de v0.2:** la unificación no es una tarea de Brain. Es una decisión de interoperabilidad entre sistemas que no está prevista. Se corrige O2 y se registra I-49 |
| Alcance: el `docs/` del repo queda fuera (§2, DJ-10) | MJ: es "una carpeta hecha a mano y con documentos que nada tienen que ver con el sistema"; "la documentación tiene que ver con los grafos que te compartí" | Coincide |
| R-1 a R-5 (§4.1) | MJ: la documentación tiene que "responder a los permanentes cambios"; hay que reajustar "no solo el contenido… sino la integridad de los archivos actualizados **en tiempo real**"; sobre la identidad: "El sistema tiene que saber todo" | Se agregan como R-6 y R-7. MJ no asigna a quién le toca la identidad (a `doc` o a Genes) |

---

## 1. Objetivo

`doc` debe convertirse en un **intent de actualización viva**: mantener al día el contenido y la integridad de la documentación del sistema, con una capacidad comparable a la de `dev` en tareas complejas. Como mínimo, tiene que reconocer que un documento movido o renombrado sigue siendo el mismo documento. Todo eso, alineado con Project, Domain y Gene y con la cadena Orrery → Location → (ASM/Postulate) → Mandate → Intents.

## 2. Alcance del sistema documental (corrección de José, 2026-11-03)

- **Dentro del sistema:**
  - la documentación que describen los árboles de Project y de Nucleus (`tree/bloom/truth/*`, con las maquetas y la descripción DESC como antecedentes);
  - la que produce el Intent `doc`.
- **Fuera del sistema:** el `docs/` de este repositorio. Son notas de trabajo hechas a mano. Con esto queda **cerrada la pregunta 3 de RV** (§3): los documentos de la plataforma no entran al grafo.
- **Requisito:** el sistema debe tener un mecanismo que identifique cualquier archivo de documentación propio. La nomenclatura actual puede rehacerse si hace falta (§8).
- **Repository de usuario:** la documentación que el sistema no produjo (README, `docs/` de un proyecto del Paladín) queda fuera del programa en esta etapa (DJ-14).

## 3. Decisiones vigentes de José

| # | Decisión | Estado |
|---|---|---|
| DJ-1 | `doc` documenta Gene, Domain y Project, con el alcance como campo de la entrada. Hoy solo Project es alcanzable | Vigente |
| DJ-2 | La salida es un borrador, diseñada para entrar después a una Contribution con activo `document` | Vigente |
| DJ-3 | Corre a mano por CLI en las fases de reparación y como Action del Mandate después. "Quedan fuera las corridas disparadas por un cambio material" | **Reemplazada en su exclusión por DJ-12** (P17, 2026-11-04). **Bajo DJ-17 (2026-11-05):** la parte de CLI no choca con la política; la parte "Action del Mandate" choca con el v4, que firma un solo `doc` (I-53). Queda abierto si un intent manual también deja su doc (P37) |
| DJ-4 | Quién persiste el archivo final es una dependencia externa (Composition §6.2) | Vigente |
| DJ-5 | El alcance `gene` referencia el `gene_id` del store | Vigente |
| DJ-6 | Postulate: se registran las dos versiones, sin elegir | Vigente |
| DJ-7 | Piloto: P-A primero, P-B después, con consulta antes de escribir código | Vigente; ver §14 |
| DJ-8 | Arreglar `doc` o crear una lógica nueva: pregunta abierta | Vigente; ver §15 |
| DJ-9 | Estado operativo: no autorizado en esta sesión | Vigente. RV lo leyó con permiso en su propia sesión |
| DJ-10 | El `docs/` del repo queda fuera del sistema (§2) | Nueva |
| DJ-11 | `doc` es un intent de actualización viva y esa es la prioridad del programa; tiene que ser tan capaz como `dev`, mantener contenido e integridad y reconocer movimientos y renombres | Vigente (v0.2) |
| DJ-12 | "La actualización viva reemplaza la exclusión anterior. Las corridas disparadas por cambios entran al programa" (respuesta a P17) | Vigente (2026-11-04) |
| DJ-13 | Respuesta a P19: el registro gobernado aparte (O4) es la base, para todos los niveles. La continuidad declarada en la Contribution (O5), solo para documentos que sean activos de un Gene y en una etapa posterior. El digest es evidencia de integridad, no identidad. Se descarta el id dentro del archivo (O3) | Nueva (2026-11-04) |
| DJ-14 | Respuesta a P20: la documentación de un Repository que el sistema no produjo queda fuera del programa en esta etapa; no se diseña incorporación | Nueva (2026-11-04) |
| DJ-15 | Respuesta a P26: el disparo es al terminar un `dev` | **Queda como caso particular de DJ-17** (2026-11-05): después de un `dev` corre un doc, igual que después de cualquier intent. Sigue en tensión con R-6 (I-50) |
| DJ-16 | Los movimientos de documentos los hace el propio sistema. Un movimiento sin pasar por el sistema es una anomalía pendiente de declaración y nunca se resuelve por parecido de contenido | Vigente (2026-11-04) |
| **DJ-17** | **Política:** "Cada intent, de cualquier tipo, deja detrás un intent doc que sanea todo lo que ese intent hizo." Está por encima de las decisiones anteriores. El costo en tokens se acepta | Vigente (2026-11-05). El choque con DJ-18 (I-58) queda cerrado por DJ-24: el `doc` está fuera de la regla |
| DJ-18 | "Un doc no dispara otro doc." | Nueva (2026-11-05) |
| DJ-19 | "Si un intent falla o se cancela, no corre su doc: el intent se vuelve a correr hasta que termina su trabajo." | Nueva (2026-11-05). En tensión con el reintento de Temporal y EM-C12 (I-52) y con la falta de evidencia de éxito de `dev` y `doc` (I-55) |
| DJ-20 | "El Mandate espera a que termine el doc antes del próximo intent." | Nueva (2026-11-05). Choca con el v4 firmado (I-53) |
| DJ-21 | "El Mandate corre de forma unívoca. Hoy los intents no corren en paralelo." | Nueva (2026-11-05). En tensión con el código (I-54) |
| DJ-22 | Si un día los intents corren en paralelo, Impact verifica las colisiones de escritura entre documentaciones | Vigente (2026-11-05). Ver I-56 y PD §5. Pedido R-I1 |
| DJ-23 | Respuesta a P34: "cada doc documenta solo lo que cambió el intent anterior" | Nueva (2026-11-05). Ver la nota de la cabecera y la tensión con R-7 y DJ-16 (I-59) |
| DJ-24 | Respuesta a P34-bis: "el doc queda fuera de la regla 'cada intent deja un doc'. Un doc no dispara otro" | Nueva (2026-11-05). Cierra I-58 |
| DJ-25 | Respuesta a P38: "el doc de un exp corre igual. Si el exp no cambió nada, no tiene nada que sanear" | Nueva (2026-11-05) |
| DJ-26 | Sobre P35: "no la decido yo". Se le pregunta a MANDATE, con las dos opciones (Action firmada del contrato o paso de política del Mandate) y sus consecuencias | Vigente (2026-11-05). Pedido R-M1 |
| DJ-27 | "Cancelá la etapa E0. No se mide dev como condición previa." El plan se rehace en torno a reparar y extender `doc`. Si reparar `doc` puede romper algo que ya funciona, se informa qué es y cómo se verifica, y José decide si se mide | Nueva (2026-11-07). Reemplaza la línea base de `dev` del plan v0.1 |
| DJ-28 | "El intent doc lo lanza el propio sistema después de cada intent, del tipo que sea (ing, dis, exp, dev y los demás), y sanea lo que hizo el intent anterior." | Nueva (2026-11-07). Responde en parte P37. Reemplaza DJ-15 como regla del disparo (DJ-15 ya era un caso de DJ-17) |

## 4. Requisitos centrales y restricciones de las fuentes

### 4.1 Requisitos (DJ-11)

| ID | Requisito |
|---|---|
| R-1 | `doc` es un intent de **actualización viva**, no un generador de una sola vez |
| R-2 | Capacidad comparable a `dev` en tareas complejas |
| R-3 | Mantiene al día el **contenido** y la **integridad** de los archivos documentales |
| R-4 | Reconoce que un documento **movido o renombrado sigue siendo el mismo** |
| R-5 | El sistema identifica cualquier archivo de documentación propio (§2) |
| R-6 | La integridad de los archivos se mantiene "en tiempo real" y responde a "los permanentes cambios" (MJ). Ninguna fuente define qué latencia es "tiempo real" (P26) |
| R-7 | "El sistema tiene que saber todo" (MJ) sobre la identidad de los documentos. No se asigna dueño: puede ser `doc`, Genes o ambos (§5.4) |

### 4.2 Restricciones que ya fijan las fuentes y que cualquier opción debe respetar o modificar explícitamente

| ID | Restricción | Fuente | Carácter |
|---|---|---|---|
| X-1 | La pertenencia no se infiere por similitud | Gene v3, invariante 11 | Normativo |
| X-2 | Git aporta evidencia, nunca decide qué constituye un Gene | Gene v3, invariante 12 | Normativo |
| X-3 | No inferir traslados por similitud; sin evidencia, no inventar continuidad | Closure v1.1 §13, A3 (invariantes y pruebas: "traslado identificable") | Research aprobado |
| X-4 | La identidad física de un activo es `project_id + repository_id + ruta relativa normalizada`; `asset_kind` no participa | G1 §4; `gene/assets.go:131-143` | Contrato físico implementado |
| X-5 | Las rutas son relativas, con `/`, sin `.`/`..`, sin symlinks | G1 §4; `assets.go:149-163` | Implementado |
| X-6 | Una Revision ratificada es inmutable; un cambio produce una Revision nueva | Gene v3 §2.2, invariante 6 | Normativo |
| X-7 | Las proyecciones se reconcilian desde la fuente canónica, nunca al revés | Gene v3, invariante 15 | Normativo |
| X-8 | El `repository_id` nunca se deriva de la ruta, el nombre de carpeta ni el remoto de Git | G1 §11.2 | Contrato |
| X-9 | Todo cambio material sobre `file` o `test` exige una Knowledge Determination antes de llegar a `CURRENT` | Requisitos de lifecycle §1.1, invariantes 16-21 | Requerimientos (diseño pendiente) |

**Hecho que condiciona R-4:** X-3, unido a X-1 y X-2, deja fuera de los mecanismos admitidos la detección de renombres por parecido de contenido. Incluye la detección de renombres de Git, que es por similitud. La continuidad tendría que **declararse** o **portarse** (§5). Cuál de las dos es una decisión de modelo.

---

## 5. Identidad documental

### 5.1 Estado actual

| Sistema | Cómo identifica un documento | ¿Sobrevive a mover o renombrar? | Cita |
|---|---|---|---|
| Genes | `asset_id` = digest de `{project_id, repository_id, repository_relative_path}`. Sin alias ni campo de continuidad | **No.** Otra ruta da otro `asset_id`. La Revision nueva tendría un activo nuevo y la anterior el viejo, sin vínculo entre ambos. **Confirmado por RG §3** | `assets.go:131-143`; `model.go:53-60, 89-100`; RG §3 |
| Intent `doc` (identidad del Intent) | `uuid3(DNS, nombre)`; carpeta `.{slug}-{uuid3[:8]}` | **No.** Renombrar el Intent regenera el id y mueve la carpeta. Dos intents con el mismo nombre comparten carpeta | `intent_manager.py:131-142, 991-998` |
| Intent `doc` (archivos que procesa) | Ruta relativa a la raíz del Project + md5 por corrida en `.codebase_index.json` | No; no hay comparación entre corridas | `intent_manager.py:325-366` |
| `.bl` de Nucleus | Solo por ruta; sin frontmatter ni id (REAL) | No | RV §2.3 |
| Frontmatter `.bl` (PROP) | Id de ChromaDB = ruta relativa a la raíz de `.bloom` | No | `tree/bloom/bloom_bl_frontmatter_spec.txt:175-179` |
| Inputs del Mandate | `{ref, sha256, size}`; `ref` relativa al directorio del Mandate | Detecta un cambio de contenido (falla cerrado); no identifica movimientos | `contract.go:64-68`; `mandate_intent_activity.go:344-355` |
| `documentId` / `document_id` | **No existe** en lo copiado | — | RV §2.1 |

### 5.2 Opciones (sin elegir)

| Opción | Qué es | Respaldo en fuentes | Cubre R-4 | Costo | Dueño probable | Cambio en Genes | Cambio en Nucleus | Cambio en Brain |
|---|---|---|---|---|---|---|---|---|
| **O1. Ruta (estado actual)** | La identidad es la ruta | IMPL (G1 §4) | **No** | Ninguno | Genes | Ninguno | Ninguno | Ninguno |
| **O2. Huella de contenido** | La identidad es el `sha256` | IMPL como evidencia (Genes, Mandate) | **No.** Identifica versiones, no documentos; un renombre sin edición coincidiría, pero eso es inferencia (X-3) | Bajo | Genes | Ninguno | Ninguno | Comparar digests. La equivalencia entre `sha256:<hex>` y hex sin prefijo no es tarea de Brain: requiere una decisión de interoperabilidad que no está prevista (RG §4; I-32, I-49) |
| **O3. Id portado dentro del archivo** | Cada documento del sistema lleva un id estable en su encabezado; mover o renombrar no lo cambia | **Ninguna fuente lo propone.** El frontmatter `.bl` existe como PROP sin campo de id | Sí, mientras el encabezado se conserve | Medio a alto: todo productor escribe y preserva el id; hay que definir qué pasa con copias y duplicados; solo aplica a formatos que admiten encabezado | Brain (`doc`) + dueño de la spec `.bl` | **Cambio de contrato G1:** el `asset_id` sigue siendo ruta (X-4), así que haría falta un campo nuevo en `AssetRef` o un alias que relacione el id portado con los `asset_id` sucesivos | Ninguno directo; en todo caso un índice si se consulta por id | Escribir y validar el id; detectar duplicados; spec de encabezado |
| **O4. Registro gobernado externo** | Un registro mapea un id de documento a su ruta vigente. Los movimientos se registran como eventos explícitos | **Ninguna fuente lo propone** | Sí, si cada movimiento se registra | Alto: store nuevo, concurrencia, reconciliación con el filesystem | LAGUNA: Brain o Nucleus | Si el registro es de Genes: equivale a O5. Si no, Genes lo consume como proyección o lo ignora | Si vive en Nucleus: store nuevo bajo `.nucleus-{org}/` y su lifecycle | Si vive en Brain: store por Project bajo `.bloom/`; `doc` lo actualiza |
| **O5. Continuidad declarada en la Contribution** | La Contribution declara "el activo de la ruta A continúa en la ruta B"; la Revision nueva conserva el vínculo | **Ninguna fuente lo propone.** Encaja con X-1 y X-3 porque la continuidad se declara y se ratifica, no se infiere | Sí, a nivel Gene | Medio: cambio de schema de Contribution y Revision, y del digest canónico | Genes | **Cambio de contrato G1 y de `model.go`:** un campo de continuidad por activo, con verificación (por ejemplo, el digest previo debe existir en la Revision base) | Ninguno | `doc` emite la declaración en su salida (T1.8) |
| **O6. Detección por Git** | Usar la detección de renombres de Git | Git solo como evidencia (X-2); la detección de Git es por similitud (X-3) | Parcial; heurística | Bajo | Brain | Ninguno | Ninguno | Leer el historial de Git. La extensión hoy no distingue renombres (`gitManager.ts:87-102`) |
| **O7. Identidad del filesystem** | inode o file ID | Ninguna | Solo en la misma máquina y el mismo volumen; se pierde con clone, checkout o copia | Bajo local; no portable | Brain | Ninguno | Ninguno | Watcher local (`watchdog` está declarado en `brain/requirements.txt` y no se usa en el código revisado) |

**Combinaciones posibles, sin elegir:** O3 u O4 dan la identidad del documento en todos los niveles; O5 la lleva al registro ratificable del Gene. O2 queda como evidencia de integridad (R-3), no de identidad. Cualquier combinación que incluya O3, O4 u O5 modifica el contrato G1 o crea una fuente nueva. RG §3 confirma que hoy no existe ninguna de las tres.

### 5.4 Las tres opciones que cumplen R-4, con un ejemplo

**Escenario común.** Los nombres de campos y rutas de este ejemplo son **ilustrativos**: ninguna fuente los fija.
- **D1, documento de nivel Project:** `.bloom/.project/.doc.app.architecture.bl` del Project P (definido en el árbol de Project). Se renombra a `.bloom/.project/architecture/app.bl` en una ronda de nomenclatura (E-N). El contenido no cambia.
- **D2, documento constitutivo de un Gene:** `docs/gravity/structural_projection.md` del Repository R, activo `document` de la Revision R1 del Gene G (el vertical del piloto). Se mueve a `docs/gravity/domain_gene_projection.md` y en el mismo acto se le corrige un párrafo.
- **El movimiento ocurre de dos maneras posibles:** (a) lo hace `doc` como parte de su trabajo; (b) lo hace una persona por fuera, con `git mv` o desde el editor.

#### O3 — Id dentro del archivo

**Qué es:** cada documento del sistema lleva en su encabezado un identificador que se crea una sola vez (ilustrativo: `doc_id: 7f3c…`). Mover o renombrar no lo toca.

| Para D1 y D2 | Qué se conserva | Qué se rompe o queda abierto |
|---|---|---|
| Identidad | El id viaja con el archivo en (a) y en (b), incluso entre máquinas y clones | Una **copia** del archivo duplica el id: hay dos documentos con la misma identidad, y hace falta una regla para detectarlo y resolverlo. Si alguien borra o edita el encabezado, la identidad se pierde en silencio |
| Formatos | Funciona en `.bl`/Markdown, y en JSON si se agrega un campo | No sirve para formatos sin encabezado. Obliga a todo productor (Brain, extensión, Nucleus) a escribirlo y preservarlo |
| Autoridad | El archivo dice quién es | Es **autodeclaración**: según los requisitos de lifecycle y G1 §11.2, el contenido previo no es evidencia de ratificación. El id vale como propuesta, no como prueba (RV B3) |
| Lectores actuales | Un lector nuevo que busque por id lo encuentra | Los que buscan por ruta se rompen igual: el inspector de Project, el payload builder y el id de ChromaDB del frontmatter, que es la ruta (`bloom_bl_frontmatter_spec.txt:178`) |
| Genes (D2) | — | El `asset_id` cambia igual, porque sigue siendo la ruta (X-4; RG §3). Para que el Gene sepa que es el mismo documento hace falta un campo nuevo en `AssetRef` que guarde el id portado: es un **cambio de contrato G1** |
| Location (D2) | Si la captura guardara el id portado, la reapertura podría ubicar el documento nuevo | El schema de Location no tiene ese campo, ni siquiera `captured_revision` (I-19) |
| Corrección del párrafo (D2) | El id distingue identidad (igual) de contenido (otro digest) | — |

#### O4 — Registro gobernado aparte

**Qué es:** un registro, fuera de los archivos, guarda por cada documento un id, la ruta vigente, el digest y la historia de rutas. Cada movimiento se registra como un evento explícito.

| Para D1 y D2 | Qué se conserva | Qué se rompe o queda abierto |
|---|---|---|
| Movimiento hecho por `doc` (a) | `doc` registra "de la ruta A a la ruta B" con evidencia (digest antes y después) en el mismo acto. Se conservan la identidad y la historia de rutas | — |
| Movimiento hecho por fuera (b) | El registro ve que A falta y B aparece | Por X-3 **no puede deducir** que B es A. El documento queda como "falta A, apareció B sin registrar" hasta que alguien **declare** la continuidad. Hace falta un acto de reconciliación, y no hay dueño definido |
| Formatos | No toca los archivos; sirve para cualquier formato | — |
| Ubicación del registro | — | **LAGUNA:** por Project en `.bloom/` (dueño Brain) o en el Nucleus (dueño Nucleus). Si no viaja con el repo, otra máquina que clona no lo tiene. Si viaja, hay que resolver conflictos de merge del registro |
| Concurrencia | — | Dos escritores (`doc` y una persona, o dos `doc`) requieren control de concurrencia, como el CAS del store de Genes |
| Genes (D2) | — | Si el registro no es de Genes, el `asset_id` cambia igual (RG §3) y Genes lo ignora, salvo que lo consuma como proyección (X-7). Si es de Genes, equivale a O5 |
| Location (D2) | Un resolver podría consultar el registro | No está definido como fuente de Location |
| Corrección del párrafo (D2) | El registro guarda el digest nuevo junto a la ruta nueva | — |

#### O5 — Continuidad declarada en la Contribution

**Qué es:** la Contribution que lleva a G de R1 a R2 declara que el activo de la ruta vieja continúa en la ruta nueva. La Revision R2 conserva ese vínculo. Se ratifica como cualquier Contribution.

| Para D1 y D2 | Qué se conserva | Qué se rompe o queda abierto |
|---|---|---|
| D1 (nivel Project) | — | **No cubre D1.** Solo existe para activos de un Gene. La documentación de Project y de Nucleus de los árboles queda sin continuidad |
| D2, identidad | R2 registra "`asset_id` nuevo continúa a `asset_id` viejo", con ratificación y procedencia. La historia es inmutable: R1 sigue con su ruta vieja (X-6) | Hace falta un **cambio de contrato G1 y de `model.go`**: el campo de continuidad entra al digest canónico de la Revision y de la Contribution |
| D2, autoridad | Es la única de las tres que **ratifica** la continuidad (RatificationEnvelope) y respeta X-1 y X-3 por diseño | Cada movimiento exige el ciclo completo: Contribution, ratificación, bindings y caller. Nada de eso tiene implementación productiva (RN §3; G1 §11) |
| D2, entre el movimiento y la ratificación | — | La Revision vigente R1 apunta a una ruta que ya no existe. Cualquier verificación del Gene falla con `ASSET_MISSING` hasta publicar R2 (`assets.go`). Ninguna fuente define ese estado intermedio |
| D2, movimiento hecho por fuera (b) | — | Alguien tiene que detectar el movimiento y proponer la Contribution. Sin O3 u O4, esa detección es inferencia (X-3) |
| D2, corrección del párrafo | El mismo acto puede declarar continuidad y digest nuevo | Si el párrafo cambia la validez, entra la KD. Por el requisito 19, un cambio solo en `document` no es cambio material; falta definir cómo se combina con la continuidad |
| Documento compartido | — | Si D2 fuera activo de otro Gene G', hace falta otra Contribution para G'. No hay regla de propagación (RG §2; D-17) |
| Location (D2) | Una reapertura de R1 podría informar el estado "movido a B en R2" en lugar de `missing` | Requiere `captured_revision` en el schema (I-19) y la lectura de Revisiones (D-04) |

#### Resumen sin elección

| | O3 Id en el archivo | O4 Registro aparte | O5 Continuidad en la Contribution |
|---|---|---|---|
| Cubre D1 (Project/Nucleus) | Sí | Sí | **No** |
| Cubre D2 (Gene) | Solo con cambio de contrato G1 | Solo si Genes lo consume o si es O5 | Sí |
| Movimiento por fuera | Sobrevive | Queda pendiente de declaración | Queda pendiente de detección y Contribution |
| Copias | Duplican identidad | El registro decide | No aplica |
| Ratificado | No (autodeclaración) | Depende del registro | **Sí** |
| Toca los archivos | Sí | No | No |
| Fuente nueva o cambio de contrato | Spec de encabezado + G1 si llega a Genes | Store nuevo (dueño LAGUNA) | G1 + `model.go` |
| Dueño probable | Brain + dueño de la spec `.bl` (+ Genes) | Brain o Nucleus | Genes |

Las tres opciones no se excluyen: una combinación (por ejemplo O3 u O4 para todos los niveles y O5 para el Gene) es posible, y tampoco se elige aquí.

**Decisión posterior (DJ-13, 2026-11-04):** O4 como base para todos los niveles; O5 para activos de un Gene en una etapa posterior; O3 descartado. Lo que falta para decidir el registro (dónde vive, si viaja con el repo, concurrencia, cambios por dueño, estado intermedio y disparo después de `dev`) está en el anexo `Programa_Documentacion_Registro_Documental_Mapa_Decision_v0_1.md`.

### 5.3 Identidad del Intent `doc` (es otro problema, pero se cruza)

| Opción | Qué es | Respaldo | Costo | Efecto |
|---|---|---|---|---|
| IO-1. `uuid3(nombre)` (actual) | Determinista por nombre | IMPL | Ninguno | Renombrar cambia el id; colisiones entre Projects (I-41); choca con `Origin.intent_id` inmutable de Gene v3 (invariantes 3-4) si `doc` llega a producir Contributions |
| IO-2. `uuid3(tipo:mandate:nombre)` (patrón de ING/DIS) | Determinista con el Mandate | IMPL para ING/DIS (`intent_manager.py:131-139`) | Bajo | No resuelve el renombre; separa por Mandate. Fuera de un Mandate, `doc` no tiene `mandate_id` |
| IO-3. Id generado una vez y persistido | No depende del nombre | **No propuesto en fuentes** | Bajo a medio: cambian `_locate_intent`, la carpeta y los lectores | El renombre no altera la identidad; hay que revisar los callers que reconstruyen el id desde el nombre |

---

## 6. Detección de cambios y movimientos

### 6.1 Qué necesita `doc` (capacidades, sin diseño)

| ID | Capacidad |
|---|---|
| DC-1 | Una **línea base** por documento: identidad (§5), ruta vigente y digest de contenido |
| DC-2 | Una **fuente de cambios**: eventos del filesystem, diferencias de Git, un disparo explícito (por ejemplo, al terminar un `dev`) o una corrida periódica |
| DC-3 | **Comparación** entre la línea base y lo observado: modificado, eliminado, nuevo, movido o renombrado |
| DC-4 | **Continuidad sin inferencia** ante un movimiento (X-3): declarada o portada (§5) |
| DC-5 | Una **relación código → documento** para saber qué documento queda desactualizado cuando cambia el código que describe |
| DC-6 | Una **decisión registrada** de si el documento sigue siendo válido o necesita actualización (equivalente a la Knowledge Determination a nivel Gene) |
| DC-7 | **Integridad:** detectar un documento corrupto, truncado o fuera de formato |

### 6.2 Qué existe hoy

| Capacidad | Qué existe | Estado | Cita |
|---|---|---|---|
| DC-1 | Digest por activo en la Revision; md5 por archivo en `.codebase_index.json` de cada corrida de `doc` | IMPL (Genes sin uso productivo; `doc` sin comparación) | `model.go:48-60`; `intent_manager.py:340-357` |
| DC-2 | Ningún disparo automático (`dev`→`doc` no codificado). `watchdog` declarado y no usado. La extensión lee `git status --porcelain` | NO EXISTE como disparo de `doc` | DOC spec §6; `brain/requirements.txt`; `gitManager.ts:75-102` |
| DC-3 | Genes: verifica el digest **durante** la materialización (`ASSET_DIGEST_CHANGED_DURING_MATERIALIZATION`). Mandate: falla si un input cambió. Location: estados `changed`/`missing` especificados | IMPL puntual / ESPEC | `assets.go:125-127`; `mandate_intent_activity.go:349-353`; Closure §8 |
| DC-4 | Nada. La extensión trata un renombre como "modified" (no tiene estado R). Location exige "traslado identificable" sin similitud | NO EXISTE; requisito ESPEC en Location | `gitManager.ts:98-100`; Closure A3 |
| DC-5 | La única relación código ↔ documento está en la Gene Revision: `file`, `test` y `document` del mismo Gene. Fuera del Gene no hay ninguna | IMPL sin uso productivo / NO EXISTE | G1 §4; Gene v3 §2.7 |
| DC-6 | Knowledge Determination: requerimientos, sin objeto físico. `knowledge_baseline_materialized` en el ledger de ING, ausente del modo lógico | ESPEC | Requisitos de lifecycle; `effect_ledger.py:23-36` |
| DC-7 | Digest y tamaño en Genes; validación de JSON en ING/DIS | IMPL parcial | `assets.go`; schemas ING/DIS |

**Hecho que se desprende del cuadro:** DC-5 solo existe a nivel Gene. Para la documentación de nivel Project (`.doc.app.*`, `.bl` de Nucleus), ninguna fuente define qué código describe cada documento, así que tampoco cuándo queda desactualizado. Es una LAGUNA (dueño probable: Brain/`doc`).

---

## 7. `doc` frente a `dev`: qué tiene `dev` que `doc` no tiene

**Hecho previo:** las dos specs dicen que su intent es "funcional, en producción" (DEV spec §0; BISP Parte E l. 1309). El código muestra que `dev` también tiene huecos: la propia DEV spec dice que `plan` y `build` están "sin verificar" (§3.2), y `download` no acepta sus etapas `execution` ni `refinement` (I-46). La comparación es entre dos intents heredados, no contra un modelo completo.

| Capacidad | `dev` | `doc` | Cita |
|---|---|---|---|
| Fases | 3: `briefing` → `execution` → `refinement` | 2: `context` → `curation`; no tiene fase de ejecución | DEV spec §2-3; DOC spec §2-3 |
| Fase de ejecución con respuestas (`.answers.json`) | Sí (en el árbol) | No | `bloom_project_tree.txt` (rama `.dev/`) |
| `plan` (context plan por Gemini) | Escribe en `.briefing/`; busca índices en sus fases | No reconoce sus fases | `plan.py:118, 157-175` |
| `build-payload` | Encuentra sus insumos | No | `build_payload.py:79-160` |
| `submit` | Ruta `.pipeline/.briefing` correcta | Rota | `intent_manager.py:2312-2346` |
| `parse`, `stage`, `merge` | Reconocen su vocabulario | No | `response_parser.py:95-104`; `staging_manager.py:354-359`; `merge_manager.py:343-366` |
| `validate` | Prompt de desarrollo | Mismo prompt, sin variante | DOC spec GAP #5 |
| `download` | Solo `briefing` aceptada | Ninguna de sus etapas | `download_manager.py:375-379` |
| Insumos propios del Project | Lee `.{strategy}.strategy.{context,standards}.bl` | Sus insumos (`.doc.app.*`, `.doc.rules.bl`) no tienen productor | `bloom_project_inspector.py:98-110`; D-14 |
| Extensión de VS Code | Comando `createIntentDev` | Solo aparece como opción en un selector y en tipos de la API | `src/commands/intent/createIntentDev.ts`; `commandRegistry.ts:163`; `BrainApiAdapter.ts:103` |
| Contratos con el Executor | `dev-dispatch` / `dev-result` / Evidence v2 como TARGET; Execution Grant y Promotion Engine diseñados | Ninguno | Investigación Codex CLI §5; conclusiones del Executor |
| Action en el Mandate v4 | Sí (`whenResult: remediation_required`) | Sí, sin `ArtifactRef` | `mandate-v4-sign/main.go:293-301` |
| Suministro de inteligencia AITAP | No | No | `intelligence-supply-request` `{ing, dis, gen}` |
| Motor de estado BSIP | No | No | `intent_types.py:50-51` |
| Lo que **ninguno** tiene y R-1/R-4 piden | Disparo por cambio, línea base persistente, identidad de documento, detección de movimiento | ídem | §5, §6 |

**Para paridad:** cerrar G0-G11 (encargo de `doc`, tramo 1) iguala a `doc` con `dev` en el pipeline. La capacidad para "tareas complejas" requiere además:
- una fase de ejecución o su equivalente (hoy `doc` no la tiene: P18);
- insumos de Project con productor (D-14);
- comando en la extensión y contratos con el Executor, si `doc` se modela como ejecución (Composition §6.2).

Lo que piden R-1 y R-4 no lo tiene ni `dev`: es construcción nueva.

---

## 8. Nomenclatura: qué fuentes la fijan hoy y quién es el dueño

| Fuente | Qué nombres fija | Carácter | Dueño |
|---|---|---|---|
| `tree/bloom/truth/bloom_project_truth.txt` y `bloom_nucleus_truth.txt` | Estructura de `.bloom/` del Project y del Nucleus, con estado por nodo | **Fuente de verdad vigente.** "Si un graph contradice el comportamiento material del software, el código gana… y el graph debe corregirse" | **AGENDA FOLLOWUP** consolida; **José** aprueba; los Works consultados (MANDATE GENESIS, AUTHORIZATION, Brain, y otros según el cambio) auditan sin editar (`tree/bloom/truth/VERIFICATION_AND_UPDATE_PROCEDURE.md` §1, §4) |
| `tree/bloom/bloom_project_tree.txt` y `bloom_nucleus_tree.txt` | Maquetas: `.doc/`, `.project/.doc.app.*`, `.core/.doc.*.bl` | Antecedentes históricos; "no son fuente de verdad vigente" | ídem (procedimiento §2) |
| `tree/bloom/DESC/bloom_project_desc_tree.txt` | Contenido esperado de cada archivo (`.doc.json`, `.docbase.json`, `.doc.app.*`) | Maqueta descriptiva (mayo 2026) | No asignado; LAGUNA |
| `tree/bloom/bloom_bl_frontmatter_spec.txt` | Encabezado `.bl`: `type`, `scope`, `vector_ref`, `parent_mandate` | PROP, sin productor ni lector | No asignado (BISP/Brain probable) |
| `docs/BSIP/TYPES/DOC_Intent_Spec_v1_0.md` y DEV spec | Nombres reales del Intent: `.context.json`, `.turn.json`, `.raw_output.*` | Spec "confirmada contra código", con divergencias (I-01, I-06) | Brain |
| Código de Brain | `intent_manager.py` (estructura de intents); `nucleus_manager.py` (`.core/`, `.governance/`); `context/manager.py` (`.bloom/core/`, `.bloom/context/`); `linker.py` (`overview.bl`, `_index.bl`); `bloom_project_inspector.py` (`.project.meta.json`, `.{strategy}.strategy.*.bl`) | IMPL; gana como evidencia del estado | Brain |
| Código de la extensión | `NucleusStrategy.ts` (`.bloom/core`, `.bloom/organization`, `.bloom/projects`); `createIntentDev.ts` (`.bloom/intents/dev`) | IMPL, con un layout distinto (I-38, I-45) | Extensión (Work no identificado en las fuentes) |
| Código de Nucleus | `governance/create.go` (lista de archivos del Nucleus); `mandatecontract/contract.go` (`domain_definition.json`) | IMPL | Nucleus / MANDATE |
| Specs ING y DIS | `.rawbase.json`, `.domain_resolution.json`, `.consolidation.json`, `.domain_graph_delta.json` | Confirmadas | Brain |

**Cómo se cambia la nomenclatura según las fuentes:** con una ronda del procedimiento de verificación y actualización. La disparan, entre otros casos, que "un Work implementa, elimina o cambia una estructura representada" o "una investigación detecta drift" (§3). La consolida AGENDA FOLLOWUP y la aprueba José. Rehacer los nombres del sistema documental pasaría por esa ronda, sumando a Brain y a los Works cuyo código fija nombres. **El procedimiento no cubre** el código de la extensión, la maqueta DESC ni la spec de frontmatter (LAGUNA: dueño probable Brain).

---

## 9. La cadena y la relación con Orrery y Location

Sin cambios de fondo respecto de v0.1 §4 y §9. Resumen:

- **Tu cadena** (Orrery → Location → Gene → Postulate → Mandate → Intents → Location):
  - Mandate → Intents tiene respaldo parcial (IMPL: el contrato v4 firma seis Actions, solo se despacha ING).
  - Postulate → Mandate está propuesto en el ADR y el roadmap de ASM.
  - Location → Gene → Postulate y "los Intents se anclan en la Location" no tienen respaldo.
- **Postulate:** dos versiones, sin elegir (I-15). Versión A: `AGENDA_FOLLOWUP` §6. Versión B: ASM Spec, ADR y BTIPS.
- **Lo que Location necesita de la documentación:**
  - C2: contenido constitutivo del Gene "con revisión y origen" (Closure §13).
  - `captured_revision` (Gene v3 §7.7; sin campo en el schema, I-19).
  - La lista declarada de documentos por revisión, con dos contratos de lectura (Universo Fase 1 §5, **no normativo**).
- **Relación con el nuevo eje:** Location exige "traslado identificable" sin inferencia (Closure A3). Es la misma restricción que R-4 enfrenta en `doc` (X-3). Cualquier opción de §5 que resuelva R-4 para `doc` alimenta también la resolución de Location. Ninguna fuente lo establece como dependencia formal.

## 10. Identidades y documentación por nivel

Según RV §2.1 y la respuesta de Nucleus (RN):

| Nivel | Identidad que rige | Otras identidades presentes | Documentación del sistema | Estado |
|---|---|---|---|---|
| Tenant | `tenant_id` (Authority), coherente en Darwin (REAL) | — | Ninguna | NO EXISTE documental |
| Organization | `canonical_id` = `organization_id` de Authority; "nunca se deriva del slug" (RN §1; Physical Design §20; `ownershipcontract/schema.go:54`) | `legacy_org_id` (`org_<epoch>`), que además usa el nodo Gravity ORGANIZATION por `init --master` (`ownership.go:426`; `gravity_bootstrap.go:47-59`); slug; id del Nucleus; nombre de gobernanza (I-26) | `.core/*.bl` y `.governance/**/*.bl`, plantillas fijas al crear el Nucleus (`nucleus_manager.py:158-194`); se identifican solo por ruta | IMPL sin actualización ni identidad |
| Project | `project_id` reclamado y confirmado por Authority; el UUID local es solo candidato (RN §2; `project_claim.go:54-84`) | Ids locales `uuid4()` del catálogo y del linker, disjuntos de los de Authority en Darwin (I-27) | `.bloom/.project/.doc.app.*` sin productor; `.bloom/core/`, `.bloom/context/` de `context generate`; artefactos de los intents | ESPEC / IMPL parcial |
| Repository | `repository_id` vía `RepositoryBindingStore` | **No hay ningún flujo productivo que cree bindings** (RN §3); ninguna instancia en Darwin (I-29) | — | IMPL sin productor |
| Domain | Canónico: NO EXISTE | ING `dom_…`; contrato del Mandate (texto libre); `domain_definition.json`; nodo Gravity (I-31) | `domain_definition.json` (declarado por el Mandate) | IMPL declarado; canónico NO EXISTE |
| Gene | `gene_id` UUID del store (DJ-5) | `gene-<hex>` de ING; `GeneRef` de Gravity | Activos `document` de la Revision | IMPL sin uso productivo |
| Instalación | `installation_id` de `authority/identity.json` | Otro id en `.ownership.json`; la reconciliación conserva el valor distinto a propósito (RN §4; I-28) | — | Incompatibilidad conocida |

**Consecuencia para la identidad documental:** cualquier id de documento anclado al Project hereda I-27. Un documento de este mismo repo hoy no podría anclarse a un `project_id` con binding (RV §3, pregunta 2). Anclarlo a un Repository requiere un flujo de bindings que no existe (RN §3).

---

## 11. Puntos de desconexión

Se conservan D-01 a D-14 de v0.1 y se agregan dos:

| ID | Dónde se corta | Quién lo cerraría |
|---|---|---|
| D-01 | `doc` → Domain/Gene/Contribution | Brain + Genes |
| D-02 | ING → store de Genes (ids incompatibles) | Integración de Mandate + Brain/ING + Genes |
| D-03 | Índice transitorio → Domain canónico | Genes + ING/DIS (C1) |
| D-04 | Store de Genes → consumidores (sin API ni servicio de contenido) | Genes (C2) |
| D-05 | Gene → Gravity (sin caller) | Gravity (C3) |
| D-06 | Gravity/Gene → Location (sin nodos ni `captured_revision`) | Location + Genes; José ratifica el schema |
| D-07 | Location → ASM | Location (A5) + ASM |
| D-08 | ASM → Postulate | LAGUNA; decide José |
| D-09 | Postulate → Mandate | LAGUNA |
| D-10 | Mandate → Intents (solo ING) | MANDATE |
| D-11 | Intents → Location | LAGUNA |
| D-12 | `docs/` del Mandate → Gene | Genes + MANDATE |
| D-13 | Gobernanza de Organization → Projects | LAGUNA (Brain/Nucleus) |
| D-14 | `.doc.app.*` sin productor | Brain |
| **D-15** | **Documento → identidad estable** (no hay id que sobreviva a un movimiento en ningún sistema) | LAGUNA; depende de la opción de §5 (Brain, Genes o Nucleus) |
| **D-16** | **Cambio de código → documento desactualizado** (no hay disparo, línea base ni relación código→documento fuera del Gene) | Brain (`doc`) + Genes (KD) |
| **D-17** | **Validez de un documento compartido entre Genes:** la KD es por Gene; no se define si invalidar en un Gene invalida a los demás, quién descubre los otros Genes afectados, cómo se coordinan varias Contributions ni cómo se bloquea la promoción conjunta (RG §2) | Genes (Gene v3; requisitos de lifecycle) |

---

## 12. Registro de inconsistencias

### 12.1 I-01 a I-25 (de v0.1, sin cambios salvo lo indicado)

| ID | Tema | Nota de v0.2 |
|---|---|---|
| I-01 | `.raw_output.txt` (spec, árbol) frente a `.raw_output.json` (código) | — |
| I-02 | Ids de ING `gene-`/`contribution-` frente a UUID | RV: se suma la forma de Gravity `GeneRef{MandateID, GenePath}` |
| I-03 | Gene bajo el Mandate frente a store por Project | ídem |
| I-04 | `doc` en Project y Nucleus frente a solo Project | — |
| I-05 | `doc` "funcional" frente a pipeline roto | v0.2: lo mismo vale para `dev` (I-47) |
| I-06 | `.doc.json` frente a `.context.json` | — |
| I-07 | Dos formatos de `docbase` | — |
| I-08 | `.bloom/.core` frente a `.bloom/core` | Ver también I-38 |
| I-09 | Efectos de la consolidación ING según la spec y según el código | — |
| I-10 | "Contrato solo `gen`" frente al v4 con seis Actions | RV: la definición publicada real tiene `doc-3` sin `artifactRef` (REAL) |
| I-11 | `approve`/`activate` y v4 | — |
| I-12 | Estado y autoridad de `.semantic-index.json` | **Agravado** por I-30 |
| I-13 | `domain_definition.json` ausente de los árboles | RV: sin instancia en Darwin; sin Project ni Organization en su forma |
| I-14 | Alcance de Domain: Project frente a Nucleus | RV: tercer alcance, por Mandate |
| I-15 | Quién formula `PostulateProposal` | — |
| I-16 | Tenant: tres versiones normativas | RV: coherente en los datos de Darwin |
| I-17 | Enum `nodeType` con nodos de Trabajo (F-1) | — |
| I-18 | Anchors DOMAIN/GENE: el schema frente a la norma | — |
| I-19 | `captured_revision` en Gene v3 frente al schema | — |
| I-20 | `version_refs`/`expansion_refs` en el Closure frente al schema | — |
| I-21 | Forma del lector de Gene (E17 frente a E18) | — |
| I-22 | Mandate/Gene en `.dev_state.json` | Confirmado por RV |
| I-23 | Gaps fuera de la DOC spec | — |
| I-24 | AITAP y `doc` (routing frente a supply) | — |
| I-25 | Obligación `knowledge_baseline_materialized` | — |

### 12.2 I-26 a I-43 (N-01 a N-18 de RV, con su numeración definitiva)

| ID | RV | Tema | Versión 1 | Versión 2 |
|---|---|---|---|---|
| I-26 | N-01 | Identidad de Organization | `canonical_id` rige (RN §1; `schema.go:54`) | `legacy_org_id` en el nodo Gravity ORGANIZATION (`ownership.go:426`; `gravity_bootstrap.go:47-59`), slug, id del Nucleus, `name: "octocat"` (REAL) |
| I-27 | N-02 | Catálogo de Projects | `project_id` de Authority (RN §2) | Ids locales `uuid4()` disjuntos (`nucleus_manager.py:510`; `linker.py:100`); RN: "son registros diferentes" sin regla de equivalencia |
| I-28 | N-03 | Instalación | `authority/identity.json` (`identity.go:18`) | `.ownership.json`, que la reconciliación conserva distinto a propósito (`ownership_reconciliation.go:216`); RN §4: "incompatibilidad conocida" sin procedimiento de reconciliación |
| I-29 | N-04 | Repository | Norma: Project→Repository 0..N; G1 exige el binding | Sin flujo productivo (RN §3); sin instancia en Darwin |
| I-30 | N-05 | Forma de `.semantic-index.json` | `{indexed_at, entries: []}` (`nucleus_manager.py:208-211`; REAL) | `{domains: {…}}` (`genesis_intelligence.py:29-32`; ING §7.3; Gravity) |
| I-31 | N-06 | Formato de `domain_id` | Spec ING `dom_{slug}_{hex4}` | Código `dom_<slug>_<32hex>_<4hex>`; contrato: texto libre |
| I-32 | N-07 | Formato de digest | `sha256:<hex>` (Genes, ING/DIS) | Hex sin prefijo (inputs del Mandate, `domain_definition`, gen) |
| I-33 | N-08 | camelCase frente a snake_case para la misma identidad | `project_claim.go`, `contract.go` | `project_binding_store.go`, `definition.go`, store de Genes |
| I-34 | N-09 | Nombre de los campos de revisión | `*_revision_id` (Gene v3) | `*_revision_digest` (`model.go`) |
| I-35 | N-10 | "Contribution de tipo `document`" | Requisitos de lifecycle, req. 17 | La Contribution no tiene tipo; el tipo vive en cada activo |
| I-36 | N-11 | Qué es un documento para Orrery | Vocabulario: resultado de Trabajo situado en su Domain | Gene v3/G1: activo constitutivo situado por el Gene |
| I-37 | N-12 | Homónimo "Domain" | "Work Domain" (`Mandate_Domain_Spec`) | Territorio funcional (Gene v3 §2.6) |
| I-38 | N-13 | Rutas de los `.bl` | Extensión: `.bloom/core`, `organization`, `projects` | Brain: `.bloom/.nucleus-{org}/.core/` (REAL) y `<nucleus>/.bloom/brain/projects/{nombre}/overview.bl`; v0.1 §6 decía `.bloom/projects/` |
| I-39 | N-14 | Alcance declarable de un `.bl` | Frontmatter: `nucleus`/`project`/`intent` | Programa: Tenant a Gene |
| I-40 | N-15 | Dos productores de `.nucleus-config.json` | Brain v2.0 (REAL) | Instalación aislada: solo `{projects:[{id, absolutePath}]}` (REAL) |
| I-41 | N-16 | Identidad del Intent `doc` | `Origin.intent_id` inmutable (Gene v3) | `uuid3(nombre)`: renombrar cambia el id (`intent_manager.py:991-998`) |
| I-42 | N-17 | Raíz de las rutas del "mismo documento" | Relativa al Repository (G1) | Relativa al Mandate, a `.bloom` o solo el nombre |
| I-43 | N-18 | Un activo en varios Genes | Técnicamente posible (el `asset_id` no lleva `gene_id`) | Ninguna regla lo decide (B4 de RV; dueño Gene v3). Confirmado por RG §1: "No existe una política explícita. Está abierto" |

### 12.3 Nuevas en v0.2 (I-44 a I-48), v0.3 (I-49), v0.4 (I-50, I-51), v0.5 (I-52 a I-58), v0.6 (I-59) y v0.7 (I-60)

| ID | Tema | Versión 1 | Versión 2 |
|---|---|---|---|
| I-44 | Nombre de los insumos de estrategia del Project | Árbol: `.dev.strategy.context.bl`, `.dev.strategy.standards.bl` | Inspector: `.{strategy}.strategy.context.bl` / `.standards.bl` (`bloom_project_inspector.py:98-99`) |
| I-45 | Carpeta de intents en la extensión | Brain: `.bloom/.intents/.dev/` (`intent_manager.py:622-626, 744`) | Extensión: `.bloom/intents/dev` (`createIntentDev.ts:16`) |
| I-46 | Etapas aceptadas por `download` | Las de `dev` (`briefing`, `execution`, `refinement_N`) y las de `doc` (`context`, `curation_N`) | `["briefing", "analysis", "implementation", "review"]` (`download_manager.py:375-379`) |
| I-47 | Estado de `dev` | "Completamente funcional en producción" (DEV spec §0) | `plan`/`build` "sin verificar" (DEV spec §3.2); `download` rechaza sus etapas (I-46); el parser lee `.json` y la spec dice `.txt` (I-01) |
| I-48 | Requisito de renombre frente al principio de no inferencia | R-4: reconocer que un documento movido sigue siendo el mismo (DJ-11) | X-3: no inferir traslados por similitud (Closure A3); Git renames por similitud (X-2). No es contradicción entre fuentes: es una restricción de diseño que condiciona R-4 |
| I-50 | Latencia de la actualización | R-6 (MJ): integridad "en tiempo real" | DJ-15: "al terminar un `dev`" |
| I-51 | Orden de `doc` respecto de `dev` | Mandate v4: `ing → dis → doc → exp → dev → exp` (`contract.go:93`; `mandate-v4-sign/main.go:293`; definición publicada REAL) | DJ-15, DOC spec §0 y BTIPS v7.3 l. 1198: `doc` después de `dev` |
| I-52 | Reintento de un intent fallido | DJ-19: "se vuelve a correr hasta que termina su trabajo" | `RetryPolicy` con `MaximumAttempts: 3` (`mandate_execution_workflow.go:178-183`); EM-C12: un fallo deja el workflow fallido, sin estado legible ni reintento |
| I-53 | Lugar de `doc` en el Mandate | DJ-17 y DJ-20: un doc después de cada intent | v4: "exactly six signed Actions" `ing, dis, doc, exp, dev, exp` (`contract.go:90-99`); cumplimiento `exp-ready` con `[ing, dis, doc, exp]` (`contract.go:183-185`) |
| I-54 | Paralelismo | DJ-21: "Hoy los intents no corren en paralelo" | Un workflow por Mandate, sin nada que serialice Mandates distintos (`worker.go:48-49`; `mandate_watcher.go:264-272, 486-519`); `dev` y `doc` manuales ignoran `mandate_id` (`intent_manager.py:97`) |
| I-55 | Qué cuenta como éxito | DJ-19 supone que se sabe si un intent terminó | `finalize` de `dev` y `doc` marca `completed` sin precondición (`intent_manager.py:1910-1917`); la TST spec rechaza la autodeclaración para cerrar un Mandate (TST spec l. 41, §3.3) |
| I-56 | Quién se ocupa de una colisión | DJ-22: Impact verifica | INVARIANT-ARB-001: la colisión entre Mandates la resuelve solo Nucleus (`NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2). Verificar y resolver son actos distintos; las fuentes no dicen dónde se separan para documentos |
| I-57 | Lista de cambios de `dis` | DIS spec l. 161, 308: `.domain_graph_delta.json` | Código: solo la obligación `domain_graph_delta_materialized` del ledger (`effect_ledger.py:38`); no se encontró quién escribe el archivo |
| ~~I-58~~ | Choque interno de la política | DJ-17: "Cada intent, de cualquier tipo" | DJ-18: "Un doc no dispara otro doc". **Cerrada por DJ-24:** el `doc` queda fuera de DJ-17 |
| I-60 | Ubicación de los archivos del programa | El repo: `docs/ANALYSIS/BSIP/DOC/` (ruta que fijó José) | El Project BTIPS: `ANALYSIS/DOC/` hasta v0.6; desde v0.7, `ANALYSIS/BSIP/DOC/`. Hay que decidir si se unifican (P47) |
| I-59 | Lo que cambia fuera de un intent | DJ-23: cada `doc` documenta solo lo que cambió el intent anterior | R-7: "El sistema tiene que saber todo". DJ-16: un movimiento fuera del sistema es una anomalía pendiente de declaración. Los escritores que no son intents (anexo del registro, T-3) y Git no pasan por ningún `doc`. No es contradicción entre fuentes: falta definir quién detecta esas anomalías (P41) |
| I-49 | Quién unifica los formatos de digest | v0.2 (O2): tarea de Brain ("unificar formato") | RG §4: Genes no reconoce el hex sin prefijo; la normalización requiere una decisión de interoperabilidad nueva entre subsistemas, que no está prevista. Dueño: LAGUNA (decisión transversal) |

---

## 13. Ejes del programa (reordenados)

En v0.1 la actualización y la coordinación eran F5 y F6. Ahora son el eje. El orden que sigue muestra dependencias, **no un calendario aprobado**.

| Eje | Contenido | Depende de | Habilita | Dueño |
|---|---|---|---|---|
| **E1. Identidad documental** (diseño) | Elegir la opción o combinación de §5 y la identidad del Intent (§5.3) | P19, P21 (José); si se toca G1: Genes; si es un store nuevo: Brain o Nucleus | E2, E5, E6 | José decide; Brain/Genes |
| **E2. Línea base y detección** | DC-1 a DC-4 y DC-7 (§6) | E1; fuente de cambios (P22) | E3, R-1, R-3, R-4 | Brain (`doc`) |
| **E3. `doc` operativo y comparable a `dev`** | Tramo 1 del encargo (G0-G11) más lo de §7 (fase de ejecución: P18; insumos de Project) | P1-P5, P10, P18 | E2 (corridas reales), E4 | Brain |
| **E4. Relación código → documento y validez** | DC-5 y DC-6 para Project; a nivel Gene, Knowledge Determination | Diseño físico de KD (Genes); LAGUNA para Project | R-1 completo | Brain + Genes |
| **E5. Alcance Project/Domain/Gene** | Tramo 2 del encargo | P6/B2, P7; C1 para el alcance `domain` verificado | E6 | Brain |
| **E6. Conexión con Genes** | Contribution con activo `document`, continuidad de activos (si se elige O5) | Caller productivo; ratificación; bindings de Repository (RN §3); ids compatibles; KD | C2 (Location) | Genes + Authority |
| **E7. Integración al Mandate** | Action `doc` despachada. Con DJ-17, un doc después de cada intent (I-53) | Despacho `dis`→`doc`; suministro AITAP; Composition §6.2; `ArtifactRef` | Corridas gobernadas | MANDATE + AITAP |
| **E8. Coordinación con Location y Orrery** | Lista declarada por revisión; lectura de contenido; `captured_revision` | C2; reconciliación de I-19; retención histórica | — | Location + Genes |
| **E9. Niveles superiores** | Documentación de Domain, Organization y Tenant | C1; I-26 (ancla de Organization); sin requisito para Tenant | — | LAGUNA |
| **E-N. Nomenclatura** (transversal) | Ronda del procedimiento de verificación si se rehacen los nombres (§8) | AGENDA FOLLOWUP y José | E1, E3 | AGENDA FOLLOWUP |

**P17 cerrada (DJ-12):** las corridas disparadas por cambios entran al programa, así que E2 puede conectarse a un disparo automático. Queda una dependencia: para documentos que son activos de un Gene, decidir si siguen siendo válidos depende de la KD (requerimientos, diseño pendiente), y para documentos compartidos, de D-17. Para documentos de Project y de Nucleus, la relación código→documento sigue siendo una LAGUNA (DC-5).

---

## 14. Piloto

Sigue P-A primero y P-B después (DJ-7). Con el eje nuevo aparecen dos variantes para que José decida si P-A las incorpora:

| Variante | Qué agrega a P-A | Qué descubriría | Dependencias |
|---|---|---|---|
| **P-A** (como en v0.1) | Borrador del vertical "proyección estructural Domain/Gene de Gravity" | Gaps del pipeline; contrato de salida T1.8 | E3 (tramo 1) y P1 |
| **P-A.1** Movimiento y renombre | Después del primer borrador, mover o renombrar el documento y volver a correr `doc` | Cómo se comporta cada opción de §5 ante R-4; dónde se rompe la identidad (I-41, X-4) | E1 decidido, al menos para el piloto |
| **P-A.2** Cambio de código | Modificar `structural_projection.go` y volver a correr `doc` | Si existe o falta la relación código→documento (DC-5) fuera del Gene | E2 mínimo |
| **P-B** | Materialización en un store aislado, modo prueba | Si la salida cabe en `AssetRef`; con P-A.1, cómo el store trata un activo movido (X-4) | Harness en Go (código; consulta previa); ids nuevos; `repository_id` sintético, porque no hay flujo de bindings (RN §3) |

---

## 15. Pregunta abierta de fondo: ¿arreglar `doc` o crear una lógica documental nueva?

Sigue abierta (DJ-8). Con el eje nuevo, la comparación cambia así:

| Aspecto | Arreglar `doc` | Lógica nueva |
|---|---|---|
| Qué aporta el código existente | El pipeline `context`/`curation` → stage → merge, que hay que reparar (E3) | Nada; se construye |
| Identidad documental, detección y actualización viva (E1, E2, E4) | **Construcción nueva** | **Construcción nueva** |
| Identidad del Intent | Hereda `uuid3(nombre)` salvo IO-3 | Puede nacer con IO-3 |
| Motor de estado | Heredado salvo P10 | Puede nacer en el motor BSIP |
| Contrato firmado | El v4 ya firma `IntentType: "doc"` | Con otro nombre, choca con los contratos firmados |
| Dependencias externas (Genes, Authority, MANDATE, AITAP, KD, C1/C2) | Las mismas | Las mismas |

**Lo que muestra el relevamiento:** el eje del programa (E1, E2 y E4) es construcción nueva en los dos caminos. La elección afecta sobre todo a E3, a la identidad del Intent y al motor de estado.

---

## 16. Preguntas abiertas

| ID | Pregunta | Afecta |
|---|---|---|
| P1-P10 | Las del encargo de `doc`: canal de inteligencia, Jinja, formato de docbase, nombres de archivo, precondición de `finalize`, id del Project, uso del índice transitorio, G12, actualización de la spec, motor de estado | E3, E5 |
| P12 | ¿Quién reconcilia `captured_revision` con el schema de Location? | E8 |
| P13 | ¿Cuál de las tres versiones sobre el Tenant rige? | E8, E9 |
| P14 | Retención histórica de documentos de revisiones anteriores | E8 |
| P15 | Dueño de la documentación de nivel Organization | E9 |
| ~~P16~~ | Material fuera del repo | **Cerrada por DJ-10:** el `docs/` del repo queda fuera del sistema |
| ~~P17~~ | ¿DJ-11 reemplaza la exclusión de DJ-3? | **Cerrada por DJ-12:** sí; las corridas disparadas por cambios entran |
| **P18** | ¿`doc` necesita una fase de ejecución, como `dev`, para tareas complejas? | E3 |
| ~~P19~~ | Identidad documental | **Cerrada por DJ-13** |
| ~~P20~~ | Documentación de un Repository no producida por el sistema | **Cerrada por DJ-14:** fuera en esta etapa |
| **P21** | Identidad del Intent `doc`: ¿IO-1, IO-2 o IO-3? | E1, E6 |
| **P22** | Fuente de cambios para la detección: filesystem, Git (como evidencia), disparo explícito o corrida periódica | E2 |
| **P23** | Ancla de los documentos de nivel Organization (I-26) y de Project (I-27). Equivale a las preguntas 1 y 2 de RV §3 | E1, E9 |
| **P24** | Si se rehace la nomenclatura, ¿se abre una ronda del procedimiento de verificación? ¿Qué pasa con el código de la extensión, que el procedimiento no cubre? | E-N |
| **P25** | Documento compartido entre Genes: ¿se permite? Si se permite, ¿cómo se propaga la validez (D-17)? Dueño: Genes (RG §1-2) | E4, E6 |
| ~~P26~~ | Latencia del disparo | **Cerrada por DJ-15:** al terminar un `dev` (ver I-50) |
| **P27-P30** | Las preguntas para decidir el registro: qué cuenta como "el sistema", dónde vive, si viaja, precedencia en el estado intermedio | Anexo del registro §8; E1, E2 |
| **P31** | Reformulada bajo DJ-17: el doc que sigue a un `dev` sanea lo que el `dev` hizo. Sigue abierto si un `dev` puede mover, renombrar o borrar documentos del sistema y si reporta lo que hizo. Depende de la lista de cambios de `dev` (PD §3) | E2, E3 |
| **P32** | Reformulada bajo DJ-17: el intervalo pasa a ser "al terminar cada intent". Sigue sin definirse qué es "tiempo real" (R-6, I-50) | E2 |
| **P33** | Reformulada bajo DJ-17: el v4 firma un solo `doc`, después de `dis`; la política pide un doc después de cada intent (I-53). Dueño: José + MANDATE | E7 |
| ~~P34~~ | Alcance de cada doc | **Cerrada por DJ-23:** solo lo que cambió el intent anterior (ver la nota de la cabecera) |
| ~~P34-bis~~ | ¿El `doc` queda fuera de DJ-17? | **Cerrada por DJ-24:** sí; un doc no dispara otro |
| **P35** | El doc de DJ-17, ¿es una Action firmada del contrato o un paso de política del Mandate? | **Derivada a MANDATE (DJ-26)**, pedido R-M1. José decide después de la respuesta |
| **P36** | DJ-21, ¿describe el uso actual o es una regla que el sistema tiene que garantizar? (I-54) | **Abierta:** José no completó la opción. También va en R-M1, sin decidir | 
| ~~P37~~ | Un intent corrido a mano fuera de un Mandate, ¿también deja su doc? | **Respondida en parte por DJ-28:** lo lanza el propio sistema, después de cada intent. Lo que falta pasa a P37-bis |
| **P37-bis** | "Lo lanza el propio sistema": ¿qué pieza lo lanza fuera del Mandate (Brain al cerrar el intent, u otra)? ¿Vale también para un intent corrido a mano por CLI? | **Abierta.** Bloquea la etapa E4 |
| ~~P38~~ | ¿Corre el doc de un `exp` en `ready`? | **Cerrada por DJ-25:** corre igual; si no hubo cambios, no hay nada que sanear |
| **P39** | "Se vuelve a correr hasta que termina". Opciones de José, sin completar: lo vuelve a lanzar el sistema sin límite / lo lanza una persona después de agotar los reintentos (I-52) | **Abierta.** También va en R-M1, sin decidir. Bloquea T1.14 y E6 |
| **P40** | La Action `doc` que el v4 firma en la posición 3, ¿es el `doc` del `dis` según DJ-17, o es otra cosa? | E6; se le pide el dato a MANDATE |
| **P41** | ¿Quién detecta los cambios hechos fuera de un intent, si cada `doc` mira solo lo que cambió su intent? (I-59) | E3, E4 |
| ~~P42~~ | Project de prueba | **Cerrada:** `tests/brain/doc-intent-tests`, en la Mac, aislado y fuera de cualquier commit, con los cuatro archivos del vertical de Gravity |
| **P43** | Cómo se instala `pytest`, que no está declarado en Brain | Respondida para las pruebas: se instala solo en el entorno de prueba. **Abierta** la forma permanente, que se decide en la etapa 1. Antecedentes en el repo: H-4 del traspaso de E0 |
| ~~P44~~ | Traspasos | **Cerrada:** `docs/ANALYSIS/BSIP/DOC/TRASPASOS/Traspaso_E<n>_..._v1_0.md`, y lo mismo en el Project |
| **P47** | ¿Se unifican las ubicaciones del programa en el Project (I-60)? | — |
| **H-3** | La clave de Gemini para `plan` y `validate`: Brain lee `gemini-profiles` y el onboarding solo guarda `gemini-key:default`. ¿Se resuelve dentro de E1 (P1) o queda para otro dueño? | Bloquea G1(a) |
| **P45** | Nombre y lugar del comando único de pruebas, alcance y máquinas | PE §3.2 |
| **P46** | Quién comprueba la extensión, que no tiene pruebas | PE §4; E1, E4 |

---

## 17. Fuentes

**Agregadas en v0.5:**
- Mensaje de José sobre la política de documentación por intent y la responsabilidad de Impact (PD).
- Código: `installer/impact/{README.md, AGENTS.md, internal/contracts/contract.go, internal/evaluation/evaluate.go}`; `installer/nucleus/internal/orchestration/{watchers/mandate_watcher.go, temporal/worker.go, temporal/temporal_client.go, temporal/workflows/mandate_execution_workflow.go, mandatecontract/contract.go, activities/mandate_execution_activities.go}`; `installer/nucleus/internal/gene/{materializer.go, recovery.go}`; `brain/core/{intent_types.py, intent/experiment.py, intent/effect_ledger.py, intent_manager.py}`.
- Specs: `docs/BSIP/TYPES/{TST, MRG, DIS, EXP}_Intent_Spec_v1_0.md`.
- Project BTIPS: `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2; `Analisis_Estrategico_Cognituum_Evaluators_Arquitectura_Contrato_Datos_v0_1.md` §1; `Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` (EM-C12).

**Agregadas en v0.3:**
- Respuesta de Genes sobre documentos compartidos, renombres y digests (RG), recibida en esta sesión. Cita G1 §2 y §4, `assets.go:49` y los requisitos de lifecycle §3-4 y requisito 17.
- Mensaje de José con los requisitos de `doc` (MJ), recibido en esta sesión.

**Las de v0.1**, más:
- `ANALYSIS/DOC/Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md` (Project BTIPS), referido como RV.
- La respuesta de Nucleus sobre Organization, Project, Repository e instalación, recibida en esta sesión (RN). Cita `docs/ROLES/BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` §20, `ownershipcontract/schema.go`, `ownership.go`, `gravity_bootstrap.go`, `project_claim.go`, `project_catalog.go`, `authority_command.go`, `repository_binding_store.go`, `identity.go` y `ownership_reconciliation.go`.
- `tree/bloom/truth/VERIFICATION_AND_UPDATE_PROCEDURE.md`.
- `tree/bloom/bloom_bl_frontmatter_spec.txt`.
- `docs/BSIP/TYPES/DEV_Intent_Spec_v1_0.md`.
- Código: `brain/core/download_manager.py`, `brain/core/bloom_project_inspector.py`, `brain/requirements.txt`, `src/utils/gitManager.ts`, `src/commands/intent/createIntentDev.ts`, `src/initialization/commandRegistry.ts`, `src/api/adapters/BrainApiAdapter.ts`.

---

## 18. Política de documentación por intent: resumen del relevamiento

El detalle, con citas, está en el anexo PD.

| Punto | Resultado |
|---|---|
| Éxito de un intent | Solo `ing` (y `dis` en Brain) tienen evidencia con digest de que terminaron. `dev` y `doc` se marcan `completed` sin precondición. `exp` tiene validador, pero nadie lo llama. `asm`, `mrg` y `tst` son solo spec. Qué evidencia debe usarse es una LAGUNA (José + MANDATE; Brain por tipo) |
| Contrato del Mandate | El v4 firma un solo `doc` en la posición 3 y rechaza cualquier otra secuencia. La política pide un doc después de cada intent. El dueño del cambio es MANDATE, con la firma de Authority. Además, el Mandate hoy solo despacha `ing` |
| Qué cambió | Hay listas para `dev` (staging manifest), `ing` (ledger y resultado parseado) y `gen` (artefacto con digest). Para `dis` la lista es solo spec. Para `doc`, el pipeline está roto. `exp`, `asm`, `mrg` y `tst` no tienen lista. Los escritores que no son intents quedan fuera de la política tal como está escrita |
| Alcance de la serie | Se serializa dentro de un Mandate y entre dos ejecuciones del mismo Mandate. No se serializan Mandates distintos, corridas manuales, la extensión ni otras máquinas |
| Impact | Hoy no puede expresar la pregunta: sus hechos son numéricos, sin `payload`, y un tipo nuevo da indeterminado. Lo que Impact no hace y tendría que aportar quien llama: qué documentos toca cada doc, qué docs corren a la vez, la identidad de los documentos y el momento de la verificación. Las preguntas para el trabajo de Impact están en PD §5.3 |

---

## 19. Plan de ejecución

El plan está en el anexo PE (v0.2), rehecho según DJ-27 y DJ-28: seis etapas para reparar y extender `doc`, cada una con su compuerta, y el traspaso entre encargos. Lo que reparar `doc` puede romper está en PE §4 (R-1 a R-7), y José decide qué se mide. E0 se canceló; su registro está en `TRASPASOS/Traspaso_E0_Cancelada_v1_0.md`.

| Etapa | Dueño | Bloqueada hoy por |
|---|---|---|
| E1 Reparar el pipeline de `doc` | Brain | P1, P3, P4, P5, P10; H-3 |
| E2 Contrato de salida y "qué cambió" | Brain | Nada nuevo; `dis` espera R-B1 |
| E3 Registro documental | Brain o Nucleus (P28) | P27 a P31 |
| E4 El sistema lanza `doc` después de cada intent | Brain | P36, P37-bis, P39 |
| E5 Alcance (tramo 2) | Brain | P2, P6, P7 |
| E6 `doc` dentro del Mandate | MANDATE, con Brain | R-M1; P35, P36, P39, P40; R-A1 |
