# Genesis en Wisdom — recepción, instalación y retiro de automatizaciones — diseño v0.1

**Fecha:** 2026-10-18 · **Modo:** sólo lectura y diseño. No se modificó código, estado ni Git; no se ejecutó RUNNER CORE ni ningún comando del producto.
**Parte de:** `ANALYSIS/WISDOM/Investigacion_Recorrido_Paladin_Wisdom_Instalacion_Genesis_v0_2.md` (recorrido, ficha, gates G2-G4).
**Base de código:** Mac, `HEAD` `7d6a628`. Para afirmar ausencias se recorrieron los **172 archivos Go no-test** del módulo `installer/nucleus` y el módulo `installer/impact`. Conductor, Core y `synapse-runner` se leyeron sólo en los archivos citados.
**Convención:** **[H]** código (ruta:línea) · **[Doc]** documento · **[I]** inferencia · **[P]** propuesta · **[D]** decisión de José.

---

## 0. Hallazgos nuevos que cambian el planteo

1. **El único productor de un contrato v4 es una herramienta de recuperación de un solo uso.** En código no-test, sólo `installer/nucleus/tools/mandate-v4-sign/main.go:305` construye un `Contract{ContractVersion: 4}` **[H]**. Tiene fijos el Mandate `4e028a82…`, la organización, el proyecto y rutas de Windows (`main.go:27-38`) **[H]**. El flujo local de `approve` construye contratos v2/v3, no v4 (`mandate_authority_cmd.go:150-170`, `buildConfirmedContract`) **[H]**.
2. **Un v4 es un plan de un proyecto en una instalación, no una plantilla.** Exige:
   - firma de la **instalación local** (`signature.go:196-249`);
   - revisión del binding canónico del proyecto (`main.go`, lectura de `project-bindings.json`);
   - al menos un insumo congelado `inputs/*` dentro del directorio del Mandate (`contract.go:191-199`), que la ejecución vuelve a leer y verificar (`mandate_intent_activity.go:344-355`);
   - `policyRef` y `registryRef` como **rutas absolutas** (`contract.go:146`);
   - un ING adoptado local (`mandate_intent_activity.go:120`, `findAdoptedING`).

   **[H]** La entrega sólo transporta `mandate.json` (`mandate-delivery.ts:31-33`). **[I]** Un v4 entregado a otro directorio o a otra instalación no es ejecutable.
3. **La ida y vuelta choca con el propio directorio de construcción.**
   - `mandate publish` lee `.mandates/<id>/mandate.json` (`mandate_publish.go:207, 225`).
   - `install` escribe en ese mismo directorio: `MaterializeFile` devuelve `alreadyInstalled` si los bytes coinciden (`install.go:248-269`).
   - `AdoptJournal` rechaza un journal local existente (`install.go:44`), salvo el ID literal `4e028a82…` (`install.go:61`).

   **[I]** Fuera de ese ID, la ida y vuelta tal como existe falla en la adopción.
4. **`install` no instala la versión ofrecida, sino la última recibida.** `LoadLatestReceipt` ordena por `AcceptedAt` (`install.go:183-224`) **[H]**.
5. **La durabilidad es desigual entre pasos.**
   - El recibo es atómico: temporal + `fsync` + rename + `fsync` de directorio (`store.go:98-168`, `store_unix.go`).
   - `mandate.json` se escribe con `os.WriteFile`, sin rename (`install.go:266`).
   - El journal usa `O_EXCL` + `fsync`, sin rename (`install.go:121-139`).
   - El contrato se verifica **después** de materializarlo (`mandate_install.go:155-163`).

   Todo esto es **[H]**.
6. **Hay un tercer disparador de la auto-entrega.** `nucleus auth link` ejecuta `Run("sync")` (`auth_link.go:170`). Se suma a `onboarding:complete` (`onboarding-handlers.js:1063`) y a `onboarding:gemini-vault-sync` (l. 171) **[H]**.
7. **Ya existe un patrón de «verificar antes de escribir».** `matchingTransport` (`mandate-v4-sign/main.go:42-80`) verifica la entrega y la compara con el digest y los bytes esperados **antes** de que `Store.Accept` escriba **[H]**.
8. **Los detectores de colisiones sí tienen callers, pero no en Wisdom.** La cadena es `internal/gravity` → `nucleus/gravity.AnalyzeJoint` (`gravity/portable.go:132-137`) → Impact `coexistence` y `preservation`. Ver la corrección en el informe v0.2.

