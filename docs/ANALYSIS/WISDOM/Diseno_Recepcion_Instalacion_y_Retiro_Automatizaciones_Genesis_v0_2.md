# Genesis en Wisdom — oferta distribuible, instancia local v4 y retiro de automatizaciones — diseño v0.2

**Fecha:** 2026-10-18 · **Modo:** sólo lectura y diseño. No se modificó código, estado ni Git; no se ejecutó RUNNER CORE.
**Reemplaza a:** v0.1 del mismo documento. La decisión sobre el origen de Genesis cambia: A2 deja de ser el primer corte y pasa a gate técnico limitado (§8). Se conservan de la v0.1: el retiro conjunto S1+P1 y las correcciones de recuperación (§5).
**Parte de:** `ANALYSIS/WISDOM/Investigacion_Recorrido_Paladin_Wisdom_Instalacion_Genesis_v0_2.md`.
**Convención:** **[H]** código (ruta:línea) · **[Doc]** documento · **[I]** inferencia · **[P]** propuesta · **[D]** decisión pendiente · **[J]** decisión ya tomada por José.

---

## 0. Decisión de partida y consecuencias

**[J]** Genesis nunca crea el proyecto. Para elegir Genesis en Wisdom hace falta un proyecto local ya creado o importado, desde onboarding o desde Core.

Consecuencias:
1. **Hay dos objetos distintos.** La **oferta distribuible** no conoce proyectos. La **instancia local v4** existe sólo vinculada a uno.
2. **El gesto se dirige a un proyecto:** «Instalar Genesis para ‹proyecto›». Sin proyecto elegible, Wisdom muestra la oferta pero no habilita el gesto.
3. **El flag `genesis_launch_required` pierde todo sentido.** Su retiro (P1) es coherente con esta decisión.
4. **La reclamación del proyecto ante Authority pasa a ser precondición de Genesis.** Esa reclamación ocurre dentro de la parte de `authority sync` que se conserva (`authority_command.go:442-500`, `ClaimProject`) **[H]**. Retirar la entrega del sync no puede tocar esa parte.

---

## 1. Qué parte de un v4 es distribuible y qué parte es local

Hoy un v4 se compone en un solo paso, en la herramienta de recuperación (`tools/mandate-v4-sign/main.go:290-312`) **[H]**. Separando sus campos:

| Campo del v4 | Hoy sale de | Clasificación |
|---|---|---|
| Grafo de seis Actions `ing,dis,doc,exp,dev,exp`, `dependsOn`, `whenResult` | Construido en código (`main.go:292-304`), validado por `ValidateMandateActions` (`contract.go:89-121`) | **Distribuible** |
| `fulfillment` (`exp-ready`/1, campos requeridos) | Constante (`main.go:312`) | **Distribuible** |
| Política y registry: versión, `snapshotId`, sha256 | `installer/aitap/policies/initial-mandate-v1.json`, `registry/initial-mandate-v1.json` (`main.go:34-35, 217-257`) | **Distribuible** (contenido y digest) |
| `policyRef` / `registryRef` | Ruta **absoluta** local (`contract.go:146`) | **Local** (dónde quedó la copia verificada) |
| Techos `maxTotalTokens`, `maxOutputTokens` | Constantes (`main.go:310`) | **Distribuible** |
| Plantilla de `objective` | Literal (`main.go:306`) | **Distribuible**, instanciada con el nombre del proyecto |
| `mandateId` | Constante del Mandate recuperado | **Local** (nuevo por instancia) |
| `organizationId`, `projectId` | Constantes | **Local** |
| `projectBinding` | Recibo canónico de `project-bindings.json` (`main.go:204-212`; también `mandate_authority_cmd.go:484-496`) | **Local** |
| `inputs[]` | `FreezeFiles` sobre `docs/` → `inputs/` (`contract.go:231-313`; `mandate_build_domains_cmd.go:186`) | **Local** |
| `domain {id, name}` | Human Sync tras un ING con inferencia (`mandate_build_workflow.go:203-264`) | **Local** — ver §3.3 |
| Firma | `mandatecontract.Sign` con la identidad de la instalación (`signature.go:181-194`) | **Local** |

