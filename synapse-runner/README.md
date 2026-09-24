> ## ⚠️ HANDOFF para Codex — verificación pendiente de Backend Authority (roles builtin + migraciones 0016/0019)
>
> **Esta sección no tiene relación con Synapse Runner ni con el resto de este documento.** José la agregó acá a propósito, como punto de entrega, porque la sesión de Claude Code (Cowork) que hizo todo el trabajo descripto abajo se quedó sin acceso de terminal al dispositivo real (el puente `device_bash` dejó de estar disponible en esa sesión) y sin tokens para seguir. El código ya está escrito y guardado en el repo — **sin commit, sin push**. Lo único que falta es correr la verificación real contra la máquina y, si el resultado coincide con lo esperado, comitear y pushear. Borrar esta sección del README una vez que eso esté hecho.
>
> Todo lo que sigue en este bloque (§A a §H) es autocontenido — no hace falta abrir ningún otro documento para ejecutar la verificación, aunque en §H se listan las fuentes completas por si hace falta más contexto o algo no cuadra.

---

## §A. Contexto completo — qué pasó y por qué

Todo esto arrancó al verificar la implementación de **Invitaciones a Organización Ajena, Fase A+B** (esquema + creación/listado/revocación de invitaciones, para que alguien pueda invitar a una identidad de GitHub a unirse a una organización que no es la suya). Al correr la suite de tests contra una base D1 real aparecieron, en cadena, tres problemas distintos — cada uno se investigó y se corrigió antes de pasar al siguiente:

**1. Migración `0016_authority_project_claims.sql` no aplicaba.** Tenía un `REFERENCES installation_keys(installation_id)` sobre una columna que sólo tiene un índice único **parcial** en la tabla referenciada (no una UNIQUE/PK completa) — SQLite rechaza eso como `foreign key mismatch`, pero **sólo** cuando la FK se enforced de verdad bajo `PRAGMA foreign_keys = ON`, que es justo lo que hace `wrangler d1 migrations apply` (los arneses de `vitest` nunca cargan ese pragma, por eso el bug nunca apareció en `npm test`, sólo en `db:migrate:local`). Como Wrangler aplica las migraciones en orden y corta en el primer error, esto dejaba **`0017` y `0018` sin aplicar nunca** contra una base limpia.
   - **Corrección:** se sacó la `REFERENCES` de esa columna en `0016`. No se pierde ninguna validación real — el código (`project-claim.ts`) y el propio guard fail-closed de esa migración ya exigen lo mismo por otra vía.
   - Hallazgo relacionado, señalado pero **no corregido** (fuera de alcance): `0008_authority_sync.sql` tiene el mismo patrón exacto y el mismo defecto latente, hoy inerte porque nada inserta ahí con `foreign_keys` activado.

**2. Cinco errores de `npm run typecheck`**, en dos archivos que no tienen nada que ver con invitaciones:
   - `src/authority/recovery.ts` (4 errores, `TS18048` — posible `undefined`): dos guard clauses usaban `deny(...)` como statement suelto en vez de `return deny(...)` — el compilador sólo narrowea la variable si la llamada está en posición de `return`/`throw`. Se corrigió con el mismo idiom ya usado en `administration.ts`.
   - `test/identity.spec.ts` (1 error, `TS2345`): `crypto.subtle.exportKey(...)` devuelve `ArrayBuffer | JsonWebKey` bajo los tipos de Workers, y se pasaba directo donde se esperaba `ArrayBuffer`. Se agregó `as ArrayBuffer`, mismo cast que ya usa `tenant-organizations.spec.ts` para el mismo caso.

**3. El hallazgo grande: ninguna organización podía otorgar `specialist` ni `operator`.** `authority-invitations.spec.ts` fallaba con `authority_invitation_role_unavailable` al intentar crear una invitación con rol `specialist`. La causa, confirmada leyendo el código:
   - El motor de autorización (`propose_assignment` en `administration.ts`, y `createInvitation` en `invitation-store.ts`) busca el rol a otorgar en `state.role_definitions` — el **estado firmado de la organización** — nunca en la tabla global `role_definitions` de la base (que sí lista `master`/`specialist`/`operator` como catálogo builtin visible globalmente).
   - La génesis (`initial-emission.ts`) sembraba en ese estado **sólo `master`**. `define_role` sólo acepta roles propios de la organización (`role_origin: "organization"`), así que no había ningún camino de producción para que `specialist` u `operator` llegaran al estado de una organización.
   - **Consecuencia real:** ninguna organización podía otorgar `specialist` ni `operator` a nadie — ni por invitación, ni por el mecanismo normal de `propose_assignment`/`accept` ya probado en producción. Tampoco era alcanzable el permiso de Nacimiento de Agente Orbital (`agent.issuer.designate`, vía `operator`).
   - **Por qué nadie lo había visto antes:** los tests que "probaban" el otorgamiento de `specialist` armaban el estado inicial a mano con evidencia de fixture de test, que acepta cualquier estado y ya traía `specialist` sembrado. El spec de invitaciones fue el primero en pasar por una génesis real y después intentar otorgar `specialist`.
   - Nota importante: la tabla global de la base **no puede** ser la fuente del motor de todas formas, porque Nucleus (el cliente Go) verifica sin conexión, sólo con lo que viene en el estado firmado — tanto `normalizeState` (TypeScript) como `validateProjection` (Go) exigen que toda asignación apunte a una definición presente en el mismo estado.

Este tercer hallazgo disparó un encargo de diseño formal (ver §H) que evaluó tres alternativas y una cuarta, y José aprobó la Alternativa 4 — descripta en §B.

## §B. Qué se decidió — reconciliación determinista del catálogo builtin