---

## 1. Decisión 1 — cómo llega a esta instalación un Genesis firmado que Nucleus acepte

Condición actual de aceptación **[H]**:
- la entrega va firmada por Authority para `(org, instalación)` (`envelope.go:66-140`);
- la organización de origen es la receptora (`mandate-delivery.ts:16`);
- el contrato está firmado por **esta** instalación (`signature.go:220-249`);
- la organización del contrato es la activa (`mandate_install.go:164-166`).

### A — Ida y vuelta de la misma instalación

Esta instalación firma un v4 para su proyecto, lo publica para su organización y lo recibe por Wisdom. Es el único camino que el código acepta hoy.

| Variante | Mecánica | Lo que el gesto deja observable | Costo y límite |
|---|---|---|---|
| **A1 — Adoptar la construcción propia** | El Genesis ya se construyó y firmó en `.mandates/<id>/`. Se publica desde ahí. Instalar = recibir + verificar + **vincular el journal local existente** a la entrega (generalizar la rama de `install.go:61`) | Recibo nuevo y journal que pasa a `adopted`. `mandate.json` no cambia | Requiere un Genesis local completo (ING + Human Sync): justo el E2E bloqueado (Canonical §6.2) **[Doc]**. Convierte un journal de construcción en uno de adopción, lo que el código hoy prohíbe a propósito (`install.go:44`) |
| **A2 — Publicar desde fuera de `.mandates`** | Un productor firma el v4 con la identidad de la instalación en un área de publicación (no en `.mandates/<id>/`) y lo publica. Instalar = recepción dirigida + verificación + materialización + adopción en un directorio vacío | Recibo, `mandate.json` y journal, todos **creados después del clic** | El productor no existe en forma general. Los insumos congelados **no viajan**: el instalado queda inactivo y además **no ejecutable** hasta otro gate. Hay que decidir si el productor es sólo de fixture o comando de producto |

**Recorrido del Paladín (A):** igual al de S0-S5. La ficha dice «Publicado por esta instalación para ‹proyecto›». Si otra instalación ve la oferta: «No instalable aquí: firmado por otra instalación».

**Estados durables:** `recibo` → `mandate.json` → `journal adopted`. En A1, `mandate.json` y un journal de construcción existen desde antes.

**Recuperación:** ver §2.4.

### B — Proyección portable con rearraigo y firma local

**Respaldo:** Canonical §4 (proyección portable → adopción local con binding, rearraigo y autoridad propios) y Package Spec §9 (rebind por tokens) **[Doc]**. Nada de eso existe en código **[H]**.

**Mecánica [P]:**
1. El Backend distribuye un artefacto sin `projectId`, binding ni insumos, firmado por un publicador confiable vía el trust manifest.
2. La receptora lo verifica, lo vincula a su proyecto activo y produce un v4 propio firmado por la instalación, con la procedencia del digest de origen.

**Problema de fondo [I]:** los insumos de Genesis son los documentos del proyecto receptor. El v4 ejecutable no puede existir sin una construcción local. Por lo tanto, «instalar B» deja una plantilla, y pasar a v4 es otra operación cercana a la creación. Reabre M-1, `publisherKeyRef` (P-1) y la Fase 1.

**Recorrido:**
1. Instalar plantilla.
2. Preparar para este proyecto (nuevo gesto).
3. Activar.

**Estados:** `recibido` → `plantilla instalada` → `v4 local adoptado`.

### C — El Backend o Authority reemite para el destino

**Mecánica [P]:** Authority firma un v4 por `(org, proyecto, instalación)`.

**Problema [I]:**
- el Backend no conoce los insumos congelados (documentos locales) ni las rutas absolutas de la instalación;
- `LoadVerified` sólo acepta firma de la instalación (`signature.go:196-200`).

