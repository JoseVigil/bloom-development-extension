# Programa de documentación — Documento madre v0.1

**Estado:** documento madre del programa. Relevamiento y plan por fases. **No autoriza implementación.**
**Fecha:** 2026-10-31
**Autoridad:** José Vigil
**Alcance:** Orrery, Location, ASM/Postulate, Mandate, Intents, Genes y Domains, en lo que toca a la documentación, en todos los niveles (Tenant, Organization, Project, Domain y Gene).
**Detalle de las fases 1 y 2:** el encargo "Homologar el intent `doc` a Project, Domain y Gene (borrador v0.1)" de esta misma sesión. Este documento no lo reemplaza: lo ubica dentro del programa.

### Convenciones de estado

| Marca | Significado |
|---|---|
| **IMPL** | Definido e implementado (código citado) |
| **ESPEC** | Definido y especificado (norma o contrato citado, sin código) |
| **PROP** | Propuesto (research, ADR candidato, roadmap o documento no normativo) |
| **NO EXISTE** | Ausencia comprobada en lo revisado |
| **LAGUNA** | No definido; se indica el dueño probable |

### Límites de la evidencia

- El código se leyó copiado desde el checkout de la Mac de José (`~/repos/bloom-development-extension`), sin shell ni Git.
- Las búsquedas negativas cubren exactamente lo copiado:
  - `brain/{cli, commands, core, shared}`;
  - `src/` de la extensión;
  - los paquetes de `installer/nucleus` de authority, governance, core, gene, gravity, mandate*, orchestration, supervisor y tools.
- No se revisaron `installer/conductor`, `webview`, `backend` ni `installer/aitap`. Lo que se dice de ellos viene de las investigaciones que se citan.
- **No se leyó estado operativo** (`~/Library/BloomNucleus`, `.bloom/` de Projects): José no lo autorizó todavía.
- **Material fuera del repo:** José no lo informó. Codex declaró que no puede certificar archivos no commiteados en otras sesiones.
- Contradicciones: cuando dos fuentes chocan, se muestran ambas y no se elige.

---

## 1. Objetivo del programa

Crear la documentación de punta a punta, mantenerla actualizada y coordinarla con un mecanismo que entienda Project, Domain y Gene, alineada con la cadena Orrery → Location → (ASM/Postulate) → Mandate → Intents.

## 2. Decisiones vigentes de José

| # | Decisión |
|---|---|
| DJ-1 | `doc` documenta Gene, Domain y Project. El alcance es un campo de la entrada desde el principio. Hoy solo Project es alcanzable; Gene y Domain quedan declarados y condicionados |
| DJ-2 | La salida es un **borrador**, diseñada para poder entrar después a una Contribution `document` (ruta relativa al Repository) |
| DJ-3 | Corre a mano por CLI en las fases 1 y 2; como Action del Mandate en la fase 4. Quedan fuera las corridas disparadas por un cambio material |
| DJ-4 | Quién persiste el archivo final es una dependencia externa (Composition §6.2) |
| DJ-5 | El alcance `gene` referencia el `gene_id` del store de Genes, no el nodo Gravity ni el id de ING (P11) |
| DJ-6 | Postulate: este documento registra las dos versiones y no elige. José decide aparte si actualiza `AGENDA_MAESTRA` |
| DJ-7 | Piloto: P-A primero, P-B como segunda etapa. Antes de escribir código para P-B se consulta a José |
| DJ-8 | La duda de fondo (arreglar `doc` o crear una lógica documental nueva) queda abierta (§12) |
| DJ-9 | Estado operativo: no autorizado por ahora; se revisa al elegir el piloto |

## 3. Principios que surgen de las fuentes

1. **La pertenencia no se infiere.** "La similitud semántica nunca prueba pertenencia" (Gene v3, invariante 11). Domain↔Gene es N:M y ratificada (v3 §7.4).
2. **El único vínculo ratificable entre documento y estructura es el activo `document` de una Gene Revision** (v3 §2.7; G1 §4; `installer/nucleus/internal/gene/assets.go`). Domain, Project, Organization y Tenant se relacionan con documentos solo a través del Gene o de forma nominal.
3. **La Location dice dónde y no guarda documentos** (Constitución C-11; LocationSnapshot §D.4 y §H).
4. **La exigencia documental va desde Orrery y Location hacia el Gene, no al revés.**
   - Closure de Location, C2: "resolver Gene → scope/documentación con revisión y origen".
   - Gene v3 §7.7: captura de Gene + `captured_revision`.
   - `Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md` §5 (l. 108, 174): "como máximo, la lista declarada de documentos de la revisión", más dos contratos de lectura separados (lista de activos y contenido) con dueño la fuente canónica de Genes. **Ese documento se declara "No normativa" (l. 6).**
