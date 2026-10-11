# Orrery — Experience Model: escenarios del trabajo activo del Paladín v0.1

| Campo | Valor |
|---|---|
| Documento | Profundización de `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_v0_1.md` (no lo reemplaza) |
| Estado | Profundización estática **cerrada por ahora** (José, 2026-10-10). Complementa el Experience Model v0.1 y no lo reemplaza. No es Interaction Grammar, UI/UX, contrato ni implementación |
| Fecha | 2026-10-10 |
| Referencia física | `main` @ `3bd723b` (lectura estática del árbol de trabajo) |
| Pedido | Profundizar el Experience Model contrastando cada propuesta con arquitectura y código reales; escenarios concretos derivados del trabajo activo del Paladín; preparar la validación con el resultado real de Genesis; clasificar qué se profundiza ahora, qué espera al E2E y qué queda abierto |

> **Marcas de evidencia (obligatorias en todo el documento).**
> - **[COMPROBADO]** — verificado por **lectura estática** del código, schema o test a `3bd723b` con cita `path:línea`. *No* significa que se haya ejecutado.
> - **[NO OBSERVADO]** — lo que el código y la norma determinan que ocurriría, pero que ningún Genesis E2E validó todavía.
> - **[QUIEBRE PREVISTO]** — subclase de [NO OBSERVADO]: la lectura estática predice que el paso **falla o no puede ocurrir** por el camino indicado. Es una predicción a confirmar o refutar con el E2E, no un hecho.
> - **[HIPÓTESIS]** — propuesta de experiencia de este documento o del EM v0.1 sin base física; se justifica sólo por la norma.
>
> Rutas abreviadas: `wf/` = `installer/nucleus/internal/orchestration/temporal/workflows/`; `cmd/` = `installer/nucleus/internal/orchestration/commands/`; `act/` = `installer/nucleus/internal/orchestration/activities/`; `mc/` = `installer/nucleus/internal/orchestration/mandatecontract/`.

---

## 1. Resumen

1. **El trabajo activo real del Paladín hoy es uno solo: llevar un Mandate Genesis de punta a punta.** No existe ningún otro acto humano físico sobre Territorio, criterio ni Location. Todo escenario de Orrery que no se apoye en ese recorrido es, por ahora, [HIPÓTESIS].
2. **El recorrido tiene diez momentos y tres actos humanos distintos**, que el EM v0.1 agrupaba como "Decidir": **confirmar** el dominio (sin atestación ni atribución), **aprobar** el contrato exacto (atestación de Authority, permiso `mandate.sign`, elección de inteligencia dentro del digest) y **activar** (otra atestación, permiso `mandate.install`). La experiencia no puede fusionarlos (§3, R-1).
3. **La lectura estática predice cinco quiebres** que el E2E debe confirmar o refutar antes de modelar CT-01 como recorrido genuino: el dominio propuesto es un marcador de posición con el nombre del Project (EM-C14); los candidatos no se persisten antes del punto de sincronización humana (EM-C15); un Genesis lanzado desde Core no tiene documentos que congelar (EM-C16); un fallo de ejecución no deja estado ni evento (EM-C12); el `status` de primer nivel nunca deja de ser `building` (EM-C13).
4. **Gravity durante Genesis:** los únicos nodos que el código crea son NUCLEUS y ORGANIZATION, con `gravityPostures` vacío, y ningún flujo escribe Postures. La experiencia necesita distinguir un quinto matiz del EM v0.1: **"sin criterio declarado"**, que no es *ninguno* ni *desconocido* (§5, R-3).
5. **El Human Sync es el caso de Atención por excelencia** y hoy no tiene señal: el workflow espera sin límite y nada lo anuncia (R-8).
6. **Protocolo de evidencia post-Genesis (§7):** lista exacta de artefactos y campos a leer cuando Genesis termine, cada uno con la pregunta del EM que responde. Autorizado por José para cuando el E2E termine (§9); camino y suministro quedan como variables observadas (V-1..V-3).

---

## 2. El recorrido real del trabajo activo: Genesis, paso a paso

Para cada momento: qué hace el Paladín, qué cambia en la Fuente, qué evento sale, qué recibe la UI hoy, y su marca.