Habría que cambiar el modelo de firma y el de insumos. No resuelve Genesis tal como está definido.

### Recomendación para D1

**A2 para el primer corte, como vehículo de verificación**, con productor **sólo de fixture**. RUNNER prepara la oferta con la identidad de la instalación del run.

Por qué: es la única alternativa en la que el gesto produce efectos durables nuevos y observables sin generalizar la excepción por ID ni depender del E2E bloqueado.

**Límite que debe quedar escrito:** no es un Genesis distribuido por el Backend a instalaciones nuevas. Eso es **B**, gate de portabilidad G5, con decisiones de Fase 1.

---

## 2. Decisión 2 — qué operaciones durables comprende «Instalar»

### 2.1 Operaciones

| Op | Qué hace | Archivo durable | Hoy | Atómica | Idempotente |
|---|---|---|---|---|---|
| **R — Recepción** | Pide la entrega, verifica envelope y firma, guarda recibo | `AppDataDir/authority/mandate-delivery/receipts/…/receipt.json` | `Client.Receive` + `Store.Accept` | Sí | Sí (`replay`) |
| **V — Verificación del contrato** | `LoadVerified` + identidad org/Mandate | — | Después de M | — | — |
| **M — Materialización** | Escribe `mandate.json` | `.mandates/<id>/mandate.json` | `MaterializeFile` | **No** | Sí si los bytes coinciden; error duro si difieren |
| **Ad — Adopción** | Registra la decisión local ligada al recibo | `.mandates/<id>/mandate_state.json` `{status: adopted, adoption{…}}` | `AdoptJournal` | **Parcial** (`O_EXCL` + `fsync`, sin rename) | Sí, compara el journal existente |
| **Act — Activación** | Recibos `approve` + `activate` ante Authority | Recibos de actos | `mandate approve/activate`, interactivo | — | — |
| **E — Ejecución** | Despacho del workflow | Temporal | watcher, sólo con Act válidos (`mandate_watcher.go:431-458`) | — | — |

Escribir el journal dispara el watcher (fsnotify). El watcher sólo lee, registra un Warning por falta de recibos de actos y **no despacha** (`mandate_watcher.go:458`) **[H]**.

### 2.2 Alternativas

| Alt | El gesto «Instalar» incluye | A favor | En contra |
|---|---|---|---|
| **I1** | R → V → M → Ad | Un solo gesto deja un estado que `approve` acepta (`loadAdoptedV4Contract`, `mandate_authority_cmd.go:142, 180-183, 196-200`). Coincide con el `install` actual | Canonical §6.3 dice «instalación ≠ adopción»: hay que ratificar que el gesto explícito incluye la adopción |
| **I2** | R → V → M; «Adoptar» como gesto aparte | Literal con Canonical §6.3 | Crea el estado «materializado sin adopción», el mismo residuo R3. Dos gestos antes de poder aprobar |
| **I3** | R → V → M → Ad → Act | — | **Rechazada:** Act requiere consentimiento ante Authority y, después, elección de recursos (G3/G4). Contradice «instalar no activa» |

**Recorrido:**
- **I1:** un botón «Instalar» y resultado «Instalado · inactivo».
- **I2:** «Instalar» → «Descargado (no adoptado)» → «Adoptar» → «Adoptado · inactivo».

### 2.3 Orden propuesto para I1

R con identidad esperada `(mandateId, versión, digest)`, siguiendo el patrón de `matchingTransport`, **antes** de que `Store.Accept` escriba. Después:

1. V sobre los bytes del recibo, en memoria, **antes** de escribir en `.mandates`.
2. M con escritura atómica (temporal + rename).
3. Ad con escritura atómica que conserve la comparación con un journal existente.

Bloqueo por `(org, mandateId)` durante toda la operación.

La selección del recibo se hace por `(versión, digest)`, no «el más reciente».

**«Instalado»** = Ad presente y coherente con recibo y archivo.

### 2.4 Recuperación ante fallos parciales

Regla de UI (corrección del informe v0.2): ante cualquier resultado que no sea éxito confirmado, Core pide a Nucleus el estado durable y muestra lo observado.

