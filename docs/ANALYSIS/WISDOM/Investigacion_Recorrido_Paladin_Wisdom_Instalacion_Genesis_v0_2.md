# Wisdom desde el recorrido del Paladín — instalación explícita de Genesis y colisión del segundo Mandate — investigación y diseño v0.2

**Cambios respecto de v0.1 (2026-10-18):**
1. Ningún mensaje de error afirma «no se instaló nada» sin reconciliar antes el estado durable (§4 S1 y S4).
2. La integración de los detectores de colisiones pasa a **no verificada para Wisdom**. Sí tienen callers: `nucleus/gravity.AnalyzeJoint` y, a través de ella, los evaluadores `coexistence` y `preservation` de Impact. Correcciones en §2.4, §2.5 y §6.
3. El segundo Mandate con sus colisiones y la elección de proveedor en AITAP quedan como **gates siguientes** (§8.2), no como capacidades del primer corte.
4. Las decisiones D1, D2 y D5 se desarrollan en `ANALYSIS/WISDOM/Diseno_Recepcion_Instalacion_y_Retiro_Automatizaciones_Genesis_v0_1.md`.

**Fecha:** 2026-10-18 · **Modo:** sólo lectura. No se editó código, configuración, estado ni Git; no se ejecutaron gates, tests ni comandos del producto; no se avanzó a AITAP.
**Continúa:** `MANDATE/GENESIS/Investigacion_Oferta_Wisdom_Mandate_Inicial_Corte_Minimo_v0_1.md` (16/10) e `Investigacion_Oferta_Adopcion_y_Eleccion_Recursos_Mandate_Recibido_v0_1.md` (15/10). Este informe no repite su inventario: lo verifica contra el checkout actual y lo convierte en recorrido de pantallas, estados, ficha y colisión.
**Convención:** **[H]** hecho comprobado en código (ruta:línea). **[Doc]** afirmado por un documento. **[I]** inferencia mía. **[P]** propuesta. **[D]** decisión que corresponde a José. «Genesis» se usa sólo como label del Mandate publicado.

---

## 0. Evidencia usada

- Checkout de la Mac `/Users/josevigil/repos/bloom-development-extension`: `HEAD` = `refs/heads/main` = `7d6a628`, igual a `refs/remotes/origin/main` local. `FETCH_HEAD` apunta a `b987d6c`, sin integrar. **[H]**
- Las líneas citadas en el informe del 16/10 (`onboarding-handlers.js:816/1063/1102/1154/1169`, `+layout.svelte:81`, `genesisLaunch.ts:126`, `authority_command.go:547-607`) **coinciden** con este checkout. La divergencia Mac↔origin que señalaba ese informe ya no existe: Core lee el pending sin borrarlo y confirma con `ack`. **[H]**
- Sin shell en la Mac: los archivos se copiaron y leyeron uno por uno. Las búsquedas de llamadores (p. ej. de los detectores) **no barrieron todo el repo**; se apoyan en los comentarios de cabecera del propio código y en los archivos vecinos leídos. Se indica en cada caso.

---

## 1. Vocabulario: qué no se debe equiparar

| Término | Qué es, con respaldo | Qué no es |
|---|---|---|
| **Mandate** | «Contrato gobernado, versionado y verificable» (`docs/MANDATE/MANDATE_PROGRAM_CANONICAL_SOURCE_v0_1.md` §2) **[Doc]**. En código, un envelope v4 firmado `{contract, contractDigest, signature, signatureKeyId}` en `.mandates/<id>/mandate.json` (`mandatecontract/contract.go:19-33`, `signature.go:181-194`) **[H]** | Su estado de ejecución (`mandate_state.json`) |
| **Lo que entrega hoy el Backend** | Una **entrega firmada de ese contrato v4**: envelope `BLOOM-MANDATE-DELIVERY-v1` (mandate_id, organization_id, installation_id, version, digest, issued_at, firma de Authority) + los bytes del `mandate.json` (`backend/src/mandate-delivery.ts:23-33`) **[H]** | Un Mandate Package |
| **Mandate Package** | Proyección portable sanitizada: `manifest.json`, `integrity/`, linter, rebind por tokens (`docs/WISDOM/BLOOM_Mandate_Package_Spec_v1_0_0.md` §1-§9) **[Doc]** | No existe en código: `mandate publish` sube el `mandate.json` firmado tal cual (`mandate_publish.go:119-125`) **[H]**. No hay manifest, `publisherKeyRef`, `requiredIntentTypes` ni rebind |
| **Wisdom (concepto)** | Conocimiento promovido desde evidencia y Gravity reutilizable; sin schema propio (`docs/ANALYSIS/WISDOM/WISDOM_DEVELOPMENT_SCOPE_v0_1.md`, «Decisiones ya tomadas») **[Doc]** | Ni un Mandate, ni un Mandate Package, ni una entrega |
| **Wisdom (sección de Core)** | Nav-item `/wisdom` (`Sidebar.svelte:57`), descrito como «directorio/explorador de mandates» (`Bloom_Conductor_Core_UI_Contexto_para_Codex.md:17`) **[Doc/H]** | La prueba de que lo listado sea «Wisdom» |
| **Instalar** | Canonical Source §6.3: «la instalación de un artefacto recibido no equivale todavía a adopción, rearraigo, firma local ni activación» **[Doc]** | En código, `nucleus mandate install` **materializa y además adopta**: escribe `mandate_state.json` con `status: "adopted"` (`mandate_install.go:155-171`, `mandateinstall/install.go:110-114`) **[H]**. **Divergencia doc↔código** |

