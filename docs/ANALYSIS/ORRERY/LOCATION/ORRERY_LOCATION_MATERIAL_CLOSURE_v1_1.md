# Orrery — Location: cierre material del Research v1.1

**Estado:** Research cerrado y aprobado por José Vigil.  
**Fecha:** 15 de septiembre de 2026.  
**Archivo:** `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`.  
**Base:** verificación directa del repositorio y aplicación literal de los diez puntos de reconstrucción al caso principal y, separadamente, al control Gravity.  
**Revisión v1.1:** formaliza el cierre; define resolución por referencia y resumen agregado opcional; incorpora `unverifiable`. No agrega investigación ni implementación.

## 1. Veredicto ejecutivo

**El Research queda cerrado. Location permanece `NOT_SUPPORTED` de extremo a extremo.** Cerrar el Research significa que están determinados el contrato candidato, las capacidades comprobadas, los cortes materiales y los encargos posteriores. No significa que Location esté implementada.

El repositorio auditado no demuestra que una selección realizada en Orrery pueda conservarse como una Location identificable, atribuible, versionada y reconstruible para la cadena:

`Organization → Project → Domain → Gene → archivo/documentación`.

Existen primitivas y recorridos parciales:

- Identidades de Project producidas y persistidas por Conductor y Brain.
- Transporte de `ProjectID` desde onboarding hasta `MandateExecutionInput`.
- Creación gobernada de PROJECT y creación de MANDATE/SESSION.
- Versionado de nodos Gravity mediante `NodeVersion` y `CompareAndSwap`.
- Resolución de Postures y persistencia de la Gravity de ejecución.

Estas capacidades no constituyen un productor, store o resolver de Location.

| Plano auditado | Resultado material |
|---|---|
| Orrery | Selección de objetos ficticios en memoria, sin captura durable de Location. |
| Código Organization → Project | Hay registros, resolución y transporte; no se demuestra coherencia de identidad entre todas las representaciones y entradas. |
| Código Project → Domain → Gene | No se demuestra un productor conectado del índice canónico ni del contenido rico de Gene. |
| Instalación local observada | Organización activa sin `organization_id`, sin `.gravity` e índice semántico vacío. |
| Control Gravity | Recorrido implementado con precondiciones; no demostrado operativamente en la instalación inspeccionada. |

Los antecedentes no localizados no son dependencias del cierre. Las conclusiones se sostienen en evidencia directa. La entrega Orrery v0.1 inexistente no se utilizó ni se requiere.

## 2. Nomenclatura y fronteras

### Definición candidata resultante

Location es una captura identificable, interpretable por versión y atribuible de **dónde decidió actuar una persona**. Conserva Organization y Project, lo señalado explícitamente, las referencias y relaciones necesarias para preservar su significado y la evidencia de estado o versión disponible al capturar. Las comprobaciones posteriores de resolución acompañan esa captura sin alterarla retrospectivamente.

La declaración humana de qué hacer allí permanece separada. Location no sustituye Mandate, Postulate, Working Snapshot, contexto ensamblado, Impact ni Gravity. Cámara, coordenadas, filtros y layout son presentación auxiliar: nunca identidad, pertenencia o autorización.

| Concepto | Evidencia y límite |
|---|---|
| `DomainCandidate` de Genesis | Propuesta dentro de un Mandate, confirmable por humano; no Domain canónico. |
| Domain canónico | El destino estructural esperado es `.cache/.semantic-index.json`; no se demostró población productiva Domain↔Gene. |
| DOMAIN Gravity | Proyección con `DomainRef`; no contiene el contenido semántico canónico. |
| Gene canónico | Especificación de identidad, función, scope y linaje; sin recorrido productor → contenido durable → consumidor demostrado. |
| `GeneRef` / GENE Gravity | Referencia al Gene y su Mandate de origen; no prueba por sí sola existencia del contenido. |
| Documentación de Mandate | `docsProvided` y documentos copiados bajo el Mandate; no prueban pertenencia constitutiva a Domain/Gene. |
| “Genes” del prototipo | Pares de IDs para dibujar conexiones ficticias; no Genes canónicos. |

DOMAIN y GENE tienen como padre Gravity un Mandate de origen. DOMAIN_GENE es una arista separada. No se reconstruye Domain → Gene siguiendo exclusivamente `ParentID`. [E6, E7]

No se incluye `tenant_ref`: las fuentes auditadas no lo establecen como identidad necesaria del contrato mínimo. No se abre una decisión sobre Tenant.

## 3. Fuentes auditadas, método y alcance de la evidencia

### Base de verificación

- Repositorio: `C:\repos\bloom-development-extension`.
- HEAD observado durante la auditoría: `0c69940f36cd20c175e2e7faa3dc564b1bec8c80`.
- Se realizaron búsquedas, lectura de implementaciones, inspección de JSON persistidos y evaluación literal del checklist.
- La prueba se ejecutó como verificación estática y de estado persistido. No fue una ejecución end-to-end del producto.
- No se ejecutaron builds, tests con fixtures, servicios, Activities ni `nucleus authority sync`.
- Existía una eliminación ajena a la auditoría; permaneció igual. El acceso denegado a `brain/.pytest_cache` no afectó las fuentes necesarias.
- La v1.1 revisa el informe aprobado y materializa este documento; no añade verificación ni cambios funcionales.

`SUPPORTED`, `PARTIALLY_SUPPORTED` y `NOT_SUPPORTED` clasifican **soporte material**. No deben confundirse con los estados de resolución de referencias definidos en §8.

### Registro de evidencia

Las rutas siguientes son relativas a la raíz del repositorio; los enlaces son relativos a este documento. Cada código de evidencia conserva archivo y símbolo para las tablas posteriores.