| # | Momento | Acto / actor | Qué cambia en la Fuente | Evento | Qué recibe la UI hoy | Marca |
|---|---|---|---|---|---|---|
| G0 | Onboarding hasta `mandate_genesis` | Persona (onboarding) | `nucleus.json` onboarding; pasos `backend_identity_check → nucleus_create → vault_init → github_app_auth/google_auth/ai_provider_setup → project_select → mandate_genesis` (`installer/native/config/onboarding/onboarding_steps.json`) | milestones de onboarding | Pantallas de onboarding | [COMPROBADO] estructura; [NO OBSERVADO] recorrido completo |
| G1 | Crear el Mandate Genesis | Core al montar (`webview/app/src/lib/bootstrap/genesisLaunch.ts:88-111`) → `POST /api/v1/mandates` | `mandate_state.json` con `status:"building"`, `currentPhase:"ingest"`, `signature.status:"not_ready"`, `docsProvided: []`, `projectId` (`src/api/handlers/create-mandate.handler.ts:120-150`) | `mandate:build:initiated` (`:169`) | `mandateStore` crea la entrada (`webview/app/src/lib/stores/mandateStore.ts:197-205`) | [COMPROBADO] |
| G1′ | Alternativa: crear por CLI con documentos | Persona (`nucleus mandate genesis --docs …`, `cmd/mandate.go:112,160,176`) | Copia documentos a `{mandate}/docs/` y llena `docsProvided` | ninguno al crear (auditoría de eventos v1, histórica) | Nada hasta el próximo catch-up | [NO OBSERVADO] |
| G2 | Ingesta | Workflow (`wf/mandate_build_workflow.go:139-147`) → Brain `intent create --type ing` + `hydrate` (`act/mandate_genesis_activities.go:490-525`) | Intent `ing` con `.reception`; `currentPhase → cluster` (`:168-176`) | `mandate:phase:ingest` con `filesReceived` (`:149-159`) | Evento desconocido para el cliente → pide reconciliación y relee la lista (`mandateStore.ts`, rama `default`) | [COMPROBADO] código; [NO OBSERVADO] ejecución |
| G3 | "Clustering" | Workflow, `ScaffoldDomainActivity` en `dry_run` (`wf/…:179-188`) | `domain_proposal.json` con **un solo dominio cuyo nombre es el del Project**, `cohesionScore: 1.0` y `suggestedActionCount: 1` como marcadores (`act/mandate_genesis_activities.go:30-35,211-240`); `currentPhase → validate` (`wf/…:192-200`) | `mandate:action:completed` con `domains` (`act/…:182-205`) | El cliente registra sólo la revisión; **descarta `domains`** (`mandateStore.ts`, caso `mandate:action:completed`) | [COMPROBADO] — ver EM-C14 |
| G4 | Punto de sincronización humana | Workflow espera **sin timeout** la señal `mandate:build:validate` (`wf/…:217-223`) | — | ninguno que lo anuncie | Nada indica que el Paladín debe actuar | [COMPROBADO] (EM-C06) |
| G4a | Ver candidatos | Persona: `nucleus mandate build domains list` (`cmd/mandate_build_domains_cmd.go:82-111`) | Lee `phases.validate.humanSync.candidateDomains` (`:94`) | — | — | [QUIEBRE PREVISTO] los candidatos no se escriben ahí antes de la señal (EM-C15) |
| G4b | Confirmar **exactamente un** dominio | Persona: `domains confirm --domain-id` (`:113-256`) | Exige fase `validate` (`:132-135`), un solo id existente entre candidatos (`:141-150`), congela Files desde `docsProvided` (`:160-164`; `mc/contract.go:172-175` exige ≥1 documento); `confirmedBy` **vacío** (`:174-180`); confirmación inmutable (`:151-154`; `:352-358`) | señal `mandate:build:validate` con `Approved:true` (`:212-237`) | Nada | [QUIEBRE PREVISTO] por EM-C15 y, si se lanzó desde Core, por EM-C16 |
| G4c | Rechazar | Persona: `domains reject` | **Nada se persiste ni se señala** (`:262-277`) | — | — | [COMPROBADO] (EM-C11) |
| G5 | Persistir Human Sync | Workflow (`wf/…:253-276`) → `PersistHumanSyncActivity` | `humanSync.candidateDomains/confirmedDomainIds/files`; `signature.status → pending` (`act/mandate_sign_activity.go:314-329`) | ninguno | Nada | [NO OBSERVADO] |
| G6 | **Aprobar** el contrato exacto | Persona: `nucleus mandate approve --id … --model/--supply/--policy/--registry/--max-*` (`cmd/mandate_authority_cmd.go:30-83`) | Se construye el contrato confirmado (v2/v3) con la inteligencia elegida y se calcula el digest (`:133-160,440`); suministro local: preflight antes y después del consentimiento (`:186-190,274-278`); consentimiento en Authority por URL + atestación pegada (`:229-249`); decisión `mandate.sign` (`:251-259`); revalidación del binding y del digest tras el consentimiento (`:260-273`); recibo `mandate_approve.json` (`mc/signature.go:101-103`; `cmd/…:287-297`); `mandate.json` firmado; `signature.status → signed` (`:298-305,331-350`) | señal `mandate:build:approve(digest)` (`:311-314,691`); log `mandate.act.*` (`:233,257,264,297,312`) | Nada | [COMPROBADO] código; [NO OBSERVADO] ejecución |
| G6′ | Fallo de la señal tras aprobar | — | Acto persistido; mensaje "reintente la señal tras recuperar Temporal" (`:311-314`); reintento recupera desde el recibo (`:191-212`, `mandate.act.recovered`) | `mandate.act.signal_failed` (sólo log) | Nada | [COMPROBADO] |
| G7 | **Activar** | Persona: `nucleus mandate activate --id` | Carga contrato firmado y recibo de aprobación verificado contra el digest (`:162-175`); nueva atestación, permiso `mandate.install` (`:251-253`); recibo `mandate_activate.json`; `activation:{status:"active", contractDigest}` (`:352-363`) | señal `mandate:build:activate(digest)` | Nada | [COMPROBADO] código; [NO OBSERVADO] ejecución |
| G7′ | Workflow verifica ambos actos | Workflow (`wf/…:279-296`) | Exige mismo digest entre aprobación y activación (`:294-296`); `currentPhase → signed` (`:285-287`) | — | — | [COMPROBADO] |
| G8 | Ejecución | Workflow hijo (`wf/mandate_execution_workflow.go:171-208`) → `MandateGenActivity` → Brain `gen_domain` vía AITAP | `domain_definition.json` (`schemaVersion, mandateId, contractDigest, domainId, name, purpose, boundaries, concepts, decisions, sources`; `brain/core/intent/gen_domain.py:96-107`); evidencia AITAP en `{mandate}/.gen-supply/` (`act/mandate_gen_activity.go:138,279,304`); `phases.execute.actions[actionId]` con `status:"completed"` y `fulfillmentStatus:"fulfilled"` (`act/mandate_execution_activities.go:82-116`) | ninguno propio | Nada | [NO OBSERVADO] (bloqueo E2E vigente: credencial Anthropic vía Vault, MANDATE canonical §6.2) |
| G9 | Cierre | Workflow (`wf/…:302-308`) | `currentPhase → completed` | `mandate:build:all_complete` con `contractDigest`, `fulfilled:true` | Evento desconocido para el cliente → reconciliación | [NO OBSERVADO] |
| G-F | Fallo de ejecución | Workflow hijo devuelve `Success:false` (`wf/mandate_execution_workflow.go:187-206`); el padre devuelve error (`wf/mandate_build_workflow.go:299-304`) | **Ningún cambio** en `mandate_state.json` | **Ninguno** | Nada | [COMPROBADO] (EM-C12) |