5. **Brain genera, el Executor promueve.**
   - Brain conserva la semántica de `doc`.
   - Si existe, el Executor solo interviene en la última milla técnica (conclusiones del Executor; `docs/EXECUTOR/EXECUTOR_ARCHITECTURE_v1_0.md`: "materializa intención técnica autorizada sin apropiarse de su significado").
   - `installer/executor/` no existe.
6. **Las proyecciones se reconcilian desde la fuente canónica, nunca al revés** (v3, invariante 15).

---

## 4. La cadena: qué tiene respaldo

### 4.1 La cadena como la planteó José

| Eslabón | Respaldo | Estado | Cita |
|---|---|---|---|
| En Orrery, la persona captura una Location | Contrato candidato y norma; sin productor | ESPEC/PROP · NO EXISTE físicamente | Vocabulario v1.1 §2.12; LocationSnapshot v0.1; Closure v1.1 §1 (`NOT_SUPPORTED`) |
| Desde la Location, el Gene se levanta para crear un Postulate | **Sin respaldo como está formulado.** El schema admite referencias a nodos Gravity `GENE`, pero esos nodos no existen y Domain/Gene canónicos no están soportados. En v0.1 solo el Project es anclable. El Postulate no lo "crea un Gene": surge de una declaración humana situada | NO EXISTE | LocationSnapshot §C.3 y §E; Experience Model v1.0 S9; D-3.b; ASM Spec v1.0 l. 23 |
| El Postulate deriva en un Mandate | Linaje propuesto: "Postulate → Mandate: lifecycle posterior de gobernanza"; sin entidad Postulate ni contrato | PROP | ADR ASM l. 163, 373, 375; Roadmap I3–I7 l. 323, 331 |
| El Mandate despliega Intents | Contrato v4 con seis Actions `ing, dis, doc, exp, dev, exp`; el workflow despacha solo ING | IMPL parcial | `mandatecontract/contract.go:93`; `mandate_execution_workflow.go:191-225` |
| Los Intents se anclan en esa Location | **Sin respaldo.** Lo más cercano: `asm/` recibe `location_id` para correlacionar | NO EXISTE (ASM: ESPEC candidato) | ASM Spec v1.0 §§1 y 3; Codex B.12 |
| La documentación se alinea con Genes y Domains | Solo por el activo `document` de la Revision; el Intent `doc` no conoce Domain ni Gene | IMPL (store) / NO EXISTE (`doc`) | G1; DOC spec §6; `intent_manager.py:97` |

### 4.2 La cadena según las fuentes (dos versiones, sin elegir)

**Versión A, `AGENDA_FOLLOWUP.md` §6 (l. 54-75), registrada como A10 en el Experience Model Assignment (l. 468):**

```text
Orrery → LocationRef → ASM → AssemblyResult / contexto preparado → proceso soberano posterior → PostulateProposal
```

**Versión B, ASM Spec v1.0 l. 23, 165; ASM Research v0.2 §11; ADR ASM l. 347; BTIPS v7.3 l. 1143:**

```text
Location + declaración humana → ASM → AssemblyResult → PostulateProposal (formulada por ASM, sin adoptar)
→ decisión humana → Postulate (Nucleus candidato) → Mandate
```

La propia Agenda dice que llevar la versión A a `AGENDA_MAESTRA` "requiere una autorización separada" (§7, ítem 2). La decisión es de José (DJ-6).

---

## 5. Mapa de piezas

