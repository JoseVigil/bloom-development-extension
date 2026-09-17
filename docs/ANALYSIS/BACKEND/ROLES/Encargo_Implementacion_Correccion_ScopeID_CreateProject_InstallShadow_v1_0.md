# Encargo de Implementación — Corregir el `Scope.ID` de la evaluación shadow de `create_project` v1.0

**Basado en:** `Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md`, confirmada por José
2026-09-17 (§3: `Scope.ID` debe venir de `Organization.CanonicalID` reconciliado, no del `org_<timestamp>`
local).

---

## §0 — Qué resuelve

`shadowDecisionRequest` arma hoy el `Scope` de la evaluación shadow observacional de `create_project`
reusando el `org_<timestamp>` local (Sistema A) que sólo sirve para la estructura del árbol de Gravity.
`DecisionEvaluator.Evaluate` compara `Scope.ID` contra `state.Binding.OrganizationID` — el id real del Backend
(Sistema B). Nunca coinciden, así que `observation.json` se llena de `scope_outside_binding` falso en vez de
señal real. Este encargo hace que `Scope.ID` use `Organization.CanonicalID`, el id real ya reconciliado por
Sovereign Tenant Fase 5 (`ReconcileCanonicalOrganization`).

**Puramente observacional, igual que todo lo que toca `InstallShadow`:** `AuthorizeGravityNodeCreation` sigue
devolviendo siempre la decisión local real (`decision.go:105-130`, sin tocar en este encargo). Este cambio
sólo mejora qué se escribe en `observation.json` — no gatea nada, no puede gatear nada.

## §1 — Archivos a tocar

| Archivo | Cambio |
|---|---|
| `internal/governance/decision/shadow_activation.go` | `shadowDecisionRequest`: `Scope.ID` sale de `analysis.Canonical.Organization.CanonicalID`, no de `parentID` |
| `internal/governance/decision/shadow_activation_test.go` | Actualizar `TestShadowDecisionRequestUsesOwnershipOwnerAsPrincipal` (agregar assert de Scope vacío) + 2 tests nuevos |

Ningún otro archivo se toca — ver §4.

## §2 — `internal/governance/decision/shadow_activation.go`

Reemplazar el cuerpo de `shadowDecisionRequest` (el comentario de la función y las primeras líneas no
cambian; sólo las últimas cuatro líneas, desde `request.PrincipalID = view.Owner.Subject`):

**Antes:**

```go
	request.PrincipalID = view.Owner.Subject
	if parentID != nil {
		request.Scope = authority.Scope{Type: "organization", ID: *parentID}
	}
	return request
}
```

**Después:**

```go
	request.PrincipalID = view.Owner.Subject
	// Scope.ID viene del Organization.CanonicalID reconciliado (Sovereign Tenant Fase 5,
	// ReconcileCanonicalOrganization en internal/governance/ownership_reconciliation.go) —
	// el mismo id que DecisionEvaluator.Evaluate compara contra state.Binding.OrganizationID
	// (internal/authority/decision.go). parentID sigue siendo el org_<timestamp> local que
	// authorizeGravityNodeCreationLocal usa para la estructura del árbol de Gravity — nunca
	// coincide con state.Binding.OrganizationID, así que ya no se usa para armar Scope (ver
	// Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md, decisión de
	// José 2026-09-17). Sin CanonicalID reconciliado (instalación que nunca corrió
	// "nucleus authority sync", o create_organization — parentID siempre nil por diseño, ver
	// Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md), Scope queda
	// vacío: Evaluate() lo reporta como scope_invalid, honesto, en vez de un
	// scope_outside_binding falso.
	if analysis.Canonical != nil && analysis.Canonical.Organization.CanonicalID != nil &&
		*analysis.Canonical.Organization.CanonicalID != "" {
		request.Scope = authority.Scope{Type: "organization", ID: *analysis.Canonical.Organization.CanonicalID}
	}
	return request
}
```