**[I]** La oferta distribuible es la plantilla del plan, más la política y los techos. La instancia es esa plantilla aplicada a un proyecto, a sus documentos congelados y a la firma de esta instalación.

---

## 2. Precondición de proyecto

| Condición | Cómo se verifica hoy | Estado |
|---|---|---|
| El proyecto existe en la organización activa, con `project_id` | Lo escriben `onboarding:select-project` / `import-project` en `nucleus.json` (`onboarding-handlers.js:816-865, 880`) **[H]** | Existe para onboarding |
| La carpeta local es accesible y el `project_id` es continuo | `nucleus authority context-read <org> <projectId>`: sólo lectura; devuelve `localLocation` y `projectIdContinuity` (`authority_command.go:132-137, 254-258`). Core ya lo lee vía `confirmedContext.read` (`preload_core.js:81-83`) **[H]** | Existe |
| Binding canónico con Authority | `authority sync` reclama los proyectos (`authority_command.go:442-500`) y guarda el recibo en `project-bindings.json`. `context-read` expone `projectBinding` **[H]** | Existe |
| Proyecto agregado desde Core | `addProject` → `POST /project/add` (`webview/app/src/lib/api.ts:416-424`) **[H]** | **No verificado:** si persiste `project_id` en la organización activa y quién dispara después el sync que lo reclama |

**[P] Regla de UI:** la lista de proyectos elegibles sale de `context-read`. Un proyecto sin binding canónico aparece con el motivo («Pendiente de vínculo con Authority») y su gesto queda deshabilitado. Wisdom no reclama proyectos ni corre el sync por sí misma.

---

## 3. Recorrido real: transiciones, efectos y estado en Core

### 3.1 Tabla

| # | Gesto / evento | Quién | Efectos durables | Estado que muestra Core |
|---|---|---|---|---|
| T0 | Entrar a Wisdom, ver la ficha | Paladín → Nucleus lee metadatos y estado local | **Ninguno** | Oferta «Genesis v‹x›, publicada por ‹publicador›». Por proyecto: «Disponible», «Requiere vínculo» o «Ya instalado» |
| T1 | **«Instalar Genesis para ‹proyecto›»** (confirmación explícita) | Nucleus | (a) Recibo de la entrega de la **definición**, con `(id, versión, digest)` ofrecidos. (b) Definición, política y registry materializados en un almacén local de definiciones, inmutable y fuera de `.mandates`. (c) **Instancia abierta:** `.mandates/<nuevoId>/mandate_state.json` con `{status: installed, projectId, source{definitionId, version, digest}}`. **Sin** `mandate.json`, insumos ni firma | «Instalado para ‹proyecto› · sin preparar» |
| T2 | **«Preparar con los documentos de ‹proyecto›»** (confirmación explícita, con la lista de documentos) | Nucleus | (a) `context-read` revalida el binding. (b) Copia de documentos a `docs/` y `FreezeFiles` → `inputs/`. (c) Composición del v4: definición + identidad local + binding + insumos + rutas a las copias verificadas de política y registry. (d) `mandate.json` firmado por la instalación. (e) Journal `{status: prepared, contractDigest, source…}` | «Preparado · firmado · inactivo», con N documentos congelados, digest del contrato y procedencia de la definición |
| T3 | Elegir recursos por Intent | **Gate G3**, fuera del primer corte | Vínculo de elección al `contractDigest` | «Recursos elegidos» |
| T4 | Aprobar / Activar | **Gate G4** | Recibos de actos | «Aprobado» → «Activo» |
| T5 | Ejecución, empezando por ING | watcher | Workflow | «En ejecución» |

### 3.2 Respuestas puntuales

- **Qué instala el clic (T1):** la definición distribuible verificada y una instancia vacía, vinculada al proyecto. No instala un contrato ejecutable, no copia documentos y no firma.
- **Cuándo entran los insumos locales:** en T2, por gesto explícito y mostrando qué documentos se congelan. Después de T2 no se pueden sustituir (`FreezeFiles` rechaza contenido distinto; `contract.go:274-284`) **[H]**.
- **Cuándo se firma el v4:** al final de T2, después de congelar los insumos y antes de cualquier inferencia. Firmar no es aprobar: la aprobación ante Authority es T4.
- **Por qué T1 y T2 no van juntos [P]:** congelar documentos y firmar son actos con consecuencias propias, y el Paladín debe ver qué documentos se toman. Juntarlos en un clic (variante K3) ocultaría eso. Instalar sólo la definición sin abrir la instancia (variante K1) dejaría sin uso la precondición de proyecto en el momento de elegir. **Recomendada: K2** (T1 + T2 separados). [D]