**[P] Regla de lenguaje para la UI:** la sección se llama Wisdom, pero lo que lista son **Mandates ofrecidos** y **Mandates instalados**. Ningún objeto de la UI se llama «Wisdom», «paquete» ni «Genesis Mandate» como tipo; «Genesis» aparece sólo como nombre visible que viene del Backend. (Ver D3.)

---

## 2. Mapa de capacidades

Estados: **Existe** · **Parcial** · **Falta** · **Contradice** (existe, pero va contra el recorrido).

### 2.1 Core (webview)

| Capacidad | Estado | Evidencia | Observación |
|---|---|---|---|
| Ruta Wisdom | Falta (stub) | `webview/app/src/routes/wisdom/+page.svelte` completo: «Wisdom / Próximamente» **[H]** | El nav-item existe (`Sidebar.svelte:57, 141`) |
| Listar Mandates locales | Parcial | `listMandates()` → `GET /api/v1/mandates` (`lib/api.ts:495-498`); catch-up desde `+layout.svelte:56-94` **[H]** | En Darwin esas rutas **no se registran** (`RUNNER_CORE_Darwin_Estado_Arranque_Core_v1.md` §3.3) **[Doc]** |
| Representar «instalado» | Contradice | `MandateStatus` no incluye `adopted` (`mandateStore.ts:35`); un estado desconocido cae a `'building'` (`mandateStore.ts:167`) **[H]** | Un Mandate instalado se mostraría como «en construcción» **[I]** |
| POST automático al montar | Contradice | `+layout.svelte:14, 81` → `runPendingGenesisLaunch()` (`lib/bootstrap/genesisLaunch.ts:126-185`) → `POST /api/v1/mandates` **[H]** | Automatización A2 (§7) |
| «Nuevo Mandate» | Contradice | `+layout.svelte:111-121` crea un placeholder local `mandateType: 'genesis'`, `status: building`, tab no cerrable **[H]** | No hace POST, pero muestra un «Genesis en construcción» que no existe. No es una de las dos automatizaciones; conviene retirarlo junto con ellas |
| Recuperación explícita de Genesis | Existe (otro recorrido) | `MandateTab.svelte:29-83` → `recoverGenesis()` (`genesisLaunch.ts:76-116`) **[H]** | Creación local, por gesto. No es instalación de un Mandate ofrecido; no debe aparecer en Wisdom |

### 2.2 Conductor (Electron)

| Capacidad | Estado | Evidencia | Observación |
|---|---|---|---|
| Bridge Core→Nucleus para ofertas e instalación | Falta | `preload_core.js` expone `onboarding` (incluye `readPendingGenesisLaunch`/`ackPendingGenesisLaunch`, l. 30-31), `nucleus` (salud/perfiles), `intelligenceSupply.read`, `confirmedContext.read` **[H]** | Patrón reutilizable: `core/ipc/*-handlers.js` registrados en `main_conductor.js:20-23` **[H]** |
| Cierre de onboarding con sync | Contradice | `onboarding:complete` corre `nucleus --json authority sync` (`onboarding-handlers.js:1063`); también `onboarding:gemini-vault-sync` (l. 171) **[H]** | Ese sync descarga y materializa (A1) |
| Pending de lanzamiento | Contradice (latente) | Se escribe sólo si `genesis_launch_required === true` (`onboarding-handlers.js:1102-1117`); las tres ramas de `step-project.js` envían `false` (l. 188, 211, 252) **[H]** | Por la UI real no se dispara; el código y el fixture de RUNNER siguen vivos |
| Copy de onboarding | Contradice | `step-mandate.js:76-86` («Meet your Genesis Mandate», «Preparing Genesis Mandate») **[H]** | Promete algo que ya no ocurrirá al entrar a Core |

### 2.3 Backend