| ID | Fuente y símbolos comprobados |
|---|---|
| E1 | [installer/nucleus/internal/core/org_context.go](../../../../installer/nucleus/internal/core/org_context.go): `ResolveActiveOrgContext`, `ResolveNucleusRoot`, `ScanForNucleusFrom`. |
| E2 | [installer/conductor/shared/onboarding-schema.js](../../../../installer/conductor/shared/onboarding-schema.js): `getOrCreateProject`, `migrateToNestedSchema`. |
| E3 | [installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js](../../../../installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js): `onboarding:select-project`, `onboarding:create-mandate`, `onboarding:complete`. |
| E4 | [installer/nucleus/internal/orchestration/commands/mandate.go](../../../../installer/nucleus/internal/orchestration/commands/mandate.go): `createBuildMandate`, `initialBuildMandateState`, `copyDocsInto`. |
| E5 | [Watcher](../../../../installer/nucleus/internal/orchestration/watchers/mandate_watcher.go): `mandateBuildInput`; [workflow de construcción](../../../../installer/nucleus/internal/orchestration/temporal/workflows/mandate_build_workflow.go): paso al child workflow. |
| E6 | [Modelo Gravity](../../../../installer/nucleus/internal/gravity/model.go): `GravityNode`, `DomainRef`, `GeneRef`, `StructuralEdge`, `CanonicalSource`, `ResolvedPosture`. |
| E7 | [Proyección estructural](../../../../installer/nucleus/internal/gravity/structural_projection.go): `reconcileStructuralProjection`, `fingerprintFact`, `findNodePath`. |
| E8 | [Store Gravity](../../../../installer/nucleus/internal/gravity/store.go): `ReadNode`, `CreateNode`, `CompareAndSwap`, `validateNode`. |
| E9 | [Creación gobernada](../../../../installer/nucleus/internal/gravity/governed_creation.go): `CreateGovernedNode`; [decisión](../../../../installer/nucleus/internal/governance/decision/decision.go): `AuthorizeGravityNodeCreation`, `EffectiveAuthorityMode`. |
| E10 | [Activities Gravity](../../../../installer/nucleus/internal/orchestration/activities/mandate_gravity_session_activities.go): `readOrganizationID`, `EnsureGravityMandateNodeActivity`, `CreateGravitySessionActivity`, `PersistExecutionGravityActivity`. |
| E11 | [Ejecución de Mandate](../../../../installer/nucleus/internal/orchestration/temporal/workflows/mandate_execution_workflow.go): `MandateExecutionWorkflow`; [worker](../../../../installer/nucleus/internal/orchestration/temporal/worker.go): registro de Activities. |
| E12 | [Resolver Gravity](../../../../installer/nucleus/internal/gravity/resolver.go): `ResolveActive`, `buildSpine`, `readSpine`; [Activity](../../../../installer/nucleus/internal/orchestration/activities/resolve_active_gravity_activity.go): frontera de I/O. |
| E13 | [Genesis](../../../../installer/nucleus/internal/orchestration/activities/mandate_genesis_activities.go): `scaffoldDryRun`, `scaffoldReal`; [firma](../../../../installer/nucleus/internal/orchestration/activities/mandate_genesis_sign_activity.go): `SignMandateActivity`, `actionIDFor`, `PersistHumanSyncActivity`. |
| E14 | [Confirmación de candidatos](../../../../installer/nucleus/internal/orchestration/commands/mandate_genesis_domains_cmd.go): confirmación, atribución de SO y persistencia; [tipos](../../../../src/types/gen-state.types.ts): `DomainCandidate`, `HumanSyncRecord`, `GenState`. |
| E15 | [NucleusManager](../../../../brain/core/nucleus_manager.py): configuración de proyectos e inicialización del índice; [ProjectLinker](../../../../brain/core/project/linker.py): `link`, `_update_nucleus_config`, `_create_nucleus_link`. |
| E16 | [Índice BISP](../../../../brain/core/bisp/chroma_client.py): `update_semantic_index`; [Paths](../../../../brain/shared/paths.py): `bin_dir`. |
| E17 | [IntentManager](../../../../brain/core/intent_manager.py): lectura candidata de Genes y snapshot Domain; [ledger de efectos](../../../../brain/core/intent/effect_ledger.py): obligaciones y evidencia de efectos. |
| E18 | [Gene conceptual](../../../GENES/BTIPS_GENES_CONCEPT_v2_0.md): `gen.json`, `gen_state.json`, scope y deltas. |
| E19 | [Datos de Orrery](../../../../installer/conductor/workspace/core/orrery/src/data.ts): `items`, `genes`; [UI](../../../../installer/conductor/workspace/core/orrery/src/main.ts): `select`, `selected`, cámara y filtros. |
| E20 | [Authority CLI](../../../../installer/nucleus/internal/governance/authority_command.go): `defaultAuthorityServices`; [auth link](../../../../installer/nucleus/internal/governance/auth_link.go): registro de `organization_id`. |
| E21 | [Identidad local](../../../../installer/nucleus/internal/authority/identity.go): `LocalIdentity`; [snapshot](../../../../installer/nucleus/internal/authority/snapshot.go): `Binding`, `DurableState`; [checkpoint](../../../../installer/nucleus/internal/authority/checkpoint.go): `Checkpoint`. |
| E22 | [Sesión humana backend](../../../../backend/src/authority/human-session-store.ts): `resolveHumanSession`. |
| E23 | [ASM v0.2](../../BSIP/ASM/ASM_Location_Research_v0_2.md): contrato candidato y disponibilidad, separados. |
| E24 | [Blueprint](../../../../installer/nucleus/internal/governance/blueprint.go): `CreateInitialBlueprint`; [bootstrap](../../../../installer/nucleus/internal/governance/gravity_bootstrap.go): `bootstrapGravity`. |

### Estado local observado

**L1 — `C:\Users\josev\AppData\Local\BloomNucleus\config\nucleus.json`:** organización activa `eias-repos`, sin `organization_id` en esa entrada. Project `sample_project` con ID `cfc4c3c8-38d0-452f-a95f-ce2f75e2b9fe`.

**L2 — `C:\repos\eias-repos\.bloom\.nucleus-eias-repos`:** configuración `.core/.nucleus-config.json` con otros proyectos e IDs propios; Blueprint con `org_identity.org_id = org_1787189466`; existe `.ownership.json`, no `.master`; no existe `.gravity`; `.cache/.semantic-index.json` contiene `entries: []`.

**L3 — Mandates persistidos:** `b15bcdf4-b8e8-4318-b009-3855aed4cb31` y `fc8e48e3-2a84-4416-a3f6-607476e17598`, bajo `.mandates` de L2. Ambos `building`, sin `projectId` y sin `phases.execute.gravity`.

**L4 — Autoridad instalada:** no existe `C:\Users\josev\AppData\Local\BloomNucleus\authority`.

Los registros de L1/L2 corresponden a nombres de proyectos distintos: no prueban colisión de identidad del mismo Project. Sí prueban coexistencia de representaciones cuya correspondencia debe estar definida.

### Antecedentes y correcciones

Se leyeron el encargo, la continuación v0.2 y ASM v0.2. No se localizaron `Pasted markdown(20260914-152632).md` ni `Pasted markdown(20260914-175802).md`. Su ausencia no condiciona el cierre: ninguna conclusión depende de su contenido no leído. La entrega Orrery v0.1 inexistente queda fuera de las fuentes.

Correcciones sustentadas por código:

