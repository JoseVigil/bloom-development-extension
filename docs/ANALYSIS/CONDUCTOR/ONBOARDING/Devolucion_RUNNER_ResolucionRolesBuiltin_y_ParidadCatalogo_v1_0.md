# Devolución a RUNNER — Resolución de roles builtin y paridad del catálogo TS↔Go v1.0

**De:** cowork de diseño e implementación (Backend/Authority).
**Para:** RUNNER.
**Fecha:** 2026-09-23.
**En respuesta a:** el hallazgo §4 de `Investigacion_BACKEND_Analisis_ResultadosSuite_PostCorreccion0016_v1_0.md`, que surgió de tu corrida de verificación de Invitaciones Fase A+B (`authority-invitations.spec.ts` fallaba con `authority_invitation_role_unavailable`).
**Estado:** diseñado, aprobado por Jose, implementado y verificado. Los cambios están escritos en el repo, **sin commit**. Te toca correr la verificación en la máquina real (§6).

---

## 1. Qué encontraste y por qué pasaba

En tu corrida, `createInvitation` rechazaba el rol `specialist` con `role_unavailable`. El diagnóstico se confirmó y resultó más amplio de lo que parecía:

- El motor de autorización (`propose_assignment` en `administration.ts` y `createInvitation` en `invitation-store.ts`) busca el rol a otorgar en `state.role_definitions`, que es el **estado firmado de la organización**. Nunca lo busca en la tabla global `role_definitions` de la base.
- La génesis (`initial-emission.ts`) sembraba en ese estado **sólo `master`**. `define_role` sólo acepta roles propios de la organización (`role_origin: "organization"`), así que no había ningún camino para que `specialist` u `operator` llegaran al estado de una organización.
- **Consecuencia:** ninguna organización real podía otorgar `specialist` ni `operator` a nadie, ni por invitación ni por el mecanismo normal de propose/accept. Tampoco era alcanzable en producción el permiso de Nacimiento de Agente Orbital (`agent.issuer.designate` vía `operator`).
- **Por qué nadie lo había visto:** los tests que "probaban" el otorgamiento de `specialist` (`authority-administration*.spec.ts`, `agent-issuer.spec.ts`) arman el estado inicial a mano con la evidencia de fixture de test, que acepta cualquier estado y ya traía `specialist` sembrado. Tu spec de invitaciones fue el primero en pasar por una génesis real y después intentar otorgar `specialist`.

Además, la tabla global de la base **no puede** ser la fuente del motor. Nucleus verifica sin conexión, sólo con lo que viene en el estado firmado. Tanto TypeScript (`normalizeState`) como Go (`validateProjection`) exigen que toda asignación apunte a una definición presente en el mismo estado.

## 2. Qué se decidió

Documento de diseño: `Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md` (`ANALYSIS/BACKEND/ROLES/`). Se evaluaron tres alternativas más una cuarta, y **Jose aprobó la Alternativa 4: "reconciliación determinista del catálogo builtin en los puntos de producción de estado"**. Una única función pura (`withBuiltinCatalog`) agrega al estado los roles builtin que falten, tomados de las constantes del código, sin modificar nada de lo que ya existe. Reglas:

- **R1:** todo estado que el Backend **produce** (la génesis y cada emisión administrativa) contiene el catálogo builtin completo.
- **R2:** el catálogo es **código** (`emission.ts`, espejo de `roles.go`), nunca la tabla de la base ni un input del caller. La fila de `master` en la base queda sólo como interruptor de activación de la génesis.
- **R3:** la regla se aplica al producir estado, **nunca al leerlo o validarlo**, para no invalidar emisiones históricas.
- **R4:** ninguna guarda de otorgamiento cambia (`grantable`, `selfGrant`, `scopeVerified`). Que un rol esté disponible no significa que se pueda otorgar.
- **R5:** la génesis sigue siendo determinista y con un único fundador asignado como `master`. Sólo cambia "exactamente una definición de rol" por "exactamente el catálogo builtin".

