package mandatestate

import "testing"

func TestValidateForwardOnlyAcceptsSingleStep(t *testing.T) {
	order := []string{"ingest", "cluster", "validate", "signed", "completed"}
	if err := ValidateForwardOnly(order, "ingest", "cluster"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if err := ValidateForwardOnly(order, "signed", "completed"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidateForwardOnlyAcceptsNoOp(t *testing.T) {
	order := []string{"ingest", "cluster", "validate", "signed", "completed"}
	if err := ValidateForwardOnly(order, "cluster", "cluster"); err != nil {
		t.Fatalf("expected no-op to be accepted, got: %v", err)
	}
}

func TestValidateForwardOnlyRejectsSkip(t *testing.T) {
	order := []string{"ingest", "cluster", "validate", "signed", "completed"}
	if err := ValidateForwardOnly(order, "ingest", "validate"); err == nil {
		t.Fatal("expected error skipping cluster, got nil")
	}
}

func TestValidateForwardOnlyRejectsBackward(t *testing.T) {
	order := []string{"ingest", "cluster", "validate", "signed", "completed"}
	if err := ValidateForwardOnly(order, "signed", "cluster"); err == nil {
		t.Fatal("expected error going backward, got nil")
	}
}

func TestValidateForwardOnlyRejectsUnknownStates(t *testing.T) {
	order := []string{"ingest", "cluster", "validate", "signed", "completed"}
	if err := ValidateForwardOnly(order, "bogus", "cluster"); err == nil {
		t.Fatal("expected error for unknown current state, got nil")
	}
	if err := ValidateForwardOnly(order, "ingest", "bogus"); err == nil {
		t.Fatal("expected error for unknown next state, got nil")
	}
}
