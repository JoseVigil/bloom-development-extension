package authority

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
	"time"
)

// The trusted fixture key is loaded from the fixed 1A vector, not from the artifact.
// This proves projection acceptance, not the future effective decision gates.
func TestAdministrationInteropBackendArtifacts(t *testing.T) {
	path := os.Getenv("AUTHORITY_ADMIN_ARTIFACT")
	if path == "" {
		t.Skip("invoked by the administrative Backend route test")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var artifact struct {
		Envelopes    []json.RawMessage `json:"envelopes"`
		StateDigests []string          `json:"state_digests"`
		FinalFull    json.RawMessage   `json:"final_full"`
	}
	if err := json.Unmarshal(raw, &artifact); err != nil {
		t.Fatal(err)
	}
	if len(artifact.Envelopes) != 6 || len(artifact.StateDigests) != 6 {
		t.Fatal("expected initial, membership proposal/acceptance, assignment proposal/acceptance and revocation")
	}
	f := readInterop(t)
	v := interopVerifier(t, f)
	v.Binding.OrganizationID = "org-admin-interop"
	v.Now = func() time.Time { return time.Date(2026, 9, 8, 12, 5, 1, 0, time.UTC) }
	var state *DurableState
	for i, envelope := range artifact.Envelopes {
		state, err = v.VerifyAndAccept(envelope, "administration")
		if err != nil {
			t.Fatalf("stage %d: %v", i, err)
		}
		if state.Monotonic.StateDigest != artifact.StateDigests[i] || len(state.Journal) != i+1 {
			t.Fatalf("stage %d digest/journal mismatch", i)
		}
		var membership *Membership
		for j := range state.Projection.Memberships {
			m := &state.Projection.Memberships[j]
			if m.MembershipID == "m-admin-target" {
				membership = m
			}
		}
		if i < 2 && membership != nil {
			t.Fatal("proposal granted membership before acceptance")
		}
		if i >= 2 && (membership == nil || membership.PrincipalID != "p-\uE000" || membership.Status != "active" || membership.AcceptedAt.IsZero()) {
			t.Fatal("accepted membership missing or incorrect")
		}
		var assignment *RoleAssignment
		for j := range state.Projection.RoleAssignments {
			a := &state.Projection.RoleAssignments[j]
			if a.AssignmentID == "admin-target" {
				assignment = a
			}
		}
		if i < 4 && assignment != nil {
			t.Fatal("proposal granted assignment before acceptance")
		}
		if i >= 4 && (assignment == nil || assignment.MembershipID != "m-admin-target" || assignment.RoleID != "specialist" || assignment.RoleVersion != "1" || assignment.Scope != (Scope{Type: "project", ID: "project-fixture"})) {
			t.Fatal("accepted assignment mismatch")
		}
		if i == 4 && assignment.Status != "active" {
			t.Fatal("accepted assignment not active")
		}
		if i == 5 {
			if assignment.Status != "revoked" {
				t.Fatal("revocation not applied")
			}
			found := false
			for _, r := range state.Projection.Revocations {
				if r.TargetType == "role_assignment" && r.TargetID == "admin-target" {
					found = true
				}
			}
			if !found {
				t.Fatal("revocation history missing")
			}
		}
	}
	before, _ := os.ReadFile(v.Store.Path)
	if _, err := v.VerifyAndAccept(artifact.FinalFull, "equivalent-full"); err != nil {
		t.Fatal(err)
	}
	after, _ := os.ReadFile(v.Store.Path)
	if !bytes.Equal(before, after) {
		t.Fatal("equivalent full changed accepted evidence")
	}
	var env Envelope
	_ = json.Unmarshal(artifact.FinalFull, &env)
	sig, err := base64.RawURLEncoding.DecodeString(env.Integrity.Signature)
	if err != nil {
		t.Fatal(err)
	}
	sig[0] ^= 1
	env.Integrity.Signature = base64.RawURLEncoding.EncodeToString(sig)
	tampered, _ := json.Marshal(env)
	for _, candidate := range [][]byte{tampered, artifact.Envelopes[0]} {
		if _, err := v.VerifyAndAccept(candidate, "invalid"); err == nil {
			t.Fatal("invalid candidate accepted")
		}
		after, _ := os.ReadFile(v.Store.Path)
		if !bytes.Equal(before, after) {
			t.Fatal("rejection changed durable projection")
		}
	}
	receipt, _ := json.Marshal(map[string]any{"state_digest": state.Monotonic.StateDigest, "authority_version": state.Monotonic.HighWaterMark, "acceptances": len(state.Journal), "revoked_assignment": "admin-target"})
	if err := os.WriteFile(path+".receipt.json", receipt, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestAdministrationInteropRejectsInvalidReferenceWithoutMutation(t *testing.T) {
	f := readInterop(t)
	v := interopVerifier(t, f)
	if _, err := v.VerifyAndAccept(f.Envelopes["full1"], "base"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(v.Store.Path)
	var env map[string]any
	_ = json.Unmarshal(f.Envelopes["full2"], &env)
	p := env["payload"].(map[string]any)
	p["content"].(map[string]any)["role_assignments"].([]any)[0].(map[string]any)["membership_id"] = "missing"
	if _, err := v.VerifyAndAccept(resignPayload(t, p, f), "invalid-reference"); err == nil {
		t.Fatal("invalid reference accepted")
	}
	after, _ := os.ReadFile(v.Store.Path)
	if !bytes.Equal(before, after) {
		t.Fatal("invalid reference changed state")
	}
}
