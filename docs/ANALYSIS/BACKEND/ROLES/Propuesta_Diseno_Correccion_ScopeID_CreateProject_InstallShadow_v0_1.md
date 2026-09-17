# Propuesta de Diseño (corta) — Corregir el `Scope.ID` de la evaluación shadow de `create_project` v0.1

**Autor:** Control
**Fecha:** 2026-09-17
**Basado en:** `Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md` §3 (hallazgo colateral).
**Estado:** Propuesta — un solo punto de decisión real, el resto es directo.

---

## §0 — Qué resuelve

`InstallShadow` está activo en producción desde §Z.20 (`Cierre_Implementacion_Activacion_InstallShadow_v1_0.md`),
puramente observacional. Hoy, cada evaluación shadow de `create_project` compara contra el id equivocado y
siempre va a devolver `scope_outside_binding` — no porque haya una organización real fuera de scope, sino
porque `Scope.ID` nunca es el id que `DecisionEvaluator.Evaluate` en verdad conoce. `observation.json` se está
llenando de ruido estructural, no de señal. Esto era esperable cuando se activó InstallShadow (la reconciliación
todavía no existía) y quedó documentado como aceptado en su momento; ahora que Sovereign Tenant Fase 5 ya
reconcilia identidad de verdad, es reparable.

## §1 — Causa exacta, confirmada en código

`shadowDecisionRequest` (`internal/governance/decision/shadow_activation.go:95-98`) arma el `Scope` de la
evaluación remota reusando el mismo `parentID` que el caller le pasa a `AuthorizeGravityNodeCreation` para la
decisión **local**:

```go
if parentID != nil {
    request.Scope = authority.Scope{Type: "organization", ID: *parentID}
}
```

Ese `parentID`, para `create_project`, es `readOrganizationID()`
(`internal/orchestration/activities/mandate_gravity_session_activities.go:91-105`) — el `org_<timestamp>` local
de `.nucleus-governance.json` (Sistema A). `DecisionEvaluator.Evaluate` compara `Scope.ID` contra
`state.Binding.OrganizationID` (`authority/decision.go:90`) — el `organizationId` real del Backend (Sistema B).
Nunca van a coincidir: son dos espacios de identidad distintos, y nada en el camino de `create_project` los
reconcilia.

**Confirmado que el dato correcto ya está disponible sin abrir ningún archivo nuevo:** `shadowDecisionRequest`
ya parsea `.ownership.json` completo (`ownershipcontract.Analyze`, línea 87) para resolver `EffectiveLegacyView`.
Verifiqué `ownershipcontract.Analyze` (`decode.go:33-63`): cuando `.ownership.json` ya está en forma canónica
(tiene la clave `"schema"` — cierto para cualquier instalación donde `create_project`/`create_organization` ya
puedan correr, porque ambas dependen de que la migración canónica ya haya pasado), `Analyze` devuelve
`Analysis{Canonical: document}` con el `*Document` completo. `document.Organization.CanonicalID` es exactamente
el campo que `ReconcileCanonicalOrganization` puebla con el id real (Sistema B) desde Fase 5. No hace falta un
segundo parseo ni un import nuevo — el valor ya está en memoria en el punto donde `Scope` se arma.

## §2 — Cambio propuesto

Acotado a `shadow_activation.go`, función `shadowDecisionRequest`. En vez de derivar `Scope.ID` de `parentID`
(que sigue siendo, correctamente, el id local usado para la estructura del árbol de Gravity —
`authorizeGravityNodeCreationLocal` no se toca), leerlo de `analysis.Canonical.Organization.CanonicalID`:

```go
request.PrincipalID = view.Owner.Subject
if analysis.Canonical != nil && analysis.Canonical.Organization.CanonicalID != nil &&
    *analysis.Canonical.Organization.CanonicalID != "" {
    request.Scope = authority.Scope{Type: "organization", ID: *analysis.Canonical.Organization.CanonicalID}
}
return request
```

`parentID` deja de usarse para construir `Scope` (sigue llegando como parámetro de la función — no cambia la
firma, sólo dónde se lee cada dato).

**Efecto para una instalación que nunca corrió `sync`** (nunca hubo reconciliación, `CanonicalID == nil`):
`request.Scope` queda en su valor cero, igual que hoy pasa siempre para `create_organization` — `Evaluate()`
devuelve `scope_invalid`. Es un cambio de calidad de señal, no una regresión: hoy esa misma instalación reporta
`scope_outside_binding` (falso — sugiere una decisión remota real de denegación) en vez de `scope_invalid`
(honesto — "no hay identidad reconciliada todavía para evaluar esto"). Ninguna de las dos gatea nada; `Evaluate`
sigue siendo puramente observacional acá, sin cambios.

## §3 — Único punto de decisión real para vos

Ninguno, en rigor — no encontré una alternativa de diseño competitiva. La incluyo solo para que quede
explícito y puedas objetar si ves algo que yo no: **¿confirmás que `Scope.ID` debe venir de
`Organization.CanonicalID` reconciliado (Sistema B) y no del `org_<timestamp>` local (Sistema A, lo que usa hoy)?**
Es la lectura directa de qué compara `Evaluate()` (`state.Binding.OrganizationID`, siempre Sistema B) — no veo
otra opción coherente con lo que la propia función necesita comparar.

## §4 — Fuera de alcance (explícito)

- `authorizeGravityNodeCreationLocal` / la decisión local real de `create_project` — no se toca. `parentID`
  sigue siendo el `org_<timestamp>` para la estructura del árbol de Gravity, que es correcto y no depende de
  identidad remota.
- `readOrganizationID` / `mandate_gravity_session_activities.go` — no se toca. El id local que usa para la
  estructura del árbol sigue siendo el correcto para ese propósito.
- `DecisionEvaluator.Evaluate`, `ScopeTypes`, `scopeIncludes` — cero cambios de motor.
- `create_organization` — sigue sin mapear, por los tres motivos ya documentados y cerrados en
  `roles.go`/`Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md`.
- Cualquier comando o UI nueva — `nucleus authority observation` ya expone lo necesario para leer la señal
  corregida.

## §5 — Validación esperada al encargar esto

Un test nuevo en `shadow_activation_test.go` que arma un `.ownership.json` con `Organization.CanonicalID`
poblado y confirma que `shadowDecisionRequest` arma `Scope.ID` con ese valor, no con `parentID` — más un caso
con `CanonicalID == nil` confirmando `Scope` vacío (no `parentID` como fallback). `go build`/`go vet`/
`go test ./internal/governance/decision/...`.

---

**Si confirmás el punto único de §3, este alcance ya es de tamaño de encargo directo — no hace falta otra
ronda de diseño.**
