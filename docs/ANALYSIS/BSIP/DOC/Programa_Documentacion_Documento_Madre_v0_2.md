# Programa de documentación — Documento madre v0.2

**Estado:** documento madre del programa. Relevamiento y mapa de opciones. **No autoriza implementación ni toma decisiones de modelo.**
**Fecha:** 2026-11-03
**Autoridad:** José Vigil
**Reemplaza a:** `Programa_Documentacion_Documento_Madre_v0_1.md` (2026-10-31), que se conserva como versión histórica y no se edita.

**Cambios respecto de v0.1:**
- El eje del programa pasa a ser la **actualización viva** y la **identidad documental**. En v0.1 eran fases finales (F5 y F6).
- Se corrige el alcance: el `docs/` del repositorio queda fuera del sistema.
- Se incorporan cuatro mapas nuevos: opciones de identidad documental (§5), detección de cambios y movimientos (§6), paridad entre `doc` y `dev` (§7) y fuentes de la nomenclatura (§8).
- Se incorporan el relevamiento de vinculación (`ANALYSIS/DOC/Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md`, en adelante **RV**) y la respuesta de Nucleus sobre Organization, Project, Repository e instalación (en adelante **RN**).
- Se asigna numeración definitiva a las inconsistencias N-01 a N-18 de RV (I-26 a I-43) y se agregan cinco nuevas (I-44 a I-48).

**Insumos anunciados que no llegaron a esta sesión:**
- la respuesta de Genes sobre documentos compartidos, renombres y digests;
- el mensaje de José que empieza con "Yo entiendo que vos sos una sesión paralela…".

Lo que aquí se dice de Genes sale del contrato G1, del concepto v3 y del código del store. Si la respuesta de Genes lo contradice, debe registrarse como inconsistencia.

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

## 1. Objetivo

`doc` debe convertirse en un **intent de actualización viva**: mantener al día el contenido y la integridad de la documentación del sistema, con una capacidad comparable a la de `dev` en tareas complejas. Como mínimo, tiene que reconocer que un documento movido o renombrado sigue siendo el mismo documento. Todo eso, alineado con Project, Domain y Gene y con la cadena Orrery → Location → (ASM/Postulate) → Mandate → Intents.

## 2. Alcance del sistema documental (corrección de José, 2026-11-03)

- **Dentro del sistema:**
  - la documentación que describen los árboles de Project y de Nucleus (`tree/bloom/truth/*`, con las maquetas y la descripción DESC como antecedentes);
  - la que produce el Intent `doc`.
- **Fuera del sistema:** el `docs/` de este repositorio. Son notas de trabajo hechas a mano. Con esto queda **cerrada la pregunta 3 de RV** (§3): los documentos de la plataforma no entran al grafo.
- **Requisito:** el sistema debe tener un mecanismo que identifique cualquier archivo de documentación propio. La nomenclatura actual puede rehacerse si hace falta (§8).
- **Sin definir:** si la documentación de un Repository de usuario que el sistema no produjo (README, `docs/` de un proyecto del Paladín) puede **incorporarse** al sistema registrándose, o queda siempre fuera. Ver P20.

## 3. Decisiones vigentes de José

| # | Decisión | Estado |
|---|---|---|
| DJ-1 | `doc` documenta Gene, Domain y Project, con el alcance como campo de la entrada. Hoy solo Project es alcanzable | Vigente |
| DJ-2 | La salida es un borrador, diseñada para entrar después a una Contribution con activo `document` | Vigente |
| DJ-3 | Corre a mano por CLI en las fases de reparación y como Action del Mandate después. "Quedan fuera las corridas disparadas por un cambio material" | **En tensión con DJ-11.** Ver P17 |
| DJ-4 | Quién persiste el archivo final es una dependencia externa (Composition §6.2) | Vigente |
| DJ-5 | El alcance `gene` referencia el `gene_id` del store | Vigente |
| DJ-6 | Postulate: se registran las dos versiones, sin elegir | Vigente |
| DJ-7 | Piloto: P-A primero, P-B después, con consulta antes de escribir código | Vigente; ver §14 |
| DJ-8 | Arreglar `doc` o crear una lógica nueva: pregunta abierta | Vigente; ver §15 |
| DJ-9 | Estado operativo: no autorizado en esta sesión | Vigente. RV lo leyó con permiso en su propia sesión |
| DJ-10 | El `docs/` del repo queda fuera del sistema (§2) | Nueva |
| DJ-11 | `doc` es un intent de actualización viva y esa es la prioridad del programa; tiene que ser tan capaz como `dev`, mantener contenido e integridad y reconocer movimientos y renombres | Nueva |

## 4. Requisitos centrales y restricciones de las fuentes

### 4.1 Requisitos (DJ-11)