| Pieza | Dueño | Qué la afirma | Estado |
|---|---|---|---|
| Territorio, Espacio, Foco, Anchor, Contexto | Orrery | Vocabulario v1.1; Constitución v1.1; D-1 a D-4 | ESPEC (normativo); Territorio simulado en código (EM v1.0 E1-E4) |
| LocationSnapshot (captura) | Location (productor candidato: Orrery) | LocationSnapshot v0.1; Closure v1.1 | PROP; productor, store y resolver NO EXISTEN (A1-A5) |
| ASM | Brain/ASM (Codex, `AGENDA_FOLLOWUP` l. 88) | ASM Spec v1.0; Research v0.2; ADR; Roadmap I3-I7 | ESPEC candidato; no registrado (`brain/core/intent_types.py:50-51`) |
| PostulateProposal y Postulate | **LAGUNA.** El ADR propone Nucleus para la adopción (l. 385) | ADR ASM §13; Agenda §6 | NO EXISTE (ADR l. 375) |
| Mandate (contrato v4, actos, workflow) | MANDATE (Nucleus/Temporal) | `contract.go`; `mandate_execution_workflow.go` | IMPL parcial |
| Intents ING, DIS | Brain | ING v1.1; DIS v1.0; `genesis_intelligence.py` | IMPL |
| Intent `doc` | Brain | DOC spec v1.0 | IMPL heredado, pipeline roto (gaps G0-G14) |
| Domain canónico y Domain↔Gene | Genes/Nucleus + ING/DIS | Gene v3 §2.6, §7.4; G1 §11.5 | ESPEC; `relations/domain-gene/` vacío (`gene/store.go:79`) |
| Índice transitorio Domain→Gene | ING en Brain | `genesis_intelligence.py:304-350` | IMPL (v3 §8: compatibilidad transitoria) |
| Domain declarado por Mandate (`domain_definition.json`) | Brain `gen_domain` + Nucleus | `gen_domain.py`; `mandate_gen_activity.go:204-247` | IMPL |
| Store de Genes (identidad, Revision, activos, head) | Genes/Nucleus | G1/G2; `internal/gene/*` | IMPL sin caller productivo |
| Ratificación de Contribution | Authority | `authority/gene_ratification.go`; `roles.go:14,42` | IMPL sin emisor productivo |
| Bindings de Repository | Authority | `authority/repository_binding_store.go` | IMPL sin escritor productivo |
| Knowledge Determination | Genes | `GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md` | ESPEC (requerimientos; diseño pendiente) |
| Proyección Gravity DOMAIN/GENE | Gravity | `gravity/structural_projection.go` | IMPL sin caller (C3) |
| Suministro de inteligencia | AITAP + Brain | `brain/core/intelligence_supply.py`; schema `{ing, dis, gen}` | IMPL sin `doc` |
| Executor | Executor | Arquitectura y norma | NO EXISTE |

---

## 6. Documentación por nivel

| Nivel | Qué existe | Productor | Dónde vive | Relación con el nivel de abajo | Estado |
|---|---|---|---|---|---|
| Tenant | Nada documental; solo `tenantId` en `ProjectBinding` | Authority | `authority/project_claim.go` | Solo identidad | NO EXISTE (documental) |
| Organization (= Nucleus) | `.core/{.rules, .standards, .policies, .ai_bot.sovereign}.bl`, `.meta.json`; `.governance/{architecture,security,quality}/*.bl`; `findings/README.md`; `reports/` | Brain `core/nucleus_manager.py:161-194`, con plantillas fijas al crear el Nucleus; el listado figura en `governance/create.go:69-86` | `.bloom/.nucleus-{org}/` | No encontré quién los consuma para Projects | IMPL al crear; sin actualización |
| Organization (extensión) | `.organization.bl`, `about.bl`, `business-model.bl`, `policies.bl`, `protocols.bl`; `projects/_index.bl`, `overview.bl` | La extensión los espera (`src/strategies/NucleusStrategy.ts:188-301`); `brain/core/project/linker.py:323,355` escribe `overview.bl` y `_index.bl` | `.bloom/organization/`, `.bloom/projects/` | `overview.bl` resume cada Project vinculado | IMPL parcial |
| Project | `.bloom/.project/.doc.app.{architecture,workflow,implementation}.bl`, `.tree.bl`, `.project.meta.json` | **Sin productor**; lectores en `bloom_project_inspector.py:52`, `nucleus_inspector.py:157`, `commands/nucleus/sync.py:37` | `<project>/.bloom/.project/` | La maqueta DESC los define como "ground truth" de DEV y DOC | ESPEC (maqueta); truth: `[HISTÓRICO/NO VERIFICADO]` |
| Project | `.bloom/core/.rules.bl`, `.bloom/context/.<stack>.bl` | `brain context generate` (`core/context/manager.py:117-139`) | `<project>/.bloom/` | Ninguna con Domain o Gene | IMPL, manual |
| Project | Artefactos de los Intents `doc` y `dev` | Brain | `<project>/.bloom/.intents/` | Ninguna | IMPL (pipeline de `doc` roto) |
| Project | Documentación del Repository (README, `docs/`) | Personas | Repository | Puede ser activo `document` de un Gene | fuera de Bloom |
| Mandate (Trabajo) | `docs/` copiados; `domain_definition.json`; `domain_proposal.json` | Nucleus Genesis; Brain `gen_domain` | `.mandates/{id}/` | `domain_definition.json` describe un Domain declarado por el Mandate (D-3.b); los `docs/` no prueban pertenencia (Closure §2) | IMPL |
| Domain | Sin documento canónico. Solo identidad y aristas en `.cache/.semantic-index.json` | ING | `.nucleus-{org}/.cache/` | Lista de Gene ids (`gene-…`) | IMPL transitorio; canónico NO EXISTE (C1) |
| Gene | Activos `document` de una Revision (referencia + digest; bytes en el Repository) | Materializador de Nucleus | `<nucleus-root>/.genes/projects/{p}/revisions/` | Hoja | IMPL sin uso productivo; modelo viejo sin escritor |

