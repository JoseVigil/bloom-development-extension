package gene

import "testing"

func TestVerifyMaterializationReceiptAndTampering(t *testing.T) {
	root := t.TempDir()
	s := &Store{Root: root}
	req := fixtureRequest(t, root)
	receipt, err := s.Materialize(req)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.VerifyMaterializationReceipt(receipt); err != nil {
		t.Fatal(err)
	}
	tampered := receipt
	tampered.ContributionDigest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if err = s.VerifyMaterializationReceipt(tampered); err == nil {
		t.Fatal("tampered receipt accepted")
	}
	replay, err := s.Materialize(req)
	if err != nil {
		t.Fatal(err)
	}
	if !replay.Replay || s.VerifyMaterializationReceipt(replay) != nil {
		t.Fatalf("replay=%+v", replay)
	}
}