| Capacidad | Estado | Evidencia | Observación |
|---|---|---|---|
| Publicar | Existe | `POST /v1/mandate/publish` (`index.ts:170`) → `publishMandate` (`mandate-publish.ts:89-158`) **[H]** | Valida v4: `organizationId` y seis Actions `ing,dis,doc,exp,dev,exp` (l. 42-57) |
| Asignación inicial | Existe, **una por organización** | `organization_bootstrap_mandates` con PK `organization_id`; republicar con `--bootstrap` **reemplaza** la asignación (`mandate-publish.ts:143-153`) **[H]** | Hoy no puede haber un segundo Mandate ofrecido |
| Entrega | Existe, **sin selección** | `GET /v1/mandate/bootstrap` (`index.ts:154-168`) devuelve envelope **y bytes** en la misma respuesta (`mandate-delivery.ts:7-34`) **[H]** | No recibe `mandate_id`, versión ni digest elegidos |
| Consulta de metadatos sin bytes | Falta | No hay ruta de catálogo ni de detalle **[H]** (recorrido de `index.ts:36-267`) | Requisito del gate negativo (dossier Darwin §5, Fase D) **[Doc]** |
| Procedencia de la oferta | Restringida | La entrega exige `mandates.origin_org_id === organización receptora` (`mandate-delivery.ts:14-17`) **[H]** | Sólo se entregan Mandates que la propia organización publicó |
| Metadatos almacenados | Parcial | `mandates(slug, description, visibility, latest_version, pillar, origin_type, created_at)` y `mandate_versions(version, r2_key, sha256, published_at)` (`contracts/marketplace-schema.ts`) **[H]** | `description` llega `''` por defecto; `pillar` y `origin_type` siempre `NULL` (`mandate-publish.ts:116-118`) **[H]** |
| Registro de adopción | Falta escritor | La tabla `mandate_adoptions` existe (`marketplace-schema.ts`), pero nada escribe en ella **[H]** | — |
| Pillars | No disponible | La columna existe; nunca se escribe; no viaja en la entrega ni en el contrato v4 **[H]** | No puede clasificarse por Pillar sin mentir **[I]** |

### 2.4 Nucleus

| Capacidad | Estado | Evidencia | Observación |
|---|---|---|---|
| Recepción verificada | Existe | `mandatedelivery.Client.Receive` (`client.go:34-101`); `Verify` comprueba binding org/instalación, `issued_at`, digest, clave en el trust bundle y firma (`envelope.go:66-140`) **[H]** | No admite pedir una versión concreta |
| Inmutabilidad de versión | Existe | Mismo `(mandate_id, version)` con digest distinto → `conflicting mandate digest` (`store.go:84-88`) **[H]** | Base para «identidad/versionado coincidentes» |
| Auto-entrega en `authority sync` | Contradice | `authority_command.go:547-548` llama `Receive` incondicionalmente; en `accepted\|replay` hace `MaterializeFile` (l. 565-607), **sin** `AdoptJournal` **[H]** | Automatización A1 (§7). Deja `mandate.json` sin journal (R3) |
| `mandate install` | Existe, incompleto para el recorrido | `mandate_install.go:107-184`: exige Master (l. 71), **recibo previo** (no hace red, l. 139), coteja identidad con la instalación activa (l. 150-153), materializa, `LoadVerified` y, en v4, `AdoptJournal` **[H]** | Idempotente: `AdoptJournal` compara el journal existente y usa `O_EXCL` (`install.go:96-133`) **[H]** |
| Rama por ID literal en la adopción | Contradice | `install.go:61` trata en especial el Mandate `4e028a82-3f94-48ab-957d-116340dbcc7f` **[H]** | Deuda local que la UI no debe heredar como regla |
| Firma del contrato | Restringida | `LoadVerified` exige que `signatureKeyId` sea la **instalación local** (`signature.go:196-249`) **[H]** | Sólo instala la misma instalación que publicó (R4) |
| Instalar no ejecuta | Existe | El watcher sólo despacha un Mandate adoptado con recibos `approve` y `activate` válidos (`mandate_watcher.go:431-458, 522-535`) **[H]** | Garantía de «instalado, aún sin ejecutar» |
| Detección de colisiones | Parcial; integración con Wisdom **no verificada** | `DetectPriorityCycles` (`internal/gravity/priority_cycle_detector.go:84`) y `DetectThresholdUnsatisfiable` (`threshold_unsatisfiable_detector.go:139`), funciones puras sobre `[]ResolvedPosture`. Las invoca `nucleus/gravity.AnalyzeJoint` (`installer/nucleus/gravity/portable.go:76-138`), y a esa función la consumen los evaluadores `coexistence` y `preservation` de Impact (`installer/impact/internal/evaluation/coexistence.go:24`, `preservation.go:43, 87`; `installer/impact/go.mod`: `replace nucleus => ../nucleus`) **[H]** | En los 172 archivos Go no-test del módulo Nucleus no aparece ningún llamador de `nucleus/gravity` ni de Impact **[H]**. **No se verificó** quién invoca el binario o el handler de Impact fuera de ese módulo (Conductor, Core, Brain, AITAP, RUNNER). El comentario `priority_cycle_logging.go:13` («nada lo invoca») está desactualizado respecto de `portable.go`. No hay detector territorial, jerárquico ni cualitativo |
| Datos para comparar Mandates | Faltan | El contrato v4 trae `domain`, `inputs`, seis `actions` y sólo **referencias** de Gravity `{nodeId, revision, sha256}` (`contract.go:19-85`) **[H]** | Ni `scope_paths` ni el contenido de las posturas viajan con la entrega **[I]** |