---

## 7. Puntos de desconexión

| ID | Dónde se corta | Efecto | Quién lo cerraría |
|---|---|---|---|
| D-01 | `doc` → Domain/Gene/Contribution | La documentación generada no se ata a nada | Brain (fases 1 y 2) + Genes (fase 3) |
| D-02 | ING → store de Genes | ING no materializa; ids incompatibles (`gene-…`/`contribution-…` frente a UUID) | Work de integración de Mandate + Brain/ING + Genes |
| D-03 | Índice transitorio → Domain canónico | No hay Domain↔Gene canónico | Genes/Nucleus + ING/DIS (C1) |
| D-04 | Store de Genes → consumidores | Sin API, lector, índice inverso ni servicio de contenido | Genes/Nucleus (C2) |
| D-05 | Gene → Gravity | `reconcileStructuralProjection` sin caller | Gravity (C3, si se ratifica) |
| D-06 | Gravity/Gene → Location | No hay nodos DOMAIN/GENE; el schema no tiene `captured_revision` | Location (A1/A3) + Genes (C2); José ratifica el schema (Closure §15.1) |
| D-07 | Location → ASM | Sin integración | Location (A5) + ASM |
| D-08 | ASM → Postulate | Discrepancia A/B; la entidad no existe | LAGUNA: dueño de la adopción sin ratificar; decide José |
| D-09 | Postulate → Mandate | Sin contrato | LAGUNA: "lifecycle posterior de gobernanza" |
| D-10 | Mandate → Intents | Solo ING; `dis` y `doc` no se despachan | MANDATE |
| D-11 | Intents → Location | No existe anclaje | LAGUNA (dueño probable: ASM/MANDATE) |
| D-12 | `docs/` del Mandate → Gene | Son copias congeladas en rutas absolutas, no activos de Repository (`mandate_intent_activity.go:344-355`) | Genes + MANDATE |
| D-13 | Gobernanza de Organization → Projects | Sin consumidor comprobado | Brain/Nucleus (LAGUNA) |
| D-14 | `.doc.app.*` | Sin productor | Brain (LAGUNA) |

---

## 8. Registro de inconsistencias