1. SESSION tiene creación, registro de Activities y consumidor; no es solo un enum. [E10–E12]
2. ProjectID tiene productores y transporte desde Conductor. [E2–E5]
3. `EnsureGravityMandateNodeActivity` crea PROJECT cuando falta mediante autorización gobernada; sus comentarios que dicen lo contrario están desactualizados. [E10]
4. Los Action IDs se calculan mediante `actionIDFor`; no son literalmente `gen-action-{name}`. [E13]
5. Existe identidad HTTP mediante sesiones humanas backend; falta su integración con Location. [E22]
6. El índice BISP audita ChromaDB y no sustituye el índice estructural canónico esperado por Gravity. [E7, E15, E16]
7. Hay lectores parciales de Gene y obligaciones en el ledger; eso no demuestra un productor canónico conectado. [E17]
8. Un timestamp, ID o versión existente en otra entidad no hace que el campo equivalente de Location esté soportado.

## 4. Mapa de productores, fuentes canónicas y consumidores

| Tramo | Productor → persistencia → consumidor | Identidad, versión y autorización | Corte material |
|---|---|---|---|
| Organization operativa | Registro de ID → configuración instalada → `ResolveActiveOrgContext`/authority sync. [E1, E20] | ID separado del slug; coherencia requerida con Blueprint y binding. | L1 carece del ID requerido. |
| Organization Gravity | Bootstrap → nodo ORGANIZATION → creación PROJECT/resolver. [E9, E24] | `NodeVersion`, decisión `local_legacy`. | No hay grafo en L2. |
| Project onboarding | `getOrCreateProject` → `organizations[].projects[]` → selección/creación Mandate. [E2, E3] | ID persistido, fallback por nombre, sin revisión propia del registro. | Correspondencia general entre registros no demostrada. |
| Project Brain | NucleusManager/ProjectLinker → configuración y vínculo → consumidores Brain. [E15] | IDs distintos de ruta; representaciones diferentes. | Puente general hacia onboarding no demostrado. |
| Project Gravity | ID recibido → PROJECT gobernado → MANDATE. [E10] | ID, Organization padre, estado activo y versión observada del padre. | CLI admite ID vacío y no resuelve pertenencia en los registros. |
| Project → Domain | Fuente esperada → índice canónico → proyección/consumidores futuros. [E7, E15] | Sin productor conectado ni pertenencia canónica poblada demostrados. | Corte fundacional del código. |
| Domain → Gene | Hecho esperado → `StructuralEdge` → proyección. [E6, E7] | Fingerprint y versión de arista. | Reconciliador sin caller productivo; índice sin hechos demostrados. |
| Gene → archivo/documentación | Scope/linaje propuestos → `gen_state.json`/historia → lectura futura. [E17, E18] | Diseño de hashes/deltas; lector parcial con forma diferente. | Cadena canónica no demostrada. |
| Selección Orrery → Location | `select(item)` → `selected` en memoria → inspector/cámara. [E19] | ID ficticio, sin versión ni atribución canónica. | Sin captura durable. |

`fingerprintFact` identifica el hecho de arista entregado al reconciliador. No certifica el contenido completo del Gene ni prueba lectura de una fuente canónica vigente. [E7]

## 5. Contrato candidato campo por campo

**O:** obligatorio. **C:** obligatorio cuando corresponda, con desconocidos explícitos. **Op:** opcional. **N:** `NOT_SUPPORTED` para Location. **P:** `PARTIALLY_SUPPORTED`, por existencia de fuente o primitiva sin integración completa. Capturador y resolver Location designan responsabilidades candidatas, no módulos existentes.

| Campo | Oblig. | Significado | Productor | Fuente material | Valor/referencia | Soporte | Resolución | Cambio/staleness | Autorización | Gap mínimo |
|---|---|---|---|---|---|---|---|---|---|---|
| `location_id` | O | Identidad de captura | Capturador | Ninguna Location | Valor | N | Recuperar captura | No regenerar al reabrir | Atribuir creación | A1, A2 |
| `schema_version` | O | Versión del contrato | Serializador | Sin schema Location | Valor | N | Validar interpretación | Distinta de revisión de contenido | Validar entrada | A1 |
| `captured_at` | O | Momento de captura | Capturador | Timestamps como precedente | Valor | N | Leer captura | Inmutable | No prueba autoría | A1 |
| `organization_ref` | O | Organization inequívoca | Resolvedor de contexto | E1, E20, E24 | Ref. + evidencia | P | Conciliar ID/raíz | Detectar binding divergente | ID no concede acceso | B1 |
| `project_ref` | O | Project dentro de Organization | Resolvedor Project | E2–E5, E15 | Ref. + evidencia | P | Registro por ID | Ruta mutable, ID preservado | Validar pertenencia | B2 |
| `explicit_anchors` | O, ≥1 | Lo señalado | Capturador | E19 simulado | Refs. tipadas | N | Por tipo/fuente | Revisión observada | Lectura autorizada | A1, A3 |
| `navigation_context` | Op | Recorrido de navegación | Orrery | E19 en memoria | Valor | N | Auxiliar | No sustituye pertenencia | Minimizar datos | A1 |
| `structural_context` | O | Posición ontológica necesaria | Fuentes canónicas | E6, E7 parciales | Refs. + hechos | P | Relaciones verificadas | Comparar fuentes | Frontera de lectura | A3, C1 |
| `constitutive_relations` | C | Relaciones que determinan significado | Fuente del tipo | E6, E7 | Hechos + refs. | P | Resolver extremos/fuente | Revisión de relación | Acceso a fuente/extremos | A3, C1 |
| `referenced_neighborhood` | Op | Vecindario conservado | Capturador/adaptador | Sin captura real | Refs. | N | Por referencia | No asumir actualidad | No expansión implícita | A1, A3 |
| `human_selection` | O | Evidencia de selección humana | Capturador | HumanSync como precedente | Valor | N | Correlacionar anchors | No sobrescribir | Actor/evidencia | A1, B3 |
| `system_expansion` | O, admite vacío | Aportes automáticos separados | Capturador/expansor | Sin contrato Location | Valor + refs. | N | Regla y origen explícitos | Nueva evidencia diferenciada | Límites explícitos | A1, A3 |
| `view_context` | Op | Cámara/filtros/presentación | Orrery | E19 en memoria | Valor | N | Restauración auxiliar | Tolerar otro layout | Nunca autoridad | A4 |
| `provenance` | O | Actor/productor/origen/momento | Capturador + identidad | E14, E21, E22 | Valor + evidencia | P | Verificar procedencia | Conservar revisiones | Instalación ≠ humano | B3, A1 |
| `state_refs` | C | Estado observado | Adaptador | E6, E8 | Ref. + versión | P | Leer estado del tipo | Actual ≠ capturado | Lectura autorizada | A3 |
| `version_refs` | O por anchor; desconocido explícito permitido | Revisión/fingerprint observado | Adaptador | E8; E7 para aristas | Valor + ref. | P | Comparar revisión | Sin revisión no prometer detección | Evidencia autorizada | A3 |
| `expansion_refs` | Op | Fuentes adicionales disponibles | Adaptador | Docs E4; Gene pendiente | Refs. | P | Antes de adquirir | No sustituir revisión | Autorizar adquisición | A3, A5 |
| `resolution_status` | O por referencia | Resultado de comprobación de esa referencia | Resolver Location | Errores parciales E1/E8/E12 | Estado + causa + evidencia | N | Ocho estados de §8 | Resultado actual separado de captura | No revelar contenido denegado | A3 |