### 2.5 Divergencias documento ↔ código que afectan el diseño

1. Canonical §6.3 separa instalar de adoptar; `mandate install` hace ambas cosas (§1).
2. Package Spec describe un paquete con manifest y rebind; lo que circula es el contrato v4 firmado (§1).
3. La spec de colisiones (§8, matriz) dice «no existe detector». Hoy existen dos subtipos estrechos, expuestos por `nucleus/gravity.AnalyzeJoint` y consumidos por Impact `coexistence/1`, que sólo concluye `JOINTLY_SATISFIABLE` con cobertura completa (`coexistence.go:35-37`). Su uso desde Wisdom o desde la instalación no existe; su uso productivo fuera del módulo Nucleus no se verificó. La misma spec excluye expresamente la «compatibilidad de instalación de Mandates» (§9.3): aplicarla a Wisdom es una decisión nueva (D7).
4. El Universal Schema v1.2.0 es un addendum de herencia de Gravity y **no define campos de identidad para una ficha**. La ficha sale del contrato v4 y de las tablas del Backend.

---

## 3. Modelo de estados

Clave del estado local: **(organización activa, instalación, mandateId, versión)**. El estado local no viaja entre máquinas: lo instalado en Windows no está en la Mac.

### 3.1 Hechos del Backend (de la oferta)

| Estado | Fuente |
|---|---|
| `ofrecido` | Existe asignación para la organización y la versión tiene artefacto íntegro |
| `sin oferta` | `404 mandate_pending` |
| `oferta inconsistente` | `409 contradictory_metadata` o `artifact_digest_mismatch` |
| `artefacto pendiente` | `404 version_pending` o `artifact_pending` |

«Retirado» o «revocado» no existen en código.

### 3.2 Estado local (Nucleus es el dueño)

| Estado | Condición observable |
|---|---|
| `no recibido` | Sin recibo para esa versión |
| `recibido, sin instalar` | Recibo verificado sin `mandate.json`. Sólo existe si se separa la descarga de la instalación |
| `materializado sin adopción` | `mandate.json` sin `mandate_state.json`: residuo del auto-sync (R3) |
| `instalado (inactivo)` | `mandate.json` + journal `status: adopted` cuya adopción coincide con el recibo |
| `conflicto local` | El journal o el digest no coinciden. Error cerrado |

### 3.3 Estados de presentación (Core es el dueño; nunca durables)

`consultando` · `error de consulta` · `no autorizado` · `Nucleus no disponible` · `instalando (en curso)` · `resultado`.

### 3.4 Transiciones

| Gesto o evento | Quién lo origina | Quién lo ejecuta | Efecto durable |
|---|---|---|---|
| Abrir Core / entrar a Wisdom / recargar | Paladín | Core lee vía Nucleus | **Ninguno** |
| Ver catálogo | Paladín | Nucleus consulta metadatos al Backend y su estado local | Ninguno |
| Seleccionar (abrir ficha) | Paladín | Core | Ninguno; registrarlo es opcional (D6) |
| Confirmar **Instalar** | Paladín | Core → Nucleus con `(mandateId, versión, digest ofrecido)` | — |
| Descargar y verificar | Nucleus | Backend entrega; Nucleus exige digest recibido == digest ofrecido | Recibo |
| Materializar (+ adoptar, según D2) | Nucleus | Nucleus | `mandate.json` (+ journal) |
| Elegir recursos por Intent | Paladín | AITAP/Nucleus — **fuera de este corte** | — |
| Aprobar / Activar | Paladín + Authority | Nucleus — fuera de este corte | Recibos de actos |
| Ejecutar | watcher | Nucleus/Temporal — fuera de este corte | Workflow |

**[P] Regla de propiedad:** Core no habla con el Backend ni escribe estado de Mandates; sólo presenta lo que Nucleus responde. La consulta al Backend requiere la autenticación de instalación (`verifyInstallationAuth`, `index.ts:154`), que hoy sólo tiene Nucleus.

---

## 4. Recorrido de pantallas

### 4.1 Verbos que la UI distingue

| Verbo | Qué hace | Efecto |
|---|---|---|
| **Ver** | Listar ofertas e instalados | Ninguno |
| **Seleccionar** | Abrir la ficha de una versión | Ninguno |
| **Instalar** | Descargar, verificar y dejar el Mandate en esta instalación, inactivo | Archivos locales |
| **Activar** | Aprobar y activar ante Authority | Recibos firmados — posterior |
| **Ejecutar** | Despachar Intents | Inferencia y efectos — posterior, tras elegir recursos |

### S0 · Primera visita

Core abre en Home. El Paladín entra a Wisdom: «Consultando Mandates disponibles para **‹organización›**…». Nada se escribe. Si Nucleus no responde, se dice así; el catálogo no se inventa.

### S1 · Catálogo

Dos bloques, siempre separados:

- **Disponibles para ‹organización›** — origen: Backend.
- **Instalados en esta instalación** — origen: Nucleus local. Se muestra aunque el Backend no responda.