| ID | Requisito |
|---|---|
| R-1 | `doc` es un intent de **actualización viva**, no un generador de una sola vez |
| R-2 | Capacidad comparable a `dev` en tareas complejas |
| R-3 | Mantiene al día el **contenido** y la **integridad** de los archivos documentales |
| R-4 | Reconoce que un documento **movido o renombrado sigue siendo el mismo** |
| R-5 | El sistema identifica cualquier archivo de documentación propio (§2) |

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
| Genes | `asset_id` = digest de `{project_id, repository_id, repository_relative_path}`. Sin alias ni campo de continuidad | **No.** Otra ruta da otro `asset_id`. La Revision nueva tendría un activo nuevo y la anterior el viejo, sin vínculo entre ambos | `assets.go:131-143`; `model.go:53-60, 89-100` |
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
| **O2. Huella de contenido** | La identidad es el `sha256` | IMPL como evidencia (Genes, Mandate) | **No.** Identifica versiones, no documentos; un renombre sin edición coincidiría, pero eso es inferencia (X-3) | Bajo | Genes | Ninguno | Ninguno | Comparar digests; unificar formato (I-32) |
| **O3. Id portado dentro del archivo** | Cada documento del sistema lleva un id estable en su encabezado; mover o renombrar no lo cambia | **Ninguna fuente lo propone.** El frontmatter `.bl` existe como PROP sin campo de id | Sí, mientras el encabezado se conserve | Medio a alto: todo productor escribe y preserva el id; hay que definir qué pasa con copias y duplicados; solo aplica a formatos que admiten encabezado | Brain (`doc`) + dueño de la spec `.bl` | **Cambio de contrato G1:** el `asset_id` sigue siendo ruta (X-4), así que haría falta un campo nuevo en `AssetRef` o un alias que relacione el id portado con los `asset_id` sucesivos | Ninguno directo; en todo caso un índice si se consulta por id | Escribir y validar el id; detectar duplicados; spec de encabezado |
| **O4. Registro gobernado externo** | Un registro mapea un id de documento a su ruta vigente. Los movimientos se registran como eventos explícitos | **Ninguna fuente lo propone** | Sí, si cada movimiento se registra | Alto: store nuevo, concurrencia, reconciliación con el filesystem | LAGUNA: Brain o Nucleus | Si el registro es de Genes: equivale a O5. Si no, Genes lo consume como proyección o lo ignora | Si vive en Nucleus: store nuevo bajo `.nucleus-{org}/` y su lifecycle | Si vive en Brain: store por Project bajo `.bloom/`; `doc` lo actualiza |
| **O5. Continuidad declarada en la Contribution** | La Contribution declara "el activo de la ruta A continúa en la ruta B"; la Revision nueva conserva el vínculo | **Ninguna fuente lo propone.** Encaja con X-1 y X-3 porque la continuidad se declara y se ratifica, no se infiere | Sí, a nivel Gene | Medio: cambio de schema de Contribution y Revision, y del digest canónico | Genes | **Cambio de contrato G1 y de `model.go`:** un campo de continuidad por activo, con verificación (por ejemplo, el digest previo debe existir en la Revision base) | Ninguno | `doc` emite la declaración en su salida (T1.8) |
| **O6. Detección por Git** | Usar la detección de renombres de Git | Git solo como evidencia (X-2); la detección de Git es por similitud (X-3) | Parcial; heurística | Bajo | Brain | Ninguno | Ninguno | Leer el historial de Git. La extensión hoy no distingue renombres (`gitManager.ts:87-102`) |
| **O7. Identidad del filesystem** | inode o file ID | Ninguna | Solo en la misma máquina y el mismo volumen; se pierde con clone, checkout o copia | Bajo local; no portable | Brain | Ninguno | Ninguno | Watcher local (`watchdog` está declarado en `brain/requirements.txt` y no se usa en el código revisado) |

**Combinaciones posibles, sin elegir:** O3 u O4 dan la identidad del documento en todos los niveles; O5 la lleva al registro ratificable del Gene. O2 queda como evidencia de integridad (R-3), no de identidad. Cualquier combinación que incluya O3, O4 u O5 modifica el contrato G1 o crea una fuente nueva.

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
| I-43 | N-18 | Un activo en varios Genes | Técnicamente posible (el `asset_id` no lleva `gene_id`) | Ninguna regla lo decide (B4 de RV; dueño Gene v3). La respuesta de Genes sobre este punto no llegó a esta sesión |

### 12.3 Nuevas en v0.2