**Lo que la UI puede leer en todo el recorrido** [COMPROBADO]: sólo el resumen de `GET /api/v1/mandates` — `mandateId, mandateType, project, name, source, status, currentStatus, currentPhase, stateVersion, updatedAt, createdAt, fileKind` (`src/api/routes/mandates.routes.ts:47-60`). Ni `signature`, ni `activation`, ni `humanSync`, ni el contrato, ni el resultado. `status/currentStatus` se resuelven de los campos de primer nivel (`src/api/handlers/list-mandates.handler.ts:28-49`), que **ningún escritor Go actualiza** después de G1 (búsqueda de escrituras de `status`/`currentStatus` en `installer/nucleus/internal/orchestration`: sólo `signature.status`, `activation.status` y `phases.*.status`) (EM-C13). El cliente modela las fases `ingest | cluster | validate | scaffold` (`mandateStore.ts:29`), no `signed` ni `completed`.

---

## 3. Escenarios de interacción en Orrery derivados del trabajo activo

Formato por escenario: **Situación real** · **Qué existe** (con marca) · **Experiencia en Orrery** (fases E*, Proyecciones P-* y Superficies del EM v0.1) · **Invariantes** · **Qué falta** · **Qué validaría el E2E**.

### S1 · Lanzar Genesis y esperar (G1–G3)

- **Situación real.** El Paladín terminó el onboarding; Core crea el Mandate al montar. Durante minutos el sistema ingiere y "agrupa".
- **Qué existe.** Mandate en la lista con `currentPhase` cambiando [COMPROBADO código]; eventos parcialmente desconocidos que el cliente resuelve releyendo la lista (mitigación física de EM-C03) [COMPROBADO]; el Contexto existe pero no se consume [COMPROBADO].
- **Experiencia en Orrery** [HIPÓTESIS]. E1 Entrar es opcional y sólo por acto del Paladín (C-17: que el Mandate arranque no lo lleva a Orrery). Si entra: capa O con Contexto; Foco inicial en el Project; P-W1 anota sobre el **Project** (todavía no hay Domain declarado) un Mandate "en ingesta" con Procedencia *registro*. El progreso real disponible es binario por fase y `filesReceived`; la experiencia no puede inventar porcentajes (C-2).
- **Invariantes.** C-2, C-4 (el Mandate se sitúa, no es Entidad), C-6, C-17.
- **Qué falta.** RI-W1 (situación del Mandate), RI-C1 (consumo del Contexto), corrección de EM-C13.
- **E2E valida.** Secuencia y momentos reales de eventos; si `filesReceived` refleja algo legible.

### S2 · El punto de sincronización humana: confirmar el dominio (G3–G5)

- **Situación real.** El workflow se detiene indefinidamente esperando que el Paladín confirme un dominio.
- **Qué existe.**
  - Propuesta: un único dominio con el nombre del Project, cohesión 1.0 y cantidad sugerida 1 **como marcadores** [COMPROBADO] (EM-C14).
  - Visibilidad: sólo en `domain_proposal.json` y en el payload de `mandate:action:completed`, que el cliente descarta [COMPROBADO]. El CLI lee otro lugar [QUIEBRE PREVISTO, EM-C15].
  - Confirmar exige ≥1 documento congelable; Genesis lanzado desde Core tiene `docsProvided: []` y no existe el endpoint de carga de documentos (`webview/app/src/lib/stores/docsGate.ts:100-122`) [QUIEBRE PREVISTO, EM-C16].
  - La confirmación no registra quién confirmó [COMPROBADO] (EM-C17).
  - Rechazar no hace nada [COMPROBADO] (EM-C11).
- **Experiencia en Orrery** [HIPÓTESIS].
  - T1 Convocatoria: "El Mandate Genesis de ‹proyecto› espera que confirmes su dominio" — **sólo si la Fuente lo clasifica** (RI-A1). Hoy no hay Fuente: Orrery no puede inferirlo de `currentPhase == "validate"` (C-17, EM-C06).
  - Espacio: el candidato se percibe por P-W3 como **propuesta situada sobre el Project**, no como Entidad (Vocab §4.2: `DomainCandidate` es "Propuesta dentro de un Mandate"). La cohesión **no** se muestra mientras la Fuente no indique que es real (C-2: un marcador no puede presentarse como medición).
  - Superficie del Mandate (E5→E9): candidato, Files a congelar con hash y tamaño, consecuencia ("este dominio quedará fijado; no podrá sustituirse": `cmd/…:151-154`), y el acto **confirmar**. **Rechazar** se presenta como "no disponible como acto registrado" mientras no persista nada (C-14: un rechazo sin evidencia no es una decisión).
  - Tras confirmar: el dominio sigue siendo **propuesta confirmada, no firmada**. D-3.b cubre al dominio "confirmado… y declarado en su contrato firmado"; entre G4b y G6 no hay contrato firmado, por lo que su Procedencia sigue siendo *propuesto* (Vocab §3.5) — no es todavía una Entidad D-3.b. Ver EM-C20 (aclaración, no contradicción).