| Punto de corte | Estado durable que queda | Lo que lee la reconciliación | Reintentar | Con el código actual |
|---|---|---|---|---|
| Antes o durante R | Nada, o recibo completo (rename atómico) | ¿Hay recibo para `(id, versión, digest)`? | R da `replay` y continúa | Igual |
| R ok, falla V (firma de otra instalación) | Recibo | Recibo sin `mandate.json` | Rechazo cerrado; no se escribe en `.mandates` | **Hoy queda `mandate.json` escrito sin journal**, porque V va después de M |
| Corte durante M | Con rename: nada o archivo completo | ¿Existe `mandate.json` y su digest coincide? | Completa | **Hoy puede quedar truncado → «contenido distinto» → bloqueo permanente** (`install.go:248-269`) |
| M ok, corte antes de Ad | Recibo + `mandate.json` | Sin journal | Ad | Igual (idempotente) |
| Corte durante Ad | Con rename: nada o journal completo | ¿Journal coherente? | Completa | **Hoy un journal parcial queda como «conflicto»** (`install.go:96-110`) |
| Ad ok, la UI no recibe respuesta | Instalado | Journal `adopted` | No hay nada que reintentar | Correcto si Core reconcilia |
| Doble clic o dos ventanas | — | — | Bloqueo + idempotencia | Hay lock en R; **no en M ni Ad** |

### Recomendación para D2

**I1.** Que José ratifique que el gesto explícito «Instalar» incluye la adopción local. Que fije la palabra de UI («Instalado»; la técnica sigue siendo `adopted`). Que acepte las cuatro correcciones de §2.3 como parte del corte.

---

## 3. Decisión 3 — retirar a la vez la recepción de `authority sync` y el POST al abrir Core

### 3.1 Qué debe preservar `authority sync`

Todo lo previo a `cutoverComplete:` (`authority_command.go:546`): registro de la instalación, snapshot, trust, tenant, cutover y reconciliación de ownership/bindings **[H]**.

`onboarding:complete` sólo depende de que el sync deje `organization_id` y `tenant_id` válidos (`onboarding-handlers.js:1063-1076`) **[H]**. La entrega ya es no bloqueante para `report.OK` (`authority_command.go:549-552`) **[H]**.

En el código leído, el único consumidor de la evidencia `mandate_delivery*` es `authority_command_test.go:420-445` **[H]**. `verify-authority-sync-handoff.js` y los fixtures de RUNNER **no se releyeron**.

### 3.2 Recepción en el sync

| Alt | Qué hace | Veredicto |
|---|---|---|
| **S1** | Quitar `authority_command.go:547-607`. La recepción vive sólo dentro de la instalación dirigida (§2.3) | **Recomendada** |
| S2 | Mantenerla detrás de un flag apagado por defecto | Deja una segunda vía al mismo efecto; contradice la regla de retiro (lo descartado no queda como conocimiento activo) |
| S3 | Recibir sin materializar | Sigue descargando sin gesto: falla el gate negativo (0 GET de bytes) |

S1 cubre los tres disparadores de una vez: onboarding, Gemini Vault y `auth link`.

### 3.3 POST al abrir Core

| Alt | Qué hace | Veredicto |
|---|---|---|
| **P1** | Quitar:<ul><li>`runPendingGenesisLaunch` (`genesisLaunch.ts:118-186`) y su llamada (`+layout.svelte:14, 81`);</li><li>la escritura del pending (`onboarding-handlers.js:1102-1123`);</li><li>los handlers read/ack (l. 1154-1212);</li><li>los bridges (`preload_core.js:28-31`).</li></ul>Conservar `readGenesisProjectStatus` y `recoverGenesis`. Retirar `genesis_launch_required` de `select-project` (l. 816-865), resume (l. 1393-1398) y `step-project.js` (l. 188, 195, 211, 219, 252, 260) | **Recomendada** |
| P2 | Dejar el hook como no-op y el flag inerte | Contradice la regla de retiro |

### 3.4 Por qué deben ir juntas