Tarjeta de oferta: nombre visible (`Genesis`), versión, «publicado por ‹organización›», fecha y un chip de estado local: `Disponible` · `Instalado v‹x›` · `Descargado sin instalar` (residuo) · `No instalable aquí` + motivo.

Estados del bloque Disponibles:

| Situación | Texto |
|---|---|
| Carga | «Consultando…» |
| Vacío | «El Backend no ofrece Mandates a esta organización» |
| Error | «No se pudo consultar el Backend.» + Reintentar. La consulta no tiene efectos; el bloque Instalados muestra igual el estado local leído de Nucleus |
| No autorizado | «Esta instalación no está registrada para ‹organización›» |
| Inconsistente | «La oferta del Backend es inconsistente (‹código›). No se puede instalar» |

### S2 · Ficha de oferta

Secciones en este orden (contenido en §5):

1. Identidad y versión.
2. Procedencia.
3. Destino.
4. Propósito.
5. Requisitos.
6. Qué se descargará.
7. Efectos de instalar.
8. Qué no ocurrirá.
9. Compatibilidad con lo instalado.
10. Estado para la organización activa.

CTA: **«Instalar en esta instalación…»**. Si no es instalable, la ficha se muestra igual, con el botón deshabilitado y el motivo concreto (por ejemplo, «requiere rol Master» o «firmado por otra instalación»).

### S3 · Confirmación

Diálogo que nombra el gesto completo:

> Vas a instalar **Genesis v‹x›** (digest `‹8›…‹4›`), publicado por **‹org›**, para la organización **‹org›** y el proyecto **‹p›**. Nucleus descargará el contrato, verificará la firma de Authority y la del contrato, y escribirá `mandate.json` y su registro de instalación en esta máquina.
> **No** se ejecutará ningún Intent, **no** se elegirá proveedor ni modelo y **no** se consumirán tokens. Para ejecutar faltarán: elegir recursos por Intent, aprobar y activar.

Botones: **Instalar** / Cancelar. El primer clic deshabilita el botón.

### S4 · Progreso y resultado

Hoy `install` es una sola invocación con resultado JSON: los pasos intermedios no son observables. La UI muestra «Instalando…» indeterminado y, al terminar, lista los pasos verificados a partir de la evidencia devuelta: descarga → firma de entrega → digest coincidente → contrato verificado → instalado. No hay barra de progreso inventada.

| Resultado | Presentación |
|---|---|
| Éxito | Pasa a S5 |
| Ya estaba instalado | Pasa a S5, con «ya estaba instalado; no se modificó nada» |
| Error recuperable (red, `artifact_pending`) | Core pide a Nucleus el estado durable de `(mandateId, versión, digest)` y muestra lo observado: «No se recibió la entrega», «Recibido, sin instalar» o «Instalado». Reintentar sólo si no está instalado |
| Rechazo cerrado (digest distinto del ofrecido, firma inválida, org/instalación distintas, journal en conflicto) | «Rechazado por verificación: ‹motivo›», seguido del estado durable reconciliado. Si quedaron recibo o `mandate.json`, se dice cuáles; nunca se afirma ausencia sin leerla |
| Sin respuesta (timeout, cierre del proceso) | Igual que arriba: reconciliar y mostrar el estado observado. La ausencia de respuesta no significa que no haya pasado nada |

**Regla:** todo resultado que no sea éxito confirmado se presenta **después** de reconciliar con Nucleus el estado durable (recibo, `mandate.json`, journal). El texto describe lo observado, no lo que se supone.

**Recarga o doble clic.** Al volver, Core consulta a Nucleus el estado local y lo muestra; nunca relanza la instalación. La idempotencia es del lado de Nucleus.

### S5 · Mandate instalado

Datos:

- mandateId, versión, digest de entrega y `contractDigest`;
- organización e instalación;
- fecha de instalación (journal) y de recepción (recibo).

Estado: **Instalado · inactivo**.

Se muestran las seis Actions del contrato por `intentType`. No hay proveedor por defecto ni botón Ejecutar. Un texto fijo dice qué falta para ejecutar y que no forma parte de este corte: elegir recursos por Intent, aprobar y activar.

### Gate G3 (no es parte del primer corte) · Entrada a AITAP

Cuando exista, será un bloque «Antes de ejecutar: recursos por Intent» dentro de S5, separado de la instalación, y el único lugar desde el que se llegue a AITAP.

### Gate G2 (no es parte del primer corte) · Segundo Mandate

La ficha de la segunda oferta sumará el panel «Compatibilidad con lo instalado» (§6).

---

## 5. Ficha mínima de una oferta verificable

Disponibilidad: **Pre** (consultable sin bytes, con un contrato nuevo de metadatos) · **Post** (sólo tras descargar) · **Derivable** (Nucleus lo calcula) · **Nuevo** (requiere contrato).