| ID | Tema | Versión 1 (cita) | Versión 2 (cita) |
|---|---|---|---|
| I-01 | Archivo de respuesta | `.raw_output.txt` (DOC spec §2, §4; `bloom_project_tree.txt`) | `.raw_output.json` (`response_parser.py:104`; `staging_manager.py:100`; `download_manager.py:305`); el Executor coincide con el código |
| I-02 | Ids de Gene y Contribution | `gene-<hex>` y `contribution-<hex>` (`genesis_intelligence.py:344,351`) | UUID obligatorio (`gene/store.go:16`; `materializer.go:24`); G1 §11.4 rechaza lo heredado |
| I-03 | Modelo del Gene | Bajo el Mandate: `.mandates/{id}/.genes/` (`bloom_nucleus_tree.txt`; `bloom_nucleus_truth.txt`; `bloom_nucleus_tree_con_gravity.md`; Gene v2; lector de DIS `intent_manager.py:528-560`) | Store por Project: `<nucleus-root>/.genes/projects/{project_id}/` (Gene v3 §1, §7.2, §11; G1 §1; `store.go:71`) |
| I-04 | Nivel donde corre `doc` | Project y Nucleus (BTIPS v7.3 l. 1080) | Solo Project confirmado (DOC spec §1) |
| I-05 | Estado de `doc` | "Funcional, en producción" (BISP Documento Único, Parte E l. 1309) | Pipeline roto, gaps #3, #4, #5 (DOC spec §7) |
| I-06 | Archivo de contexto | `.context/.doc.json` (árbol) | `.context/.context.json` (`intent_manager.py:297`) |
| I-07 | Formato de `docbase` | Semántico (`tree/bloom/DESC/bloom_project_desc_tree.txt:343-363`) | Mecánico (`files_compressor.py:274-295`); ninguno lo produce `doc` |
| I-08 | Ruta de contexto técnico | `.bloom/.core/` (árbol) | `.bloom/core/` y `.bloom/context/` (`core/context/manager.py:117-139`) |
| I-09 | Efectos de la consolidación ING | Escribe `.genes/` y `.files/.docbase.json` (ING v1.1 §5) | Escribe `.semantic-index.json` y `.parsed_result.json` con `physical_materialization: pending` (`genesis_intelligence.py:286-356`) |
| I-10 | Actions del contrato | "Contrato solo `gen`" (`Investigacion_Ejecucion_Local_Doc_Dev_Codex_CLI…_v0_1.md` §5) | v4 con seis Actions, incluida `doc` (`contract.go:93`) |
| I-11 | `approve`/`activate` en v4 | Rechazan v4 (`Investigacion_Oferta_Adopcion…_v0_1.md` §6 R1) | Ramas v4 presentes (`mandate_authority_cmd.go:180-348`) |
| I-12 | `.semantic-index.json` | "IMPLEMENTADO vacío" (truth) · "fuente canónica de DOMAIN" (maqueta) · canónica (GravityGraph Audit §5) | Lo escribe ING (`genesis_intelligence.py:304-306`) · compatibilidad transitoria (Gene v3 §8) |
| I-13 | `domain_definition.json` | Ausente de los árboles | Existe en `{MandatesRoot}/{id}/` (`mandate_gen_activity.go:209`) |
| I-14 | Alcance de Domain | Dentro del Project (Gene v3 §2.6) | Resolución Nucleus-wide (ING v1.1 §4) |
| I-15 | Quién formula `PostulateProposal` | ASM (ASM Spec v1.0; Research v0.2; ADR; BTIPS v7.3 l. 1143) | Un proceso soberano posterior (`AGENDA_FOLLOWUP` §6; A10 en el EM Assignment l. 468) |
| I-16 | Tenant en Location | Contexto = Organization + Project (Vocabulario §2.9) · "No se incluye `tenant_ref`" (Closure §2) | Tenant obligatorio en el scope (LocationSnapshot §C.3) |
| I-17 | Enum `nodeType` (F-1) | Admite `NUCLEUS`, `MANDATE`, `SESSION` como anchor, ancestro o vecino (LocationSnapshot §E) | No son Territorio (Vocabulario V-Q2, F-1 l. 339) |
| I-18 | Anchors DOMAIN/GENE | Admitidos por el schema (`gravityRef` en `anchors`) | No soportados como canónicos (§C.3); "Sólo el Project es anclable en v0.1" (EM v1.0 S9; D-3.b) |
| I-19 | Revisión capturada | Location "puede capturar Gene + `captured_revision`" (Gene v3 §2.8, §7.7) | El schema no tiene el campo; para GENE solo `node_version` de Gravity (§E) |
| I-20 | Campos de versión y expansión | `version_refs`, `expansion_refs` (Closure §5) | Ausentes del schema v0.1 |
| I-21 | Forma del lector de Gene | Lector E17: `gene_id`, `semantic_function`, `scope_files` | E18: `gen_id`, `function` (Closure §12) |
| I-22 | Mandate y Gene en `.dev_state.json` | "Incluye mandate_id y gene_id activo" (árbol) | Se ignoran para dev/doc (`intent_manager.py:97`) |
| I-23 | Gaps de la DOC spec | La spec lista #2 a #10 | Hay más gaps fuera de la lista: `plan.py:118,157-175`; `build_payload.py:79-160`; `download_manager.py:375-379` |
| I-24 | AITAP y `doc` | "AITAP ya tiene contratos y políticas que pueden asignar un runtime a `doc`" (conclusiones del Executor); `routing-request` v2 incluye `doc` | `intelligence-supply-request` solo `{ing, dis, gen}`; policy y request v2 marcadas `BROKEN` (Investigación Codex CLI §4.1) |
| I-25 | Obligación `knowledge_baseline_materialized` | Declarada para ING (`effect_ledger.py:29-36`) | El modo lógico que usa Genesis no la incluye (`effect_ledger.py:23-27`; `genesis_intelligence.py:286-289`) |