**Alternativa aprobada:** una única función pura, `withBuiltinCatalog(state)`, que agrega al estado de una organización los roles builtin (`master`, `specialist`, `operator`) que falten, tomados de una constante en el código (`BUILTIN_ROLE_CATALOG` en `emission.ts`) — nunca de la tabla de la base ni de un input del caller. Se aplica en cada punto donde el Backend **produce** estado nuevo (génesis, y cada comando administrativo), nunca al leerlo o validarlo, para no invalidar emisiones históricas.

Reglas de diseño, por si hace falta juzgar un caso borde no cubierto:
- **R1:** todo estado que el Backend produce contiene el catálogo builtin completo.
- **R2:** el catálogo es código, nunca la tabla de la base — la fila de `master` en la base queda sólo como interruptor de activación de la génesis (`activeMaster`).
- **R3:** la reconciliación corre sólo al producir estado, nunca al leer/validar uno ya firmado.
- **R4:** ninguna guarda de otorgamiento cambia (`grantable`, `selfGrant`, `scopeVerified`) — que un rol esté *disponible* en el estado no significa que se pueda *otorgar*.
- **R5:** la génesis sigue siendo determinista, con un único fundador asignado como `master`. Sólo cambia la validación estructural de "exactamente una definición de rol" a "exactamente el catálogo builtin completo".

**Efecto práctico:** una organización nueva nace con `master`, `specialist` y `operator` ya definidos en su estado. Las organizaciones que ya existen reciben las definiciones que les faltan en su próxima emisión administrativa (el delta trae sólo dos *upsert*: `operator` y `specialist`) — **sin migración**.

## §C. Paso 0 — divergencia grave entre el catálogo TypeScript y el catálogo Go

Durante el diseño de lo anterior apareció, y se verificó ejecutando, un hallazgo lateral serio: el rol `master` de **Go** (`installer/nucleus/internal/authority/roles.go`) tenía **13 permisos** (incluye `create_project`, agregado en un encargo anterior de mapeo Gravity), mientras que el `master` de **TypeScript** (`emission.ts`) tenía **12**. Con eso, **Go rechazaba toda emisión real del Backend** con `built-in permissions contradict catalog` — es decir, Nucleus no podía validar ninguna emisión real, de ninguna organización.

- Se evaluó sacar `create_project` de Go. Se descartó tras correr los tests: ese permiso es el requisito del cutover a `remote_enforced` ("principal canónico único con `create_project`") — sin él, `nucleus authority sync` corta con `remote_identity_ambiguous` antes de entregar el mandate. **Ese cambio no se aplicó.**
- **Decisión final de José:** agregar `create_project` al `master` v1 de TypeScript, para que coincida exactamente con Go.
  - `emission.ts`: el `master` pasa a 13 permisos.
  - Migración nueva **`backend/migrations/0019_authority_master_create_project.sql`**: actualiza la fila global de `master` en la base (sembrada originalmente por `0013` con 12 permisos).
  - `installer/nucleus/internal/authority/roles_test.go`: test nuevo `TestBuiltinCatalogMatchesBackend`, que falla si los dos catálogos (TS y Go) vuelven a divergir en el futuro. **`roles.go` no se tocó.**

**Consecuencia que hay que tener en cuenta al verificar (ver §D):** una emisión guardada en la D1 local **antes** de este cambio (con el `master` viejo de 12 permisos) ya no decodifica contra el código nuevo y cae en `recovery_required`. Ningún ambiente tiene emisiones reales que valga la pena conservar — por eso el primer paso de la verificación es resetear la D1 local, no sólo migrarla.

## §D. Archivos tocados — referencia completa

| Archivo | Qué cambió |
|---|---|
| `backend/migrations/0016_authority_project_claims.sql` | Se quitó la `REFERENCES installation_keys(installation_id)` de la FK rota. |
| `backend/src/authority/recovery.ts` | `return deny(...)` en dos guard clauses (antes: `deny(...)` como statement suelto). |
| `backend/test/identity.spec.ts` | `as ArrayBuffer` en el resultado de `crypto.subtle.exportKey(...)`. |
| `backend/src/authority/emission.ts` | `BUILTIN_ROLE_CATALOG` (fuente única del contenido builtin, `master` ahora con 13 permisos) + función `withBuiltinCatalog(state)`. `normalizeState` usa el mismo catálogo. |
| `backend/src/authority/administration.ts` | Al entrar a `evaluateAdministration`, el estado se reconcilia con el catálogo builtin antes de evaluar cualquier comando. |
| `backend/src/authority/invitation-store.ts` | `createInvitation` valida el rol pedido contra el estado ya reconciliado (vista de sólo lectura, no persiste nada nuevo). |
| `backend/src/authority/initial-emission.ts` | El estado v1 de una organización nueva se arma con el catálogo builtin completo, no sólo `master`. `activeMaster` usa la fila de la base sólo como interruptor de activación. |
| `backend/src/authority/emission-store.ts` | La guarda canónica de v1 exige `role_definitions` = catálogo builtin exacto + exactamente una asignación `master`. |
| `backend/migrations/0019_authority_master_create_project.sql` (nuevo) | Actualiza la fila global de `master` en la base para incluir `create_project` (paridad con Go). |
| `installer/nucleus/internal/authority/roles_test.go` | Test nuevo `TestBuiltinCatalogMatchesBackend` — falla si TS y Go vuelven a divergir. |
| `backend/test/authority-administration.spec.ts` | +6 casos de reconciliación del catálogo builtin. |
| `backend/test/authority-administration-store.spec.ts` | +1 caso: organización existente con sólo `master` → delta con dos *upsert* (`operator`, `specialist`). |
| `backend/test/initial-emission.spec.ts` | +6 casos de rechazo de la nueva guarda canónica de v1. |
| `backend/test/authority-invitations.spec.ts` | **Test nuevo (a2):** génesis real → membership → otorgar `specialist` → accept, todo por HTTP — el test que faltaba para probar el flujo completo de punta a punta. **Tests (b) y (c) corregidos:** sembraban roles con un `INSERT` directo en una tabla que nunca llega al estado firmado — ahora usan el comando real `define_role`, vía un helper nuevo `defineOrgRole`. Lo que cada test afirma no cambió, sólo cómo arma el fixture. |
| Fixtures de `master` en 7 specs | Actualizados a 13 permisos. En particular, `authority-snapshot-route.spec.ts` tenía un fixture con sólo **11** permisos — un catálogo todavía más viejo — que era la causa real de una falla que se había registrado como "aislada y sin relación" (`authority_invalid_emission` en el test *"delivers an administrative membership/grant/revocation journey to Go"*). Queda resuelta. |
| `authority-genesis.spec.ts`, `tenant-genesis.spec.ts`, `authority-genesis-result.spec.ts` | Ahora cargan la migración `0019` en su propio `loadMigrations`. |

