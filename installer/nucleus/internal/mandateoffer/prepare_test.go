package mandateoffer

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/orchestration/mandatecontract"
)

type preparationReceiver struct {
	raw         []byte
	receiptPath string
}

func (r *preparationReceiver) ReceiveOffer(_ context.Context, _ mandatedelivery.OfferSelection, verify func([]byte) error) (mandatedelivery.OfferReceipt, error) {
	if err := verify(r.raw); err != nil {
		return mandatedelivery.OfferReceipt{}, err
	}
	if err := os.WriteFile(r.receiptPath, []byte("verified fixture receipt"), 0600); err != nil {
		return mandatedelivery.OfferReceipt{}, err
	}
	return mandatedelivery.OfferReceipt{Status: "accepted", ReceiptPath: r.receiptPath, Content: r.raw}, nil
}

func TestPrepareKeepsInstalledProvenanceAndDoesNotExecute(t *testing.T) {
	h := newHarness(t)
	original := Instance{Schema: InstanceSchema, SchemaVersion: InstanceSchemaVersion, MandateID: testMandateID,
		Status: StatusInstalled, OrganizationID: testOrg, ProjectID: testProject,
		ProjectBinding: InstanceProjectBinding{Revision: h.eligibility.BindingRevision, CheckedAt: h.eligibility.BindingCheckedAt},
		Definition: InstanceDefinition{DefinitionID: h.sel.DefinitionID, Version: h.sel.Version, Digest: h.sel.Digest,
			Label: "Genesis", PublisherKeyID: "publisher-key", Preparation: mandatedefinition.PreparationNotDefined},
		ReceiptRef:    "authority/original-receipt.json",
		Authorization: InstanceAuthorization{Kind: AuthorizationMasterLocal, InstallationID: testInstallation},
		InstalledAt:   "2026-10-19T19:00:00Z"}
	if err := writeImmutable(DefinitionPath(h.appData, h.sel.DefinitionID, h.sel.Version), h.definition, h.sel.Digest); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(h.mandates, testMandateID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	stateBytes, err := MarshalInstance(original)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), stateBytes, 0600); err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	if err := os.Mkdir(filepath.Join(project, "notes"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(project, "notes", "scope.md"), []byte("approved project input\n"), 0600); err != nil {
		t.Fatal(err)
	}
	pub, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identity := &authority.LocalIdentity{InstallationID: testInstallation, PublicKey: pub, PrivateKey: private}
	identityPath := filepath.Join(h.appData, "authority", "identity.json")
	if err := os.MkdirAll(filepath.Dir(identityPath), 0700); err != nil {
		t.Fatal(err)
	}
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": testInstallation, "public_key": base64.StdEncoding.EncodeToString(pub)})
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	payload, err := mandatedefinition.BuildPreparableOfferPayload(mandatedefinition.InitialOfferInput{
		DefinitionID: h.sel.DefinitionID, Version: "1.1.0", Label: "Genesis", Purpose: "Oferta inicial",
		PublisherID: "bloom", KeyID: "publisher-key", PublishedAt: "2026-10-27T12:00:00Z",
		PolicyRaw:   repoFile(t, "installer/aitap/policies/initial-mandate-v1.json"),
		RegistryRaw: repoFile(t, "installer/aitap/registry/initial-mandate-v1.json"),
	})
	if err != nil {
		t.Fatal(err)
	}
	h.definition, err = mandatedefinition.Sign(payload, h.publisherKey)
	if err != nil {
		t.Fatal(err)
	}
	h.sel = mandatedelivery.OfferSelection{DefinitionID: payload.DefinitionID, Version: payload.Version, Digest: mandatedefinition.FileDigest(h.definition)}
	receiver := &preparationReceiver{raw: h.definition, receiptPath: filepath.Join(h.appData, "authority", "preparation-receipt.json")}
	preparer := &Preparer{OrganizationID: testOrg, AppDataDir: h.appData, MandatesRoot: h.mandates,
		ProjectPath: project, ProjectName: "sample_project", Identity: identity, Receiver: receiver,
		PublisherKeys: func() (map[string]ed25519.PublicKey, error) { return h.publisherKeys, nil },
		Eligibility:   func(string) (Eligibility, error) { return h.eligibility, nil }, Now: time.Now}
	result, err := preparer.Prepare(context.Background(), testMandateID, h.sel, []string{"notes/scope.md"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != StatusPrepared || result.ContractDigest == "" {
		t.Fatalf("bad result: %+v", result)
	}
	stateRaw, err := os.ReadFile(result.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	var state Instance
	if err := json.Unmarshal(stateRaw, &state); err != nil {
		t.Fatal(err)
	}
	if state.Status != StatusPrepared || state.MandateID != original.MandateID ||
		!reflect.DeepEqual(state.Definition, original.Definition) || state.ReceiptRef != original.ReceiptRef ||
		state.Preparation == nil || state.Preparation.Definition.Digest != h.sel.Digest || state.Preparation.ReceiptRef == "" {
		t.Fatalf("lost installed provenance: %+v", state)
	}
	envelope, err := mandatecontract.LoadVerified(filepath.Dir(result.StatePath), identityPath)
	if err != nil || envelope.ContractDigest != result.ContractDigest || envelope.Contract.Domain.ID != testProject ||
		envelope.Contract.Domain.Name != "sample_project" || len(envelope.Contract.Actions) != 6 || len(envelope.Contract.Inputs) != 1 {
		t.Fatalf("prepared contract not verified: %+v err=%v", envelope, err)
	}
	if _, err := os.Stat(filepath.Join(h.mandates, testMandateID, "inputs", "notes", "scope.md")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(h.mandates, testMandateID, "ing")); !os.IsNotExist(err) {
		t.Fatal("preparation created an Intent or workflow artifact")
	}
	again, err := preparer.Prepare(context.Background(), testMandateID, h.sel, []string{"notes/scope.md"})
	if err != nil || again.Status != "already_prepared" || again.ContractDigest != result.ContractDigest {
		t.Fatalf("retry changed prepared contract: %+v err=%v", again, err)
	}
}
