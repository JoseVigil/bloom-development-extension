package authority

import "testing"

func TestBuiltinCatalogExact(t *testing.T) {
	expected := map[string][]string{
		"master":     {"authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage", "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote", "mandate.install", "intent.create", "intent.cor.merge", "agent.issuer.designate", "create_project"},
		"specialist": {"intent.create"},
		"operator":   {"intent.create", "agent.issuer.designate"},
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

// TestCreateOrganizationDeliberatelyUnmapped is defensive: create_organization is permanently absent from
// PermissionsV1 and from BuiltinRoles[RoleMaster] — not a temporary gap. See the NOTA comment in roles.go
// and Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md for the three independent
// reasons (identity reconciliation insufficient by itself, temporal ordering, structurally empty Scope). If
// a future change adds it back without reading that investigation first, this test should fail instead of
// passing silently.
func TestCreateOrganizationDeliberatelyUnmapped(t *testing.T) {
	if _, ok := PermissionsV1["create_organization"]; ok {
		t.Fatal("create_organization must not be in PermissionsV1 — see Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md before adding it")
	}
	if HasBuiltinPermission(RoleMaster, "create_organization") {
		t.Fatal("create_organization must not be granted to master — see Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md before adding it")
	}
}

// TestCreateProjectMappedOnlyToMaster confirms create_project is granted to master and to no other
// builtin role.
func TestCreateProjectMappedOnlyToMaster(t *testing.T) {
	if !HasBuiltinPermission(RoleMaster, "create_project") {
		t.Fatal("master must have create_project")
	}
	if HasBuiltinPermission(RoleSpecialist, "create_project") {
		t.Fatal("specialist must not have create_project")
	}
	if HasBuiltinPermission(RoleOperator, "create_project") {
		t.Fatal("operator must not have create_project")
	}
}

// TestBuiltinCatalogMatchesBackend pins parity with backend/src/authority/emission.ts
// BUILTIN_ROLE_CATALOG (Paso 0 de Propuesta_Diseno_Resolucion_AsignacionRolesBuiltin_v0_1.md, 2026-09-23).
// Until then the Backend emitted master v1 with 12 permissions and this catalog rejected every real
// emission ("built-in permissions contradict catalog"). Changing a builtin here without the identical
// change in the Backend (and vice versa) breaks every snapshot again.
func TestBuiltinCatalogMatchesBackend(t *testing.T) {
	backend := map[string][]string{
		"master":     {"authority.membership.manage", "authority.role_definition.manage", "authority.assignment.manage", "authority.binding.approve", "authority.cutover.approve", "mandate.create", "mandate.sign", "mandate.promote", "mandate.install", "intent.create", "intent.cor.merge", "agent.issuer.designate", "create_project"},
		"operator":   {"intent.create", "agent.issuer.designate"},
		"specialist": {"intent.create"},
	}
	if len(BuiltinRoles) != len(backend) {
		t.Fatalf("builtin role count differs from Backend: %d vs %d", len(BuiltinRoles), len(backend))
	}
	for role, permissions := range backend {
		if err := ValidateRoleDefinition(RoleDefinition{RoleID: role, RoleVersion: "1", RoleOrigin: "builtin", Permissions: permissions}); err != nil {
			t.Fatalf("Backend %s v1 rejected by Nucleus: %v", role, err)
		}
	}
}