| Campo | Fuente hoy | Disponibilidad | Nota |
|---|---|---|---|
| Nombre visible | `mandates.slug` | Pre — Nuevo (hoy sólo en tabla) | Será «Genesis» si así se publica |
| Propósito | `mandates.description` (`''` por defecto); `contract.objective` | Pre sólo si el Backend expone `objective` o exige `description` — Nuevo | Sin propósito declarado, la ficha dice «sin descripción publicada» |
| mandateId | `mandate_versions.mandate_id` | Pre — Nuevo | — |
| Versión | `mandate_versions.version` (string libre) | Pre — Nuevo | — |
| Digest ofrecido | `mandate_versions.sha256` | Pre — Nuevo | Precondición de la instalación |
| Publicador | `mandates.origin_org_id` → `organizations.name` | Pre — Nuevo | Hoy siempre es la propia organización |
| Firma de entrega | Authority, `signing_key_id` | Post | Verificada por `envelope.go` |
| Firma del contrato | `signatureKeyId` = instalación que construyó | Post | Determina la instalabilidad (R4) |
| Fecha de publicación | `mandate_versions.published_at` | Pre — Nuevo | — |
| Organización destinataria | `organization_bootstrap_mandates.organization_id`; envelope `organization_id` + `installation_id` | Pre / Post | — |
| Proyecto vinculado | `contract.projectId`, `projectBinding` | Post — **Nuevo si se quiere pre** | Sin esto la oferta puede listar algo no aprobable |
| Dominio | `contract.domain {id, name}` | Post | — |
| Plan | `contract.actions` (seis, fijas) | Post | — |
| Requisitos | Rol Master; firma de esta instalación; proyecto vinculado activo; Intents soportados (Brain sólo `ing/dis`) | Derivable — Nuevo (chequeo de instalabilidad) | `requiredIntentTypes` del Package Spec no existe en código |
| Techos de inteligencia | `contract.intelligence` (opcional) | Post | Se muestran como techo firmado, no como elección |
| Insumos y Gravity | `contract.inputs`, `contract.gravity` (sólo referencias) | Post | — |
| Tamaño a descargar | No se almacena | Nuevo | — |
| Efectos locales | Recibo bajo `AppDataDir/authority/mandate-delivery/receipts/…`; `.mandates/<id>/mandate.json` y journal | Derivable | Texto fijo verificable contra el código |
| Visibilidad | `mandates.visibility` | Pre — Nuevo | — |
| Pillar | `NULL` siempre | No disponible | **No mostrar** |
| Estado para la org activa | Nucleus local | Derivable | — |

**[P] Regla de verificabilidad.** Todo lo que se muestra antes de descargar se rotula «declarado por el Backend». Al instalar, Nucleus exige digest recibido == digest ofrecido, y la ficha de S5 contrasta lo declarado con el contrato real. Si algo difiere, se muestra la diferencia; no se oculta. (Si la oferta debe venir firmada: D4.)

---

## 6. Colisión del segundo Mandate

### 6.1 Qué permite hoy el código

- **Un segundo Mandate ofrecido no puede existir:** hay una asignación por organización y republicar la reemplaza (§2.3).
- **Sí puede haber un segundo Mandate local:** un Mandate construido localmente puede convivir con el recibido (R7). En el primer corte, la ficha sólo dice «Compatibilidad con otros Mandates: no evaluada en esta versión». El panel de §6.2 pertenece al gate G2.
- **La función de análisis existente no se puede alimentar antes de descargar.** `AnalyzeJoint` necesita expresiones de postura situadas en un contexto compartido; la entrega sólo trae referencias de Gravity. Tampoco hay `scope_paths` para territorio. Que Impact `coexistence` sea el evaluador de G2 es una opción por decidir, no un hecho.

### 6.2 Presentación

Los tres veredictos de la spec de colisiones (§4.2) se mapean por familia, nunca a un resultado global:

| Veredicto | Texto en UI | Exige |
|---|---|---|
| `CONFIRMED_COLLISION` | **Conflicto comprobado** | Sujetos, contexto compartido, hecho comparado, detector y versión |
| `UNDECIDABLE_CANDIDATE` | **Posible conflicto — requiere revisión** | Solapamiento estructural observado (mismo `projectId`, mismo `domain.id`) sin prueba de incompatibilidad |
| `NO_COLLISION` | **Sin conflicto en ‹familia›** | Detector que cubra esa familia con datos completos |
| (sin cobertura) | **No determinada** | Sin detector o sin datos |

Tabla de cobertura que muestra el panel:

| Familia | Estado hoy |
|---|---|
| Territorio (`MANDATE_TERRITORY_OVERLAP`) | No determinada — no hay detector ni scope en el contrato |
| Contradicción jerárquica | No determinada — sin detector |
| Ciclo de prioridades | No determinada — existe la función (`AnalyzeJoint` / Impact `coexistence`), sin posturas del Mandate ofrecido y sin integración con Wisdom |
| Umbrales insatisfacibles | Igual que la anterior |
| Criterios cualitativos | No evaluable mecánicamente (spec §4.3) |