## 3. Qué se implementó (pasos 1-5)

| Archivo | Cambio |
|---|---|
| `backend/src/authority/emission.ts` | `BUILTIN_ROLE_CATALOG`, la única fuente del contenido de los builtin, más la función `withBuiltinCatalog(state)`. `normalizeState` usa el mismo catálogo, sin cambiar su lógica. |
| `backend/src/authority/administration.ts` | Al entrar a `evaluateAdministration`, el estado se reconcilia con el catálogo. Así cualquier comando (propose, accept, suspend…) evalúa y emite con los tres builtin. |
| `backend/src/authority/invitation-store.ts` | `createInvitation` valida el rol pedido contra el estado reconciliado, como vista de sólo lectura. No persiste nada. |
| `backend/src/authority/initial-emission.ts` | El estado v1 se arma con el catálogo completo. `activeMaster` usa la fila de la base sólo como interruptor: si falta, está inactiva o contradice el catálogo, devuelve `master_role_unavailable`. |
| `backend/src/authority/emission-store.ts` | La guarda canónica de v1 exige `role_definitions` = catálogo builtin exacto, más **una** asignación `master`. Las demás condiciones quedan igual. |

**Efecto práctico:** una organización nueva nace con `master`, `specialist` y `operator` definidos. Las organizaciones existentes reciben las definiciones faltantes en su próxima emisión administrativa (en el delta aparecen sólo dos *upsert*: `operator` y `specialist`), sin migración.

## 4. Paso 0 — divergencia del rol `master` entre TypeScript y Go

Durante el diseño apareció un hallazgo lateral grave: el `master` de Go (`roles.go`) tenía **13** permisos, porque incluye `create_project` desde el encargo de Mapeo Gravity. El de TypeScript tenía **12**. Lo **verificamos ejecutando**: Go rechazaba el estado v1 real del Backend con `built-in permissions contradict catalog`. O sea, **Nucleus rechazaba toda emisión real**.

- Primero se evaluó sacar `create_project` de Go. Se descartó después de correr los tests: `create_project` es el requisito del cutover a `remote_enforced` ("principal canónico único con `create_project`"). Sin él, `nucleus authority sync` corta con `remote_identity_ambiguous` antes de la entrega del mandate. Ese cambio **no se aplicó**.
- **Decisión final de Jose:** agregar `create_project` al `master` v1 de TypeScript, para que quede idéntico a Go.
  - `emission.ts`: `master` pasa a 13 permisos.
  - Nueva migración **`backend/migrations/0019_authority_master_create_project.sql`**: actualiza la fila global de `master` en la base (sembrada por `0013` con 12).
  - `installer/nucleus/internal/authority/roles_test.go`: nuevo `TestBuiltinCatalogMatchesBackend`, que falla si los catálogos vuelven a separarse. **`roles.go` no se tocó.**
- **Consecuencia aceptada:** una emisión guardada antes de este cambio (con `master` de 12) ya no decodifica y cae en `recovery_required`. Ningún ambiente tiene emisiones reales que conservar; **la D1 local hay que resetearla** (ver §6).

## 5. Cambios en tests que te conviene conocer

- **Nuevos:**
  - 6 casos de reconciliación en `authority-administration.spec.ts`;
  - organización existente con sólo `master` → delta con dos *upsert*, en `authority-administration-store.spec.ts`;
  - guarda canónica de v1 con 6 casos de rechazo, en `initial-emission.spec.ts`;
  - **(a2) en `authority-invitations.spec.ts`**: génesis real → membership → `specialist` → accept, todo por HTTP. Es el test que faltaba.