`resolution_status` pertenece a **cada referencia**, incluidas Organization, Project, anchors y las referencias de relaciones, contexto, versión y expansión. Debe existir correspondencia inequívoca entre el resultado y la referencia evaluada; una deduplicación solo es válida si conserva esa correspondencia.

Puede añadirse un **resumen agregado opcional de Location**, derivado de esos resultados. No reemplaza resultados individuales ni concede permisos, no reescribe anchors y no equivale a readiness de ASM. Su forma física y nombre no se congelan en este Research.

Las colecciones pueden estar vacías cuando eso sea válido y explícito. Vacío, no capturado y no resoluble no significan lo mismo. `entities[]` y `relations[]` genéricos no se conservan como duplicados: se distinguen anchors, estructura y relaciones constitutivas.

## 6. Prueba literal de reconstrucción del caso principal

Caso mantenido: **Organization → Project → Domain → Gene → archivo/documentación**. Se aplicaron los diez puntos a código y estado persistido, sin sustituir Domain/Gene por candidatos, Mandates o SESSION.

| # | Punto literal | Resultado | Evidencia y éxito/corte | Consecuencia y gap |
|---|---|---|---|---|
| 1 | Identificar inequívocamente Organization y Project | `PARTIALLY_SUPPORTED` | IDs Project existentes; L1 sin `organization_id`; E1 falla cerrado; registros sin conciliación integral. | Scope no certificado. B1–B2. |
| 2 | Recuperar los anchors | `NOT_SUPPORTED` | Selección ficticia en memoria E19; sin Domain/Gene canónicos demostrados en L2. | No hay captura recuperable. A1–A2, C1–C2. |
| 3 | Reconstruir la posición ontológica | `PARTIALLY_SUPPORTED` | E6–E12 ofrecen estructura Gravity; Domain↔Gene requiere fuente/arista no conectada. | No inferir desde dibujo o solo ParentID. A3, C1. |
| 4 | Recuperar las relaciones constitutivas | `NOT_SUPPORTED` | E7 proyecta hechos recibidos, sin productor productivo demostrado; índice L2 vacío. | Relación Domain↔Gene no acreditada. C1–C3. |
| 5 | Distinguir lo señalado por el humano de lo agregado por el sistema | `NOT_SUPPORTED` | HumanSync pertenece a Genesis; Orrery no serializa la separación. | Selección no auditable. A1. |
| 6 | Detectar entidades modificadas, eliminadas o movidas | `PARTIALLY_SUPPORTED` | CAS detecta conflicto de nodo; no hay revisiones capturadas de anchors ni continuidad de traslado. | No demuestra continuidad del “acá”. A3, B2, C2. |
| 7 | Explicar referencias no resolubles | `PARTIALLY_SUPPORTED` | Errores concretos E1/E8; sin resultado tipado por referencia Location. | Falta distinguir ausencia, inaccesibilidad y capacidad no implementada. A3. |
| 8 | Reabrir una representación equivalente aunque cambie el layout | `NOT_SUPPORTED` | Sin Location serializada ni reapertura E19. | Foco real no recuperable fuera de la escena. A2, A4. |
| 9 | Conservar provenance | `PARTIALLY_SUPPORTED` | Atribución SO, identidad de instalación y sesión backend sin enlace a la selección. | Sin trazabilidad de captura. B3, A1. |
| 10 | Evitar que los datos visuales se conviertan en autoridad | `PARTIALLY_SUPPORTED` | Prototipo declara simulación; sin contrato/validación Location que imponga separación. | Falta garantía al integrar fuentes reales. A1, A4. |

No hay resultado `SUPPORTED` para la reconstrucción completa de una Location real del caso principal.

## 7. Caso de control Gravity

### Recorrido comprobado

`SignMandateActivity` lee confirmación y produce `mandate.json` con Actions → `MandateBuildWorkflow` transmite ProjectID/IntentType → `EnsureGravityMandateNodeActivity` identifica Organization desde Blueprint, valida/crea PROJECT y garantiza MANDATE → `MandateExecutionWorkflow` usa su RunID como SessionID → `CreateGravitySessionActivity` crea/reutiliza SESSION → `ResolveActive` recopila Postures activas aplicables al IntentType → `PersistExecutionGravityActivity` guarda `phases.execute.gravity` mediante `mandatestate.Mutate`. [E5, E10–E13]

“Firmado” describe aquí el estado y artefacto de ese recorrido. No se certificó verificación criptográfica end-to-end del Mandate.

### Misma prueba literal, separada

Los resultados siguientes describen capacidad del código con precondiciones satisfechas; la instancia local no dispone de la espina requerida.

| # | Punto | Resultado | Evidencia y límite |
|---|---|---|---|
| 1 | Organization y Project inequívocos | `PARTIALLY_SUPPORTED` | IDs/parentesco verificados; coherencia integral de registros pendiente. B1–B2. |
| 2 | Recuperar anchors | `SUPPORTED` | MANDATE/SESSION recuperables por IDs y rutas del recorrido. E10–E12. |
| 3 | Reconstruir posición ontológica | `SUPPORTED` | `readSpine` valida tipos, IDs y parentesco; SESSION pertenece al Mandate. E12. |
| 4 | Recuperar relaciones constitutivas | `SUPPORTED` | Recupera parentesco de esta espina, no Domain↔Gene. E12. |
| 5 | Separar humano/sistema | `PARTIALLY_SUPPORTED` | HumanSync diferencia candidatos/confirmados; no captura selección espacial/expansión. A1 como precedente. |
| 6 | Detectar modificación/eliminación/movimiento | `PARTIALLY_SUPPORTED` | CAS/lecturas frescas; sin versiones fuente completas en resultado persistido ni historial de traslados. A3. |
| 7 | Explicar referencias no resolubles | `PARTIALLY_SUPPORTED` | Errores de ausencia/identidad/parentesco; no normalizados al contrato por referencia. A3. |
| 8 | Reabrir representación equivalente | `PARTIALLY_SUPPORTED` | Relectura de estructura/Postures guardadas; sin reapertura Orrery ni historia completa por corrida. A4. |
| 9 | Conservar provenance | `PARTIALLY_SUPPORTED` | Sesión, turno, instante y nodo de origen; sin todas las versiones fuente ni autoría de captura. B3, A3. |
| 10 | Evitar autoridad visual | `SUPPORTED` | Resolver no recibe cámara/coordenadas: consume nodos, parentesco, estado e IntentType. E12. |