`analysis` ya está en scope (viene de `ownershipcontract.Analyze(ownershipRaw)`, unas líneas arriba, sin
cambios). `parentID` deja de leerse en esta función — sigue llegando como parámetro (la firma no cambia, la
usa `Request func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest` del
`ShadowConfiguration`, sin tocar).

No hay otro cambio en el archivo — `DefaultShadowConfiguration` y el resto de `shadowDecisionRequest` (lectura
de `nucleusRoot`, `.ownership.json`, `EffectiveLegacyView`, resolución de `PrincipalID`) quedan exactamente
iguales.

## §3 — `internal/governance/decision/shadow_activation_test.go`

### §3.1 — Modificar `TestShadowDecisionRequestUsesOwnershipOwnerAsPrincipal`

Su fixture (`writeLocalLegacyFixture`) escribe `.ownership.json` en forma **legada**, pre-migración canónica
— nunca tiene `Organization.CanonicalID` (no hay campo `canonical_id` en absoluto en esa forma). Con el
cambio de §2, la aserción de `Scope.ID == orgID` ya no aplica — el comportamiento correcto para esta fixture
es `Scope` vacío. Reemplazar el cuerpo completo:

```go
func TestShadowDecisionRequestUsesOwnershipOwnerAsPrincipal(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeLocalLegacyFixture(t, nucleusRoot, "owner-x")

	orgID := "org-a"
	version := uint64(3)
	request := shadowDecisionRequest(OpCreateProject, "proj-1", &orgID, &version)

	if request.Operation != string(OpCreateProject) {
		t.Fatalf("operation = %q", request.Operation)
	}
	if request.PrincipalID == "" {
		t.Fatal("expected a non-empty PrincipalID from .ownership.json")
	}
	// .ownership.json legado (pre-migración canónica) no tiene Organization.CanonicalID
	// reconciliado todavía — Scope debe quedar vacío, nunca caer de vuelta al org_<timestamp>
	// local (orgID/parentID), que nunca coincide con state.Binding.OrganizationID. Ver
	// Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md.
	if request.Scope.Type != "" || request.Scope.ID != "" {
		t.Fatalf("expected empty Scope without a reconciled CanonicalID, got %+v", request.Scope)
	}
}
```

### §3.2 — Agregar helper `writeCanonicalOwnershipFixture`

Escribe `.ownership.json` ya en forma canónica con `Organization.CanonicalID` poblado — el estado que deja
`ReconcileCanonicalOrganization` tras un `sync` exitoso. Estado `UNBOUND` alcanza (`Validate()` sólo exige
`TenantID`/`TrustBinding`/etc. para `BOUND`/`REMOTE_LOCKED` — ver `ownershipcontract/schema.go`), así el
fixture es mínimo y no necesita simular un binding completo:

```go
// writeCanonicalOwnershipFixture escribe un .ownership.json ya en forma canónica, con
// Organization.CanonicalID poblado — el estado que deja ReconcileCanonicalOrganization tras
// un "nucleus authority sync" exitoso (Sovereign Tenant Fase 5). A diferencia de
// writeLocalLegacyFixture, que escribe la forma legada pre-migración.
func writeCanonicalOwnershipFixture(t *testing.T, nucleusRoot, ownerID, canonicalID string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	doc := `{"schema":"bloom.organization.ownership","schema_version":"1.0","authority_mode":"local_legacy",` +
		`"organization":{"canonical_id":"` + canonicalID + `","legacy_org_id":null,"legacy_locator":null,"slug":null,"display_name":null,"tenant_id":null},` +
		`"installation":{"installation_id":"installation-x"},` +
		`"binding":{"state":"UNBOUND","issuer_id":null,"accepted_at":null,"remote_locked_at":null},` +
		`"trust_binding":null,` +
		`"legacy_authority":{"owner":{"source":"github_handle","subject":"` + ownerID + `","display_name":null},"team_members":[],"effective_markers":[]},` +
		`"migration":null,"created_at":"` + now + `","updated_at":"` + now + `"}`
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".ownership.json"), []byte(doc), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
}
```

### §3.3 — Agregar `TestShadowDecisionRequestScopeUsesReconciledCanonicalID`