- **Invariantes.** C-2, C-3, C-13, C-14, C-17, D-3.b.
- **Qué falta.** RI-T6 (candidatos legibles antes de la señal), RI-W5/RI-A1 (acto esperado), RI-W6 (atribución de la confirmación), RI-W7 (rechazo con evidencia), endpoint de documentos.
- **E2E valida.** Cómo se confirmó realmente (CLI, otro camino), si `candidateDomains` existía antes de la señal, qué documentos se congelaron, el nombre real del dominio.

### S3 · Aprobar el contrato exacto con elección de inteligencia (G6)

- **Situación real.** El Paladín elige modelo, suministro (local o cloud), política, registro y presupuesto; el sistema arma el contrato y su digest; el Paladín consiente en Authority y pega la atestación.
- **Qué existe.** Todo el recorrido [COMPROBADO código]; sólo por CLI; ninguna Superficie lo muestra [COMPROBADO].
- **Experiencia en Orrery** [HIPÓTESIS].
  - La **elección de inteligencia ocurre antes del consentimiento y forma parte del digest**. Por C-13 la Superficie debe mostrar el digest **recalculado después de elegir**, y el acto aplicarse a ese digest. Cambiar cualquier elección produce otro contrato candidato.
  - La Superficie muestra: objetivo, dominio, Action (`run_intent gen`, artefacto `domain_definition.json`), inputs con hash, inteligencia (proveedor, modelo, local/cloud, presupuesto), Gravity del contrato (**vacío → "sin criterio vinculado"**, R-3) y digest.
  - El acto **abre** el paso de consentimiento de Authority y **verifica** el resultado por relectura; nunca firma (C-13, V-11).
  - Rechazos que la experiencia debe distinguir porque el código ya los produce: Authority deniega el permiso (`:256-259`); el binding del Project cambió durante el consentimiento (`:260-263`); el contrato candidato cambió tras el consentimiento (`:271-273`); el preflight local falló antes o después del consentimiento (`:186-190,274-278`). Hoy esas causas quedan **sólo en el log** (EM-C19).
- **Invariantes.** C-12 (sin Contexto confirmado no se canaliza), C-13, C-14.
- **Qué falta.** RI-W2 (contrato y digest legibles), RI-W8 (resultado del acto y causa de denegación como estado), canal desde Core.
- **E2E valida.** Qué ve realmente el Paladín en Authority; tiempos; si la elección local/cloud fue la usada.

### S4 · Activar (G7)

- **Situación real.** Segundo consentimiento independiente, con otro permiso.
- **Experiencia** [HIPÓTESIS]. Un acto distinto del de aprobar (R-1), con su propia atestación y posible principal distinto. La Superficie muestra que el digest a activar es **el mismo** que se aprobó (el workflow lo exige: `wf/…:294-296`) y quién aprobó.
- **Qué existe.** [COMPROBADO código]; [NO OBSERVADO] ejecución.

### S5 · Ejecución y resultado (G8–G9)

- **Situación real.** Brain produce la definición del dominio con el modelo firmado; Nucleus verifica y persiste.
- **Experiencia** [HIPÓTESIS].
  - El dominio pasa a ser **Entidad D-3.b** (declarada por un Mandate firmado). P-W1 anota el Mandate "completado" sobre él; P-W2 anota que hay un resultado.
  - Superficie del Domain: propósito, límites (`inScope/outOfScope` en local), conceptos y **"decisiones" presentadas como propuestas del modelo** (EM-C18; C-2, C-14), fuentes con hash, modelo y referencia de contabilidad.
  - "Cumplido" se dice como lo que es: **"la definición tiene la estructura exigida"** (evaluador `domain-definition-structure`, `cmd/mandate_authority_cmd.go:440`), no "es correcta" (C-2; R-6).
- **Qué existe.** [NO OBSERVADO] todo el paso; [COMPROBADO] forma del artefacto y verificaciones.
- **E2E valida.** Contenido real de `domain_definition.json`; si `decisions` contiene enunciados que un humano leería como decisiones tomadas.

### S6 · Fallos, denegaciones y recuperación

- **Qué existe.** Fallo de ejecución sin estado ni evento [COMPROBADO] (EM-C12); denegaciones sólo en log [COMPROBADO] (EM-C19); señal fallida con acto persistido y recuperación [COMPROBADO]; confirmación persistida sin señal si Temporal no responde (`cmd/mandate_build_domains_cmd.go:222-237`) [COMPROBADO].
- **Experiencia** [HIPÓTESIS]. La peor violación posible aquí es mostrar "en curso" para siempre algo que falló (C-2). Mientras la Fuente no exponga el fallo, la experiencia sólo puede decir **"sin novedades desde ‹momento›; el sistema no informa el estado de ejecución"** — es *desconocido*, no "en curso". El caso "acto persistido, señal pendiente" necesita un estado propio porque requiere un acto de recuperación del Paladín.
- **Qué falta.** RI-W9 (estado de fallo y causa), RI-W10 (estado "acto registrado, workflow no notificado").

