package authority

import (
	"errors"
	"strings"
)

const (
	RoleMaster                     = "master"
	RoleSpecialist                 = "specialist"
	RoleOperator                   = "operator" // Working name (ex-delegate); scope-project admin. See Encargo_Implementacion_Nacimiento_Agente_Orbital_v1_0.md §1, §2.1.
	PermissionIntentCorMerge       = "intent.cor.merge"
	PermissionAgentIssuerDesignate = "agent.issuer.designate"
)

// NOTA — decisión de José, 2026-09-15 (Propuesta_Diseno_P3_PoliticaDesconexion_y_MapeoGravity_v0_1.md
// §3 Q1): "create_organization" NO está en PermissionsV1 a propósito, no por omisión. Evaluate() deniega
// scope.Type == "organization" cuya Scope.ID no coincide con el binding ya vinculado — estructuralmente
// incompatible con la operación que crea esa organización. create_organization es además un evento único
// de bootstrap por instalación, no recurrente como create_project. Antes de agregarla, releer esa decisión
// — no es un gap accidental.
var PermissionsV1 = map[string]struct{}{
	"authority.membership.manage": {}, "authority.role_definition.manage": {}, "authority.assignment.manage": {},
	"authority.binding.approve": {}, "authority.cutover.approve": {},
	"mandate.create": {}, "mandate.sign": {}, "mandate.promote": {}, "mandate.install": {},
	"intent.create": {}, PermissionIntentCorMerge: {}, PermissionAgentIssuerDesignate: {},
	"vault.key.read": {}, "vault.key.write": {}, "vault.key.delete": {},
	"executor.command.execute": {}, "executor.filesystem.write": {}, "executor.network.access": {}, "executor.change.promote": {},
	"create_project": {}, // NUEVO — ver Propuesta_Diseno_P3_PoliticaDesconexion_y_MapeoGravity_v0_1.md §1
}
var BuiltinRoles = map[string][]string{
	RoleMaster: {
		"authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage",
		"authority.binding.approve", "authority.cutover.approve",
		"mandate.create", "mandate.sign", "mandate.promote", "mandate.install",
		"intent.create", PermissionIntentCorMerge, PermissionAgentIssuerDesignate,
		"create_project", // NUEVO
	},
	RoleSpecialist: {"intent.create"},
	// scope-project admin (§2.1/§2.2 del encargo de nacimiento de agente Orbital): mismo piso que
	// specialist (intent.create) más la capacidad nueva de pedir nacimiento de agente, evaluada contra
	// el scope real de la asignación (decision.go scopeIncludes), nunca contra un scope fijo.
	RoleOperator: {"intent.create", PermissionAgentIssuerDesignate},
}
var ScopeTypes = map[string]struct{}{"organization": {}, "project": {}, "mandate": {}, "intent": {}, "resource": {}, "environment": {}}

type RoleDefinition struct {
	RoleID      string   `json:"role_id"`
	RoleVersion string   `json:"role_version"`
	RoleOrigin  string   `json:"role_origin"`
	DisplayName string   `json:"display_name"`
	Status      string   `json:"status"`
	Permissions []string `json:"permissions"`
}

func ValidateRoleDefinition(r RoleDefinition) error {
	if r.RoleID == "" || r.RoleVersion == "" {
		return errors.New("role identity required")
	}
	if strings.EqualFold(r.RoleID, "architect") {
		return errors.New("architect role forbidden")
	}
	if r.RoleOrigin != "builtin" && r.RoleOrigin != "organization" {
		return errors.New("invalid role origin")
	}
	if r.RoleOrigin == "builtin" {
		if _, ok := BuiltinRoles[r.RoleID]; !ok || r.RoleVersion != "1" {
			return errors.New("unknown built-in role or version")
		}
	}
	if r.RoleOrigin == "organization" && (r.RoleID == RoleMaster || r.RoleID == RoleSpecialist) {
		return errors.New("custom role uses reserved built-in ID")
	}
	seen := map[string]bool{}
	for _, p := range r.Permissions {
		if strings.Contains(p, "*") {
			return errors.New("permission wildcards forbidden")
		}
		if _, ok := PermissionsV1[p]; !ok {
			return errors.New("unknown permission")
		}
		if seen[p] {
			return errors.New("duplicate permission")
		}
		seen[p] = true
	}
	if r.RoleOrigin == "builtin" {
		expected := BuiltinRoles[r.RoleID]
		if len(seen) != len(expected) {
			return errors.New("built-in permissions contradict catalog")
		}
		for _, p := range expected {
			if !seen[p] {
				return errors.New("built-in permissions contradict catalog")
			}
		}
	}
	return nil
}
func HasBuiltinPermission(role, permission string) bool {
	for _, p := range BuiltinRoles[role] {
		if p == permission {
			return true
		}
	}
	return false
}
