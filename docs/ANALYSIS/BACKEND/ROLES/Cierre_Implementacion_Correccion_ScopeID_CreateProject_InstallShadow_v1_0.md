# Cierre de Implementación — Corrección del `Scope.ID` de la evaluación shadow de `create_project` v1.0

**Basado en:** `Encargo_Implementacion_Correccion_ScopeID_CreateProject_InstallShadow_v1_0.md`.
**Implementado por:** Control, directamente (mismo patrón que Sovereign Tenant Fase 5), a pedido explícito de
José.
**Verificado por:** Control, código real contra el dispositivo de José (no el reporte del commit), más
`go build`/`go vet`/`go test` corridos por José en su entorno local — dos rondas.

---

## §0 — Qué se cerró

`shadowDecisionRequest` (`internal/governance/decision/shadow_activation.go`) arma ahora `Scope.ID` desde
`Organization.CanonicalID` reconciliado (Sistema B, el mismo id que `DecisionEvaluator.Evaluate` compara
contra `state.Binding.OrganizationID`), en vez del `org_<timestamp>` local (Sistema A) que nunca podía
coincidir. `InstallShadow` sigue siendo puramente observacional — `AuthorizeGravityNodeCreation` no se tocó
y sigue devolviendo siempre la decisión local real.

## §1 — Implementación, tal como quedó en el repo real

- `internal/governance/decision/shadow_activation.go` — `shadowDecisionRequest`: el bloque final ahora es

  ```go
  if parentID != nil && analysis.Canonical != nil && analysis.Canonical.Organization.CanonicalID != nil &&
      *analysis.Canonical.Organization.CanonicalID != "" {
      request.Scope = authority.Scope{Type: "organization", ID: *analysis.Canonical.Organization.CanonicalID}
  }
  ```

- `internal/governance/decision/shadow_activation_test.go` — `TestShadowDecisionRequestUsesOwnershipOwnerAsPrincipal`
  corregido (fixture legado, sin `CanonicalID` → `Scope` vacío) + helper `writeCanonicalOwnershipFixture` +
  dos tests nuevos: `TestShadowDecisionRequestScopeUsesReconciledCanonicalID` (caso feliz) y
  `TestShadowDecisionRequestScopeEmptyForCreateOrganization` (guardia defensiva).

Ningún otro archivo tocado — confirmado por mtime en el dispositivo real en ambas rondas de verificación.

## §2 — Desviación real respecto del Encargo v1.0, encontrada por el propio test que el Encargo pedía

El diff especificado en el Encargo v1.0 §2 tenía un bug: la condición para armar `Scope` chequeaba sólo
`analysis.Canonical.Organization.CanonicalID`, sin `parentID != nil`. Efecto: `Scope` se poblaba para
*cualquier* operación con `CanonicalID` reconciliado — incluido `create_organization`, que siempre pasa
`parentID = nil` por diseño (`authorizeGravityNodeCreationLocal` rechaza cualquier padre para esa operación,
ver `Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md` §1). Eso habría reintroducido
exactamente el tipo de señal falsa que este encargo buscaba eliminar, sólo que para la otra operación:
`create_organization` habría empezado a evaluar `scope_outside_binding`/`permission_granted` contra un
`Scope` que no debería existir, contradiciendo el motivo #3 ya cerrado en `roles.go`.

`TestShadowDecisionRequestScopeEmptyForCreateOrganization` — el mismo test que el Encargo especificaba en
§3.4 como guardia defensiva — lo agarró en la primera corrida de José:

```
--- FAIL: TestShadowDecisionRequestScopeEmptyForCreateOrganization (0.00s)
    shadow_activation_test.go:91: create_organization must never get a Scope ..., got {Type:organization ID:org-canonical-xyz}
```

**Fix aplicado por Control** (no un cambio de diseño, una corrección del diff sobre el mismo diseño ya
confirmado por José): se restauró el chequeo `parentID != nil` al inicio de la condición. `parentID` sigue
sin usarse para el *valor* de `Scope.ID` (eso sigue viniendo de `CanonicalID`, tal como confirmó José en la
Propuesta §3) — se usa, como en el código original pre-encargo, para decidir si la operación en curso tiene
noción de padre/scope en absoluto. Verificado a mano contra los 4 tests antes de volver a commitear, y
confirmado en verde por la segunda corrida de José.

## §3 — Validación final

```
jose@bell-ubuntu:~/repos/bloom-development-extension/installer/nucleus$ go build ./internal/governance/... && go vet ./internal/governance/... && go test ./internal/governance/...
ok  	nucleus/internal/governance	3.610s
ok  	nucleus/internal/governance/decision	0.018s
ok  	nucleus/internal/governance/ownershipcontract	(cached)
```

`gofmt -l` limpio y grep de nomenclatura (0 coincidencias del término prohibido) corridos sobre ambos
archivos en las dos rondas (antes del bug y después del fix).

## §4 — Efecto neto

`observation.json` ahora registra, para cada `create_project`, una evaluación shadow contra el id real que
`DecisionEvaluator.Evaluate` compara — señal real en vez de `scope_outside_binding` estructuralmente falso.
`create_organization` sigue, correctamente, sin `Scope` nunca (su exclusión de `PermissionsV1` sigue intacta,
motivo #3 de `roles.go`). Ningún camino de gating cambió — `InstallShadow` sigue puramente observacional,
`remote_enforced` sigue sin ser un valor alcanzable de `AuthorityMode`.

## §5 — Continuidad

Con esto, de los dos ítems que quedaban para `remote_enforced` al cierre de Fase 5 (§Z.22 del Tablero), este
queda resuelto — "señal de `InstallShadow` corregida". El primer ítem (`create_organization` sin mapear)
también queda cerrado, pero como decisión permanente, no como pendiente: ver
`Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md` y el `NOTA` actualizado en
`roles.go`. Queda un único ítem abierto hacia `remote_enforced`: el gap de "ProjectID productor real"
(Orbital/Gravity, frente aparte, alcance mayor).
