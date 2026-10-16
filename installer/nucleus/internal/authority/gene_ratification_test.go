package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func validGeneRatification() GeneRatificationPayload {
	return GeneRatificationPayload{SchemaVersion: "bloom.gene-ratification/v1", Issuer: "authority", KeyID: "key-1", Permission: PermissionGeneContributionRatify,
		PrincipalID: "principal", ProjectID: "11111111-1111-4111-8111-111111111111", GeneID: "33333333-3333-4333-8333-333333333333",
		ContributionID: "44444444-4444-4444-8444-444444444444", ContributionDigest: "sha256:" + strings.Repeat("a", 64), MandateID: "55555555-5555-4555-8555-555555555555",
		IntentID: "66666666-6666-4666-8666-666666666666", DecisionID: "77777777-7777-4777-8777-777777777777", RepositoryIDs: []string{"22222222-2222-4222-8222-222222222222"},
		AuthorityVersion: "1", AuthorityStateDigest: "sha256:" + strings.Repeat("b", 64), ControlRevisions: []string{"human:1"}, Outcome: "ratified", DecidedAt: time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)}
}

func TestGeneRatificationExactScopeAndSignature(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	p := validGeneRatification()
	raw, err := SignGeneRatification(p, priv)
	if err != nil {
		t.Fatal(err)
	}
	v := GeneRatificationVerifier{TrustedKeys: map[string]ed25519.PublicKey{"key-1": pub}}
	d, err := v.VerifyGeneRatification(raw, p.ProjectID, p.GeneID, p.ContributionID, p.ContributionDigest, p.MandateID, p.IntentID, p.DecisionID, p.RepositoryIDs)
	if err != nil || d == "" {
		t.Fatalf("digest=%q err=%v", d, err)
	}
	if _, err = v.VerifyGeneRatification(raw, p.ProjectID, p.GeneID, p.ContributionID, "sha256:"+strings.Repeat("c", 64), p.MandateID, p.IntentID, p.DecisionID, p.RepositoryIDs); err == nil {
		t.Fatal("different contribution accepted")
	}
	var env GeneRatificationEnvelope
	_ = json.Unmarshal(raw, &env)
	env.Payload.ProjectID = "other"
	tampered, _ := json.Marshal(env)
	if _, err = v.VerifyGeneRatification(tampered, "other", p.GeneID, p.ContributionID, p.ContributionDigest, p.MandateID, p.IntentID, p.DecisionID, p.RepositoryIDs); err == nil {
		t.Fatal("tampered envelope accepted")
	}
	if _, err = v.VerifyGeneRatification(raw, p.ProjectID, p.GeneID, p.ContributionID, p.ContributionDigest, p.MandateID, p.IntentID, p.DecisionID, []string{"different"}); err == nil {
		t.Fatal("different repository set accepted")
	}
}
