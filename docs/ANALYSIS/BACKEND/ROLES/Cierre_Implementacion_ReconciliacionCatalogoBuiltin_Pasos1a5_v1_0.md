# Cierre de implementación — Reconciliación determinista del catálogo builtin (Paso 0 y pasos 1-5 de §4.3) v1.1

**Ejecuta:** `Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md` §4.3, pasos 1-5, aprobada por Jose el 2026-09-23.
**Fecha:** 2026-09-23.
**Estado:** **Paso 0 y pasos 1-5 implementados y verificados de punta a punta contra Go real.** Los cambios quedaron escritos en el repo, **sin commit**. v1.1 reemplaza a la v1.0, que dejaba el Paso 0 abierto.

---

## 1. Qué se cambió (código)

| Archivo | Cambio |
|---|---|
| `backend/src/authority/emission.ts` | Nuevo `BUILTIN_ROLE_CATALOG`, exportado y congelado, construido a partir de las constantes existentes `master`/`operator`/`specialist`. Pasa a ser la única fuente de TypeScript para el contenido de los builtin. `normalizeState` lo usa para sus chequeos `builtin contradiction` y `reserved role`, y lo que acepta o rechaza **no cambia**. Nueva función pura `withBuiltinCatalog(state)` que implementa R1: sólo agrega los pares `(role_id, role_version)` que falten, con `status:"active"`; nunca modifica ni quita nada; no re-agrega un builtin cuyo `role_id` tenga una revocación `role_definition`. |
| `backend/src/authority/administration.ts` | En la entrada de `evaluateAdministration`: `normalizeState(withBuiltinCatalog(normalizeState(input, org)), org)`. No hay otro cambio en el motor: `grantable`, `selfGrant` y `scopeVerified` quedan intactas (R4). |
| `backend/src/authority/invitation-store.ts` | `loadAuthorizedState` devuelve `withBuiltinCatalog(current.state)` como vista de **sólo lectura**. No se persiste nada. |
| `backend/src/authority/initial-emission.ts` | El estado v1 se arma con `withBuiltinCatalog(...)`. `activeMaster` sigue leyendo la fila global de la base, pero sólo como **interruptor de activación**: si la fila no existe, no está activa o sus permisos contradicen el catálogo compilado, devuelve `master_role_unavailable`. El contenido emitido sale siempre del catálogo compilado (R2). Consecuencia menor: el `display_name` de `master` en v1 ahora viene del catálogo ("Master") y no de la fila de la base. |
| `backend/src/authority/emission-store.ts` | Guarda canónica de v1 (R5): la condición `role_definitions.length !== 1 && role === master` pasa a ser "`role_definitions` canónicamente igual al catálogo builtin". Todas las demás condiciones (un principal, una membership, **una** asignación que referencia a `master` builtin activo en scope organización, sin revocaciones) quedan sin cambios. |

`normalizeState`, `decodeEmission` y el verificador de Go **no** cambiaron (R3): las emisiones históricas se siguen decodificando igual.

## 2. Tests

**Nuevos:**
- `authority-administration.spec.ts`, describe "builtin catalog reconciliation (R1-R4)", 6 casos:
  - otorgar `specialist` sobre un estado que sólo tiene `master`;
  - la reconciliación ocurre con cualquier comando, no sólo con otorgamientos;
  - un `specialist` suspendido se queda suspendido y no se puede otorgar;
  - un builtin revocado no se re-agrega;
  - las guardas de otorgamiento no se relajan;
  - la doble evaluación es determinista.
- `authority-administration-store.spec.ts`: una organización existente con v1 de sólo `master` emite en su próximo comando un delta con **exactamente** `upsert:role_definitions:operator` y `upsert:role_definitions:specialist`, y después el otorgamiento de `specialist` se acepta.
- `initial-emission.spec.ts`: la guarda canónica acepta el catálogo exacto y rechaza, con `initial_evidence_required`, seis casos: sólo `master`, falta un builtin, sobra un rol, un builtin alterado, una segunda asignación y una asignación que no es `master`.
- `authority-invitations.spec.ts` (a2), **el test que faltaba**: génesis real, sin fixture → `propose_membership` → `propose_assignment specialist` → `accept`, todo por HTTP.

**Modificados:**
- `initial-emission.spec.ts`: la expectativa de v1 ahora exige las tres definiciones builtin y una sola asignación.
- `authority-invitations.spec.ts` (b) y (c): **el defecto estaba en el propio test.** Sembraban roles personalizados con un `INSERT` en la tabla global `role_definitions`, que nunca llega al estado firmado (la misma confusión que dio origen al hallazgo). Ahora los definen con el comando real `define_role` por HTTP, a través de un helper nuevo `defineOrgRole`, en línea con la regla de cabecera del propio archivo ("nunca un INSERT directo"). Lo que cada test afirma no cambió.

## 3. Paso 0 — resuelto: `create_project` en `master` v1 del Backend