---

## 9. Relación con Orrery y Location

### 9.1 Qué necesita Location de la documentación

| Necesidad | Fuente | Carácter |
|---|---|---|
| Documentación constitutiva del Gene con revisión y origen (C2) | Closure v1.1 §13, C2 | Encargo propuesto; normativo por el cierre aprobado |
| Captura de Gene + revisión, y comparación al reabrir | Gene v3 §2.8, §7.7 | Normativo (sin forma en el schema: I-19) |
| Lista declarada de documentos por revisión; contrato de lectura de la lista de activos y otro, aparte, del contenido | Universo Fase 1 §5 (l. 108, 174) | **No normativo** |
| Ningún documento dentro de la captura | LocationSnapshot §D.4, §H | Contrato candidato |
| Recuperación histórica | Fuera de garantía (LocationSnapshot §H); la retención la decide José (Closure §15.6) | LAGUNA |

### 9.2 Por dónde puede entrar un documento a una Location

| Camino | Estado |
|---|---|
| Documento como anchor directo | Postergado (LocationSnapshot §H) |
| Por la revisión del Gene → `constitutive_assets[kind=document]` | ESPEC en Gene v3; sin campo en el schema; sin API (D-04, D-06) |
| Por un Domain | NO EXISTE de forma directa; solo Domain → Gene → documento |
| Por `expansion_refs`/`version_refs` | PROP (Closure §5); ausente del schema |

### 9.3 Qué le falta a una Location para disparar un Mandate, y su relación con este programa

| Pieza | Dueño | Relación con el programa |
|---|---|---|
| A1-A5 (captura, persistencia, resolución, reapertura, entrega a ASM) | Location | Independiente |
| B1 (Organization), B3 (identidad humana) | Compartido | Independiente |
| B2 (continuidad de ProjectID) | Compartido | Se cruza con P6 (id del Project en `doc`) |
| C1 (Domain↔Gene canónico) | Domain/Gene, por ratificar | Prerrequisito del alcance `domain` verificado |
| C2 (contenido constitutivo de Gene) | Gene | **Punto de convergencia:** lo que el programa produce a nivel de Gene es lo que C2 entrega a Location |
| C3 (proyección Gravity) | Gravity | Solo para P-D |
| ASM I3-I7, Postulate, Postulate → Mandate | ASM; LAGUNA | Independiente |

---

## 10. Fases

| Fase | Contenido | Dependencias | Relación con Orrery y Location |
|---|---|---|---|
| **F1 — `doc` de punta a punta** (tramo 1 del encargo) | Cerrar G0-G11, el gap de download y T1.8 (contrato de salida con ruta portable y digest) | P1 (canal), P3, P4, P5 | Ninguna directa. T1.8 prepara la salida para atarse a una Revision |
| **F2 — Alcance Project/Domain/Gene** (tramo 2) | Campo de alcance; Domain y Gene "declarados, no verificados"; plantillas (P2) | P6/B2, P7, P11 (cerrada: DJ-5), P2 | No promete entrar a una Location (§9.2) |
| **F3 — Conexión con Genes** (tramo 3, parte Genes) | La salida de `doc` → Contribution `document` → Revision | Caller productivo (G1 §11); emisor de ratificación; bindings; `MergeReceipt` o `workspace_effect=none`; ids compatibles; KD para el primer commit (invariante 20) | Habilita C2 |
| **F4 — Integración al Mandate** (tramo 3, parte Mandate) | Action `doc` despachada | Despacho de `dis`→`doc`; Activity; `ArtifactRef` y evaluador; suministro AITAP; Composition §6.2; Executor si es ejecución | Ninguna directa |
| **F5 — Actualización** | Regenerar o validar la documentación ante cambios materiales | Diseño físico de KD (requerimientos §9-§10) | La reapertura `changed` de Location dependería de esto |
| **F6 — Coordinación con Location y Orrery** | Lista declarada por revisión y lectura del contenido | C2; API de Genes; reconciliación de I-19 (José ratifica el schema); servicio de contenido histórico (LAGUNA, Genes); retención (Closure §15.6) | Es la fase que atiende las necesidades de §9.1 |
| **F7 — Niveles superiores** | Documentación de Domain, Organization y Tenant | C1 para Domain; LAGUNA para Organization (D-13) y Tenant (sin requisito en ninguna fuente) | Orrery no define requisitos documentales para estos niveles (Codex E.17-18) |