### S7 · Volver al día siguiente

- **Qué existe.** Catch-up por `GET /mandates` y reconciliación ante reconexión o evento desconocido [COMPROBADO] (`webview/app/src/routes/+layout.svelte:87-92`; `mandateStore.ts`); `status` congelado en `building` (EM-C13); fases `signed`/`completed` no modeladas en el cliente [COMPROBADO].
- **Experiencia** [HIPÓTESIS]. E2 Orientarse incluye "qué cambió desde la última vez" **sólo con lo que la Fuente provee** (EM v0.1 §3.1). Con los datos actuales, un Mandate completado se mostraría como "construyendo": violación de C-2 previsible si se usa `status`.
- **E2E valida.** Qué devuelve realmente `GET /mandates` en cada momento.

### S8 · Segundo Mandate sobre el mismo Project

- **Situación real posible.** `mandateType: 'domain_expansion'` existe en cliente y servidor [COMPROBADO] (`create-mandate.handler.ts:120`; `mandateStore.ts:27`).
- **Predicción** [QUIEBRE PREVISTO]. El dry-run vuelve a proponer un dominio con el **nombre del Project**, con otro id (`newDomainID` agrega sufijo aleatorio: `act/mandate_genesis_activities.go:130-132`). Resultado: dos Entidades D-3.b con el mismo nombre visible.
- **Experiencia** [HIPÓTESIS]. La identidad es `(fuente, tipo, id)`, nunca el nombre (C-3). La indicación y la Superficie deben desambiguar por id y Mandate de origen; la experiencia no puede fusionarlas por nombre.

### S9 · "Quiero declarar algo desde este dominio"

- **Qué existe.** Nada [COMPROBADO]: sin Postulate, sin anclar, sin Captura.
- **Experiencia** [HIPÓTESIS]. Sólo el Project es anclable en v0.1; el dominio D-3.b se informa `unsupported`. E8 queda **indeterminada** (EM-C04). La experiencia correcta hoy es decir que el acto no existe, no simularlo.

### S10 · Gravity durante Genesis

- **Qué existe.** El bootstrap crea NUCLEUS y ORGANIZATION con `gravityPostures: []` [COMPROBADO] (`installer/nucleus/internal/governance/gravity_bootstrap.go:34,59`). Ningún código escribe Postures en ningún nodo (búsqueda de asignaciones de `GravityPostures` fuera de tests y de inicializaciones vacías: sólo DOMAIN/GENE en la proyección estructural, también vacías). El contrato no lleva Gravity; ningún workflow resuelve Gravity (EM-C01) [COMPROBADO].
- **Experiencia** [HIPÓTESIS]. Ver R-3: la persona debe percibir **"no hay criterio declarado en ningún nivel"** (hecho de la Fuente, si la Fuente lo expone) y, para el Trabajo, **"Gravity no fue evaluada para este Mandate"**. Nunca "sin conflictos".

### S11 · El Contexto cambia en medio de un acto

- **Qué existe.** El código revalida el binding del Project después del consentimiento y aborta si cambió (`cmd/mandate_authority_cmd.go:260-263`) [COMPROBADO].
- **Experiencia** [HIPÓTESIS]. La Superficie debe presentar el acto como **no registrado** con esa causa, y la capa O actualizar el Contexto (C-12, C-13). Es el único caso de CT-14 ("el objeto cambió entre percepción y acto") que hoy tiene soporte físico.

---

## 4. Profundizaciones del Experience Model que surgen del contraste

| Id | Profundización | Base | Marca | Afecta en EM v0.1 |
|---|---|---|---|---|
| R-1 | **E9 Decidir se descompone en tres actos distintos**: confirmar (sin atestación ni atribución, inmutable), aprobar (atestación, `mandate.sign`, elección de inteligencia dentro del digest) y activar (atestación, `mandate.install`, mismo digest). Cada uno tiene precondición, evidencia y autoridad propias. | §2 G4b, G6, G7 | [COMPROBADO] estructura | §3.3 E9, §7.2 |
| R-2 | **Etapa observable derivada de hechos de la Fuente**: creado → ingiriendo → agrupando → espera confirmación → espera aprobación → espera activación → ejecutando → completado / fallado. Cada etapa corresponde a una combinación verificable de `currentPhase`, `humanSync`, `signature`, `activation`, `phases.execute`. **La correspondencia debe ser propiedad de la Fuente**, no de Orrery (C-17). | `wf/…:112`; `cmd/…:331-363`; `act/mandate_sign_activity.go:314-329` | [COMPROBADO] hechos; [HIPÓTESIS] etapa | §7.3, §7.4; RI-W5 |
| R-3 | **"Sin criterio declarado" como matiz propio.** Con cero Postures, una evaluación verdadera daría "sin colisión", pero el significado humano es otro: no hay criterio que pudiera colisionar. La experiencia distingue: *no evaluado* (desconocido), *evaluado sin criterio aplicable*, *evaluado con criterio y sin colisión* (ninguno). | §3 S10 | [COMPROBADO] ausencia de Postures; [HIPÓTESIS] distinción | §6.3, §6.6 (CT-04) |
| R-4 | **Estado intermedio del dominio**: entre confirmar y aprobar, el dominio es una propuesta confirmada, no una Entidad D-3.b. | D-3.b; §3 S2 | [HIPÓTESIS] lectura de la norma | §11 CT-01, CT-09 |
| R-5 | **Colisión de nombre "decisions"**: el artefacto llama `decisions` a propuestas del modelo. La experiencia no puede usar la palabra "decisión" para ellas. | `gen_domain.py:58,85-107` | [COMPROBADO] | §7.1, CT-01 |
| R-6 | **"Cumplido" = estructura válida.** | `cmd/…:440` (`RequiredFields`, evaluador `domain-definition-structure`) | [COMPROBADO] | §11 CT-01 |
| R-7 | **Nombres duplicados de dominio** entre Mandates del mismo Project. | §3 S8 | [QUIEBRE PREVISTO] | §4.3, CT-16 |
| R-8 | **El Human Sync es el caso testigo de Atención**: espera indefinida, acto humano requerido, ninguna señal. Es el primer requisito concreto de RI-A1. | `wf/…:217-223` | [COMPROBADO] | §7.4 |
| R-9 | **El primer Territorio genuino es mínimo**: Tenant/Organization/Project + un dominio con el nombre del Project. Un recorrido por el Espacio con esos datos casi no tiene estructura que explorar; lo valioso en CT-01 es la **orientación** (Contexto, qué se hizo, qué falta) y la **Superficie del Domain**, no la navegación espacial. | §2 G3; EM v0.1 §4.7 | [NO OBSERVADO] | §11 CT-01; P-02 |