El caso feliz: `Scope.ID` debe venir de `CanonicalID`, nunca de `parentID`, aunque sean valores distintos:

```go
func TestShadowDecisionRequestScopeUsesReconciledCanonicalID(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeCanonicalOwnershipFixture(t, nucleusRoot, "owner-x", "org-canonical-xyz")

	// parentID es intencionalmente distinto de canonicalID — es el org_<timestamp> local que
	// authorizeGravityNodeCreationLocal usa para la estructura del árbol de Gravity, nunca lo
	// que Scope.ID debe llevar.
	parentID := "org_1700000000"
	version := uint64(1)
	request := shadowDecisionRequest(OpCreateProject, "proj-1", &parentID, &version)

	if request.Scope.Type != "organization" || request.Scope.ID != "org-canonical-xyz" {
		t.Fatalf("expected Scope.ID from reconciled CanonicalID, got %+v", request.Scope)
	}
}
```

### §3.4 — Agregar `TestShadowDecisionRequestScopeEmptyForCreateOrganization`

Guardia defensiva ligada a `Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md` §1: aun
con `CanonicalID` reconciliado, `create_organization` nunca debe tener `Scope` (por diseño, `parentID` siempre
es `nil` para esta operación):

```go
func TestShadowDecisionRequestScopeEmptyForCreateOrganization(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeCanonicalOwnershipFixture(t, nucleusRoot, "owner-x", "org-canonical-xyz")

	request := shadowDecisionRequest(OpCreateOrganization, "org-node-1", nil, nil)
	if request.Scope.Type != "" || request.Scope.ID != "" {
		t.Fatalf("create_organization must never get a Scope — see Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md, got %+v", request.Scope)
	}
}
```

`TestShadowDecisionRequestDegradesWithoutOwnership` y `TestDefaultShadowConfigurationConnectedReflectsFilePresence` no cambian.

## §4 — Explícitamente fuera de alcance

- `authorizeGravityNodeCreationLocal`, `AuthorizeGravityNodeCreation`, `decision.go` en general — cero
  cambios. La decisión local real de `create_project`/`create_organization` no se toca.
- `readOrganizationID` / `mandate_gravity_session_activities.go` — el `org_<timestamp>` local que usa para la
  estructura del árbol de Gravity sigue siendo correcto para ese propósito y no cambia.
- `DecisionEvaluator.Evaluate`, `ScopeTypes`, `scopeIncludes` (`internal/authority/decision.go`) — cero
  cambios de motor.
- `roles.go` / `PermissionsV1` / `BuiltinRoles` — `create_organization` sigue sin mapear (ya cerrado,
  `Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md`).
- Cualquier comando o UI nueva — `nucleus authority observation` ya expone `observation.json`.
- `DefaultShadowConfiguration`, el wiring en `worker.go` — sin cambios, ya cerrados en §Z.20.

## §5 — Validación

```bash
go build ./internal/governance/... && go vet ./internal/governance/... && go test ./internal/governance/...
```

No se espera ningún cambio de resultado fuera del paquete `internal/governance/decision` — los tests nuevos y
el modificado viven ahí. Verificación de alcance esperada: por mtime, confirmar que sólo
`shadow_activation.go` y `shadow_activation_test.go` fueron tocados.

## §6 — Nomenclatura (regla del proyecto)

Este encargo no introduce el término prohibido en ningún lado — verificar con grep case-insensitive sobre los
dos archivos antes de commitear, mismo criterio que todos los encargos anteriores de esta serie.

## §7 — Continuidad

Cierre esperado: confirmación de Control leyendo ambos archivos completos contra el repo real (no el reporte)
de que el diff coincide exactamente con lo especificado acá, más `go test` en verde corrido por José en su
entorno local (este sandbox sigue sin acceso a `proxy.golang.org` para compilar de forma independiente). Con
eso, Control actualiza el tablero: de los dos ítems que quedaban para `remote_enforced` al cierre de Fase 5
(§Z.22), éste queda resuelto como "señal de `InstallShadow` corregida" — queda sólo el gap de "ProjectID
productor real" (Orbital/Gravity, frente aparte).