---

## 11. Piloto

**Decisión (DJ-7):** P-A primero; P-B como segunda etapa, con consulta previa antes de escribir código.

| Piloto | Qué es | Qué descubriría | Dependencias | Viabilidad hoy |
|---|---|---|---|---|
| **P-A** | Borrador de nivel Project, generado por `doc` (F1), que documenta el vertical "proyección estructural Domain/Gene de Gravity" (`internal/gravity/structural_projection.go` y su test). Es el vertical que recomienda Gene v3 §12 | Gaps reales del pipeline; si T1.8 alcanza; reglas de ruta portable; elección de docbase; el choque entre raíz del Project y Repository | F1 y P1 | Viable cuando F1 esté hecha |
| **P-B** | P-A más materialización en un store aislado, en modo `test_only`/`synthetic` (`materializer.go:27`), con tres activos: `file`, `test` y el borrador como `document` | Si la salida de `doc` cabe en `AssetRef`; generación de UUID; `repository_id`; dónde falta registrar KD (invariante 20); ausencia de Domain (G1 §11.5) | P-A; **harness de prueba en Go (código, dueño Genes; requiere aprobación)**; ids nuevos (G1 §9 prohíbe reutilizar los del fixture) | Viable con aprobación |
| P-C | Documentar el Gene de prueba G2 (`FIRST_GENE.md`) | Solo mecánica | Mínimas | Poco valor |
| P-D | El vertical visto desde una Location | El tramo de Location completo | C3, A1-A3 | No viable |
| P-E | Documentar un Domain declarado por un Mandate real | La brecha entre Domain declarado y canónico | Corrida real de Genesis; lectura de estado operativo (DJ-9) | Pendiente de autorización |

**Criterio de cierre propuesto para P-A** (para validar): cumplir los criterios del tramo 1 sobre el vertical Gravity, y registrar qué campos del contrato de salida T1.8 corresponden y cuáles no a `AssetRef` (`project_id`, `repository_id`, `repository_relative_path`, `asset_kind`, `sha256`, `size_bytes`). Cada diferencia entra a §8 como inconsistencia real.

---

## 12. Pregunta abierta de fondo: ¿arreglar `doc` o crear una lógica documental nueva?

No se cierra en este documento (DJ-8). Esto es lo que implica cada camino según el relevamiento:

| Aspecto | Arreglar `doc` | Lógica documental nueva |
|---|---|---|
| Punto de partida | Pipeline heredado con gaps conocidos (G0-G14) y estructura `.context`/`.curation` existente | No hay código. Requisitos de KD F3: "no se prescribe si ese canal es `doc/` reparado, un intent nuevo o un mecanismo distinto" |
| Riesgo inmediato | Managers compartidos con `dev` (regresión) | Duplicar lo que ya hace el pipeline |
| Contrato firmado | El v4 ya firma `IntentType: "doc"` (`contract.go:93`; `mandate-v4-sign/main.go:293`) | Con otro nombre, choca con los contratos firmados y con el registro de tipos, salvo que ocupe el nombre `doc` |
| Motor de estado | Sigue heredado salvo que se decida migrar a `IntentStateManager` (P10) | Puede nacer en el motor BSIP (`intent_types.py`) |
| Dependencias superiores (Genes, Authority, Mandate, AITAP, KD, C1/C2) | **Las mismas** | **Las mismas** |
| Qué parte es construcción nueva en cualquier caso | Todo lo que va por encima de Project: atarse a una Revision, Domain canónico, contenido histórico, lectura para Location | Igual |

Lo que el relevamiento sí muestra: la fase 1 es reparación, y las fases 3, 5, 6 y 7 son construcción nueva en cualquiera de los dos caminos. La elección cambia sobre todo F1, F2 y el nombre o motor del Intent.

---

## 13. Preguntas abiertas