### Límites de reutilización

- `NodeVersion` versiona nodo, no contenido universal; CAS previene actualización sobre una versión distinta, no conserva todas las versiones históricas. [E8]
- Releer contenido fresco no equivale a emitir `changed`/`stale`. [E12]
- La persistencia conserva `collected`, sesión, turno y fecha; no `Cache` ni versiones de nodos fuente. Reemplaza el campo cuando cambia: no es historial por SESSION. [E10]
- MANDATE/SESSION usan `CreateNode`, sin operación equivalente a `OpCreateProject` en la API inspeccionada. PROJECT usa `local_legacy`; observación remota no modifica la decisión efectiva. [E8–E10]
- Los tests de creación, reintentos, ID faltante y lectura fresca se inspeccionaron como fuentes; no se ejecutaron ni se reportan como aprobados.

Un positivo del control demuestra una primitiva reutilizable, no soporte del caso principal. GravityGraph no se propone como store de Location.

## 8. Estados de resolución por referencia

### Unidad y evidencia del resultado

Cada referencia tiene su propio `resolution_status`. El resultado identifica como mínimo la referencia evaluada, componente productor, momento de comprobación, causa, evidencia y consecuencias. Cuando corresponda, conserva revisión capturada, revisión observada y locator observado. Estos son requisitos semánticos, no un schema físico implementado.

La captura original permanece intacta. Una comprobación nueva produce evidencia nueva; no cambia retrospectivamente qué señaló el humano ni qué estaba registrado al capturar.

| Estado | Semántica | Evidencia requerida y productor | Conducta |
|---|---|---|---|
| `resolved` | Identidad única y correspondencia verificada, fuente accesible y acceso permitido, sin discrepancia conocida relevante para esa comprobación. | Adaptador del tipo y evidencia de acceso; límites de versión explícitos. | Uso solo dentro del alcance autorizado; no promete historia que no se verificó. |
| `missing` | Entidad ausente en una fuente canónica consultada correctamente. | Consulta autoritativa negativa; tombstone u otra evidencia si se afirma eliminación. | Preservar referencia; bloquear dependencias críticas. |
| `changed` | Misma identidad con revisión diferente de la capturada. | Comparación sustentada de revisión/fingerprint anterior y actual. | Exponer diferencia; no sustituir silenciosamente. |
| `stale` | Evidencia conservada cuya vigencia no está acreditada, o proyección atrasada respecto de su fuente. | Evidencia previa utilizable con causa de falta de vigencia, o diferencia comprobada fuente/proyección. | No afirmar actualidad; solicitar comprobación autorizada. |
| `unauthorized` | Denegación comprobada de resolución o adquisición. | Decisión aplicable de acceso, no excepción genérica de red. | No adquirir ni revelar contenido restringido. |
| `ambiguous` | Más de una correspondencia admisible o identidad contradictoria. | Candidatos o contradicción comprobados, dentro de lo permitido revelar. | No elegir por nombre, proximidad o similitud. |
| `unsupported` | Tipo o mecanismo de resolución requerido no materializado. | Perfil de capacidades del componente. | Preservar entrada y declarar el tramo sin implementación. |
| `unverifiable` | Fuente canónica no disponible y evidencia insuficiente para clasificar fundadamente ausencia, desactualización, denegación o falta de soporte. | Resolver registra la imposibilidad de consultar, su causa/momento y la insuficiencia de evidencia disponible. | Conservar referencia; no afirmar existencia, eliminación, cambio ni permiso; bloquear la acción dependiente de esa verificación. |

### Elección formal de `unverifiable`

Se adopta `unverifiable` porque describe exactamente un límite **epistémico de resolución de una referencia**: el sistema no puede verificarla con la evidencia disponible. No afirma una propiedad de la entidad ni falta de implementación. `not_evaluable` no se incorpora como sinónimo: podría confundirse con evaluación normativa, Impact o readiness y no añade una distinción necesaria aquí.

`unverifiable` no debe convertirse en un cajón de sastre. Exige una fuente esperada identificada, indisponibilidad constatada y registro de por qué los otros estados no están sustentados. Si se conoce que el tipo no está implementado, corresponde `unsupported`; si hay una denegación comprobada, `unauthorized`; si una consulta autoritativa acredita ausencia, `missing`; si existe evidencia anterior utilizable sin vigencia acreditada, puede corresponder `stale`.

### Casos que no deben confundirse

- **Eliminada:** `missing` con evidencia de eliminación. Un archivo ausente en una ruta antigua no basta.
- **Movida pero identificable:** identidad conservada y locator actualizado, con evidencia de continuidad. Puede seguir `resolved`; si cambia una revisión relevante, registrar `changed` y el traslado como hecho separado.
- **Misma identidad, otra versión:** `changed` con ambas revisiones.
- **Referencia válida sin permiso:** `unauthorized` solo con evidencia de denegación.
- **Múltiples candidatos:** `ambiguous`; no selección automática.
- **Tipo no materializado:** `unsupported`, no `missing`.
- **Fuente inaccesible con evidencia previa utilizable sin vigencia acreditada:** `stale` con causa de indisponibilidad.
- **Fuente inaccesible sin evidencia suficiente:** `unverifiable`; no inventar una clasificación más concluyente.
- **Proyección atrasada:** `stale`, conservando evidencia fuente/proyección.

Cada estado requiere causa y evidencia complementarias. Una condición nueva no debe borrar hechos anteriores conocidos. Cuando concurran restricciones, la conducta debe respetarlas todas; una denegación vigente nunca se elude porque exista contenido histórico.

### Resumen agregado opcional de Location

El resumen se deriva exclusivamente de resultados por referencia y debe permitir inspeccionarlos. Debe informar cobertura —qué se comprobó y qué falta— y las referencias afectadas por cada estado. No se deduce mediante una jerarquía ciega de “peor estado” ni una mayoría de referencias sanas.