### 3.3 El dominio del v4: decisión de fondo

Hoy el dominio sale de un Human Sync sobre una propuesta de clustering. Esa propuesta requiere un ING con Brain, es decir inferencia (`mandate_genesis_activities.go:299-375, 632`; `mandate_build_workflow.go:162-264`) **[H]**. El v4 exige `domain.id` y `domain.name` no vacíos (`contract.go:135`) **[H]**.

| Alt | Cómo se obtiene el dominio | Consecuencia |
|---|---|---|
| **Dom-a** | El dominio es el proyecto (`id` derivado del `projectId`, `name` del proyecto). El v4 se firma en T2 sin inferencia; el ING corre **bajo** el contrato firmado | Toda inferencia ocurre después de firmar, lo que encaja con M-1. Cambia el significado de `domain` en los v4 de Genesis |
| Dom-b | Como hoy: ING + Human Sync antes de firmar | Exige elegir proveedor (G3) **antes** de poder firmar, y ejecuta inferencia sin plan firmado. Desordena el recorrido pedido (instalar → … → AITAP después) |

**Recomendada: Dom-a.** [D]

### 3.4 El watcher frente a los estados nuevos

El watcher lanza el build cuando el journal tiene `mandateType` `genesis` o `domain_expansion` **y** `status: building` (`mandate_watcher.go:368-372, 540-552`) **[H]**. Con un journal adoptado, toma otra rama (`mandate_watcher.go:355-357`).

**[P]** Los estados `installed` y `prepared` **no** llevan `mandateType: genesis` ni `status: building`, y no se presentan como adopción de una entrega. Así el watcher actual los ignora y T1/T2 no disparan el workflow de construcción ni ningún ING. «Genesis» sigue siendo sólo un label que viene de la definición.

---

## 4. Contratos mínimos

Sin nombres de rutas, comandos ni schemas definitivos. Ninguno lleva la palabra *bootstrap*.

| # | Contrato | Contenido mínimo | Relación con lo existente |
|---|---|---|---|
| **C1** | **Definición distribuible** (la oferta) | `definitionId`, `version`, `label`, plantilla de `objective`, grafo de Actions, `fulfillment`, política y registry (bytes o referencia por versión + sha256), techos, requisitos de insumos (fuente: documentos del proyecto, mínimo 1), regla de dominio (Dom-a), Intents requeridos, publicador y firma del publicador. **No** contiene organización, proyecto, instalación ni rutas | Es una realización mínima de la «proyección portable» (Canonical §4.2) **[Doc]**. Si debe ser el Mandate Package del Spec o un artefacto propio es [D]. Nada de esto existe en código |
| **C2** | **Catálogo sin bytes** (Backend) | Por organización: ofertas habilitadas con id, versión, digest, label, propósito, publicador, fecha y requisitos | Hoy sólo existe la asignación única con bytes (`mandate-delivery.ts:7-34`) **[H]** |
| **C3** | **Entrega por selección** | Pedido con `(definitionId, versión, digest esperado)`. Envelope firmado por Authority para `(org, instalación)`, como hoy. La restricción pasa a «oferta habilitada para la organización», en lugar de «`origin_org_id` = receptora» | Reutiliza envelope, recibo atómico e idempotencia (`envelope.go`, `store.go`). Hoy la restricción es `mandate-delivery.ts:16` **[H]**. Verificar antes de escribir: patrón `matchingTransport` (`mandate-v4-sign/main.go:42-80`) |
| **C4** | **Confianza en el publicador** | Clave del publicador distribuida por el trust manifest; Nucleus verifica la firma de C1 | `publisherKeyRef` sin resolver (Package Spec P-1) **[Doc]**. El trust manifest existe (`authority/trust_manifest.go`) **[H]** |
| **C5** | **Instancia local** | `mandate_state.json`: `installed` → `prepared` → (`approved` → `active`). Bloque `source{definitionId, version, digest, receiptRef}`. `mandate.json` = v4 firmado por la instalación. La procedencia de la definición debe quedar dentro del contrato firmado o sólo en el journal [D] | Exige cambiar las verificaciones que hoy suponen «`mandate.json` == bytes entregados»: `mandate_watcher.go:443-446`, `loadAdoptedV4Contract` (`mandate_authority_cmd.go:357-390`), `mandate_intent_activity.go:339-342`. Si la procedencia entra al contrato firmado, sube la versión de contrato |
| **C6** | **Operaciones de Nucleus** | Leer ofertas y estado local juntos; instalar para un proyecto (T1); preparar (T2); leer estado para reconciliar. Idempotencia por `(org, proyecto, definitionId, versión)` | Reutiliza `context-read`, `FreezeFiles`, `mandatecontract.Sign`, recepción. `mandate install --id` actual queda sustituido por T1 |
| **C7** | **Bridge Conductor/Core** | IPC de lectura, T1, T2 y reconciliación; sin escritura desde el renderer | Patrón `core/ipc/*-handlers.js` + `preload_core.js` |

