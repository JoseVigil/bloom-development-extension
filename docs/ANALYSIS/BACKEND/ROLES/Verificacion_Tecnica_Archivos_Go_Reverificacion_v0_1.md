# Verificación técnica — archivos Go citados de segunda mano (§6 de Encargo v0.3)

**Tipo:** Re-verificación directa contra el repo real, no lectura de segunda mano. Responde al pedido
de Génesis Control de abrir este hilo ya, en paralelo, sin esperar a que se cierre la custodia de la
clave efímera.
**Fecha:** 2026-09-12
**Archivos leídos directamente esta vez:** `installer/nucleus/internal/authority/decision.go` (completo,
215 líneas), `identity.go` (completo, 121 líneas), `actor_proof.go` (completo, 124 líneas), `roles.go`
(sección relevante), `snapshot.go` (definiciones de struct relevantes); `temporal_client.go` (grep
dirigido sobre `RunID`/`WorkflowID`).

---

## H1 — El archivo de `RoleAssignment` y el scope enforcement no estaban "no identificados": es `snapshot.go`

`snapshot.go:49` define `type RoleAssignment struct` con campo `Scope Scope`. El enforcement de scope al
evaluar autorización vive en `decision.go` (`DecisionEvaluator.Evaluate`, línea 133), no en un archivo
aparte. **Cierra la pregunta abierta de v0.2/v0.3 §6.1** — no hace falta seguir buscando un archivo
adicional no identificado, ya está dentro de los cinco ya listados.

## H2 — El "cubrir" del scope de `scoped_admin` no existe en código: es igualdad exacta, no cobertura [G]

`decision.go:215`: `func scopeIncludes(grant, requested Scope) bool { return grant == requested }`.

Es comparación de struct completo (`Type` + `ID` iguales), no una relación de contención jerárquica.
El Encargo v0.2 §2 dice literalmente que Backend debe validar "que el scope del `role_assignment` de
`scoped_admin` **cubra** el `project_id` pedido" — esa palabra ("cubrir") no tiene hoy ningún soporte
en el evaluador real. Con el código tal como está:

- Un `role_assignment` de `scoped_admin` con `Scope{Type: "project", ID: "proj-123"}` sólo autoriza
  una `DecisionRequest` con `Scope{Type: "project", ID: "proj-123"}` — exacto, sin ambigüedad, esto sí
  funciona como se espera.
- Pero **no está resuelto qué scope debe llevar la `DecisionRequest` cuando quien pide es `master`**,
  si `master` se asigna típicamente con `Scope{Type: "organization", ...}`. Si la petición de
  `IssuerDesignation` arma su `DecisionRequest` con scope de proyecto (porque el nacimiento del agente
  es por proyecto), un `master` con asignación de organización **no matchea** por esta igualdad
  exacta — quedaría bloqueado, contradiciendo el propósito central del Encargo (que el founder solo,
  vía `master`, pueda autorizar agentes).

**No es un bug — es una decisión de diseño que este documento no puede tomar por su cuenta.** Antes de
escribir código hace falta definir explícitamente: ¿la `DecisionRequest` para `agent.issuer.designate`
se arma con scope de organización cuando el emisor es `master` (y de proyecto sólo para
`scoped_admin`)? Eso es coherente con el código tal como es, pero hoy no está dicho en ningún
documento de esta línea — queda como pendiente explícito, no asumido.

## H3 — Los roles built-in están hardcodeados en Go, no sólo en una migración de SQL [G]

`roles.go`: `RoleMaster`/`RoleSpecialist` son constantes; `BuiltinRoles` es un `map[string][]string`
fijo en código; `ValidateRoleDefinition` rechaza cualquier `RoleID` de origen `"builtin"` que no esté
en ese mapa (`"unknown built-in role or version"`). **La tabla de archivos del §5 de v0.3 sólo lista
una migración SQL nueva para dar de alta `operator`/`scoped_admin`** — eso no alcanza. Hace falta
también modificar `roles.go` (agregar entradas a `BuiltinRoles` y a `PermissionsV1`) — es un cambio de
código Go, no sólo de datos. Corrección concreta a la tabla de impacto, no un hallazgo que bloquee el
diseño.

## H4 — Los permisos con wildcard (`vault.*`, `executor.*`) están prohibidos por código

`ValidateRoleDefinition` rechaza cualquier permiso que contenga `*` (`"permission wildcards
forbidden"`). Los documentos de investigación describen a `operator` (ex-`delegate`) informalmente
como `vault.*`/`executor.*` — eso es agrupación en prosa, no sintaxis real. El permiso set real, ya
existente en `PermissionsV1`, es la lista enumerada: `vault.key.read`, `vault.key.write`,
`vault.key.delete`, `executor.command.execute`, `executor.filesystem.write`, `executor.network.access`,
`executor.change.promote`. Sin impacto en el diseño — sólo hay que enumerar, no inventar sintaxis
nueva, al momento de escribir la migración/código.

