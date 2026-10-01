package authority

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func acceptedIntelligenceGrant(t *testing.T, mutate func(*FullContent)) (*Store, *CheckpointStore, time.Time) {
	t.Helper()
	p, pub, priv := full11Fixture(t, "1")
	now := p.IssuedAt.Add(time.Minute)
	var content FullContent
	if err := json.Unmarshal(p.Content, &content); err != nil {
		t.Fatal(err)
	}
	grant := intelligenceGrantFixture(p.IssuedAt)
	grant.GrantID = "grant"
	grant.ReplacesGrantID = nil
	grants := []IntelligenceSupplyGrant{grant}
	content.IntelligenceSupplyGrants = &grants
	if mutate != nil {
		mutate(&content)
	}
	p.Content, _ = json.Marshal(content)
	dir := t.TempDir()
	store := &Store{Path: filepath.Join(dir, "state.json")}
	checkpoint := &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: store, Checkpoint: checkpoint, Now: func() time.Time { return now }}
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "fixture"); err != nil {
		t.Fatal(err)
	}
	return store, checkpoint, now
}

func TestResolveIntelligenceSupplyGrantReturnsDetachedDeclaredEvidence(t *testing.T) {
	store, checkpoint, now := acceptedIntelligenceGrant(t, nil)
	evidence, err := ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Status != IntelligenceSupplyGrantActive || evidence.ConsumerID != "brain" || evidence.Purpose != "mandate_intelligence" || len(evidence.MembershipIDs) != 1 || evidence.Limits.MaxUSD != "1.500000" || evidence.AuthorityVersion != "1" || evidence.AuthorityStateDigest == "" {
		t.Fatalf("unexpected evidence: %+v", evidence)
	}
	evidence.AllowedCapabilities[0] = "mutated"
	evidence.AllowedDestinations[0].Models[0] = "mutated"
	again, err := ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now)
	if err != nil || again.AllowedCapabilities[0] == "mutated" || again.AllowedDestinations[0].Models[0] == "mutated" {
		t.Fatal("caller mutated durable grant evidence")
	}
}

func TestResolveIntelligenceSupplyGrantRejectsBindingsAndMembership(t *testing.T) {
	store, checkpoint, now := acceptedIntelligenceGrant(t, nil)
	for _, tc := range []struct{ org, installation, grant string }{
		{"other", "installation", "grant"}, {"org", "other", "grant"}, {"org", "installation", "missing"},
	} {
		if _, err := ResolveIntelligenceSupplyGrant(store, checkpoint, tc.org, tc.installation, tc.grant, now); !errors.Is(err, ErrIntelligenceSupplyGrantDenied) {
			t.Fatalf("binding accepted: %+v err=%v", tc, err)
		}
	}
	store, checkpoint, now = acceptedIntelligenceGrant(t, func(content *FullContent) { content.Memberships[0].Status = "suspended" })
	if _, err := ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now); !errors.Is(err, ErrIntelligenceSupplyGrantDenied) {
		t.Fatal("inactive membership accepted")
	}
}

func TestResolveIntelligenceSupplyGrantRejectsValidityRevocationAndReplacement(t *testing.T) {
	store, checkpoint, now := acceptedIntelligenceGrant(t, func(content *FullContent) {
		(*content.IntelligenceSupplyGrants)[0].ValidFrom = nowFromContent(content).Add(10 * time.Minute)
	})
	evidence, err := ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now)
	if !errors.Is(err, ErrIntelligenceSupplyGrantDenied) || evidence.Status != IntelligenceSupplyGrantNotYetValid {
		t.Fatalf("not-yet-valid grant accepted: %+v %v", evidence, err)
	}
	store, checkpoint, now = acceptedIntelligenceGrant(t, func(content *FullContent) {
		content.Revocations = append(content.Revocations, Revocation{RevocationID: "revoke", TargetType: "intelligence_supply_grant", TargetID: "grant", EffectiveAt: content.Memberships[0].ValidFrom.Add(2 * time.Hour), RecordedInAuthorityVersion: "1", ReasonCode: "opaque"})
	})
	if _, err = ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now); err != nil {
		t.Fatal("future revocation denied an active grant")
	}
	store, checkpoint, now = acceptedIntelligenceGrant(t, func(content *FullContent) {
		content.Revocations = append(content.Revocations, Revocation{RevocationID: "revoke", TargetType: "intelligence_supply_grant", TargetID: "grant", EffectiveAt: content.Memberships[0].ValidFrom, RecordedInAuthorityVersion: "1", ReasonCode: "opaque"})
	})
	evidence, err = ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now)
	if !errors.Is(err, ErrIntelligenceSupplyGrantDenied) || evidence.Status != IntelligenceSupplyGrantRevoked {
		t.Fatalf("revoked grant accepted: %+v %v", evidence, err)
	}
	store, checkpoint, now = acceptedIntelligenceGrant(t, func(content *FullContent) {
		replacement := intelligenceGrantFixture(content.Memberships[0].ValidFrom.Add(time.Hour))
		replacement.GrantID = "replacement"
		old := "grant"
		replacement.ReplacesGrantID = &old
		replacement.ValidFrom = content.Memberships[0].ValidFrom
		*content.IntelligenceSupplyGrants = append(*content.IntelligenceSupplyGrants, replacement)
		content.Revocations = append(content.Revocations, Revocation{RevocationID: "replace", TargetType: "intelligence_supply_grant", TargetID: "grant", EffectiveAt: content.Memberships[0].ValidFrom, RecordedInAuthorityVersion: "1", ReasonCode: "opaque"})
	})
	evidence, err = ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now)
	if !errors.Is(err, ErrIntelligenceSupplyGrantDenied) || (evidence.Status != IntelligenceSupplyGrantRevoked && evidence.Status != IntelligenceSupplyGrantReplaced) {
		t.Fatalf("replaced grant accepted: %+v %v", evidence, err)
	}
}

func nowFromContent(content *FullContent) time.Time {
	return content.Memberships[0].ValidFrom.Add(time.Hour)
}

func TestResolveIntelligenceSupplyGrantRequiresAcceptedCheckpoint(t *testing.T) {
	store, checkpoint, now := acceptedIntelligenceGrant(t, nil)
	checkpoint.Path += ".missing"
	if _, err := ResolveIntelligenceSupplyGrant(store, checkpoint, "org", "installation", "grant", now); !errors.Is(err, ErrIntelligenceSupplyGrantDenied) {
		t.Fatalf("missing checkpoint accepted: %v", err)
	}
}