---

## 5. Nuevos hallazgos (continúan la numeración del EM v0.1)

Ninguno se resuelve; no se corrigen contratos ni implementación.

| ID | Tipo | Hallazgo | Evidencia | Marca | Afecta |
|---|---|---|---|---|---|
| EM-C11 | norma ↔ físico | `domains reject` no persiste ni señala nada; `mandate:build:rejected` (`wf/…:225-230`) es inalcanzable desde el CLI porque `confirm` siempre envía `Approved:true`. Un rechazo no deja evidencia (C-14). | `cmd/mandate_build_domains_cmd.go:230-233,262-277` | [COMPROBADO] | S2, R-1 |
| EM-C12 | físico | Un fallo de ejecución no cambia `mandate_state.json` ni publica evento; sólo el workflow de Temporal falla. | `wf/mandate_execution_workflow.go:187-206`; `wf/mandate_build_workflow.go:299-304` | [COMPROBADO] | S6, C-2 |
| EM-C13 | físico | `status`/`currentStatus` de primer nivel quedan en `building` desde la creación; ningún escritor Go los actualiza. El cliente no modela las fases `signed`/`completed`. | `create-mandate.handler.ts:125`; `list-mandates.handler.ts:28-49`; búsqueda de escrituras en `installer/nucleus/internal/orchestration`; `mandateStore.ts:29,35` | [COMPROBADO] | S1, S7 |
| EM-C14 | físico ↔ experiencia | El dominio propuesto por Genesis es un marcador: nombre = Project, cohesión 1.0 y cantidad 1 fijas, sin clustering de Brain. Presentarlo como resultado de análisis violaría C-2. | `act/mandate_genesis_activities.go:30-35,211-240` | [COMPROBADO] | S2, CT-01, R-9 |
| EM-C15 | físico (interno) | `domains list/confirm` leen `phases.validate.humanSync.candidateDomains`, que sólo `PersistHumanSyncActivity` escribe **después** de recibir la señal; creación inicial `candidateDomains: []`. Predicción: el CLI no ve candidatos y `confirm` falla. | `cmd/mandate_build_domains_cmd.go:94,137-146`; `wf/mandate_build_workflow.go:253-276`; `create-mandate.handler.ts:149`; búsqueda de escritores de `candidateDomains` | [QUIEBRE PREVISTO] | S2; validar con E2E |
| EM-C16 | físico (interno) | Genesis lanzado desde Core se crea con `docsProvided: []`; `FreezeFiles` exige ≥1 documento; el endpoint de documentos de Core no existe. Predicción: `confirm` no puede congelar Files salvo creación por CLI con `--docs`. | `create-mandate.handler.ts:130`; `mc/contract.go:172-175`; `docsGate.ts:100-122` | [QUIEBRE PREVISTO] | S1, S2; validar con E2E |
| EM-C17 | norma ↔ físico | La confirmación del dominio guarda `confirmedBy: ""`. La experiencia no puede atribuir el acto a una persona. | `cmd/mandate_build_domains_cmd.go:170-180`; `wf/mandate_build_workflow.go:267-270` | [COMPROBADO] | S2, CT-09 |
| EM-C18 | vocabulario ↔ artefacto | El campo `decisions` de `domain_definition.json` contiene propuestas del modelo. | `gen_domain.py:58,96-107` | [COMPROBADO] | S5 |
| EM-C19 | físico | Las denegaciones de aprobar/activar (Authority, preflight local, binding o contrato cambiados) se registran sólo en el log `MANDATE`; no hay estado legible. | `cmd/mandate_authority_cmd.go:256-259,318-329` | [COMPROBADO] | S3, S6 |
| EM-C20 | aclaración normativa (no contradicción) | D-3.b define el dominio "confirmado… y declarado en su contrato firmado"; no cubre explícitamente el intervalo confirmado-sin-firmar. Se lee como *propuesto* (Vocab §3.5). | D-3 §3 | [HIPÓTESIS] lectura | S2, R-4 |

**Matiz sobre EM-C03:** el cliente pide reconciliación (relee `GET /mandates`) ante cualquier evento `mandate:*` desconocido, por lo que el desalineamiento de nombres no deja la lista desactualizada indefinidamente; sí impide que la UI reciba el contenido del evento (por ejemplo los `domains` del dry-run) [COMPROBADO].

---