**Decisión de Jose (2026-09-23):** agregar `create_project` al `master` v1 de TypeScript para igualar a Go, que tiene 13 permisos. Antes se había elegido la opción "alinear Go a TS", pero se descartó después de verificarla ejecutando: sacar `create_project` de `master` bloquea el cutover a `remote_enforced`, porque el cutover exige un "principal canónico único con `create_project`" (`ownership_reconciliation.go`, `resolveCutoverPrincipal`). Con eso bloqueado, `nucleus authority sync` corta con `remote_identity_ambiguous` antes de la entrega del mandate (falló `TestAuthoritySyncWiresIdentityRegistrationTrustAndMandateDelivery`). El patch de esa opción **no se aplicó**.

| Archivo | Cambio |
|---|---|
| `backend/src/authority/emission.ts` | `master` v1 = 13 permisos, idéntico a `roles.go` `BuiltinRoles[RoleMaster]`. Sale del mismo `BUILTIN_ROLE_CATALOG`. |
| `backend/migrations/0019_authority_master_create_project.sql` (nueva) | `UPDATE` de la fila global `master` v1 (sembrada por `0013` con 12 permisos). Sin esto, `activeMaster` devuelve `master_role_unavailable`. Sólo datos, sin DDL. |
| `installer/nucleus/internal/authority/roles_test.go` | Nuevo `TestBuiltinCatalogMatchesBackend`: fija la paridad byte a byte con el catálogo del Backend. **`roles.go` no cambia.** |
| Fixtures de test del Backend | Las constantes `master` de 7 specs pasan a 13 permisos. `authority-snapshot-route.spec.ts` tenía un `master` de **11**, un catálogo todavía más viejo: esa era la causa, hasta ahora sin diagnosticar, del `authority_invalid_emission` del test "*administrative … journey to Go*". Los 3 specs de génesis cargan `0019`. |

**Consecuencia aceptada:** una emisión persistida antes de este cambio (con `master` de 12) ya no decodifica y cae en `recovery_required`. Según Jose, ningún ambiente tiene emisiones reales que conservar. En dev local hay que resetear la base de D1.

## 4. Verificación

Corrí todo en una copia aislada del repo con `backend/` e `installer/nucleus/` juntos, usando `npm ci`, Miniflare/D1 reales y el toolchain de Go 1.24 (los specs "*with Go*" sí ejecutan Go). El shell del equipo de Jose no arrancó en esta sesión.

**Prueba decisiva del Paso 0:** el estado v1 real de génesis que produce TypeScript (`master` 13 + `operator` + `specialist`, una asignación) pasa por `authority.StateDigest` de Nucleus sin error, **y el digest es idéntico** en TypeScript y en Go. Antes del cambio, Go lo rechazaba con `built-in permissions contradict catalog`.

| | Línea de base | Final |
|---|---|---|
| `vitest run`, suite completa (con Go disponible) | 27 fallan en la copia sin Go; con Go, 2 fallan sólo en los specs de interop | **11 fallan / 293 pasan** |
| Specs "*with Go*" (interop, snapshot-route, sync-route, evidence-route, trust) | 2 fallan (trust + journey administrativo `authority_invalid_emission`) | **1 falla** (trust, preexistente) |
| Specs de la zona tocada | 9 fallan (invitaciones, `role_unavailable`) | **todos en verde** (incluidos los 14 de invitaciones) |
| `go test ./internal/authority/... ./internal/governance/...` | verde | **verde** (con el test de paridad nuevo) |
| `tsc --noEmit` | 111 errores | 111 (los mismos; sólo tipos `node:*`/`ImportMeta` preexistentes) |

Las 11 fallas que quedan son todas preexistentes y ajenas a este cambio:
- **10** de `authority-genesis.spec.ts`/`tenant-genesis.spec.ts`: es el gap de arnés (falta `0017`), ya documentado y no aplicado por decisión previa. **Lo verifiqué:** en una copia descartable con `0017` agregado, los 12 tests de esos dos specs pasan con estos cambios.
- **1** de `authority-trust.spec.ts` > "*exchanges … with Go*": es el `TestTrustManifestBackendInterop` ya registrado en `Investigacion_BACKEND_Analisis_ResultadosSuite_PostCorreccion0016_v1_0.md` §2. Falla igual en la línea de base.

Para correr en la máquina de Jose: `cd backend && npm run db:migrate:local && npm run typecheck && npm test`, y `cd installer/nucleus && go test ./internal/authority/... ./internal/governance/...`.

## 5. Pendientes que no bloquean y quedan fuera

- Aplicar el fix de arnés `0017` en los dos specs de génesis. Es trivial y está verificado arriba, pero su aplicación había quedado explícitamente fuera de alcance.
- Diagnosticar `TestTrustManifestBackendInterop`.
- Divergencia menor: Go reserva como id de rol de organización sólo `master`/`specialist`, sin `operator`.
- Fase C de invitaciones: ya no la bloquea el vacío de roles builtin. Sigue bloqueada por el `invitationCommitGuard`.