---

## 5. Recuperación ante fallos parciales

Regla general: ningún resultado que no sea éxito confirmado se presenta sin reconciliar antes con Nucleus el estado durable.

| Transición | Punto de corte | Estado que queda | Reconciliación y reintento |
|---|---|---|---|
| T1 | Antes o durante la recepción | Nada, o recibo completo (rename atómico, `store.go:98-168`) | Reintentar: `replay` y continúa |
| T1 | Firma de publicador o digest inválidos | Ninguna escritura (verificar antes de `Accept`) | Rechazo cerrado |
| T1 | Durante la materialización de la definición | Con escritura temporal + rename: nada o completa | Reintentar completa |
| T1 | Recibo y definición ok, instancia sin abrir | Definición instalada, sin instancia para el proyecto | Core muestra «Definición instalada; falta abrir la instancia para ‹proyecto›». Reintentar abre la instancia **reutilizando** el `mandateId` reservado (clave de idempotencia de C6) |
| T2 | Binding revocado o vencido | Instancia `installed` | Bloqueo con motivo; no se congela nada |
| T2 | Durante la copia o el congelamiento | `docs/` o `inputs/` parciales; `FreezeFiles` es atómico por archivo | Reintentar: misma lista → completa. Lista distinta → error (inmutabilidad, `contract.go:274-284`) **[H]** |
| T2 | Insumos ok, sin firma | `inputs/` completo, sin `mandate.json` | Reintentar compone y firma |
| T2 | Firma escrita, journal sin actualizar | `mandate.json` firmado, journal `installed` | La reconciliación detecta un contrato válido sin `prepared` y completa el journal; nunca re-firma con otro contenido |
| T1/T2 | La UI no recibe respuesta | Cualquiera de los anteriores | Leer estado y mostrar lo observado |

Correcciones de la v0.1 que se conservan como requisito de C6:
- selección por `(versión, digest)`, no «el último recibo»;
- verificar antes de escribir;
- `mandate.json` y journal escritos con temporal + rename (hoy `install.go:121-139, 266` no lo hacen **[H]**);
- lock por `(org, proyecto)` durante T1 y T2.

---

## 6. Retiro de las dos automatizaciones (se conserva)

- **S1:** quitar la recepción y la materialización de `authority sync` (`authority_command.go:547-607`). Se conserva todo lo anterior a `cutoverComplete:` (l. 546): registro, snapshot, trust, tenant, cutover y **reclamación de proyectos** (l. 442-500). Cubre los tres disparadores: `onboarding:complete` (`onboarding-handlers.js:1063`), `onboarding:gemini-vault-sync` (l. 171) y `nucleus auth link` (`auth_link.go:170`).
- **P1:** quitar `runPendingGenesisLaunch` y su llamada (`genesisLaunch.ts:118-186`, `+layout.svelte:14, 81`); el pending (`onboarding-handlers.js:1102-1123`, 1154-1212; `preload_core.js:28-31`); y `genesis_launch_required` (`onboarding-handlers.js:816-865, 1393-1398`; `step-project.js:188-260`). Se conservan `readGenesisProjectStatus` y `recoverGenesis`. Con la decisión [J], el comentario de `step-project.js:250-251` («la futura rama "crear proyecto nuevo" deberá enviar true») queda sin objeto.
- **Juntas y en orden:** Nucleus primero o a la vez. El gate negativo registra el hash del binario de Nucleus.
- **Residuos:** no se borra nada. El pending se ignora. Un `mandate.json` sin journal, producto del auto-sync anterior, es un v4 entregado del modelo viejo: Wisdom no lo presenta como instancia del modelo nuevo [D].