Una Location no puede resumirse como íntegramente resuelta si alguna referencia comprendida en esa afirmación está `unverifiable`, degradada o sin comprobar. Un resumen parcial debe declarar su alcance. La criticidad para ensamblar o adquirir depende de la operación y sus límites; el resumen no decide por sí solo readiness de ASM ni autorización.

Los ocho estados y el resumen son contrato candidato. No se afirma que estén implementados por los errores actuales de Gravity o Nucleus.

## 9. Trazado completo de ProjectID

1. **Representaciones:** Conductor `organizations[].projects[].project_id`; NucleusManager `projects[].id`; ProjectLinker `LinkedProject.id`, `linkedProjects` y `.bloom/nucleus.json`; Mandate `project` separado de `projectId`; Gravity `NodeID` de PROJECT. [E2–E6, E15]
2. **Primer conocimiento:** depende del ingreso. Onboarding registra selección; Brain descubre al crear Nucleus o vincula mediante ProjectLinker. No hay primer componente único para todos los recorridos.
3. **Identidad estable distinta de nombre/ruta:** sí existe y se persiste. El gap es correspondencia/continuidad, no ausencia universal de generador.
4. **Productor:** Conductor ya produce para onboarding; Brain produce para sus entradas. Location consume identidad resuelta y no emite otro ProjectID.
5. **Persistencia:** reutilizar los registros/vínculos existentes; no un catálogo exclusivo de Location. La regla entre representaciones debe ratificarse.
6. **Transporte comprobado:** `getOrCreateProject` → escritura de `NUCLEUS_JSON` → respuesta `projectId` → `onboarding:create-mandate` → `--project-id` → `initialBuildMandateState.projectId` → watcher → `MandateBuildInput.ProjectID` → `MandateExecutionInput.ProjectID` → `EnsureGravityMandateNodeActivity`. [E2–E5, E10]
7. **Falta de ID:** el flag CLI es opcional. ID vacío hace fallar la Activity antes de SESSION, resolución y persistencia Gravity. Los dos Mandates L3 carecen de ID; no se ejecutaron. [E4, E10, E11]
8. **Movimiento/renombre:** `getOrCreateProject` conserva ID al actualizar por identidad existente; el handler de selección recibe nombre/ruta y busca por nombre. No se demostró protocolo integral de traslado, redescubrimiento o cambio de instalación. [E2, E3]
9. **Organization/instalación:** Project está anidado en Organization en onboarding y Gravity. `installation_id` identifica instalación, no Project ni humano. Binding de autoridad no sustituye registro de Project. [E21]
10. **Migración:** existe migración de onboarding plano a anidado, capaz de generar ID; no se demostró conciliación con registros Brain ni Mandates antiguos sin ID. [E2]

Opciones reservadas: mantener el ID del registro operativo y asociar antecedentes, o adoptar un ID anterior de Brain cuando se demuestre identidad del mismo Project. No elegir por conveniencia ni generar otro UUID ante conflicto.

## 10. Gaps exclusivos de Location: A1–A5

- **A1:** contrato y captura atribuible: identidad, schema, anchors, separación humano/sistema y provenance.
- **A2:** persistencia y lectura de capturas por identidad, fuera de GravityGraph.
- **A3:** resolución por tipo, versiones, ocho estados por referencia, causas, evidencia y resumen opcional.
- **A4:** reapertura de Orrery con representación equivalente independiente del layout.
- **A5:** entrega a ASM sin transferir reparación de referencias ni producción de identidades.

No asignan a Location propiedad de Domain, Gene, Gravity o identidad organizacional.

## 11. Gaps compartidos: B1–B3

- **B1:** coherencia de Organization entre configuración, Blueprint, ownership y binding. L1/L2 no cumplen el recorrido actual.
- **B2:** continuidad de ProjectID entre representaciones, fallback por nombre, CLI y migración previa.
- **B3:** identidad humana y autorización para capturar/resolver; primitivas existentes sin conexión demostrada con Orrery/Location.

| Archivo | Responsabilidad comprobada |
|---|---|
| `config/nucleus.json` | Contexto instalado de organizaciones/proyectos y configuración de acceso. |
| `.ownership.json` | Evidencia local para autorización legacy; no identidad de captura. |
| `identity.json` | Identidad y claves de instalación; no identidad humana. |
| `state.json` | Proyección aceptada de autoridad, binding, estado monotónico y journal. |
| `checkpoint.json` | Evidencia de consistencia/continuidad del estado aceptado. |

`nucleus authority sync` puede crear identidad, registrar instalación, obtener/verificar datos remotos y persistirlos. No es una comprobación de lectura y no se ejecutó. [E20, E21]

## 12. Decisiones futuras de Domain, Gene o Gravity: C1–C3

- **C1:** productor y contrato del índice canónico Domain↔Gene y pertenencia a Project.
- **C2:** contenido canónico Gene, scope, documentación constitutiva y linaje.
- **C3:** autorización e invocación productiva de `reconcileStructuralProjection`.

Las relaciones futuras Posture↔Domain/Gene y la política normativa de proyecciones permanecen fuera del contrato mínimo de Location.

El lector E17 busca `gene_id`, `semantic_function` y `scope_files`; E18 propone `gen_id`, `function` y scope en otro archivo. Se registra la incompatibilidad. Location no debe inventar una conversión. C1–C3 son dependencias externas, no una propuesta de rediseño ni responsabilidades internas de Location.

## 13. Encargos mínimos de implementación

Todos son encargos posteriores propuestos, no autorización de escritura. Los módulos citados son candidatos afectados. Ubicación/nombres de módulos Location inexistentes quedan reservados a José. Cada resultado parcial o no soportado de las tablas remite a estos encargos.

### B1 — Resolver coherencia de Organization

- **Objetivo:** una Organization respaldada por evidencia consistente.
- **Productor → consumidor:** contexto/gobernanza → Location y consumidores existentes.
- **Fuente/módulos:** E1, E20, E24; configuración, Blueprint y binding.
- **Invariantes/fail-closed:** slug no es ID; no sustituir identidad discordante; ausencias, contradicciones e inaccesibilidad impiden afirmar resolución.
- **Migración:** conciliación explícita de instalaciones anteriores, conservando evidencia previa.
- **Pruebas:** ID faltante, IDs discordantes, cambio de raíz y configuración válida.
- **Criterio `SUPPORTED`:** consumidores obtienen la misma identidad comprobada.
- **Fuera:** rediseño de autoridad.

### B2 — Conservar ProjectID entre registros y entradas