## 6. Qué se profundiza ahora, qué espera al E2E y qué queda abierto

### 6.1 Profundizable ahora (lectura estática y norma alcanzan)

| Aspecto | Por qué alcanza ahora |
|---|---|
| Descomposición de los actos (R-1) y sus precondiciones, evidencias y causas de rechazo | El código de los actos es completo y legible |
| Etapas observables derivadas de hechos (R-2) y su tabla de correspondencia como requisito hacia la Fuente | Los campos y transiciones están en el código |
| Matiz "sin criterio declarado" (R-3) y su lugar en CT-04 | Ausencia de escritores de Postures verificada |
| Reglas de experiencia para fallos y denegaciones (S6) | No dependen de datos reales |
| Lenguaje de "cumplido" y de "decisiones" (R-5, R-6) | Forma del artefacto fija |
| Estado intermedio del dominio (R-4) | Lectura de la norma |
| Requisitos nuevos RI-T6, RI-W5..RI-W10 | Derivados de quiebres y huecos |
| Atención: el Human Sync como caso de diseño de RI-A1 (R-8) | El punto de espera está en el código |

### 6.2 Requiere evidencia del Genesis E2E

| Aspecto | Qué tiene que mostrar el E2E |
|---|---|
| CT-01 como recorrido genuino | El Territorio real resultante (Project, dominio, nombre) y qué ve el Paladín en cada paso |
| EM-C14..EM-C16 | Si se confirman o se refutan los quiebres previstos y por qué camino se superaron |
| Contenido de `domain_definition.json` | Si propósito, límites, conceptos y "decisiones" son legibles y útiles para orientar |
| Secuencia y tiempos reales de eventos | Qué eventos llegan, cuándo, y qué etapa se ve en Core |
| Experiencia de consentimiento en Authority | Qué datos muestra Authority; si el digest es reconocible para la persona |
| Nodos Gravity existentes al final | Si existe PROJECT; si hay Postures; si se creó MANDATE/SESSION |
| Contexto confirmado real | Si `context-read` devuelve `verified` y con qué componentes |
| Elección de inteligencia efectiva | Local o cloud, modelo, costo (contabilidad) |

### 6.3 Debe permanecer abierto (no se resuelve con evidencia, requiere decisión)

| Aspecto | Por qué | Decisión requerida |
|---|---|---|
| Postulate y E8 Declarar | Indefinición normativa (EM-C04) | Definición de Postulate |
| Lentes con nombre, gestos, layout | Fuera de alcance (Interaction Grammar / UI) | Fases posteriores |
| Admisibilidad de Domain D-3.b como Anchor | Contrato de Location (F-1, D-3.b) | Revisión del schema |
| Dueño de la señal de Atención | Arquitectura (EM-C06) | Workflow / Nucleus / Monitor |
| Escala de autoridad de Fuentes | A-4 | Localizar SAP V1 |
| Integración de Gravity en ejecución | EM-C01 | Dueño de Gravity/MANDATE |
| Clustering real de dominios | EM-C14 es límite de producto, no de experiencia | Roadmap Genesis/Brain |

---

## 7. Protocolo de evidencia post-Genesis

**Autorización (José, 2026-10-10):** lectura de E1–E11 **cuando el Genesis E2E haya terminado**, estrictamente sobre los campos de esta sección y con las exclusiones indicadas (secretos, credenciales, atestaciones). E12 la aporta José.

**Variables del protocolo (no decisiones del Experience Model).** Genesis no se modifica para satisfacer a Orrery. La corrida usa el camino y el suministro que correspondan a su propio trabajo, y se registran como variables observadas:

| Variable | Valores posibles | Dónde se observa | Qué hallazgos condiciona |
|---|---|---|---|
| V-1 Camino de creación | Core (`genesisLaunch` → `POST /api/v1/mandates`) / CLI (`nucleus mandate genesis --docs`) / otro | E12; E1 (`docsProvided`, `source`) | EM-C15, EM-C16, S1, S2 |
| V-2 Suministro de inteligencia | local (Ollama, contrato v3) / cloud (Anthropic, contrato v2) | E3 (`contractVersion`, `intelligence.privacy`, `provider`); E6 | S3, S5, EM-C19 (preflight local) |
| V-3 Camino de confirmación del dominio | CLI `domains confirm` / otro | E12; E1 (`humanSync`) | EM-C15, EM-C17 |

EM-C14, EM-C15 y EM-C16 se mantienen como **[QUIEBRE PREVISTO]** hasta que E1–E12 los confirmen o refuten; no se tratan como hechos observados.


Leer estos artefactos toca el estado operativo (Assignment §13.7). **No leí ninguno.** Propongo esta lista exacta; sólo campos, nunca secretos (se excluyen atestaciones crudas, claves, credenciales, `identity.json`, contenido de documentos del usuario).

`{M}` = `<nucleusRoot>/.mandates/<mandateId>/` del Mandate Genesis que termine.

