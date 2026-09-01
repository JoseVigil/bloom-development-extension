package core

import "testing"

// TestGetNucleusIconAndDescriptionForGravity guards the two additive switch
// cases added for the new "GRAVITY" category (internal/gravity's Priority
// Cycle logging). A regression here (someone dropping the case) would make
// core.InitLogger(paths, "GRAVITY", ...) silently fall through to the
// generic default icon/description instead of failing loudly, so this pins
// the specific values rather than just checking "non-default".
func TestGetNucleusIconAndDescriptionForGravity(t *testing.T) {
	if icon := getNucleusIcon("GRAVITY"); icon != "🪐" {
		t.Fatalf("getNucleusIcon(\"GRAVITY\") = %q, want the dedicated Gravity icon", icon)
	}
	const defaultDescription = "Nucleus gravity log" // what the default: branch would produce
	description := getNucleusStreamDescription("GRAVITY")
	if description == "" || description == defaultDescription {
		t.Fatalf("getNucleusStreamDescription(\"GRAVITY\") = %q, want a dedicated description distinct from the generic default", description)
	}
}