| ID | Pregunta | Afecta |
|---|---|---|
| P1 | Canal de inteligencia de F1: (a) archivo asistido, fuera de AITAP; (b) canal web heredado, no verificado; (c) esperar el suministro AITAP. ¿Siguen las llamadas directas a Gemini de `plan` y `validate`? | F1, P-A |
| P2 | ¿Se incorpora Jinja? Si sí, ¿en F1 o en F2? No está en `brain/requirements.txt` ni en `brain.spec` | F1/F2 |
| P3 | Formato de `docbase` (I-07) | F1 |
| P4 | Nombres de archivo: los del código o los de la spec (I-01, I-06) | F1 |
| P5 | Precondición de `finalize` | F1 |
| P6 | Id del Project en `doc`: ruta o `project_id` (cruza con B2) | F2 |
| P7 | ¿El alcance `domain`/`gene` puede leer `.semantic-index.json` como pista transitoria? | F2 |
| P8 | ¿G12 (visualización posterior) queda fuera? | F1 |
| P9 | ¿Se actualizan la DOC spec y los árboles al cerrar F1? | F1 |
| P10 | ¿`doc` sigue heredado o se migra a `IntentStateManager`? | F1/F2, §12 |
| P12 | ¿Quién reconcilia Gene v3 `captured_revision` con el schema de Location (I-19), y cuándo? | F6 |
| P13 | Tres versiones sobre el Tenant (I-16): ¿cuál rige para Location? | F6/F7 |
| P14 | Política de retención histórica de documentos de revisiones anteriores (Closure §15.6) | F6 |
| P15 | ¿Quién es dueño de la documentación de nivel Organization, que hoy son plantillas fijas sin actualización? | F7 |
| P16 | ¿Se registra como material fuera del repo "no hay", o hay algo para incorporar? | Límites de la evidencia |

P11 está cerrada (DJ-5).

---

## 14. Fuentes principales

**Normas y contratos**
- `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md`
- `docs/GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md`
- `docs/GENES/GENE_DOCUMENT_LIFECYCLE_REQUIREMENTS_v0_1.md`
- `docs/BSIP/TYPES/{DOC_Intent_Spec_v1_0, ING_Intent_Spec_v1_1, DIS_Intent_Spec_v1_0, ASM_Intent_Spec_v1_0}.md`
- `docs/BSIP/BLOOM_BISP_Documento_Unico_v2_0.md`
- `docs/BTIPS_Bloom_Technical_Intent_Package_v7_3.md`

**Orrery y Location**
- `docs/ANALYSIS/ORRERY/{Orrery_Vocabulario_Normativo_v1_1, Orrery_Constitucion_v1_1, Orrery_Decisiones_Arquitectonicas_v1_1}.md`
- `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v1_0.md`
- `docs/ANALYSIS/ORRERY/Orrery_Experience_Model_Assignment_v0_1.md`
- `docs/ANALYSIS/ORRERY/LOCATION/{Orrery_LocationSnapshot_v0, ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1}.md`
- `docs/ANALYSIS/ORRERY/VISUAL/Orrery_Estructura_Base_Universo_Fase1_Definicion_v0_1.md` (no normativo)

**ASM y control**
- `docs/ANALYSIS/BSIP/ASM/{ASM_Location_Research_v0_2, ASM_PRE_MANDATE_EXECUTION_ADR_v0_1, ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1}.md`
- `docs/CONTROL/{AGENDA_FOLLOWUP, AGENDA_MAESTRA}.md`

**Mandate y Genesis (Project BTIPS)**
- `MANDATE/GENESIS/Investigacion_Ejecucion_Local_Doc_Dev_Codex_CLI_Mandate_Recibido_v0_1.md`
- `MANDATE/GENESIS/Investigacion_Oferta_Adopcion_y_Eleccion_Recursos_Mandate_Recibido_v0_1.md`

**Árboles**
- `tree/bloom/{bloom_project_tree, bloom_nucleus_tree}.txt`
- `tree/bloom/truth/*`
- `tree/bloom/DESC/bloom_project_desc_tree.txt`

**Código**
- Brain: `intent_manager.py`, `core/intent/*`, `genesis_intelligence.py`, `effect_ledger.py`, `gen_domain.py`, `files_compressor.py`, `download_manager.py`, `commands/intent/{plan, build_payload, supply, download}.py`, `nucleus_manager.py`, `project/linker.py`.
- Nucleus: `internal/gene/*`, `internal/authority/{gene_ratification, repository_binding_store, roles}.go`, `internal/orchestration/{mandatecontract/contract.go, activities/*, temporal/workflows/mandate_execution_workflow.go}`, `tools/mandate-v4-sign/main.go`, `internal/governance/create.go`.
- Extensión: `src/strategies/NucleusStrategy.ts`.

**Insumos externos de esta sesión**
- Conclusiones del Executor sobre `doc` y Jinja.
- Respuesta de Codex sobre Location (rutas de Windows).
- Relevamiento de documentación, encargo de `doc` y plan de lectura (esta sesión).