- **Objetivo:** resolver Project existente y conservar identidad al mover/renombrar.
- **Productor → consumidor:** registro existente → onboarding, CLI, watcher, Gravity y Location.
- **Fuente/módulos:** E2–E5, E15.
- **Invariantes/fail-closed:** no derivar identidad del nombre ni regenerarla al mover; validar Organization; duplicados o correspondencia incierta bloquean; CLI no fabrica pertenencia.
- **Migración:** asociar proyectos y Mandates previos solo con evidencia inequívoca.
- **Pruebas:** homónimos, renombre, traslado, ID inexistente, otra Organization y Mandate antiguo sin ID.
- **Criterio `SUPPORTED`:** mismo Project conserva ID/pertenencia a través del recorrido.
- **Fuera:** store nuevo o elección unilateral de identidad canónica.

### B3 — Atribución y autorización de captura

- **Objetivo:** distinguir humano, instalación y productor; verificar acceso.
- **Productor → consumidor:** identidad/autoridad existente → capturador/resolver.
- **Fuente/módulos:** E9, E20–E22; integración Orrery pendiente.
- **Invariantes/fail-closed:** instalación no equivale a humano; `unknown` no es identidad verificada; sin evidencia suficiente no adquirir contenido protegido.
- **Migración:** no inventar autoría retrospectiva.
- **Pruebas:** sesión vencida, identidad revocada, Organization discordante y evidencia local limitada.
- **Criterio `SUPPORTED`:** actor, fundamento y límites verificables en captura/lectura.
- **Fuera:** otro sistema de login.

### A1 — Schema y productor de captura

- **Objetivo:** serializar §5 conservando exactamente lo señalado.
- **Productor → consumidor:** Orrery → persistencia/resolver Location.
- **Fuente/módulos:** E19; contrato por ubicar.
- **Invariantes/fail-closed:** humano/sistema separados; IDs independientes de coordenadas; schema distinto de revisión; contexto ambiguo o anchor ficticio no se presenta como captura canónica válida.
- **Migración:** no convertir datos de demostración en referencias reales.
- **Pruebas:** selección múltiple, expansión vacía, actor ausente, schema desconocido, cambio de foco y correspondencia de cada referencia con su resultado.
- **Criterio `SUPPORTED`:** selección real produce captura interpretable/atribuible sin pérdida.
- **Fuera:** intención, Impact y contenido ensamblado.

### A2 — Persistencia recuperable

- **Objetivo:** guardar/recuperar captura por identidad.
- **Productor → consumidor:** capturador → reapertura/resolver/ASM.
- **Fuente/módulos:** A1; ubicación de persistencia pendiente.
- **Invariantes/fail-closed:** captura original preservada; comprobaciones posteriores separadas; Gravity no es su store; colisión o escritura incompleta no devuelve éxito.
- **Migración:** solo versiones efectivamente existentes del contrato.
- **Pruebas:** reinicio, interrupción de escritura, reintento y schema no admitido.
- **Criterio `SUPPORTED`:** round-trip durable conserva campos y significado, incluidos resultados por referencia cuando se persistan.
- **Fuera:** archivo histórico universal de entidades.

### C1 — Entregar fuente canónica Domain↔Gene

- **Objetivo:** hechos identificables de pertenencia/relaciones producidos por su responsable.
- **Productor → consumidor:** propietario por ratificar → adaptadores Location/proyección.
- **Fuente/módulos:** índice esperado E7/E15, consumidores E17.
- **Invariantes/fail-closed:** candidato Genesis no equivale a Domain; índice BISP no reemplaza al canónico; fuente vacía o no materializada se informa como tal.
- **Migración:** resolver forma inicial `entries` frente a consumidores que esperan `domains`.
- **Pruebas:** identidad, pertenencia, relación ausente y revisión modificada.
- **Criterio `SUPPORTED`:** productor real escribe hechos resueltos sin inferencia.
- **Fuera:** diseñar Domain en este Work; requiere encargo independiente.

### C2 — Entregar contenido constitutivo de Gene

- **Objetivo:** resolver Gene → scope/documentación con revisión y origen.
- **Productor → consumidor:** propietario Gene → adaptador Location.
- **Fuente/módulos:** E17/E18; escritor canónico no demostrado.
- **Invariantes/fail-closed:** GeneRef no es contenido; docs generales no prueban pertenencia; incompatibilidad/ausencia bloquea expansión crítica.
- **Migración:** resolver divergencia lector/especificación explícitamente.
- **Pruebas:** archivo modificado, eliminado, movido, documento incorporado y revisión histórica.
- **Criterio `SUPPORTED`:** contenido/pertenencia reconstruibles desde fuente productiva.
- **Fuera:** decidir aquí el modelo Gene.

### C3 — Conectar proyección gobernada, si se ratifica

- **Objetivo:** proyectar hechos canónicos mediante invocación autorizada.
- **Productor → consumidor:** fuente C1/C2 → reconciliador E7 → consumidores Gravity.
- **Invariantes/fail-closed:** fuente manda, fingerprint identifica hecho, origen inmutable; entrada no confirmada o no autorizada no se proyecta.
- **Migración:** no promover fixtures/datos ficticios.
- **Pruebas:** idempotencia, cambio, supersesión y rechazo sin autorización.
- **Criterio `SUPPORTED`:** caller productivo autorizado y trazabilidad fuente → proyección.
- **Fuera:** política Gravity y nuevas relaciones normativas.
- **Dependencia:** necesaria para soporte por esta proyección; no obliga a resolver toda Location mediante Gravity.

### A3 — Resolver referencias con evidencia

- **Objetivo:** implementar los ocho estados de §8 por referencia sobre tipos disponibles; permitir resumen agregado derivado y auditable.
- **Productor → consumidor:** adaptadores canónicos → Orrery/ASM.
- **Fuente/módulos:** B1–B3, C1–C2; precedentes E8/E12.
- **Invariantes/fail-closed:** preservar captura; no inferir traslado por similitud; no confundir indisponibilidad con eliminación; resumen no oculta referencias ni autoriza; tipos no implementados `unsupported`; fuente indisponible sin evidencia suficiente `unverifiable`.
- **Migración:** sin revisión histórica conocida no inventarla; no reclasificar fallos anteriores sin evidencia.
- **Pruebas:** ocho estados; fuente inaccesible con/sin evidencia previa; denegación comprobada frente a fallo de transporte; traslado identificable; proyección atrasada; mezcla de referencias resueltas y no verificables; resumen parcial con cobertura explícita.
- **Criterio `SUPPORTED`:** cada referencia devuelve resultado reproducible con causa/evidencia/límites; resumen, si existe, es trazable a esos resultados y nunca afirma resolución completa con referencias no verificadas.
- **Fuera:** corregir entidad fuente, recalcular Gravity o decidir readiness ASM.

