# Investigación — ¿La reconciliación de identidad (Sovereign Tenant Fase 5) desbloquea el mapeo de `create_organization`? v0.1

**Autor:** Control
**Fecha:** 2026-09-17
**Estado:** Investigación cerrada — conclusión negativa para la pregunta original, con un hallazgo colateral real y accionable.

---

## §0 — Qué responde este documento

Con Sovereign Tenant Fase 5 cerrado (`Tablero_Seguimiento_Consolidado_v0_2.md` §Z.22), la reconciliación de
identidad que bloqueaba el mapeo de `create_organization` — descrita en
`Propuesta_Diseno_Mapeo_CreateOrganization_v0_1.md` §1 como "Sistema A ↔ Sistema B sin reconciliar" — ya está
construida y verificada (`ReconcileCanonicalOrganization`). La pregunta de José, tal como quedó planteada al
cerrar Fase 5: ¿ese prerrequisito resuelto habilita ahora mapear `create_organization` a `DecisionEvaluator`?

**Respuesta directa: no.** La reconciliación resuelve el problema de identidad (§1 de la Propuesta original),
pero `create_organization` está bloqueada por un problema estructural distinto y más duro — ausencia total de
`Scope` evaluable — que ninguna reconciliación de identidad puede resolver porque no es un problema de qué
valor comparar, sino de que no existe ningún valor que construir. Esto lo confirmo releyendo el código real,
no repitiendo la conclusión de la Propuesta anterior.

Sí encontré, buscando esto, un hallazgo colateral real y distinto: la Propuesta original ya había señalado que
el mapeo de `create_project` (cerrado en la ronda P3) compara contra el id equivocado — sigue siendo cierto
hoy, y ahora, con la reconciliación ya construida, **es reparable**. Ver §3.

## §1 — Por qué `create_organization` sigue sin Scope, verificado en el código actual

`AuthorizeGravityNodeCreation` es el único punto de entrada tanto para la decisión local real como para la
evaluación shadow observacional (`internal/governance/decision/decision.go:105-130`). Para
`OpCreateOrganization`, `authorizeGravityNodeCreationLocal` rechaza explícitamente cualquier `parentID`:

```go
// decision.go:146-148
if operation == OpCreateOrganization && (parentID != nil || parentObservedVersion != nil) {
    return GovernedCreationDecision{}, errors.New("create_organization does not accept an explicit parent or parent version")
}
```

Esto no es una omisión de la capa de autorización — está reforzado también en la capa de escritura del nodo
(`internal/gravity/governed_creation.go:35-38,71-81`): la operación es un evento único por raíz de Gravity
(`ErrOrganizationExists` si ya existe un nodo `ORGANIZATION`), y su padre está fijo al `NUCLEUS` canónico, no a
otro `ORGANIZATION` ni a nada que dependa de identidad remota:

```go
// governed_creation.go:71-74
case authoritydecision.OpCreateOrganization:
    if node.ParentID == nil || *node.ParentID != nucleus.NodeID {
        return fmt.Errorf("%w: ORGANIZATION parent must be the canonical NUCLEUS", ErrInvalidGovernedDecision)
    }
```

La consecuencia para una eventual evaluación remota está en `shadowDecisionRequest`
(`internal/governance/decision/shadow_activation.go:95-98`):

```go
request.PrincipalID = view.Owner.Subject
if parentID != nil {
    request.Scope = authority.Scope{Type: "organization", ID: *parentID}
}
return request
```

Para `create_organization`, `parentID` es siempre `nil` por construcción (línea arriba) — así que `request.Scope`
nunca se asigna y queda en su valor cero: `Scope{Type: "", ID: ""}`. `DecisionEvaluator.Evaluate` rechaza esto
antes de llegar a ningún chequeo de identidad u organización:

```go
// authority/decision.go:86-89
if _, ok := ScopeTypes[request.Scope.Type]; !ok || request.Scope.ID == "" {
    decision.Reason = "scope_invalid"
    return decision
}
```

**Conclusión de §1:** si hoy se agregara `"create_organization"` a `PermissionsV1` sin ningún otro cambio, la
evaluación remota nunca llegaría a comparar organización alguna — devolvería `scope_invalid` siempre, para
cualquier instalación, para siempre. No es un mapeo parcial ni degradado — es un mapeo permanentemente inerte,
que además sería engañoso (parece soportado, nunca decide nada real). La reconciliación de identidad no cambia
esto en absoluto: el problema no es "qué id comparar", es que la operación, tal como está modelada, no tiene
scope que comparar. Confirma con más precisión lo que la Propuesta original ya sostenía en su §2 con un
argumento distinto (orden temporal) — dos motivos independientes, no uno solo, bloquean el mismo mapeo.

### §1.1 — El problema de orden temporal de la Propuesta original también sigue intacto

Sin necesidad de repetir la evidencia completa (`Propuesta_Diseno_Mapeo_CreateOrganization_v0_1.md` §2): un
`state.json` evaluable requiere una instalación ya registrada y vinculada (`RegisterInstallation` +
`FetchAndVerifyTrustManifest`, `authority_command.go` caso `"sync"`), y `ReconcileCanonicalOrganization` corre
**dentro** de ese mismo `"sync"`, después de que el `Binding` ya se aceptó. El nodo Gravity `ORGANIZATION`
local, en cambio, es un requisito para que exista cualquier otra cosa gobernada en ese `nucleusRoot` — no hay
ningún indicio en el código de que su creación dependa de, o pueda esperar a, un ciclo de sync ya completado.
La reconciliación llena `Organization.CanonicalID` años (en términos de secuencia, no de tiempo real) después
del punto en el que `create_organization` necesitaría evaluarse. Esto no cambió con Fase 5 — Fase 5 nunca tocó
cuándo corre `create_organization` ni cuándo corre `sync`.

