package authority

import (
	"errors"
	"sort"
	"strings"
)

const (
	RoleMaster               = "master"
	RoleSpecialist           = "specialist"
	PermissionIntentCorMerge = "intent.cor.merge"
)

var PermissionsV1 = map[string]struct{}{"authority.membership.manage": {}, "authority.role_definition.manage": {}, "authority.assignment.manage": {}, "authority.binding.approve": {}, "authority.cutover.approve": {}, "mandate.create": {}, "mandate.sign": {}, "mandate.promote": {}, "mandate.install": {}, "intent.create": {}, PermissionIntentCorMerge: {}, "vault.key.read": {}, "vault.key.write": {}, "vault.key.delete": {}, "executor.command.execute": {}, "executor.filesystem.write": {}, "executor.network.access": {}, "executor.change.promote": {}}
var BuiltinRoles = map[string][]string{RoleMaster: keys(PermissionsV1), RoleSpecialist: {"mandate.create", "intent.create"}}
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
	return nil
}
func keys(m map[string]struct{}) []string {
	r := make([]string, 0, len(m))
	for k := range m {
		r = append(r, k)
	}
	sort.Strings(r)
	return r
}
func HasBuiltinPermission(role, permission string) bool {
	for _, p := range BuiltinRoles[role] {
		if p == permission {
			return true
		}
	}
	return false
}
