package authority

import "testing"

func TestBuiltinCatalogExact(t *testing.T) {
	expected := map[string][]string{
		"master":     {"authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage", "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote", "mandate.install", "intent.create", "intent.cor.merge"},
		"specialist": {"intent.create"},
	}
	if len(BuiltinRoles) != len(expected) {
		t.Fatal("unexpected built-in roles")
	}
	for role, permissions := range expected {
		if len(BuiltinRoles[role]) != len(permissions) {
			t.Fatalf("unexpected permission count for %s", role)
		}
		for _, permission := range permissions {
			if !HasBuiltinPermission(role, permission) {
				t.Fatalf("%s lacks %s", role, permission)
			}
		}
		for _, permission := range []string{"vault.key.read", "vault.key.write", "vault.key.delete", "executor.command.execute", "executor.filesystem.write", "executor.network.access", "executor.change.promote"} {
			if HasBuiltinPermission(role, permission) {
				t.Fatalf("%s unexpectedly grants %s", role, permission)
			}
		}
		if err := ValidateRoleDefinition(RoleDefinition{RoleID: role, RoleVersion: "1", RoleOrigin: "builtin", Permissions: permissions}); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRoleDefinitionConformance(t *testing.T) {
	cases := []RoleDefinition{
		{RoleID: "architect", RoleVersion: "1", RoleOrigin: "organization"},
		{RoleID: "Architect", RoleVersion: "1", RoleOrigin: "builtin"},
		{RoleID: "custom", RoleVersion: "1", RoleOrigin: ""},
		{RoleID: "custom", RoleVersion: "1", RoleOrigin: "local"},
		{RoleID: "custom", RoleVersion: "1", RoleOrigin: "builtin"},
		{RoleID: "specialist", RoleVersion: "1", RoleOrigin: "organization"},
		{RoleID: "specialist", RoleVersion: "2", RoleOrigin: "builtin", Permissions: []string{"intent.create"}},
		{RoleID: "specialist", RoleVersion: "1", RoleOrigin: "builtin", Permissions: []string{"mandate.create", "intent.create"}},
		{RoleID: "specialist", RoleVersion: "1", RoleOrigin: "builtin", Permissions: []string{"intent.cor.merge"}},
		{RoleID: "master", RoleVersion: "1", RoleOrigin: "builtin", Permissions: []string{"intent.create"}},
		{RoleID: "custom", RoleVersion: "1", RoleOrigin: "organization", Permissions: []string{"unknown.permission"}},
		{RoleID: "custom", RoleVersion: "1", RoleOrigin: "organization", Permissions: []string{"intent.create", "intent.create"}},
	}
	for _, r := range cases {
		if ValidateRoleDefinition(r) == nil {
			t.Fatalf("invalid definition accepted: %+v", r)
		}
	}
	// Custom roles may explicitly grant these permissions without adding a built-in role.
	if err := ValidateRoleDefinition(RoleDefinition{RoleID: "org-custom", RoleVersion: "1", RoleOrigin: "organization", Permissions: []string{"intent.cor.merge", "vault.key.read", "executor.filesystem.write"}}); err != nil {
		t.Fatal(err)
	}
}

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