| ID | Tema | Versión 1 | Versión 2 |
|---|---|---|---|
| I-44 | Nombre de los insumos de estrategia del Project | Árbol: `.dev.strategy.context.bl`, `.dev.strategy.standards.bl` | Inspector: `.{strategy}.strategy.context.bl` / `.standards.bl` (`bloom_project_inspector.py:98-99`) |
| I-45 | Carpeta de intents en la extensión | Brain: `.bloom/.intents/.dev/` (`intent_manager.py:622-626, 744`) | Extensión: `.bloom/intents/dev` (`createIntentDev.ts:16`) |
| I-46 | Etapas aceptadas por `download` | Las de `dev` (`briefing`, `execution`, `refinement_N`) y las de `doc` (`context`, `curation_N`) | `["briefing", "analysis", "implementation", "review"]` (`download_manager.py:375-379`) |
| I-47 | Estado de `dev` | "Completamente funcional en producción" (DEV spec §0) | `plan`/`build` "sin verificar" (DEV spec §3.2); `download` rechaza sus etapas (I-46); el parser lee `.json` y la spec dice `.txt` (I-01) |
| I-48 | Requisito de renombre frente al principio de no inferencia | R-4: reconocer que un documento movido sigue siendo el mismo (DJ-11) | X-3: no inferir traslados por similitud (Closure A3); Git renames por similitud (X-2). No es contradicción entre fuentes: es una restricción de diseño que condiciona R-4 |

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
| **E7. Integración al Mandate** | Action `doc` despachada | Despacho `dis`→`doc`; suministro AITAP; Composition §6.2; `ArtifactRef` | Corridas gobernadas | MANDATE + AITAP |
| **E8. Coordinación con Location y Orrery** | Lista declarada por revisión; lectura de contenido; `captured_revision` | C2; reconciliación de I-19; retención histórica | — | Location + Genes |
| **E9. Niveles superiores** | Documentación de Domain, Organization y Tenant | C1; I-26 (ancla de Organization); sin requisito para Tenant | — | LAGUNA |
| **E-N. Nomenclatura** (transversal) | Ronda del procedimiento de verificación si se rehacen los nombres (§8) | AGENDA FOLLOWUP y José | E1, E3 | AGENDA FOLLOWUP |

**Tensión registrada (P17):** DJ-3 excluye las corridas disparadas por un cambio material porque dependen de la validez de la documentación, que sigue en requerimientos. DJ-11 pone la actualización viva como prioridad. E2 y E4 son justamente esa capacidad. Mientras P17 no se responda, E2 se puede diseñar, pero no conectarse a un disparo automático.

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
| **P17** | ¿DJ-11 reemplaza la exclusión de DJ-3? ¿Entran al programa las corridas disparadas por cambios, aunque dependan de KD? | E2, E4 |
| **P18** | ¿`doc` necesita una fase de ejecución, como `dev`, para tareas complejas? | E3 |
| **P19** | Identidad documental: ¿qué opción o combinación de §5 se evalúa primero? | E1 |
| **P20** | ¿La documentación de un Repository que el sistema no produjo puede incorporarse al sistema, o queda siempre fuera? | §2, E1 |
| **P21** | Identidad del Intent `doc`: ¿IO-1, IO-2 o IO-3? | E1, E6 |
| **P22** | Fuente de cambios para la detección: filesystem, Git (como evidencia), disparo explícito o corrida periódica | E2 |
| **P23** | Ancla de los documentos de nivel Organization (I-26) y de Project (I-27). Equivale a las preguntas 1 y 2 de RV §3 | E1, E9 |
| **P24** | Si se rehace la nomenclatura, ¿se abre una ronda del procedimiento de verificación? ¿Qué pasa con el código de la extensión, que el procedimiento no cubre? | E-N |

---

## 17. Fuentes

**Las de v0.1**, más:
- `ANALYSIS/DOC/Relevamiento_Vinculacion_Documental_Arbol_Estructural_v0_1.md` (Project BTIPS), referido como RV.
- La respuesta de Nucleus sobre Organization, Project, Repository e instalación, recibida en esta sesión (RN). Cita `docs/ROLES/BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` §20, `ownershipcontract/schema.go`, `ownership.go`, `gravity_bootstrap.go`, `project_claim.go`, `project_catalog.go`, `authority_command.go`, `repository_binding_store.go`, `identity.go` y `ownership_reconciliation.go`.
- `tree/bloom/truth/VERIFICATION_AND_UPDATE_PROCEDURE.md`.
- `tree/bloom/bloom_bl_frontmatter_spec.txt`.
- `docs/BSIP/TYPES/DEV_Intent_Spec_v1_0.md`.
- Código: `brain/core/download_manager.py`, `brain/core/bloom_project_inspector.py`, `brain/requirements.txt`, `src/utils/gitManager.ts`, `src/commands/intent/createIntentDev.ts`, `src/initialization/commandRegistry.ts`, `src/api/adapters/BrainApiAdapter.ts`.