- Quitar sólo el POST deja la auto-instalación por sync.
- Quitar sólo la entrega deja latente el POST.
- El gate negativo cuenta ambos (dossier Darwin §6) **[Doc]**.

Nucleus, Conductor y Core se despliegan por separado con Metamorph **[Doc: RUNNER Darwin §2.2]**. Una ventana con Core nuevo y Nucleus viejo sigue descargando. **[P]** Desplegar Nucleus primero o a la vez; el gate negativo registra el hash del binario de Nucleus y falla si no corresponde.

**Recorrido visible:** el onboarding cierra igual que hoy. No aparece ningún «Preparing Genesis» (copy de `step-mandate.js:76-86`). Core abre sin crear ni descargar. Wisdom muestra la oferta.

**Residuos [D]:**
- La Mac se reinició sin estado previo (contexto de José; no inspeccioné `~/Library`).
- En Windows puede haber `mandate.json` sin journal (auto-sync) y `pending_genesis_launch` escritos.
- **[P]**
  - No borrar nada.
  - Wisdom muestra el `mandate.json` sin journal como «Recibido, sin instalar» si coincide con un recibo, y el gesto Instalar completa Ad.
  - El pending se ignora al leer y se limpia en la próxima escritura de `nucleus.json`.

---

## 4. Primer corte verificable (A2 + I1 + S1 + P1)

### 4.1 Recorrido

| Paso | Quién | Efecto durable |
|---|---|---|
| Preparación | Fixture de RUNNER | Firma un v4 con la identidad de la instalación del run, fuera de `.mandates`, y lo publica asignado a la organización del run |
| Onboarding | Paladín | Sync sin entrega |
| Abrir Core y entrar a Wisdom | Paladín | Ninguno |
| Ver ficha | Paladín | Ninguno |
| Instalar | Paladín | Nucleus ejecuta R → V → M → Ad para la identidad ofrecida |
| Resultado | Core | Reconcilia y muestra «Instalado · inactivo». Texto fijo: para ejecutar faltan insumos, recursos, aprobar y activar (gates siguientes) |

### 4.2 Criterios observables

**Negativo** (onboarding, apertura, navegación, recarga y reinicio, sin gesto):
- 0 `POST /api/v1/mandates`;
- 0 `GET /v1/mandate/bootstrap` y 0 recibos;
- `.mandates` sin cambios;
- 0 workflows.

**Positivo:**
- el primer GET de bytes ocurre después del clic registrado;
- `(id, versión, digest)` coinciden en ficha, Backend, recibo, `mandate.json` y journal;
- un recibo, un `mandate.json` y un journal `adopted`;
- 0 recibos `approve`/`activate`; 0 workflows;
- doble clic y recarga sin cambio.

**Rechazos:**
- digest distinto del ofrecido → 0 escrituras;
- contrato de otra instalación → recibo sí, `.mandates` no;
- otra organización → 0 escrituras.

**Fallos parciales:** interrumpir en cada punto de §2.4. La UI muestra el estado observado y Reintentar completa sin duplicar.

### 4.3 Gates siguientes

Ninguno forma parte de este corte:

| Gate | Contenido |
|---|---|
| G2 | Segundo Mandate y colisiones |
| G3 | Recursos por Intent en AITAP |
| G4 | Aprobar y activar desde Core |
| G5 | Portabilidad real (alternativa B): Genesis del Backend para instalaciones nuevas e insumos locales |

---

## 5. Archivos que cambiaría cada alternativa (sin modificarlos)