## H5 — `identity.go` (LocalIdentity), verificado limpio, sin sorpresas

Confirma exactamente lo ya asumido: keypair Ed25519 por instalación, persistido en JSON en disco,
`InstallationID` como UUID v4 validado a mano. Ningún ajuste necesario al diseño de v0.1-v0.3 respecto
a este archivo.

## H6 — Ya existe en el repo un patrón de identidad efímera de actor: `actor_proof.go` [G] — el más importante de esta ronda

`actor_proof.go` implementa, ya hoy, un mecanismo casi exactamente equivalente a lo que
`OrbitalExecutionContext` se propone construir desde cero:

- `ActorProof`: keypair Ed25519 efímero, atado a `OrganizationID` + `InstallationID` + `Audience`.
- Challenge-response (`ActorChallengeRequest` → `ActorChallengeApproval`) para probar posesión de la
  clave privada.
- `ActorAttestation`: afirmación firmada, con vigencia (`IssuedAt`/`ExpiresAt`), verificada contra un
  `VerifiedTrustManifest`, con dos dominios de firma ya definidos y en uso:
  `BLOOM-AUTHORITY-ACTOR-PROOF-v1` y `BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1`.

Esto no estaba visible en ningún documento anterior de esta línea — nadie había leído este archivo
directamente hasta ahora. **Pregunta de diseño real y abierta, no cosmética:** ¿`OrbitalExecutionContext`
debería extender o reutilizar `ActorProof`/`ActorAttestation` en lugar de definir un tipo paralelo con
un dominio de firma nuevo (`BLOOM-ORBITAL-CONTEXT-ATTESTATION-v1`, decidido en la sesión anterior)? Las
dos piezas resuelven el mismo problema (identidad de actor efímera, atada a organización + instalación,
con expiración) con vocabulario casi idéntico. Esto amerita una decisión explícita de José antes de
escribir código — no se resuelve en este documento.

## H7 — Corrección menor de ubicación: `BLOOM-INSTALLATION-AUTH-v1` es real, pero vive en `sync.go`

Confirmado que existe (`sync.go:20`), no en `identity.go` como se había asumido implícitamente. No
afecta la validez del diseño de reutilizar ese dominio para `LocalIdentity` — sólo corrige dónde está
declarado.

## H8 — `temporal_client.go`: no se encontró una función genérica de "verificar que este `run_id` esté
## activo ahora" [G]

El archivo tiene `WorkflowID`/`WorkflowRunID` cableados para un caso de uso específico ya existente
(workflows de ciclo de vida de perfil), no una función reutilizable de verificación de estado de un
`run_id` arbitrario. El paso del Encargo "Nucleus verifica... estado real de Temporal por `run_id`
exacto" probablemente requiere código nuevo acá, no reutilización — a confirmar que no exista ese
helper en otro archivo de `orchestration/temporal/` no revisado todavía, antes de asumir que hay que
construirlo desde cero.

---

## Qué queda cerrado y qué sigue abierto

**Cerrado por esta re-verificación:** H1 (archivo de `RoleAssignment` identificado), H5 (identidad
local verificada sin cambios), H7 (corrección de ubicación, sin impacto).

**Abierto, y ahora más preciso que antes:** H2 (semántica real de scope, decisión de diseño pendiente),
H3 (corrección a la tabla de archivos — cambio de código Go además de migración), H6 (pregunta de
diseño mayor: reutilizar `ActorProof`/`ActorAttestation` o mantener `OrbitalExecutionContext` como tipo
paralelo), H8 (a confirmar si hace falta código nuevo de verificación de Temporal).

**Sin tocar en este documento, sigue exactamente como estaba:** custodia de la clave efímera durante el
turno (§8.2 de v0.1, ítem 2 del §6 de v0.3) — es un hilo de decisión, no de verificación de código, y
no se avanzó acá.

**Conclusión práctica:** el hilo de re-verificación técnica, lejos de ser un trámite, encontró un
hallazgo de diseño real (H6) y una corrección de mecanismo real (H2) que v0.3 no podía prever sin leer
estos archivos directamente. Con esto, de los dos bloqueantes que listaba v0.3 §6, éste (re-verificación)
queda sustancialmente avanzado pero no cerrado — H2 y H6 son decisiones que le corresponden a José, no
al hilo técnico en sí.