**Regla:** el resumen sólo puede decir «Sin conflictos comprobados» cuando **todas** las familias aplicables dieron `NO_COLLISION`. En cualquier otro caso dice «Compatibilidad no determinada» y lista qué no se evaluó.

Lo que **no** es colisión y se muestra como información:

- Misma `mandateId` en otra versión: es una actualización.
- Mismo `(id, versión)` con otro digest: Nucleus ya lo rechaza por integridad.
- Coincidencia de `appliesTo`, similitud de texto o diferencia de masa: la spec §2.2 lo descarta como prueba.

### 6.3 Gobierno

Como instalar deja el Mandate inactivo, el punto donde una colisión confirmada tiene consecuencias es la **activación**, no la instalación **[I]**.

**[P]**
- Ante «Conflicto comprobado»: la instalación pide un reconocimiento explícito («instalo sabiendo que hay conflicto con ‹X›»), y la activación queda bloqueada hasta una decisión autorizada.
- Ante «No determinada»: se permite instalar con el aviso visible.
- Quién arbitra y qué se registra (¿`ArbitrationEvent`?) queda abierto (D7).

Evaluar con más datos que los metadatos exige descargar. Un botón «Evaluar compatibilidad» sería otro gesto de descarga sin instalar. Requiere decisión (D7) y no debe colarse por la puerta de la consulta.

---

## 7. Las dos automatizaciones a retirar

**A1 — Entrega e instalación dentro de `authority sync`.**
- **Dónde:** `installer/nucleus/internal/governance/authority_command.go:547-607` (`Receive` incondicional + `MaterializeFile`).
- **Disparos:** `onboarding:complete` (`onboarding-handlers.js:1063`), `onboarding:gemini-vault-sync` (l. 171) y cualquier sync manual.
- **Efecto real:** descarga y escribe `mandate.json` sin gesto, antes incluso de abrir Core.
- **Qué se retira:** sólo la entrega. El sync sigue validando Authority y tenant; la recepción pasa a ser parte de la instalación pedida por el Paladín.

**A2 — Creación local al montar Core.**
- **Dónde:** `webview/app/src/routes/+layout.svelte:14, 81` → `lib/bootstrap/genesisLaunch.ts:126-185` → `POST /api/v1/mandates`.
- **Productor:** `onboarding-handlers.js:1102-1117`. Lectura y `ack`: l. 1154-1212, expuestos en `preload_core.js:30-31`.
- **Efecto:** crea un Mandate local en construcción. Hoy está latente en la UI (el flag llega `false`), pero sigue en el código y en el fixture de RUNNER.
- **Qué se conserva:** `readGenesisProjectStatus`/`recoverGenesis`, que usa `MandateTab`.

**Retiro asociado (no automático, pero contradictorio):** el placeholder «Nuevo Mandate» `genesis/building` (`+layout.svelte:111-121`) y el copy de `step-mandate.js:76-86`.

**Residuos que hay que decidir (D5):**
- `mandate.json` ya materializados sin journal;
- `pending_genesis_launch` y `genesis_launch_required` ya escritos en `nucleus.json`.

Por la regla vigente, lo retirado sale del contexto normativo y operativo; no queda marcado como «supersedido».

---

## 8. Primer corte instalable — «Genesis explícito»

**Incluye:**
- la oferta actual (asignación única) en Wisdom, con ficha;
- instalación por gesto, con resultado durable;
- vista de instalado inactivo;
- en la ficha, la frase «Compatibilidad con otros Mandates: no evaluada en esta versión» (sin panel ni veredicto).

**No incluye:** catálogo múltiple, Pillars, búsqueda, elección de recursos (AITAP), aprobar/activar, Mandate Package, «continuar sin él», evaluación de colisiones. Ver gates G2 y G3 en §8.2.

**Capacidades necesarias** (sin fijar nombres de rutas, comandos ni schemas; ninguna nueva lleva la palabra *bootstrap*):

1. **Backend:** lectura de metadatos de la oferta asignada, sin bytes, autenticada por instalación.
2. **Nucleus:** lectura de la oferta más el estado local, devueltos juntos.
3. **Nucleus:** instalación desde la oferta = recepción con `(mandateId, versión, digest)` esperados + la ruta actual de `install`. Rechaza si el digest difiere.
4. **Nucleus:** `authority sync` sin entrega (A1).
5. **Conductor:** handler IPC y bridge de Wisdom en `preload_core.js`; quitar el pending (A2).
6. **Core:**
   - página Wisdom;
   - store de presentación;
   - estado «instalado» en los tipos (hoy cae a `building`);
   - retirar `runPendingGenesisLaunch` y el placeholder.
7. **Darwin (precondición):** registrar las rutas de Mandates (estado de arranque §3.3), o que la lista de instalados no dependa de ellas.

**Límite que la UI debe declarar** (hasta D1): sólo se puede instalar un Mandate publicado por **esta misma instalación** para **su** proyecto. Si no se cumple, «No instalable aquí: firmado por otra instalación». Por qué es así hoy, y qué cambiaría cada alternativa: documento de diseño de recepción e instalación.