## §E. Paso 0 real de la verificación — resetear la D1 local

**No saltear este paso.** Por lo explicado en §C, cualquier emisión que ya exista en la D1 local de `backend/` con el `master` viejo (12 permisos) va a fallar al decodificar contra el código nuevo.

```bash
cd backend
rm -rf .wrangler/state/v3/d1
```

Esa es la ruta estándar donde Wrangler guarda el estado de D1 local para desarrollo. Si en esta máquina el estado vive en otro lado (confirmarlo con `find . -iname "*.sqlite*" -path "*wrangler*" 2>/dev/null` desde `backend/`, o revisando `wrangler.jsonc`), borrar ese directorio en su lugar. Alternativa más quirúrgica, si no se quiere borrar todo: `DELETE FROM authority_emissions; DELETE FROM authority_emission_heads;` (o como se llamen las tablas de cabecera de emisión) contra la D1 local — pero borrar el directorio completo es más simple y es lo verificado.

## §F. Comandos a correr, en este orden exacto

```bash
# (ya reseteada la D1 local en el paso anterior)
cd backend
npm run db:migrate:local
npm run typecheck
npm test

cd ../installer/nucleus
go test ./internal/authority/... ./internal/governance/...
```

Si hace falta re-verificar sólo invitaciones en aislamiento en algún momento:
```bash
cd backend
npx vitest run test/authority-invitations.spec.ts
```

## §G. Resultado esperado, y qué hacer con lo que salga

Esto es lo que se obtuvo corriendo todo en una copia aislada del repo (Miniflare/D1 reales + Go 1.24), porque el puente al dispositivo real no estuvo disponible en la sesión que hizo el trabajo. **Hace falta confirmarlo en la máquina real** — es exactamente la tarea que le queda a Codex.

| Comando | Resultado esperado |
|---|---|
| `npm run db:migrate:local` | `0019` aplica sin error, junto con todo lo anterior |
| `npm run typecheck` | los mismos ~111 errores de siempre (sólo tipos `node:*`/`ImportMeta`, preexistentes), ninguno nuevo |
| `npm test` | **293 tests pasan / 11 fallan** (la línea de base antes de todo este trabajo era 27 fallas) |
| `go test ./internal/authority/... ./internal/governance/...` | **todo en verde**, incluido el `TestBuiltinCatalogMatchesBackend` nuevo |

**Las 11 fallas esperadas son preexistentes y conocidas — ninguna la introduce este trabajo, y no hay que intentar arreglarlas ahora:**
- **10** en `authority-genesis.spec.ts` y `tenant-genesis.spec.ts`: un gap de arnés de test ya identificado y ya verificado como solución (agregar la migración `0017_authority_genesis_result.sql` al `loadMigrations` de esos dos specs) pero **deliberadamente no aplicado todavía** — quedó fuera de alcance de este trabajo, es una decisión pendiente de José, no un bug.
- **1** en `authority-trust.spec.ts` → `TestTrustManifestBackendInterop` ("*exchanges freshly signed trust and actor artifacts with Go*", `missing or unknown wire property`) — ya fallaba antes de todo esto, sin diagnóstico todavía, no relacionada.

**Si el resultado coincide exactamente con la tabla de arriba:**

1. Confirmar con `git status` que los archivos modificados/nuevos coinciden con la lista de §D (más los archivos de este README).
2. Comitear **el código de backend/nucleus** (no este README, ver nota al final) con este mensaje, ya redactado y listo, sin comillas dobles:

```
Fix authority role assignment and complete organization invitations phase A and B. Adds the invitation schema and endpoints (create, list, revoke) with their Batcave proxy routes, backed by a new invitation-store module and full test coverage including a CSRF-checked end-to-end HTTP flow. Fixes a foreign key mismatch in migration 0016 that blocked local D1 migrations from applying past that point, which had silently left migrations 0017 and 0018 never applied against a clean database, plus five related TypeScript errors in recovery.ts and identity.spec.ts. Resolves a deeper structural gap this surfaced: initial emissions only ever seeded the master role, so no organization could ever grant specialist or operator to anyone, through invitations or through the normal propose and accept flow. Introduces a deterministic builtin role catalog reconciliation applied at every point the backend produces state, in genesis and in administration commands, so new and existing organizations end up with the full builtin catalog without a migration and without touching any authorization guard. Also fixes a latent parity break between the TypeScript and Go builtin master role definitions, thirteen permissions in Go against twelve in TypeScript, that made Nucleus reject every real emission, by aligning TypeScript to include create_project and adding a Go test that will catch the two catalogs drifting apart again. Includes migration 0019, updated fixtures across the test suite, a real genesis-to-specialist-grant invitation test, and corrections to two invitation tests that had been seeding roles directly into a table the signed state never reads.
```

3. Push a la rama de trabajo actual (**nunca a `main`/`master` sin confirmar con José primero**, y nunca con `--force`).