### A4 — Reabrir Location en Orrery

- **Objetivo:** foco y relaciones equivalentes con otro layout.
- **Productor → consumidor:** captura + resolución → UI E19.
- **Fuente:** identidades/relaciones resueltas; vista auxiliar opcional.
- **Invariantes/fail-closed:** presentación no modifica identidad, pertenencia o acceso; mostrar referencias degradadas/no verificables sin reemplazo automático.
- **Migración:** ninguna desde escena ficticia.
- **Pruebas:** layout distinto, ausencia de snapshot visual, anchor faltante/no verificable y cambio de workspace.
- **Criterio `SUPPORTED`:** misma captura conserva foco semántico con posiciones distintas, mostrando límites por referencia.
- **Fuera:** rediseño visual general de Orrery.

### A5 — Entrega validable a ASM

- **Objetivo:** entregar captura y diagnóstico sin trasladar reparación de referencias.
- **Productor → consumidor:** Location → entrada candidata ASM.
- **Fuente/módulos:** A1–A3, E23; integración física pendiente.
- **Invariantes/fail-closed:** declaración separada, anchors intactos, límites explícitos; faltante crítico permite diagnóstico pero bloquea operación dependiente; `unverifiable` no concede permiso ni se trata como ausencia comprobada.
- **Migración:** no aceptar contratos anteriores por similitud de nombres.
- **Pruebas:** foco cambiado, permiso denegado, relación crítica ambigua, referencia opcional ausente, referencia crítica no verificable y resumen agregado que no sustituye resultados individuales.
- **Criterio `SUPPORTED`:** ASM consume/correlaciona sin inventar identidad, reinterpretar captura ni depender exclusivamente del resumen.
- **Fuera:** implementar ASM, Impact o Postulate.

## 14. Compatibilidad de frontera con ASM

ASM v0.2 requiere Organization, Project, foco y declaración humana para ensamblar. Location entrega dónde; la declaración expresa qué. Deben existir correlación, versión interpretable y atribución suficiente. Antes de adquirir/expandir deben estar definidos los límites aplicables; declarar Organization/Project no concede permisos. Solicitud incompleta admite diagnóstico; faltante crítico bloquea la conclusión dependiente. [E23]

ASM conserva anchors, relaciones, evidencia, estados por referencia y origen humano/sistema. No reescribe anchors, completa identidades ni cambia foco: foco nuevo requiere nueva captura. No recalcula Gravity ni adopta/sella Postulates.

| Condición por referencia | Conducta de frontera candidata |
|---|---|
| `unauthorized` | Impedir adquisición de la referencia denegada. |
| `ambiguous` crítica | Impedir operación dependiente hasta desambiguación. |
| `unsupported` crítica | No iniciar el tramo que necesita esa capacidad. |
| `missing` crítica | Bloquear dependencia y conservar diagnóstico. |
| `changed` / `stale` | No sustituir por actualidad supuesta; verificar vigencia y límites. |
| `unverifiable` | No afirmar ausencia/existencia/permiso; bloquear adquisición o expansión que requiera esa verificación. Permitir diagnóstico y trabajo independiente autorizado. |
| Faltante opcional | Omitir solo con cobertura/causa explícitas, sin invalidar alcance. |
| `resolved` | No basta por sí solo: aplicar permisos y límites de la acción. |

`unverifiable` es una precisión del contrato candidato de Location para entregar a ASM; no se afirma que ASM v0.2 ya lo implemente. El resumen agregado de Location no equivale a readiness. ASM debe evaluar la criticidad para la solicitud concreta sin alterar la captura.

La compatibilidad es conceptual; no se demostró integración física Location → ASM.

## 15. Decisiones reservadas a José

El cierre y los tres ajustes de v1.1 quedan aprobados. En particular, se define resolución por referencia, resumen opcional y `unverifiable`; no quedan como decisiones de nomenclatura pendientes.

Para los encargos posteriores permanecen reservados:

1. Ratificación física del schema y ubicación/propietario/nombres de módulos y persistencia.
2. Regla de identidad entre registros Conductor y Brain, y conciliación organizacional de instalaciones anteriores.
3. Canal de identidad humana y autorización para Orrery.
4. Encargos separados de materialización Domain y Gene.
5. Ratificación de la proyección gobernada y su consumidor productivo.
6. Retención histórica requerida de capturas/evidencia frente a contenidos completos.
7. Alcance visual mínimo de reapertura.

No se propone Tenant ni se utiliza su ausencia como bloqueo.

## 16. Conclusión y orden de encargos posteriores

**El Research de Location en Orrery queda cerrado por verificación directa del repositorio y ejecución literal de la prueba de reconstrucción, en modalidad estática y de estado persistido.** Los antecedentes no localizados no son dependencias. No existe una condición documental pendiente que reabra este cierre.

El resultado material sigue siendo `NOT_SUPPORTED` de extremo a extremo: ProjectID tiene productores/transporte; SESSION tiene creación/consumidor; Gravity aporta primitivas con límites; faltan la cadena canónica Domain/Gene y el recorrido propio de Location. La instalación inspeccionada agrega un corte previo de identidad organizacional y ausencia de Gravity.

La v1.1 fija `resolution_status` **por referencia**, admite un resumen agregado opcional sin autoridad propia e incorpora `unverifiable` para indisponibilidad canónica sin evidencia clasificatoria suficiente. No se implementa ninguna de estas capacidades.

### Orden de encargos posteriores

1. **B1, B2 y B3:** resolver coherencia de Organization, continuidad de ProjectID y frontera de identidad/autorización. Son encargos separados.
2. **A1:** materializar contrato y captura sobre esas fronteras; después **A2**, persistencia y recuperación.
3. **C1 y C2:** mediante encargos independientes del propietario de Domain/Gene, entregar las fuentes necesarias para la cobertura fundacional. Pueden avanzar junto con A1/A2; no son responsabilidad interna de Location.
4. **A3:** resolver por referencia con los ocho estados y evidencia. Puede validar antes degradación/`unsupported`/`unverifiable`; no puede declarar soporte Domain/Gene hasta disponer de C1/C2.
5. **C3:** solo si se ratifica y se necesita la vía de proyección Gravity; no es requisito universal para A3 ni motivo para convertir Gravity en store de Location.
6. **A4 y A5:** tras captura durable y resolución, habilitar reapertura de Orrery y entrega validable a ASM como encargos separados.

Este orden habilita implementación posterior con fronteras y criterios de aceptación comprobables. El cierre del Research no autoriza ejecutar esos encargos.