### 8.1 Criterios observables para RUNNER CORE

**Gate negativo** — terminar onboarding, abrir Core, navegar Home↔Wisdom, recargar y reiniciar, todo sin gesto:
- 0 `POST /api/v1/mandates`;
- 0 GET de bytes de entrega;
- 0 recibos nuevos;
- `mandate.json`, `mandate_state.json` y workflows sin cambios.

Las consultas de metadatos se registran aparte. Una oferta real del Backend del run debe verse con id, versión y origen.

**Gate positivo** — tras el gesto:
- la primera descarga ocurre **después** del clic registrado;
- id, versión y digest coinciden en UI, Backend, recibo y archivo;
- se crea exactamente un `mandate.json` (+ journal según D2);
- 0 workflows y 0 recibos `approve`/`activate`;
- un segundo clic o una recarga no producen cambio.

**Rechazos cerrados:** digest alterado, firma inválida, otra organización u otra instalación, oferta no seleccionada. Tras cada rechazo, el estado durable reconciliado debe coincidir con lo que muestra la UI.

**Fallo parcial:** se interrumpe la instalación entre pasos; al volver, la UI muestra el estado observado y Reintentar completa sin duplicar.

Mientras falten las capacidades 1-3: **BLOQUEADO POR CAPACIDAD PENDIENTE**, no PASS.

### 8.2 Gates siguientes (no forman parte del primer corte)

| Gate | Contenido | Condición de apertura |
|---|---|---|
| **G2 — Segundo Mandate y colisiones** | Catálogo múltiple; panel de compatibilidad por familia (§6.2); integración de un evaluador (candidato: `nucleus/gravity.AnalyzeJoint` / Impact `coexistence`, no verificado como camino productivo) | §9 y D7 |
| **G3 — Recursos por Intent (AITAP)** | Elección de proveedor y modelo por Intent antes de ejecutar; vinculación al digest adoptado | Decisiones 5-8 del informe del 16/10 |
| **G4 — Aprobar y activar desde Core** | Consentimiento ante Authority sin stdin | Decisión 7 del informe del 16/10 |

---

## 9. Corte posterior — segundo Mandate y análisis de colisiones

**Requiere:**
- catálogo con más de una oferta por organización (cambia el modelo de asignación única);
- entrega por selección;
- que la proyección distribuible transporte lo necesario para comparar: posturas resueltas o una proyección del `GravityNode` (pregunta 5 abierta en `Verificacion_Codigo_Mandate_Package_Gravity_v0_1.md`), y algún territorio declarado;
- decidir si el evaluador es Impact `coexistence` (que ya usa los dos detectores) y verificar su camino productivo de invocación;
- ratificar `COLLISION-CATALOG-01`, `ACTIVE-MANDATE-SOURCE-01`, `TERRITORY-NORMALIZATION-01` y el borde detección/arbitraje (spec §9.1-§9.4).

Hasta entonces, la ficha no emite veredicto de compatibilidad.

---

## 10. Decisiones para José antes de implementar

1. **D1 — Procedencia instalable (bloqueante).** Para el primer corte:
   - (a) sólo la misma instalación y el mismo proyecto, declarado en la UI;
   - (b) rebind con re-firma local en la receptora;
   - (c) reemisión del Backend para el destino.
2. **D2 — Qué significa «Instalar».** ¿Materializar y adoptar, como hace el código, o sólo materializar, como dice Canonical §6.3? ¿La UI dice «Instalado» o «Adoptado»?
3. **D3 — La sección Wisdom.** ¿Se confirma que lista Mandates ofrecidos e instalados, y que esos objetos nunca se llaman «Wisdom»? ¿Se descartan los Pillars hasta que tengan escritor?
4. **D4 — Metadatos de oferta.**
   - ¿Van firmados o basta «digest recibido == digest ofrecido»?
   - ¿Qué es obligatorio al publicar (descripción/propósito)?
   - ¿Se expone el proyecto vinculado antes de descargar?
5. **D5 — `authority sync` y residuos.**
   - ¿Se quita la entrega o queda detrás de un flag apagado?
   - ¿Qué se hace con los `mandate.json` sin journal y con `pending_genesis_launch`/`genesis_launch_required` ya escritos?
6. **D6 — Autoridad del gesto.**
   - ¿Sólo Master puede instalar? ¿La ficha se muestra a no-Master como «requiere Master»?
   - ¿Se registra el actor y el contexto del gesto? ¿Dónde: localmente o en `mandate_adoptions`?
7. **D7 — Colisión.**
   - ¿Bloquea instalar, bloquea activar o sólo informa?
   - ¿Quién arbitra?
   - ¿Se permite un gesto «descargar para evaluar» sin instalar?
   - ¿La spec de colisiones se extiende a la compatibilidad de instalación?
8. **D8 — Rechazo o «continuar sin él».** ¿Entra en el primer corte o queda fuera? El recorrido pedido no lo incluye.