## §2 — ¿Vale la pena inventar un `Scope` no-organizacional para esto?

Antes de cerrar, evalué la alternativa obvia: usar otro `ScopeType` de los ya definidos
(`organization`, `project`, `mandate`, `intent`, `resource`, `environment`) para darle a `create_organization`
un scope evaluable sin depender de una organización que todavía no existe — por ejemplo, `Scope{Type:
"environment", ID: <algo de la instalación>}`.

La descarto: `scopeIncludes` (`authority/decision.go:215`, `grant == requested`, comparación exacta de struct)
y el resto del motor de decisión están construidos alrededor de que el scope de una operación describe el
recurso sobre el que se actúa, evaluado contra asignaciones de rol que ya existen en la `Emission` aceptada —
y una `Emission` aceptada, otra vez, requiere una organización ya vinculada. Inventar un `ScopeType`
puramente sintético para esta operación no evita el problema de fondo (necesitás autoridad ya emitida para
evaluar authority sobre algo que todavía no tiene organización), sólo lo disfraza. Sería una pieza de
arquitectura nueva y no trivial (qué principal, qué rol, contra qué emisión se evaluaría "environment"), fuera
de lo que esta investigación fue a resolver. Queda descartada, no ignorada.

## §3 — Hallazgo colateral real y accionable: `create_project` sigue comparando contra el id equivocado

La Propuesta original (§1, "Consecuencia que no esperaba") ya había encontrado esto y lo dejó documentado
como ruido estructural aceptado, sin arreglo a mano en ese momento porque la reconciliación todavía no
existía. Verifiqué si seguía siendo cierto hoy, con Fase 5 ya cerrada — **sigue siendo cierto**:

`readOrganizationID` (`internal/orchestration/activities/mandate_gravity_session_activities.go:91-105`) lee
`.nucleus-governance.json` → `org_identity.org_id` — el id local `org_<timestamp>` (Sistema A). Ese valor se
pasa como `parentID` a `AuthorizeGravityNodeCreation` para `create_project`, y `shadowDecisionRequest` reusa
ese mismo `parentID` como `Scope.ID` de la evaluación remota (§1 de este documento, línea `if parentID != nil
{ request.Scope = ... }`). Pero `DecisionEvaluator.Evaluate` compara `Scope.ID` contra
`state.Binding.OrganizationID` (`authority/decision.go:90`) — el id real del Backend (Sistema B). Estos dos
nunca van a coincidir, con o sin reconciliación, **porque la reconciliación nunca toca lo que
`readOrganizationID` lee**: `ReconcileCanonicalOrganization` escribe `Organization.CanonicalID` dentro de
`.ownership.json`, no dentro de `.nucleus-governance.json`.

**Esto ya es reparable hoy**, a diferencia de `create_organization`: `shadowDecisionRequest` ya lee
`.ownership.json` completo vía `ownershipcontract.Analyze` (lo usa para `EffectiveLegacyView`,
`shadow_activation.go:87-94`) — el mismo `Analysis.Canonical.Organization.CanonicalID` que
`ReconcileCanonicalOrganization` ya puebla está a un campo de distancia, sin abrir ni parsear ningún archivo
adicional. El cambio sería, en principio, acotado a `shadow_activation.go`: construir `Scope.ID` a partir de
`analysis.Canonical.Organization.CanonicalID` cuando esté disponible (con manejo explícito para instalaciones
que nunca corrieron `sync` — `CanonicalID` sigue siendo `nil` en ese caso, y la observación seguiría
reportando algo como `state_unavailable`/`scope_invalid`, ambos ya manejados por `Evaluate()`, en vez de
`scope_outside_binding` falso). No toca `authorizeGravityNodeCreationLocal` ni la identidad del nodo Gravity
local (`parentID` sigue siendo el `org_<timestamp>` para la estructura del árbol — eso es correcto y no debe
cambiar), sólo el valor que arma el `Scope` de la evaluación remota. **No diseño esto en detalle acá** — es un
cambio real pero acotado, candidato natural a una Propuesta/Encargo corto si te interesa cerrarlo.

## §4 — Recomendación

1. **`create_organization` queda confirmado como límite permanente de diseño — con más fundamento que antes,
   no menos.** El `Encargo_Documentacion_Cierre_CreateOrganization_v1_0.md` que ya existe en el proyecto
   (Opción A, nunca ejecutado — José pidió reabrir con Opción B en su lugar, ver
   `Tablero_Seguimiento_Consolidado_v0_2.md` §Z.21) quedó desactualizado: su `NOTA` propuesta sólo cita el
   problema de identidad (ya resuelto) y el de orden temporal — no menciona el hallazgo de `Scope` vacío de
   este documento, que es el motivo más duro de los dos. Si querés cerrar esto formalmente, la `NOTA` de
   `roles.go` debería reescribirse citando los tres motivos (identidad ya resuelta y aun así insuficiente;
   orden temporal; `Scope` estructuralmente vacío) — no reusar el texto viejo tal cual. Encargo puramente
   documental, mismo alcance que el original.
2. **El hallazgo de §3 es el próximo paso con valor real.** Repararlo es lo único que haría que el
   `InstallShadow` que ya activamos en producción (§Z.20) empiece a dar señal verdadera sobre `create_project`
   en `observation.json`, en vez de `scope_outside_binding` sistemático y sin sentido. Si te interesa, el
   siguiente paso sería una Propuesta corta (no hace falta una investigación nueva, el hallazgo ya está
   acotado acá) para decidir el detalle de implementación y encargarlo.

**Sin cambios de código en esta ronda** — es investigación pura, como correspondía.
