# Orrery — estado completo para la gestión de Antigravity

| Campo | Valor |
|---|---|
| Fecha de corte | 2026-11-14 |
| Tipo | Informe de estado y tablero de tareas. **No es norma ni aprueba diseño.** |
| Autoridad de diseño | José Vigil |
| Redacta | Cowork ORRERY (nube, con acceso de lectura a la Mac "Darwin") |
| Destinatario | Antigravity (Windows), que gestiona las tareas del cowork en Darwin y de Codex en Windows |
| Estado del frente | **EN PAUSA** por decisión de José hasta que se cumplan las condiciones de §2 |

## 0. Cómo leer las rutas

- Todas las rutas son **relativas a la raíz del repositorio** `bloom-development-extension`.
  - En Windows: `C:\repos\bloom-development-extension\`.
  - En Darwin: `/Users/josevigil/repos/bloom-development-extension/`.
- Las rutas se escriben con `\` para Windows. En Darwin son las mismas con `/`.
- **Verificación previa obligatoria en Windows.** Lo de este informe se verificó en el checkout de **Darwin** el 2026-11-14. Antes de usar cualquier ruta, comprobá con `git log` y `git status` que el checkout de Windows tenga los mismos archivos. Las corridas de `IMAGES\V_02\` las puso José en Darwin y este informe no comprobó si están commiteadas.
- Marcas de estado:
  - **REPO**: el archivo está en el repo de Darwin.
  - **FUERA DEL REPO**: está solo en las salidas del cowork en la nube; Windows no lo ve (ver §6).
  - **NO EXISTE**: ausencia comprobada.

## 1. Qué es Orrery y en qué punto está

Orrery es la experiencia espacial 3D de Cognituum. Muestra el Territorio de un Project (Tenant, Organization, Project, Domain, Gene, Repository) como un Espacio navegable, con una Superficie de detalle. Tiene además Lentes que proyectan información sobre las Entidades.

El código del prototipo es `installer\conductor\workspace\core\orrery\`. Usa Vite + TypeScript + PlayCanvas y está **congelado por D-4**: no se toca.

**Punto actual:**

1. La norma está cerrada y versionada (§3.1).
2. José definió la estructura visual del **Universo Fase 1**, una ciudad sobre una placa madre:
   - el Tenant es la base;
   - las Organizations son cuadrados dentro del Tenant;
   - los Projects son manzanas, con autopistas entre ellas;
   - los Domains son edificios, con calles entre ellos, y la altura depende de cuántos Genes tienen;
   - cada Gene es un piso dentro de cada Domain con el que tiene Relación;
   - las **tuberías** unen solo apariciones del mismo Gene y se ven solo con Foco.
3. Se hicieron cuatro cortes espaciales en PlayCanvas (01 a 04).
4. Sobre el corte 04 se armaron **cuatro corridas comparables** (C0 a C3). Exploran cómo un Gene deja de ser una placa con texto y deja explorar su función, revisiones, apariciones y activos.
5. Las corridas se entregaron el 2026-10-30. **José todavía no eligió dirección** y quedan abiertas 8 preguntas (§4.2).
6. **Ningún dato es real.** No hay lector del store de Genes hacia Orrery. La Relación Domain↔Gene no tiene productor. No se leyó el estado productivo de Nucleus. Las corridas usan valores simulados con la forma exacta del store G1, o el fixture de prueba del repo, y cada campo declara de dónde viene.

## 2. Por qué está en pausa y qué la levanta

José decidió no avanzar Orrery hasta que se cumplan las dos condiciones siguientes:

| # | Condición | Quién la lleva | Dónde mirar | Por qué condiciona a Orrery |
|---|---|---|---|---|
| P-1 | **Genesis terminado y su grafo disponible** | Codex y Antigravity, en Windows | `docs\MANDATE\GENESIS\` y el traspaso vigente de Genesis | Es la primera fuente real de Domains, Genes y sus Relaciones. Sin ese grafo la ciudad solo puede mostrarse con datos simulados. |
| P-2 | **Nuevo intent `doc` consolidado**: documentación integrada a la estructura Tenant, Organization, Project, Domain y Gene | Cowork "DOC Intent", en Darwin | `docs\ANALYSIS\BSIP\DOC\` (§3.4) | Define cómo se documentan y se identifican los documentos de cada nivel. Esa es la capa "conocimiento" del Gene que la Superficie de Orrery quiere mostrar. |

**Criterio sugerido para reanudar:** cuando P-1 y P-2 estén cerradas, Antigravity le pide al cowork ORRERY un **relevamiento de datos reales**, de solo lectura, que rehaga la matriz Fuente→dato del informe de corridas (§3.3, informe §2) contra el grafo de Genesis y el registro documental de `doc`. Con ese resultado José elige la dirección de las corridas.

## 3. Mapa de rutas

### 3.1 Norma vigente (manda sobre todo lo demás)

| Archivo | Estado |
|---|---|
| `docs\ANALYSIS\ORRERY\Orrery_Estado_Base_v1_0.md` | REPO. Índice del estado normativo |
| `docs\ANALYSIS\ORRERY\Orrery_Vocabulario_Normativo_v1_1.md` | REPO. Vigente (la v1.0 es histórica) |
| `docs\ANALYSIS\ORRERY\Orrery_Constitucion_v1_1.md` | REPO. Vigente, C-1..C-17 |
| `docs\ANALYSIS\ORRERY\Orrery_Decisiones_Arquitectonicas_v1_1.md` | REPO. Vigente, D-1..D-4 (D-4: código congelado) |
| `docs\ANALYSIS\ORRERY\EXPERIENCE\Orrery_Experience_Model_v1_0.md` | REPO. Vigente (la v0.1 es histórica) |
| `docs\ANALYSIS\ORRERY\LOCATION\ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md` y `Orrery_LocationSnapshot_v0.md` | REPO. Location |

### 3.2 Research y evidencia previa

| Archivo | Estado |
|---|---|
| `docs\ANALYSIS\ORRERY\VISUAL\Orrery_Morphological_Spatial_Language_Research_v0_1.md` | REPO. Research morfológico (G-1..G-10) |
| `docs\ANALYSIS\ORRERY\VISUAL\Orrery_Channel_Budget_Interaction_Reservation_v0_1.md` | REPO. Presupuesto de canales; deja preguntas abiertas (RI-3, DP-c) |
| `docs\ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Research_Lente_Seleccion_Indicacion_v0_2.md` | REPO. Lente, selección e indicación |
| `docs\ANALYSIS\ORRERY\INTERACTION\Orrery_Interaction_Experiment_Protocol_v0_1.md` | REPO. **Borrador histórico.** José rechazó el corte por tiempo; sus umbrales no están aprobados |
| `docs\ANALYSIS\ORRERY\INTERACTION\Orrery_Correccion_Continuidad_Protocolo_2026-10-18.md` | REPO |
| `docs\ANALYSIS\ORRERY\ENCARGOS\` (3 encargos) | REPO. Encargos de research ya cumplidos |
| `docs\ANALYSIS\ORRERY\UI\` (8 documentos) | REPO. Integración UI, LocationFirst, Gateway UX; contexto |

### 3.3 Universo Fase 1, cortes y corridas (trabajo vivo)

| Archivo | Estado |
|---|---|
| `docs\ANALYSIS\ORRERY\VISUAL\Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md` | REPO (commit `87893ef9`). **Definición de José, base visual vigente.** Research, no norma. Su §8 contiene D-E1..D-E6 |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_01\` (10 PNG) | REPO. Capturas del corte 04, con datos simulados |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\C0_linea_base.html` | REPO en Darwin. Corrida C0 |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\C1_ficha_en_capas.html` | REPO en Darwin. Corrida C1 |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\C2_gene_por_lentes.html` | REPO en Darwin. Corrida C2 |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\C3_despiece_FN.html` | REPO en Darwin. Corrida C3 (fuera de norma) |
| `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\*.png` (10) | REPO en Darwin. Capturas de las corridas |
| `docs\ANALYSIS\ORRERY\VISUAL\primer_corte\index.html` | REPO. Maqueta SVG inicial (Codex) |
| `docs\ANALYSIS\ORRERY\VISUAL\primer_corte\index-1.html` | REPO. **Corte espacial 01** (a pesar del nombre) |
| `docs\ANALYSIS\ORRERY\VISUAL\escena_gris\index_1.html` | REPO. Escena gris, evidencia técnica de PlayCanvas |
| `docs\ANALYSIS\ORRERY\VISUAL\corte_espacial_04\capturas\` | REPO en Darwin, **sin seguimiento en git. Duplicado de `IMAGES\V_01`.** Hay que borrarlo (T-03) |
| Informe de las corridas: `Orrery_Corridas_Fase1_Gene_Informe_v0_1.md` | **FUERA DEL REPO.** Contiene la matriz Fuente→dato, las diferencias y las 8 preguntas (§6) |
| HTML de los cortes 02, 03 y 04 | **FUERA DEL REPO.** C0 es el corte 04 rotulado |

**Cómo abrir las corridas.** Abrí el HTML en el navegador; no hace falta servidor, pero sí conexión, porque PlayCanvas 2.22.1 se carga desde jsDelivr. Parámetros de URL:

- `?T=T3&foc=p0_0_g0`: mismo caso en las cuatro corridas, un Gene con 3 revisiones y 2 apariciones. `T=T1|T2|T3` cambia la escena simulada.
- `?env=fixture&foc=p0_0_g0`: carga el fixture del repo tal cual.

**Teclas:**

| Teclas | Función |
|---|---|
| I, R, O, Z, K, T | Alternan las variantes de D-E1..D-E6 |
| P | Pisos apilados o repartidos |
| 1–6 | Lentes, solo en C2 |

Cada corrida declara en pantalla CORRIDA y ENTORNO. Cada campo de la Superficie lleva una etiqueta de Fuente: `G1 · valor simulado`, `FIXTURE test_only`, `SIMULADO · sin productor`, `NO DISPONIBLE`, `calculado en el cliente` o `HIP`.

| Corrida | Qué cambia en el Gene | Norma |
|---|---|---|
| C0 · Línea base | Corte 04 sin cambios: placa con texto | Dentro |
| C1 · Ficha en capas | El piso muestra solo el id y `×N` apariciones. La Superficie tiene 4 capas: identidad y estado, indicación, detalle y conocimiento. Es navegable por revisión, aparición y Repository | Dentro |
| C2 · Gene por Lentes | C1 más tres Lentes hipotéticas sobre el Gene, con glifos en el piso: P-R1 (revisiones), P-K1 (activo `document`) y P-D1 (vigencia documental, activa sin datos) | Mecanismo dentro; las Proyecciones no existen |
| C3 · Despiece [FN] | C1 más láminas por revisión anterior y puertos por activo, en el Espacio | **Fuera de norma** (C-6, EM §5.7) |

### 3.4 Fuentes de otros sistemas que Orrery consume

| Archivo o ruta | Qué aporta | Estado para Orrery |
|---|---|---|
| `docs\GENES\COGNITUUM_GENE_CONCEPT_v3_0.md` | Qué es un Gene; Relación Domain↔Gene N:M | Norma de Genes |
| `docs\GENES\COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md` | Store G1 y extensión G2 | G1 declara que **no integra Orrery** |
| `docs\GENES\GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md` | Vigencia de la documentación de un Gene | Solo requerimientos |
| `installer\nucleus\internal\gene\` (`model.go`, `store.go`, `materializer.go`, `assets.go`) | Código del store G1 | Existe; **sin lector hacia Orrery**. `relations\domain-gene\` está reservado y nadie escribe ahí. Estado del Gene: solo `active` |
| `installer\nucleus\internal\gene\testdata\authorized_first_gene.json` | Fixture `test_only`, sintético | Lo usa el entorno `fixture` de las corridas |
| `docs\ANALYSIS\BSIP\DOC\` | Programa de documentación e intent `doc`. Documento madre v0.7; encargos de doc autocontenido y actualización viva; `Ficha_Interfaz_Doc_Nucleus_v1_0.md`; `TRASPASOS\` (P0, E0 cancelada, D1 Brain) | **En curso** (cowork DOC Intent). Es la condición P-2 |
| `docs\MANDATE\GENESIS\` | Genesis | **En curso** (Windows). Es la condición P-1 |

### 3.5 Traspasos e índices de continuidad de Orrery

| Archivo | Estado |
|---|---|
| `docs\ANALYSIS\ORRERY\Orrery_Traspaso_Cloud_Darwin_Estado_Recoleccion_y_Genes_2026-10-30.md` | REPO. **Encargo vigente.** Pasa de Codex al cowork en Darwin; preguntas de datos (§4) y requerimiento (§5) |
| `docs\ANALYSIS\ORRERY\Orrery_Traspaso_Codex_Estado_y_Orden_de_Lectura_v1_0.md`, `Orrery_Traspaso_Codex_Windows_v1_0.md` | REPO. Históricos (etapa en Codex) |
| `docs\ANALYSIS\ORRERY\Orrery_Continuidad_Local_2026-10-18.md`, `Orrery_Cierre_Exploracion_Codex_y_Verificacion_Cloud_2026-10-24.md` | REPO. Procedencia y cierre del primer corte |
| Este informe | Propuesto para `docs\ANALYSIS\ORRERY\Orrery_Estado_para_Gestion_Antigravity_2026-11-14.md` |

## 4. Tablero de tareas

### 4.1 Hechas

| ID | Tarea | Resultado |
|---|---|---|
| H-01 | Norma v1.1 y Experience Model v1.0 | REPO |
| H-02 | Research morfológico, de canales y de interacción | REPO |
| H-03 | Cortes espaciales 01–04 | 01 en REPO; 02–04 FUERA DEL REPO (04 = C0) |
| H-04 | Actas Gene "matrioska", v0.1 a v0.3 (hipótesis H-6..H-13) | FUERA DEL REPO. José descartó las formas F-B, F-C y la hipótesis H-8 |
| H-05 | Relevamientos: dinamismo Location→Postulate→Mandate; casos Location→Mandate y colisión; contraste de colisión Impact vs norma | FUERA DEL REPO. La definición de colisión es de Impact; José cerró esa discusión |
| H-06 | Definición del Universo Fase 1 | REPO (`87893ef9`) |
| H-07 | Corridas C0–C3 con el informe | HTML y PNG en REPO (`IMAGES\V_02`); informe FUERA DEL REPO |

### 4.2 Esperando decisión de José (no bloquean nada mientras dure la pausa)

| ID | Decisión | Fuente |
|---|---|---|
| J-01 | ¿El piso del Gene dice algo más que su identidad? | Informe de corridas §5.1 |
| J-02 | Si dice algo, ¿por Lentes (C2) o por forma (C3, exige versionar la norma)? | §5.2 |
| J-03 | ¿Qué Proyecciones sobre el Gene se le piden al dueño de Genes? (P-R1, P-K1, P-D1) | §5.3 |
| J-04 | ¿Hace falta comparar una revisión capturada con la vigente, o alcanza con saber cuántas hay? | §5.4 |
| J-05 | ¿El Repository sirve como entrada a los activos? Es un índice calculado, no una Relación | §5.5 |
| J-06 | ¿Se autoriza leer el store real de Genes? José tiene que indicar ruta y campos | §5.6 |
| J-07 | ¿Se plantean al dueño de Genes los contratos de lectura del store G1 y de la Relación Domain↔Gene hacia Orrery? | §5.7 |
| J-08 | D-E1 Identificación del Gene en el Espacio (no tiene nombre; EM §4.4) | Definición §8 |
| J-09 | D-E2 Dónde viven los Repositories y los Genes sin Domain | Definición §8 |
| J-10 | D-E3 Clave neutra para ordenar los pisos | Definición §8 |
| J-11 | D-E4 Figura urbana de la Organization | Definición §8 |
| J-12 | D-E5 Resaltado de la tubería: luminosidad o color | Definición §8 |
| J-13 | D-E6 Apertura de pilas: animada (RI-3) o instantánea | Definición §8 |
| J-14 | Arrastrados de antes: N-4, RI-3, aceptación de H-14 | Actas y relevamientos |

### 4.3 Dependen de otros dueños

| ID | Necesidad | Dueño | Relación con la pausa |
|---|---|---|---|
| O-01 | Lector del store G1 hacia Orrery (identidad, head, revisiones, activos, Contribution) | Genes | Revisar después de P-1 |
| O-02 | Productor y lector de la Relación Domain↔Gene | Genes / Genesis | **El grafo de Genesis podría resolverlo**: verificarlo al cerrar P-1 |
| O-03 | Identidad canónica de Domain: propuesta ING vs declarada vs ratificada | Genesis / Domains | P-1 |
| O-04 | Enmienda de Genes: que todo Gene tenga al menos un Domain (afecta D-E2) | Genes | Independiente |
| O-05 | Contrato de lectura del contenido de documentos y de su vigencia | Genes y programa doc | P-2 |
| O-06 | Proyecciones P-R1, P-K1 y P-D1 si José las elige (J-03) | Genes | Después de J-03 |

### 4.4 Tareas del cowork ORRERY

| ID | Tarea | Estado | Bloqueo |
|---|---|---|---|
| T-01 | Llevar al repo el informe de corridas y los documentos FUERA DEL REPO (§6) | Pendiente | Necesita la lista aprobada por José |
| T-02 | Guardar este informe en el repo o en el Project | Pendiente | Aprobación de José |
| T-03 | Borrar el duplicado `docs\ANALYSIS\ORRERY\VISUAL\corte_espacial_04\` (sin seguimiento en git) | Pendiente | José lo borra en Darwin (`rm -r docs/ANALYSIS/ORRERY/VISUAL/corte_espacial_04`); el cowork no tiene shell |
| T-04 | Relevamiento de datos reales contra el grafo de Genesis y el registro de `doc` (rehacer la matriz Fuente→dato) | **En pausa** | P-1 y P-2 |
| T-05 | Próximo corte visual según la dirección que elija José (C1, C2 o una mezcla) con datos reales donde existan | **En pausa** | T-04 y J-01..J-13 |
| T-06 | Caso de prueba del traspaso del 30/10 §4: un Gene en dos Domains con activos en un Repository, mostrado con datos reales | **En pausa** | O-01, O-02 |

## 5. Reglas de trabajo para este frente

1. **El código de Orrery está congelado** (D-4): no se modifica `installer\conductor\workspace\core\orrery\`.
2. **La norma no se edita hacia atrás**: los cambios se hacen con una versión nueva en un archivo nuevo. Los contratos de otros sistemas no se tocan; lo que requiera enmienda se le lleva a José.
3. **Git y push los hace José.** Ningún agente commitea.
4. **Escritura en el repo o en el Project:** las solicitudes de investigar o proponer son de solo lectura. Escribir requiere un pedido concreto de José; ante una ampliación de alcance, consultar.
5. **No leer estado operativo**: ni `.bloom`, ni `BloomNucleus`, ni el store de Nucleus, salvo que José indique un archivo y un campo exactos.
6. **No inventar datos.** Lo que no tiene productor se rotula `NO DISPONIBLE` o `SIMULADO`. Un fixture no es evidencia productiva.
7. **No reabrir lo cerrado**: Orrery es 3D; la cámara y la elección del Espacio no se discuten; la definición de colisión es de Impact.
8. En los informes, separar siempre: código implementado, prueba realmente corrida e integración pendiente.

## 6. Material que todavía no está en el repo

Lo tiene el cowork ORRERY en la nube y **Windows no puede verlo**. Si José aprueba (T-01), se copiaría a estas rutas:

| Archivo | Ruta propuesta en el repo |
|---|---|
| `Orrery_Corridas_Fase1_Gene_Informe_v0_1.md` | `docs\ANALYSIS\ORRERY\VISUAL\IMAGES\V_02\` (junto a las corridas) |
| `Orrery_Acta_Gene_Matrioska_Hipotesis_H6_H8_v0_1.md`, `..._v0_2.md`, `Orrery_Acta_Gene_Matrioska_Hipotesis_H6_H13_v0_3.md` | `docs\ANALYSIS\ORRERY\VISUAL\ACTAS\` |
| `Orrery_Relevamiento_Dinamismo_Location_Postulate_Mandate_v0_1.md` | `docs\ANALYSIS\ORRERY\LOCATION\` |
| `Orrery_Relevamiento_Casos_Location_Mandate_y_Colision_v0_1.md` | `docs\ANALYSIS\ORRERY\LOCATION\` |
| `Orrery_Contraste_Colision_Impact_vs_Norma_v0_1.md` | `docs\ANALYSIS\ORRERY\LOCATION\` |
| `Orrery_Relevamiento_Estructura_Base_Universo_Fase1_v0_1.md` | `docs\ANALYSIS\ORRERY\VISUAL\` |
| HTML de los cortes 02 y 03 (el 04 ya está como C0) | `docs\ANALYSIS\ORRERY\VISUAL\cortes\corte_espacial_02\index.html` y `...\corte_espacial_03\index.html` |

## 7. Preguntas que Antigravity puede evaluar con Codex mientras dure la pausa

Son preguntas de lectura que ayudan a levantar la pausa sin tocar Orrery:

1. ¿El grafo que produce Genesis incluye Domains con identidad, Genes con `gene_id` del store G1 y la Relación Domain↔Gene ratificada? ¿En qué formato y dónde queda persistido? (O-02, O-03)
2. ¿Genesis escribe en `relations\domain-gene\` del store G1 o en otra parte (GravityGraph `DOMAIN_GENE`)? ¿Hay un único lugar de verdad?
3. ¿El grafo de Genesis declara cobertura? Es decir, ¿se puede distinguir *no hay Genes* de *no se sabe*?
4. ¿El registro documental del nuevo `doc` (en Brain, por Project) expone qué documentos tiene cada Gene y su vigencia, de modo que P-K1 o P-D1 puedan leerse de ahí? (O-05)
5. ¿Qué Repositories enumera el Project después de Genesis? Hace falta para D-E2.

---

*Documento de estado, no normativo. Ante una divergencia, manda el documento fuente citado.*