**Si el resultado NO coincide** (otro número de tests, fallas nuevas, algo que no está en la lista de "esperadas"): **no improvisar una corrección.** Documentar exactamente qué comando y qué salida difiere de lo esperado, y leer los documentos de §H antes de tocar nada — casi seguro la respuesta ya está ahí. Si after eso sigue sin quedar claro, es momento de frenar y preguntarle a José, no de adivinar sobre código de autorización.

**Nota sobre el commit de este README:** este archivo se modifica y se comitea aparte, con su propio mensaje — no lo mezcles con el commit del código de backend/nucleus de arriba.

## §H. Qué queda abierto (no resolver acá, sólo tenerlo presente)

- **Fase C de invitaciones (redención vía OAuth)** ya no está bloqueada por el vacío de roles builtin, pero sigue bloqueada por el `invitationCommitGuard` (ver `Cierre_Implementacion_FaseAB_Invitaciones_y_Correccion_ActorSintetico_v1_0.md` §2) y requiere autorización explícita de José antes de escribir código.
- El fix del gap de arnés de `0017` en los dos specs de génesis (§G) es trivial y ya está verificado, pero sigue pendiente de decisión — no aplicarlo sin que José lo pida.
- `TestTrustManifestBackendInterop` sigue sin diagnosticar.
- Detalle menor: Go reserva como id de rol de organización sólo `master`/`specialist` (no `operator`) — señalado, no corregido.

**Documentos fuente completos**, en `docs/ANALYSIS/` de este repo y en el proyecto BTIPS de Claude, por si hace falta más profundidad que lo que ya está inline en esta sección (rutas relativas a la raíz del repo):

- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Traspaso_RUNNER_Invitaciones_FaseAB_Ejecucion_v1_0.md` — el traspaso original de Fase A+B.
- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Cierre_Implementacion_FaseAB_Invitaciones_y_Correccion_ActorSintetico_v1_0.md` — implementación de Fase A+B y el hallazgo de `invitationCommitGuard` (Fase C).
- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Recepcion_RUNNER_TraspasoInvitacionesFaseAB_v0_1.md` y `Cierre_Verificacion_RUNNER_InvitacionesFaseAB_v1_0.md` — primera corrida de verificación y sus resultados.
- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Encargo_BACKEND_Correccion_Migracion0016_y_Typecheck_v1_0.md` y `Cierre_Correccion_Migracion0016_y_Typecheck_v1_0.md` — el bug de la migración 0016 y su corrección.
- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Investigacion_BACKEND_Analisis_ResultadosSuite_PostCorreccion0016_v1_0.md` — el hallazgo original del gap de roles builtin (§4).
- `docs/ANALYSIS/BACKEND/ROLES/Encargo_Diseno_Resolucion_AsignacionRolesBuiltin_v1_0.md` — el encargo de diseño formal.
- `docs/ANALYSIS/BACKEND/ROLES/Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md` — las tres alternativas evaluadas y la decisión (Alternativa 4).
- `docs/ANALYSIS/BACKEND/ROLES/Cierre_Implementacion_ReconciliacionCatalogoBuiltin_Pasos1a5_v1_0.md` — el cierre técnico completo de la implementación.
- `docs/ANALYSIS/CONDUCTOR/ONBOARDING/Devolucion_RUNNER_ResolucionRolesBuiltin_y_ParidadCatalogo_v1_0.md` — la devolución completa que resume todo lo de arriba (fuente directa de esta sección del README).
- `docs/ANALYSIS/BACKEND/ROLES/Investigacion_Estructura_Tenant_Organizacion_Roles_v0_1.md` y `Propuesta_Resolucion_Inconsistencias_Investigacion_TenantOrganizacionRoles_v0_1.md` — la investigación estructural previa de Tenant/Organización/Roles que sirvió de base.

---

# synapse-runner

Suite de testing E2E UI-driven para el onboarding de Bloom, y sistema de
diagnóstico/detección temprana de fallas para todo el pipeline — desde un
browser genérico sin nada instalado (Fase 0, server-side) hasta
Electron/Conductor + Chromium/Discovery + Side Panel/Companion + CLI `brain`
(Fases 1-4, local).

**Fuente de verdad actual:**
[`docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_Requerimiento_Integrado_v1_0.md`](../docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_Requerimiento_Integrado_v1_0.md)
— integra, sin reemplazarlos en disco, el encargo original de Fase 0, la
investigación server-side ya verificada contra código real, y el dossier de
arquitectura de Fases 1-4. Los tres documentos fuente (ese encargo, esa
investigación, y el
[dossier original](../docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md))
quedan intactos en disco como referencia histórica — este README y el
código de `synapse-runner/` son lo que se actualiza cuando cambia el
esquema. Esta sección y las siguientes reflejan la incorporación de Fase 0
al esquema local (Requerimiento Integrado §15 "Próximos Pasos").

**Independiente del código de producción que audita** — vive en la raíz del
repo (`synapse-runner/`), no dentro de `installer/` ni de ninguna otra
carpeta existente.

---

## Por qué existe

Objetivo actualizado (Requerimiento Integrado §2): validar la hipótesis de
automatización end-to-end **desde un browser genérico sin nada instalado**
hasta la finalización del onboarding local, cruzando dos capas
fundamentalmente distintas:

- **Fase 0 (server-side):** browser genérico → registro/login GitHub contra
  el backend → descarga del instalador. Sin extensión Cortex instalada
  todavía. **Sigue como stub** — ver "Fase 0" más abajo.
- **Fases 1-4 (local):** Electron/Conductor + Chromium/Discovery + Side
  Panel/Companion + CLI de Synapse Intent — esto sí está implementado, y es
  lo que documentaba el objetivo original del dossier: automatizar
  **exclusivamente desde las capas de UI** (sin inyectar eventos sintéticos
  por protocolo), usando la captura de eventos/IPCs como capa de
  observabilidad — y, además, como **sistema de diagnóstico y detección
  temprana de fallas** en todo el pipeline (Sección 6 del dossier).

La arquitectura de observabilidad (`src/diagnostics/`) no es un agregado
posterior: es lo primero que se construyó, y todo paso de la suite corre
envuelto en ella (`SynapseRunner.runStep()`), tenga o no aserciones de
negocio.

---

## Arquitectura

```
src/
  config/          bloom-paths.ts (resolución de paths BloomNucleus, ver
                   más abajo), env.ts, selectors.ts,
                   flow-matrix.ts   — esquema tipado de la Matriz de Flujo
                                      completa (00a-00d + 01-11) y de las
                                      6 fronteras externas — NUEVO
  diagnostics/      Capas 1-4 + Correlator + Reporter (Sección 6 del dossier)
  preflight/        extension-parity-check.ts (resuelve el punto 7),
                     environment-check.ts (falla rápido si el entorno no
                     está levantado)
  surfaces/         Las 5 superficies (Requerimiento Integrado §7):
                       phase0-generic-browser.ts — Superficie 0, STUB — NUEVO
                       electron-conductor.ts   — Superficie 1, _electron.launch()
                       discovery-chromium.ts   — Superficie 2, chromium.connectOverCDP()
                       companion-panel.ts      — Superficie 3, Target CDP del Side Panel
                       submit-cli.ts           — Superficie 4, CLI `brain` (contingencia)
  runner/           SynapseRunner — orquestador, envuelve cada paso en una
                     StepDiagnosticSession