- **`authority-invitations.spec.ts` (b) y (c):** el defecto estaba en el test. Sembraban roles personalizados con un `INSERT` en la tabla global, que nunca llega al estado firmado. Ahora usan el comando real `define_role`, con un helper nuevo `defineOrgRole`. Lo que cada test afirma no cambió.
- **Fixtures de `master`:** en 7 specs pasan a 13 permisos. En `authority-snapshot-route.spec.ts` el fixture tenía **11**, un catálogo todavía más viejo. **Esa era la causa del `authority_invalid_emission` de "*delivers an administrative membership/grant/revocation journey to Go*"**, una de las dos fallas que figuraban como "aisladas y sin relación" en tu corrida. Queda resuelta.
- `authority-genesis.spec.ts`, `tenant-genesis.spec.ts` y `authority-genesis-result.spec.ts` ahora cargan `0019` en su `loadMigrations`.

## 6. Qué tenés que correr y qué esperar

Todo se verificó en una copia aislada del repo, con Miniflare/D1 reales y Go 1.24, porque el shell de la máquina de Jose no arrancó en la sesión. Hace falta confirmarlo en la máquina real:

```bash
# 0. Resetear la D1 local (las emisiones viejas con master de 12 permisos ya no decodifican)
#    — borrar el estado local de wrangler/D1 o las filas de authority_emissions/_heads.
cd backend
npm run db:migrate:local      # debe aplicar 0019 limpio
npm run typecheck
npm test
cd ../installer/nucleus
go test ./internal/authority/... ./internal/governance/...
```

**Resultado esperado**, que es el obtenido en la copia aislada:

| Comando | Esperado |
|---|---|
| `db:migrate:local` | `0019` aplica sin error |
| `typecheck` | los mismos 111 errores de siempre (sólo tipos `node:*`/`ImportMeta`), ninguno nuevo |
| `npm test` | **293 pasan / 11 fallan** (en la línea de base eran 27 fallas) |
| `go test` (authority + governance) | todo en verde |

**Las 11 fallas que quedan son preexistentes y conocidas; ninguna la introduce este cambio:**
- **10** en `authority-genesis.spec.ts` y `tenant-genesis.spec.ts`: el gap de arnés ya identificado (no cargan `0017_authority_genesis_result.sql`). Lo verificamos en una copia descartable: agregando `0017` a esos dos specs, los 12 tests pasan. La corrección sigue sin aplicarse porque había quedado fuera de alcance.
- **1** en `authority-trust.spec.ts` > "*exchanges freshly signed trust and actor artifacts with Go*" (`TestTrustManifestBackendInterop`, "missing or unknown wire property"). Ya fallaba antes y no está relacionada.

**Qué cambió respecto de tu corrida anterior:**
- los 9 de invitaciones que fallaban están en verde;
- se agregó un 14.º test (a2);
- el journey administrativo contra Go pasa;
- de los specs "*with Go*" sólo queda rojo el de trust.

Si los timeouts de 5000 ms que viste en `authority-administration-store.spec.ts` e `initial-emission.spec.ts` vuelven a aparecer en la suite completa, corré esos specs en aislamiento. En la copia aislada pasaron todos, así que la hipótesis de contención de recursos sigue siendo la más probable.

## 7. Qué queda abierto

- **Fase C de invitaciones (redención):** ya **no** la bloquea el vacío de roles builtin. Sigue bloqueada por el `invitationCommitGuard` (`Cierre_Implementacion_FaseAB_Invitaciones_y_Correccion_ActorSintetico_v1_0.md` §2) y requiere autorización de Jose.
- Aplicar el fix de arnés de `0017` en los dos specs de génesis. Es trivial y está verificado, pero requiere decisión.
- Diagnosticar `TestTrustManifestBackendInterop`.
- Menor: Go reserva como id de rol de organización sólo `master`/`specialist`, sin `operator`.

## 8. Documentos de referencia

En `ANALYSIS/BACKEND/ROLES/`, en el proyecto y en `docs/` del repo:
- `Encargo_Diseno_Resolucion_AsignacionRolesBuiltin_v1_0.md`: el encargo.
- `Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md`: el diseño y la decisión.
- `Cierre_Implementacion_ReconciliacionCatalogoBuiltin_Pasos1a5_v1_0.md` (v1.1): el cierre técnico completo.