| Alternativa | Archivos |
|---|---|
| **A1** | `installer/nucleus/internal/mandateinstall/install.go` (generalizar la rama de l. 61 y quitar el ID literal) + `install_test.go`; productor v4 de producto (generalizar `tools/mandate-v4-sign/main.go`, registrar en `commands/mandate.go`) |
| **A2** | Productor de fixture en `synapse-runner/src/runner-core/` (archivo nuevo junto a `genesis-backend-api.ts`); publicar desde el fixture contra `POST /v1/mandate/publish`, o bien `commands/mandate_publish.go` (origen fuera de `.mandates`, l. 207/225/261) + test |
| **B** | `mandatecontract/contract.go` (nuevo tipo de artefacto), `signature.go`, `mandateinstall/install.go`, `internal/authority/trust_manifest.go` + `backend/src/authority/trust-route.ts` (claves de publicador), `backend/src/mandate-publish.ts`, `backend/src/mandate-delivery.ts` (restricción `origin_org_id`), docs Package Spec y Canonical Source |
| **C** | `backend/src/mandate-delivery.ts`, `mandate-publish.ts` (firma por destino), `mandatecontract/signature.go` (aceptar firma de Authority); el modelo de insumos sigue sin resolver |
| **I1** | `commands/mandate_install.go` (recepción dirigida, orden V→M→Ad, texto «corré authority sync primero» l. 44-57); `mandateinstall/install.go` (selección por versión/digest, escrituras atómicas, lock); `mandatedelivery/client.go` (identidad esperada antes de `Accept`) + tests; Backend: metadatos sin bytes (`backend/src/index.ts`, `mandate-delivery.ts`) |
| **I2** | Lo de I1 + un comando y gesto de adopción separados (`commands/mandate.go`) + estado intermedio en Core |
| **S1** | `internal/governance/authority_command.go` (quitar l. 547-607) + `authority_command_test.go` (l. 420-445); revisar `onboarding/verify-authority-sync-handoff.js` |
| **P1** | `webview/app/src/routes/+layout.svelte`, `webview/app/src/lib/bootstrap/genesisLaunch.ts`, `installer/conductor/workspace/core/preload_core.js`, `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js`, `renderer/steps/step-project.js`, `renderer/steps/step-mandate.js`, `renderer/core/navigation.js`, `preload_onboarding.js`, `onboarding.html`; fixtures `synapse-runner/src/runner-core/windows-functional-root.ts` y `windows-functional-preflight.ts` y el E2E `core-genesis-functional.spec.ts`; docs Roadmap v3.3 (D-23) y Truth Matrix |
| **Wisdom (común)** | `webview/app/src/routes/wisdom/+page.svelte`, store de presentación nuevo, `lib/stores/mandateStore.ts` (estado instalado), handler `core/ipc/` nuevo + `main_conductor.js:20-23` |

`navigation.js`, `preload_onboarding.js` y `onboarding.html` se citan del informe del 16/10; existen en la Mac, pero no se releyeron.

---

## 6. Decisiones que José debe tomar antes de implementar

1. **D1 — Origen del Genesis del primer corte.**
   - **A2 con productor sólo de fixture** (recomendado);
   - A1 (requiere E2E local y generalizar la adopción de la construcción propia);
   - esperar a B.
2. **D1-bis — ¿Se acepta un «instalado» no ejecutable?** En A2 los insumos congelados no viajan con la entrega.
3. **D2 — I1:** el gesto incluye la adopción local, con estas correcciones obligatorias:
   - recepción dirigida por `(id, versión, digest)`;
   - verificar antes de escribir;
   - escrituras atómicas;
   - lock.
   - Palabra de UI: «Instalado».
4. **D5 — S1 + P1 en un mismo cambio,** con orden de despliegue (Nucleus primero o a la vez). Destino de los residuos: no borrar; ofrecer completar la instalación; ignorar el pending.
5. **D-B — Abrir la Fase 1 de portabilidad (G5)** como camino de producto para que Genesis llegue a instalaciones nuevas.

---

## 7. Dictamen

**Recomiendo A2 + I1 + S1 + P1.**

Con ese conjunto, el primer corte demuestra lo que hoy no se puede demostrar:
- sin gesto no hay efectos;
- con gesto, Nucleus recibe, verifica, materializa y adopta exactamente la versión ofrecida;
- queda inactivo;
- reintentos e interrupciones se reconcilian sin duplicar ni mentir.

**Límites:**
- Sólo vale para la misma instalación y proyecto.
- El Genesis lo prepara el fixture, no el Backend para cualquier instalación.
- El resultado no es ejecutable sin insumos locales.
- La portabilidad real (B) exige nuevas decisiones de contrato.
- Colisiones (G2), AITAP (G3) y activación (G4) quedan fuera del corte.
