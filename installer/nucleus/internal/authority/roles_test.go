package authority

import "testing"

func TestMasterHasIntentCorMerge(t *testing.T) {
	if !HasBuiltinPermission(RoleMaster, PermissionIntentCorMerge) {
		t.Fatal("master lacks intent.cor.merge")
	}
	if _, ok := BuiltinRoles["architect"]; ok {
		t.Fatal("architect must not be built-in")
	}
}
func TestCustomRolesRejectReservedIDsAndWildcards(t *testing.T) {
	for _, r := range []RoleDefinition{{RoleID: RoleMaster, RoleVersion: "1", RoleOrigin: "organization", Permissions: []string{"intent.create"}}, {RoleID: "custom", RoleVersion: "1", RoleOrigin: "organization", Permissions: []string{"intent.*"}}} {
		if ValidateRoleDefinition(r) == nil {
			t.Fatalf("expected rejection: %+v", r)
		}
	}
}