---

## 7. Primer corte del recorrido real

**Alcance:** T0 + T1 + T2 sobre **una** definición de Genesis publicada por el publicador. Resultado: «Preparado · firmado · inactivo».

**Requiere:**
- C1 a C7;
- Dom-a y K2 decididos;
- S1 + P1;
- y, en Darwin, las rutas de Mandates del Control Plane, o que la vista no dependa de ellas.

**Criterios observables:**

| Gate | Criterio |
|---|---|
| **Negativo** | Onboarding, apertura, navegación, recarga y reinicio: 0 entregas, 0 recibos, `.mandates` sin cambios, 0 workflows, 0 ING |
| **Precondición** | Sin proyecto con binding, el gesto aparece deshabilitado y el motivo coincide con `context-read` |
| **T1** | El primer GET de bytes ocurre después del clic. `(id, versión, digest)` coinciden en ficha, Backend, recibo y definición materializada. Se crea exactamente una instancia `installed` para el proyecto elegido, sin `mandate.json`. Repetir el clic no crea otra |
| **T2** | `inputs/` contiene exactamente los documentos mostrados. `mandate.json` lo firma la instalación y contiene `projectId`, binding vigente y digests de política y registry iguales a los de la definición. Journal `prepared`. 0 recibos de actos, 0 workflows, 0 ING |
| **Rechazos** | Firma de publicador inválida, digest distinto, oferta no habilitada para la organización, binding ausente |
| **Fallos parciales** | Cada punto de §5; la UI muestra lo observado y reintentar completa sin duplicar |

**Gates siguientes:**

| Gate | Contenido |
|---|---|
| G2 | Segundo Mandate y colisiones |
| G3 | Recursos por Intent (AITAP) |
| G4 | Aprobar y activar desde Core |
| G5 | Publicación de definiciones por terceros |

---

## 8. A2 con fixture: gate técnico limitado (G-T)

**Qué verifica:**
- con un v4 firmado por la propia instalación y publicado por el fixture, el carril actual de entrega (recibo atómico, verificación del envelope, idempotencia) funciona sólo tras un gesto;
- el gate negativo se cumple después de S1 + P1.

**Qué no verifica:**
- la oferta distribuible;
- la precondición de proyecto;
- T2;
- la portabilidad;
- la firma de publicador.

El instalado de G-T no es ejecutable: sus insumos no viajan.

**Reglas:**
- el productor vive **sólo** en `synapse-runner`;
- ningún comando de producto publica desde fuera de `.mandates`;
- no se generaliza la rama por ID de `install.go:61`;
- cuando exista T1, G-T se retira o queda como prueba del canal de entrega, nunca como recorrido del Paladín.

---

## 9. Archivos por cambio (sin modificarlos)