tests/
  fixtures/         fixture de Playwright que engancha SynapseRunner
  e2e/              onboarding-flow.spec.ts — Fases 1-4 (pasos 01-11)
                     phase0-server-onboarding.spec.ts — Fase 0 (pasos
                       00a-00d), test.fixme() — punto de inserción marcado,
                       NO implementado — NUEVO
scripts/
  preflight-check.ts   `npm run preflight` — chequeos de entorno standalone
```

### Sistema de diagnóstico (Sección 6)

4 listeners independientes, uno por capa, todos publicando al mismo
`DiagnosticBus`:

| Capa | Fuente | Archivo |
|---|---|---|
| 1 — Companion | Port directo (`chrome.runtime.connect({name:'companion-link'})`) — `background-companion.js` no publica al bridge centralizado | `layer1-companion-port.ts` |
| 2 — Inyección DOM en Gemini | Reinterpreta eventos de Capa 1 + watchdog propio (`RUNNER_WATCHDOG_MS`) | `layer2-dom-watchdog.ts` |
| 3 — Debug Panel/EventBus | WebSocket `ws://localhost:4124` directo, sin scraping del HTML | `layer3-eventbus-ws.ts` |
| 4 — CLI de contingencia | `spawn('brain', ['intent','submit',...])`, clasifica stderr | `layer4-cli-contingency.ts` |

`correlator.ts` arma, por cada paso (`SynapseRunner.runStep()`), un
**bundle de diagnóstico único** cruzando las 4 capas por `commandId` /
`mandateId` / `intent_id` — nunca reporta "step failed" genérico; siempre
apunta a la capa específica, con el trazo crudo adjunto. `reporter.ts`
persiste cada bundle a `diagnostics-output/` a medida que se produce (no al
final), para no perder visibilidad si el propio proceso de Playwright
crashea a mitad de corrida.

Nota: esta arquitectura de 4 capas cubre las Fases 1-4 (local). La Fase 0
(server-side) **no tiene hoy una capa de observabilidad propia** — ver
"Fase 0" más abajo y Requerimiento Integrado §14.4 (decisión pendiente, no
bloqueante).

---

## Cinco superficies (no cuatro)

El dossier original definía cuatro superficies controladas simultáneamente
por Playwright. La Fase 0 agrega una quinta, **anterior** a las otras
cuatro en el tiempo (Requerimiento Integrado §7):

| # | Superficie | Archivo | Estado en este Runner |
|---|---|---|---|
| 0 | Browser genérico (`chromium.launch()`, sin extensión Cortex) — pasos 00a-00c | `src/surfaces/phase0-generic-browser.ts` | 🚧 **STUB** — bloqueada por decisión pendiente de José, §14.1 (ver "Decisiones pendientes" abajo) |
| 1 | `_electron.launch()` — ventana Conductor | `src/surfaces/electron-conductor.ts` | ✅ Implementada |
| 2 | `chromium.connectOverCDP()` — tab Discovery | `src/surfaces/discovery-chromium.ts` | ✅ Implementada |
| 3 | Target CDP del Side Panel (Companion) | `src/surfaces/companion-panel.ts` | ✅ Implementada |
| 4 | Proceso CLI como testigo (`brain intent submit`, contingencia) | `src/surfaces/submit-cli.ts` | ✅ Implementada (fuera de banda) |

La Superficie 0 debe cerrarse/descartarse antes de levantar las
Superficies 1-4, ya que éstas asumen la extensión Cortex ya instalada —
cosa que la Superficie 0, por definición, todavía no tiene.

---

## Fase 0 — server-side (pasos 00a-00d) — STUB, no implementada

La investigación de Fase 0 confirmó que el onboarding **no** empieza al
arrancar Electron — antes hay una etapa server-side completa. La Matriz de
Flujo completa (`src/config/flow-matrix.ts`, `FLOW_MATRIX`) ahora arranca en
`00a`, no en `01`:

| Paso | Qué hace | Estado en el backend | ¿Implementado en el Runner? |
|---|---|---|---|
| 00a. Registro server-side | Login/registro GitHub contra el backend (`POST/GET /v1/authority/genesis/login`) | ✅ CONSTRUIDO | ❌ No — stub |
| 00b. Autorización GitHub (backend) | Autorizar la GitHub App propia del backend | ✅ CONSTRUIDO | ❌ No — stub |
| 00c. Descarga del instalador | `GET /v1/releases/:releaseId/download` | ⚠️ CONSTRUIDO, sin descubrimiento público de `releaseId` para un humano anónimo | ❌ No — stub |
| 00d. Instalación + `nucleus authority sync` | Ejecutar instalador, `nucleus init` manual, `sync` | ✅ CONSTRUIDO — pasos manuales, no automáticos incluso en el flujo real | ❌ No — stub, y ni siquiera correspondería a un browser (corre en el SO) |

**Por qué es un stub y no una implementación real:** Requerimiento
Integrado §14.1 deja explícitamente sin decidir si `AUTHORITY_BOUNDARY.md`
§1 aplica a un arnés de Playwright automatizando login/registro GitHub del
backend. Esa sección es agnóstica de componente pero nunca menciona "arnés
de pruebas" como categoría — no se resuelve sola. Dos opciones quedaron
presentadas, sin inclinar la balanza, y **ninguna de las dos fue elegida
acá**:

- **Opción A** — Playwright sujeto a la restricción: la Superficie 0 se
  detendría en la puerta de GitHub y usaría una sesión ya autenticada
  inyectada por fixture, nunca un login real automatizado.
- **Opción B** — Playwright fuera de alcance por ser herramienta de QA:
  se automatizaría un login de prueba contra una cuenta dedicada. Riesgo
  documentado: si el arnés se reutiliza como base de un flujo de producto
  real, la línea entre "sólo QA" y "el sistema" se vuelve difícil de
  sostener retroactivamente.

El punto de inserción para cuando esta decisión se tome está listo y
marcado en `src/surfaces/phase0-generic-browser.ts` (lanza siempre, a
propósito, con un mensaje que explica por qué) y en
`tests/e2e/phase0-server-onboarding.spec.ts` (`test.fixme()` por cada paso
00a-00d, así que `npx playwright test --list` sigue mostrando estos 4 pasos
como pendientes explícitos en vez de que desaparezcan del inventario).

Relacionado, también pendiente de José y no bloqueante: §14.3 (de dónde
arranca Fase 0 sin una landing pública/dominio confirmado — afecta en
particular al paso 00c) y §14.4 (si vale la pena definir una Capa 0 de
observabilidad para Fase 0, hoy inexistente).

---

## Fronteras externas — seis, no tres ni cuatro

El pipeline completo (Fase 0 + Fases 1-4) cruza **seis** fronteras externas
confirmadas (Requerimiento Integrado §4; esquema tipado en
`EXTERNAL_BOUNDARIES` de `src/config/flow-matrix.ts`). Cualquier diseño de
Playwright que cuente menos está incompleto:

| # | Frontera | Fase | ¿Automatizada por este Runner? |
|---|---|---|---|
| 1 | Login GitHub del backend (Auth Code+PKCE, GitHub App propia del backend) | 0 | ❌ No — bloqueada por la Superficie 0 (stub) |
| 2 | Repo Ops (GitHub App + Device Flow, Cortex/Discovery) | 1-4, paso 03 | ✅ Sí (asume sesión ya autorizada, no automatiza credenciales reales) |
| 3 | Batcave Auth (control plane Codespaces) | Transversal, fuera del onboarding de usuario final | ❌ No — fuera del camino crítico |
| 4 | GitHub App instalada por organización | Transversal | ❌ No — sin ruta HTTP dedicada auditada |
| 5 | Detección de cuenta Google (Companion) | 1-4, paso 04 | ✅ Sí |
| 6 | Tab de Gemini (`gemini.google.com`, DOM de tercero `untrusted-dom`) | 1-4, paso 10 | ✅ Sí (selectores ⚠️ sin verificar — ver Puntos abiertos) |