| # | Artefacto | Campos | Pregunta del EM que responde |
|---|---|---|---|
| E1 | `{M}/mandate_state.json` | `status`, `currentStatus`, `currentPhase`, `stateVersion`, `projectId`, `docsProvided`, `phases.*.status`, `phases.validate.humanSync.{candidateDomains, confirmedDomainIds, confirmedAt, confirmedBy, files[].ref/size}`, `signature.{status, contractDigest, signedAt}`, `activation`, `phases.execute.actions.*.{status, fulfillmentStatus, resultRef}` | R-2, EM-C13, EM-C15, EM-C16, EM-C17; etapas observables |
| E2 | `{M}/domain_proposal.json` | `status`, `domains[].{id, domainName, cohesionScore, suggestedActionCount}` | EM-C14; S2 |
| E3 | `{M}/mandate.json` | Del contrato: `contractVersion`, `organizationId`, `projectId`, `objective`, `domain`, `action`, `inputs[].ref/sha256/size`, `intelligence.{provider, model, privacy, maxUsd}`, `gravity`, `fulfillment`; `contractDigest` | S3; CT-09 (Domain D-3.b real); RI-W2 |
| E4 | `{M}/mandate_approve.json`, `{M}/mandate_activate.json` | `operation`, `contractDigest`, `recordedAt`, `decision.{outcome, operation, principalId, authorityVersion}` — **sin** `attestation`, `manifest`, claves | R-1; S3, S4 |
| E5 | `{M}/domain_definition.json` | todos los campos (es el resultado de trabajo) | S5, R-5, R-6; CT-01 Superficie del Domain |
| E6 | `{M}/.gen-supply/.supply_result.json` | `model`, `provider`, `routing_decision.effective_intelligence.{backend_id, privacy}`, `accounting_ref` — **sin** `raw_response` | S3, S5; contabilidad |
| E7 | `<nucleusRoot>/.gravity/` | Listado de nodos: `nodeId`, `nodeType`, `parentId`, `status`, cantidad de `gravityPostures` | S10, R-3, EM-C01 |
| E8 | `<nucleusRoot>/.cache/.semantic-index.json` | cantidad de `domains` y de `genes` | CT-01 (Domain canónico); RI-T3 |
| E9 | Log `MANDATE` del período | líneas `event: mandate.act.*` (tipo, operación, `reason`, `stage`) | EM-C19; S6 |
| E10 | Salida de `nucleus --json authority context-read <org> <projectId>` | estados por componente | P-03, CT-15, EM-C02 |
| E11 | Respuesta de `GET http://localhost:48215/api/v1/mandates` al final | el objeto del Mandate | S7, EM-C13 |
| E12 | **Bitácora del Paladín** (escrita por vos durante la corrida) | camino de creación (Core o CLI), comandos usados, hora de cada paso, qué mostraba Core en cada momento, qué buscaste y no encontraste | Primer recorrido genuino; T1; S1–S7 |

**Próximo paso de este frente:** contrastar el Experience Model contra el Genesis E2E real mediante E1–E12; actualizar CT-01, los escenarios S1–S10 y los hallazgos EM-C11..EM-C20 según lo que la evidencia confirme o refute; completar R-2 con datos reales.

---

## 8. Requisitos de información nuevos (continúan el EM v0.1 §12)

| Id | Información requerida | Productor / Fuente esperado | Procedencia necesaria | Existencia física | Gap |
|---|---|---|---|---|---|
| RI-T6 | Candidatos de dominio legibles **antes** del punto de sincronización, con indicación de si sus métricas son reales o marcadores | Nucleus (workflow de build) | Propuesta | [F~] `domain_proposal.json` y payload de evento; no en el read model (EM-C15) | Persistir/exponer; marcar marcadores |
| RI-W5 | Acto humano esperado (confirmar / aprobar / activar / recuperar señal) explícito | Workflow / Nucleus | Registro | [F✗] | Ver R-2, EM-C06 |
| RI-W6 | Autor de la confirmación del dominio | Nucleus + identidad humana | Atribución | [F✗] `confirmedBy` vacío (EM-C17) | Canal de identidad (D-9) |
| RI-W7 | Rechazo de candidato como acto registrado | Nucleus | Registro | [F✗] (EM-C11) | Definición del acto |
| RI-W8 | Resultado de aprobar/activar y causa de denegación como estado | Nucleus / Authority | Registro | [F~] sólo log (EM-C19) | Exponer |
| RI-W9 | Fallo de ejecución con causa | Nucleus / Temporal | Registro | [F✗] (EM-C12) | Persistir |
| RI-W10 | "Acto registrado, workflow no notificado" | Nucleus | Registro | [F~] sólo mensaje del CLI | Estado legible |
| RI-W11 | Etapa del Mandate en el read model (incluye `signed`, `completed`) | Nucleus / Control Plane | Registro | [F~] `currentPhase` sí; `status` congelado (EM-C13) | Corregir/exponer |
| RI-G15 | "Sin criterio declarado" como hecho legible por nivel | Gravity | Proyección | [F✗] sin lectura | Ver R-3 |

---

## 9. Decisiones registradas (José, 2026-10-10)

1. Escritura autorizada en `docs/ANALYSIS/ORRERY/EXPERIENCE/Orrery_Experience_Model_Escenarios_Trabajo_Activo_v0_1.md` y copia en el Project; profundización del EM v0.1, no lo reemplaza.
2. Lectura de E1–E11 autorizada al terminar el Genesis E2E, sólo campos de §7, con exclusiones de secretos, credenciales y atestaciones. E12 la aporta José.
3. Camino (Core/CLI) y suministro (local/cloud) son variables del protocolo (V-1..V-3), no decisiones del Experience Model; Genesis no se modifica por Orrery.
4. EM-C14..EM-C16 permanecen como quiebres previstos.
5. Profundización estática cerrada por ahora. Sin avance a Interaction Grammar ni UI/UX.

---

*Fin. No define Interaction Grammar, UI/UX, contratos ni implementación. No leyó estado operativo. Todas las afirmaciones físicas son de lectura estática a `3bd723b`.*