| Cambio | Archivos |
|---|---|
| **C1/C4 — definición y confianza** | Nuevo paquete de definiciones en `installer/nucleus/internal/` (nombre a decidir); `internal/authority/trust_manifest.go`; `backend/src/authority/trust-route.ts`; política y registry hoy en `installer/aitap/policies/` y `registry/` |
| **C2/C3 — catálogo y entrega** | `backend/src/index.ts`, `backend/src/mandate-delivery.ts` (selección, restricción de origen), `backend/src/mandate-publish.ts` (publicador), migraciones de `mandates` / `mandate_versions` / asignaciones (`contracts/marketplace-schema.ts`); `installer/nucleus/internal/mandatedelivery/client.go`, `store.go` + tests |
| **C5 — instancia** | `internal/orchestration/mandatecontract/contract.go` (procedencia; versión si va firmada), `signature.go`; `internal/mandateinstall/install.go` (sustituir `AdoptJournal` por estados `installed` / `prepared`, escrituras atómicas, quitar la rama de l. 61); `watchers/mandate_watcher.go:355-357, 436-452`; `commands/mandate_authority_cmd.go:357-390`; `activities/mandate_intent_activity.go:339-342` |
| **C6 — operaciones** | `commands/mandate_install.go` (sustituido por T1), comando de preparación (T2) registrado en `commands/mandate.go`; reutiliza `governance/authority_command.go` (`context-read`) y `mandatecontract.FreezeFiles` / `Sign` |
| **C7 — bridge y UI** | `installer/conductor/workspace/core/preload_core.js`, handler nuevo en `core/ipc/` + `main_conductor.js:20-23`; `webview/app/src/routes/wisdom/+page.svelte`, store de presentación nuevo, `lib/stores/mandateStore.ts` (estados `installed` / `prepared`) |
| **S1** | `internal/governance/authority_command.go` (l. 547-607) + `authority_command_test.go` (l. 420-445); revisar `onboarding/verify-authority-sync-handoff.js` |
| **P1** | `webview/app/src/routes/+layout.svelte`, `lib/bootstrap/genesisLaunch.ts`, `preload_core.js`, `onboarding/ipc/onboarding-handlers.js`, `renderer/steps/step-project.js`, `step-mandate.js`, `renderer/core/navigation.js`, `preload_onboarding.js`, `onboarding.html`; `synapse-runner/src/runner-core/windows-functional-root.ts`, `windows-functional-preflight.ts`, E2E `core-genesis-functional.spec.ts`; docs Roadmap v3.3 (D-23) y Truth Matrix |
| **Precondición desde Core** | Verificar primero el handler de `POST /project/add` (Control Plane) y el disparo del sync que reclama el proyecto; archivos a determinar tras leerlos |
| **G-T** | Sólo `synapse-runner/src/runner-core/` (productor de fixture) y su E2E |

---

## 10. Decisiones mínimas que necesito antes de implementar

1. **Dominio del v4 (Dom-a / Dom-b).** Recomiendo Dom-a: dominio = proyecto, firma antes de cualquier inferencia.
2. **Partición del gesto (K2).** Clic = definición + instancia abierta; «Preparar» = insumos + firma.
3. **Forma de C1.** ¿Artefacto propio o Mandate Package del Spec? ¿Política y registry viajan como bytes dentro de la definición o como referencia a versiones que distribuye el instalador?
4. **Publicador y confianza (C4).** ¿Quién publica Genesis (¿Bloom?) y cómo se distribuye su clave? ¿Las organizaciones también pueden publicar definiciones, o eso queda para G5?
5. **Procedencia (C5).** ¿Dentro del contrato firmado (nueva versión de contrato) o sólo en el journal?
6. **Multiplicidad.** ¿Una instancia de Genesis por proyecto y versión, o varias?
7. **Selección de documentos en T2.** ¿Todos los del proyecto, los que elige el Paladín, o reglas declaradas en la definición?
8. **Proyecto agregado desde Core.** ¿Qué gesto o servicio corre el sync que lo reclama antes de que sea elegible?
9. **Residuos del modelo viejo.** ¿Se ignoran los `mandate.json` entregados sin journal o se presentan aparte?

---

## 11. Dictamen

**Recomiendo:**
- separar la **definición distribuible de Genesis** (C1), sin organización ni proyecto y firmada por el publicador, de la **instancia v4 local** (C5);
- el clic instala la definición y abre una instancia vinculada al proyecto;
- «Preparar» congela los documentos y firma el v4 con la identidad de la instalación, antes de cualquier inferencia (Dom-a, K2);
- AITAP, aprobación y activación vienen después;
- el retiro conjunto S1 + P1 se mantiene, preservando la reclamación de proyectos del sync, que ahora es precondición;
- A2 queda como gate técnico del canal de entrega, no como producto.

**Límites:**
- C1, C3 y C4 no existen y piden decidir el publicador y la forma del artefacto.
- Las verificaciones de adopción de Nucleus suponen «contrato = bytes entregados» y deben cambiar en tres sitios.
- El camino de proyectos agregados desde Core no está verificado.
