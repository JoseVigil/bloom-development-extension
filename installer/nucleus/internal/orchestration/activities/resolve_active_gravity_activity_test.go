package activities

import "testing"

func TestResolveActiveGravityActivityValidatesRoot(t *testing.T) {
	_, err := ResolveActiveGravityActivity(ResolveActiveGravityInput{})
	if err == nil {
		t.Fatal("expected validation error")
	}
}