**Regla de oro (Requerimiento Integrado §4):** `ACCOUNT_REGISTERED` es la
cuenta **Google** del Companion (frontera #5), nunca el registro de cuenta
del servidor (frontera #1, Fase 0). Son mecanismos y credenciales
completamente distintos — no comparten client id, secret, ni callback entre
sí. No confundirlos al leer logs o bundles de diagnóstico.

---

## Limitación conocida — sólo el usuario fundador

**Este PoC (incluida la Superficie 0, cuando deje de ser stub) sólo puede
simular el flujo del usuario FUNDADOR — nunca a un segundo miembro
invitado.** No es una limitación de diseño del Runner: es que **ese camino
no existe en el backend actual** (Requerimiento Integrado §14.2). El código
soporta la forma (`administration.ts` / `administration-store.ts`), pero no
hay ningún camino en el repo que cree una identidad verificada para una
segunda persona distinta dentro de una organización ya existente — los dos
únicos `INSERT INTO authority_human_identities` del repo son para el mismo
fundador.

Esto queda registrado en código como `KNOWN_LIMITATION_FOUNDER_ONLY` en
`src/config/flow-matrix.ts`, e impreso en el resumen final de cada corrida
(`SynapseRunner.stop()`) para que no se pierda de vista. No es bloqueante
para lo que este PoC sí prueba (el flujo del fundador de punta a punta) —
pero cualquier automatización futura de un flujo multi-usuario debe
resolver primero este gap en el backend, no en el Runner.

---

## Decisiones pendientes de José (no tomadas por esta actualización)

Estas decisiones son explícitamente de José, no de código — este Runner no
toma partido, sólo deja los puntos de inserción listos:

- **§14.1 — ¿Aplica `AUTHORITY_BOUNDARY.md` §1 a la Superficie 0?** Ver
  "Fase 0" arriba. Condiciona directamente cómo se implementa
  `phase0-generic-browser.ts`.
- **§14.3 — Landing pública / punto de entrada sin cuenta.** Sin esto
  confirmado, el paso 00c (descarga del instalador) no tiene forma de
  descubrir un `releaseId` real desde la UI.
- **§14.4 — ¿Vale la pena una Capa 0 de observabilidad dedicada para Fase
  0?** Hoy esa fase no tiene ninguna capa de diagnóstico propia — un
  eventual `phase0-generic-browser.ts` funcional tendría que apoyarse en
  las respuestas HTTP directas del backend nada más, salvo que se decida
  construir algo mejor.

---

## Setup

```bash
cd synapse-runner
npm install
npx playwright install chromium   # si no está ya instalado
cp .env.example .env              # ajustar puertos/paths si hace falta
npm run preflight                 # chequeos de entorno standalone
npm test                          # preflight + suite completa
```

Requisitos para que la suite corra de punta a punta:
- BloomNucleus corrió al menos una vez en esta máquina en modo desarrollo
  (para que exista `<base_dir>/config/profiles.json` con un perfil maestro
  — ver "Resolución del punto 7" más abajo).
- `brain synapse host` corriendo (Capa 4 / paso 06-contingencia depende del
  socket TCP `127.0.0.1:5678`).
- El debug panel / EventBus levantado en `ws://localhost:4124` (Capa 3).
- Chromium de Nucleus/Sentinel levantado con `--remote-debugging-port=0`.
  Tras el click de Identity, el Runner lee el puerto asignado en
  `DevToolsActivePort` dentro del `paths.user_data` del `ignition_spec.json`
  del perfil `master_profile` indicado por `nucleus.json`.

---

## Resolución del punto bloqueante (Sección 7, punto 7)

> **Nota de transparencia (añadida al incorporar Fase 0):** el Requerimiento
> Integrado (§1 y §12.6) sigue listando este punto como *"aún sin
> confirmar"* / *"sigue sin confirmarse"*, heredado tal cual del dossier
> original — esa integración fue una investigación separada de Fase 0
> server-side que explícitamente **no re-verificó** los hallazgos de Fases
> 1-4 (su propia regla de precedencia, §0: *"Ningún hallazgo de las Fases
> 1-4 fue re-verificado en esta integración"*). La resolución de abajo sí
> viene de leer el código real (`profile_create.py` y los 4 `*_generator.py`)
> en una sesión anterior de este mismo proyecto `synapse-runner`, y sigue
> vigente — no hay contradicción real, sólo dos documentos que no se
> vieron entre sí. Si en el futuro se re-verifica esto desde cero, avisar
> para reconciliar ambas fuentes.

> *"Confirmar si `brain/core/profile/web/templates/{companion,discovery,synapse-simulator}/`
> y `installer/cortex/extension/` se sincronizan por un paso de build
> automático o manual."*

**Resuelto por lectura de código** (no por build script tradicional — no
hay ninguno; `build-all.py`/`package.json` no contienen lógica de sync de
templates). Dos mecanismos DISTINTOS, con dos "fuentes de verdad" DISTINTAS:

1. **`templates/{discovery,companion,synapse-simulator,landing}/` →
   siempre en sync, automáticamente, con el runtime.** No es un build:
   es una copia Python **verbatim** (`shutil.copy2`, sin transformación)
   que corre en `brain/core/profile/profile_create.py::_generate_profile_pages()`
   **cada vez que se crea un perfil**, invocando a
   `brain/core/profile/web/{companion,discovery,synapse_simulator,landing}_generator.py`.
   Confirmado leyendo esos 4 generadores — todos copian la misma lista
   fija de archivos estáticos, sin modificarlos.

2. **`installer/cortex/extension/{background.js, background-companion.js,
   manifest.json, content.js, protocols/*.json}` → llegan al perfil por un
   camino DISTINTO y potencialmente desactualizado.** `build-all.py::build_cortex()`
   empaqueta ese directorio en un `.blx` (`installer/native/bin/cortex/`)
   para distribución. En una instalación de desarrollo, el `bin/extension`
   base vive en `<BloomNucleus base_dir>/bin/extension` (resuelto por
   `brain/shared/paths.py::Paths`, replicado en `src/config/bloom-paths.ts`),
   y `profile_create.py::_copy_extension_to_profile()` lo clona
   (`shutil.copytree`) al perfil maestro. **Este segundo camino puede estar
   desincronizado del repo actual** si el BloomNucleus instalado en la
   máquina no fue reconstruido/reinstalado desde el último cambio en
   `installer/cortex/extension/`.

**Consecuencia práctica para Playwright:** el directorio que Chrome carga
de verdad es `<base_dir>/profiles/<profile_id>/extension/` — la parte
discovery/companion/synapse-simulator SIEMPRE refleja `templates/` del repo
actual; la parte `background*.js`/`manifest.json` puede no reflejarlo.
`src/preflight/extension-parity-check.ts` compara ambas copias por hash
**antes de correr la suite** (`npm run preflight`) y avisa con un mensaje
claro si divergen, en vez de asumir sincronía.

Nota adicional descubierta durante esta resolución: el codebase tiene **al
menos 2 convenciones distintas para "base_dir"** conviviendo —
`Paths._resolve_base_directory()` (usada por `profile_create.py`, la que
importa acá) resuelve a `~/.local/share/BloomNucleus` en Linux dev (o
`$XDG_DATA_HOME/BloomNucleus`), mientras que `ExtensionManager._get_default_base_path()`
(en `brain/core/extension/manager.py`, aparentemente no usada por el flujo
de creación de perfiles) resuelve a `~/.bloom`. `bloom-paths.ts` replica
específicamente la primera (la que realmente usa `profile_create.py`).

---

## Puntos abiertos — NO bloqueantes (Sección 7 del dossier)

Los siguientes puntos de la Sección 7 **no bloquean el arranque** del
harness y se dejan explícitamente sin resolver acá, tal como pide la
consigna, en vez de asumirlos:

1. **Auditar `intent_manager.py`, `synapse_protocol.py`, `synapse_ipc_server.py` línea por línea.**
   No auditado. El Runner usa `submit.py` como caja negra vía CLI (Capa 4)
   — no depende de los internals de estos módulos.

2. **Valor exacto de `ENGINE_RESPONSE_TIMEOUT_MS`.** No extraído de
   `background-companion.js` en esta sesión. `layer2-dom-watchdog.ts` usa
   un fallback configurable (`ENGINE_RESPONSE_TIMEOUT_MS_FALLBACK`, 45s por
   defecto) — **ajustar en `.env` apenas se confirme el valor real**, o el
   watchdog puede dar falsos positivos de `silent_hang`.

3. **Selectores de `injectAndObserve()` sin verificar contra un browser
   real** (`div.ql-editor[contenteditable]`, botones por `aria-label`,
   `[data-message-author="model"]`). Fuera del control directo de
   synapse-runner (viven en `background-companion.js`, no en este
   proyecto) — pero es el punto más frágil de toda la arquitectura, y es
   exactamente el tipo de falla que la Capa 2 (`input_not_found`) está
   diseñada para detectar y diagnosticar con precisión en la primera
   corrida real, en vez de fallar con un timeout genérico.

4. **¿`synapse-simulator.html` expone una categoría de error explícita
   distinta de `sentinel`/`brain`/`synapse`?** No confirmado.
   `layer3-eventbus-ws.ts` NO filtra por categoría — reenvía cualquier
   categoría recibida al DiagnosticBus, así que si existe una categoría de
   error separada, ya va a aparecer en los bundles sin necesitar cambios de
   código.

5. **Discrepancia de documentación: `ENGINE_RESPONSE_ERROR` se emite en
   código pero no está en `knownReasons` de `companionProtocol.js` v2.0.0.**
   No es una corrección que le corresponda a este proyecto (es un fix de
   documentación en el repo principal). `layer2-dom-watchdog.ts` ya tolera
   este valor explícitamente (ver comentario `classifyFailureReason()`).

6. **Diseño formal del Submit Simulator UI-driven (Sección 2C).**
   Explícitamente fuera de alcance de este PoC — el dossier lo marca como
   iniciativa propia futura. `src/surfaces/submit-cli.ts` es el único punto
   de inserción: cuando el módulo UI-driven exista, reemplaza
   `runSubmitTestimony()` sin tocar el resto del Runner (el diagnostic bus
   ya espera el shape `cli_submit_result`).

## Puntos abiertos nuevos — de la integración de Fase 0 (Requerimiento Integrado §11/§13)

No bloqueantes, heredados sin resolver de la integración server-side (no
resueltos por esta actualización, tal como pide la consigna):

7. **Landing pública / dominio sin cuenta, y descubrimiento de `releaseId`.**
   Ver "Fase 0" y "Decisiones pendientes de José" arriba (§14.3). Bloquea en
   la práctica el paso 00c cuando la Superficie 0 deje de ser stub.

8. **Tamaño en bytes de `~/.local/share/BloomNucleus/bin`** y **cadencia de
   polling de `nucleus authority sync` en producción.** Datos pendientes de
   José (§13), sin impacto en el código de este Runner hoy.

9. **Capa 0 de observabilidad para Fase 0** (§14.4) — ver "Fase 0" arriba.
   Item de diseño futuro, explícitamente no bloqueante.

## Otras cosas sin verificar contra un browser/proceso real (no vienen de la Sección 7, surgieron al implementar)

Estos NO estaban en la lista de puntos abiertos del dossier, pero aparecieron
al escribir el harness real y se documentan acá por la misma razón — para
no asumirlos silenciosamente:

- **Puerto de `--remote-debugging-port` de Chromium**: Sentinel escribe
  `--remote-debugging-port=0` en `ignition_spec.json`; Chromium asigna el
  puerto y lo publica en `DevToolsActivePort` del directorio `paths.user_data`.
  `electron-conductor.ts::waitForDiscoveryCdpEndpoint()` espera un archivo
  actualizado tras el click y comprueba que `/json/version` responda antes de
  conectar. `Launch()` en `installer/sentinel/internal/ignition/ignition_lifecycle.go`
  todavía devuelve `9222` fijo, aunque no lee el puerto asignado; queda
  registrado para DA-0-08, sin cambiar Sentinel en esta tarea.
- **API real del bridge IPC de Conductor** (`window.onboarding` vs
  `window.electronAPI`, y la forma de suscripción a milestones —
  `electron-conductor.ts::installMilestoneBuffer()` prueba `onMilestone()`
  y `on('milestone:reached', ...)`, pero no fue confirmado contra
  `preload_onboarding.js` línea por línea.
- **Tipo de CDP Target que reporta esta build de Chrome para un Side
  Panel de extensión** (`companion-panel.ts`) — el código intenta el
  camino simple (`context.pages()`) y cae a enumeración CDP cruda
  (`Target.getTargets`), pero deja un error explícito en vez de adivinar
  si hace falta `Target.attachToTarget` manual.
- **Selectores de Discovery** (`src/config/selectors.ts`) — placeholders
  `__TODO_VERIFY__` que hacen fallar el test con un mensaje claro apenas se
  intentan usar, en vez de fallar silenciosamente contra un selector
  inventado.

**Procedimiento sugerido para la primera corrida real:** ejecutar
`npm run preflight` primero (valida entorno + parity de la extensión), después
`npm run test:headed` para ver el flujo y corregir en vivo los ítems de
arriba — cada uno fue diseñado para fallar con un mensaje que dice
exactamente qué archivo tocar.
