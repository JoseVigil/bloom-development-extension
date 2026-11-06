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

func TestPreparedContractPreservesIntelligenceRequirementByAction(t *testing.T) {
	required, notRequired := true, false
	definition := mandatedefinition.Payload{Plan: mandatedefinition.Plan{Actions: []mandatedefinition.PlanAction{
		{ActionID: "exp-4", Type: "run_intent", IntentType: "exp", RequiresIntelligence: &required},
		{ActionID: "exp-6", Type: "run_intent", IntentType: "exp", RequiresIntelligence: &notRequired},
		{ActionID: "legacy", Type: "run_intent", IntentType: "exp"},
	}}}
	contract := contractFromDefinition(Instance{MandateID: "mandate", ProjectID: "project"}, definition, "project", "binding", "policy", "registry", nil)
	if len(contract.Actions) != 3 || contract.Actions[0].RequiresIntelligence == nil || !*contract.Actions[0].RequiresIntelligence ||
		contract.Actions[1].RequiresIntelligence == nil || *contract.Actions[1].RequiresIntelligence ||
		contract.Actions[2].RequiresIntelligence != nil {
		t.Fatalf("prepared contract lost per-action intelligence markers: %+v", contract.Actions)
	}
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
		DefinitionID: h.sel.DefinitionID, Version: "1.2.0", Label: "Genesis", Purpose: "Oferta inicial",
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
	intelligenceIDs, err := envelope.Contract.IntelligenceActionIDs()
	if err != nil || !reflect.DeepEqual(intelligenceIDs, []string{"ing-1", "dis-2"}) {
		t.Fatalf("prepared Intelligence Supply Actions differ from signed definition: %v err=%v", intelligenceIDs, err)
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

func TestUpgradePreparedPreservesSignedHistoryAndRetries(t *testing.T) {
	h := newHarness(t)
	project := t.TempDir()
	if err := os.WriteFile(filepath.Join(project, "README.md"), []byte("frozen\n"), 0600); err != nil {
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
	inst := Instance{Schema: InstanceSchema, SchemaVersion: InstanceSchemaVersion, MandateID: testMandateID, Status: StatusInstalled,
		OrganizationID: testOrg, ProjectID: testProject, Definition: InstanceDefinition{DefinitionID: h.sel.DefinitionID, Version: h.sel.Version,
			Digest: h.sel.Digest, Label: "Genesis", PublisherKeyID: "publisher-key", Preparation: mandatedefinition.PreparationNotDefined},
		ReceiptRef: "authority/original-receipt.json", Authorization: InstanceAuthorization{Kind: AuthorizationMasterLocal, InstallationID: testInstallation}}
	if err := writeImmutable(DefinitionPath(h.appData, h.sel.DefinitionID, h.sel.Version), h.definition, h.sel.Digest); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(h.mandates, testMandateID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	stateRaw, _ := MarshalInstance(inst)
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), stateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	input := mandatedefinition.InitialOfferInput{DefinitionID: h.sel.DefinitionID, Version: "1.2.0", Label: "Genesis", Purpose: "Oferta inicial",
		PublisherID: "bloom", KeyID: "publisher-key", PublishedAt: "2026-10-27T12:00:00Z",
		PolicyRaw: repoFile(t, "installer/aitap/policies/initial-mandate-v1.json"), RegistryRaw: repoFile(t, "installer/aitap/registry/initial-mandate-v1.json")}
	payload, err := mandatedefinition.BuildPreparableOfferPayload(input)
	if err != nil {
		t.Fatal(err)
	}
	upgradeRaw, err := mandatedefinition.Sign(payload, h.publisherKey)
	if err != nil {
		t.Fatal(err)
	}
	upgradeSel := mandatedelivery.OfferSelection{DefinitionID: input.DefinitionID, Version: "1.2.0", Digest: mandatedefinition.FileDigest(upgradeRaw)}
	payload.Version = "1.1.0"
	for i := range payload.Plan.Actions {
		payload.Plan.Actions[i].RequiresIntelligence = nil
		payload.Plan.Actions[i].RequiredCapabilities = nil
	}
	previousRaw, err := mandatedefinition.Sign(payload, h.publisherKey)
	if err != nil {
		t.Fatal(err)
	}
	previousSel := mandatedelivery.OfferSelection{DefinitionID: input.DefinitionID, Version: "1.1.0", Digest: mandatedefinition.FileDigest(previousRaw)}
	receiver := &preparationReceiver{raw: previousRaw, receiptPath: filepath.Join(h.appData, "authority", "preparation-receipt.json")}
	preparer := &Preparer{OrganizationID: testOrg, AppDataDir: h.appData, MandatesRoot: h.mandates, ProjectPath: project,
		ProjectName: "sample_project", Identity: identity, Receiver: receiver, PublisherKeys: func() (map[string]ed25519.PublicKey, error) { return h.publisherKeys, nil },
		Eligibility: func(string) (Eligibility, error) { return h.eligibility, nil }, Now: time.Now}
	old, err := preparer.Prepare(context.Background(), testMandateID, previousSel, []string{"README.md"})
	if err != nil {
		t.Fatal(err)
	}
	oldRaw, err := os.ReadFile(old.ContractPath)
	if err != nil {
		t.Fatal(err)
	}
	oldStateRaw, err := os.ReadFile(old.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	receiver.raw, receiver.receiptPath = upgradeRaw, filepath.Join(h.appData, "authority", "upgrade-receipt.json")
	preparer.Upgrade = true
	result, err := preparer.Prepare(context.Background(), testMandateID, upgradeSel, []string{"README.md"})
	if err != nil {
		t.Fatal(err)
	}
	if result.ContractDigest == old.ContractDigest {
		t.Fatal("upgrade kept old digest")
	}
	stateRaw, err = os.ReadFile(result.StatePath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(stateRaw, &inst); err != nil {
		t.Fatal(err)
	}
	if inst.Status != StatusPrepared || inst.MandateID != testMandateID || inst.Preparation.Definition.Version != "1.2.0" ||
		len(inst.PreparationHistory) != 1 || inst.PreparationHistory[0].ContractDigest != old.ContractDigest {
		t.Fatalf("bad transition state: %+v", inst)
	}
	archived, err := os.ReadFile(filepath.Join(dir, "preparations", old.ContractDigest, "mandate.json"))
	if err != nil || !reflect.DeepEqual(archived, oldRaw) {
		t.Fatal("original signed contract was not preserved")
	}
	if err := verifyTransitionArtifacts(preparer, inst, dir, identityPath); err != nil {
		t.Fatal(err)
	}
	preparedContract, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil {
		t.Fatal(err)
	}
	intelligenceIDs, err := preparedContract.Contract.IntelligenceActionIDs()
	if err != nil || !reflect.DeepEqual(intelligenceIDs, []string{"ing-1", "dis-2"}) {
		t.Fatalf("upgraded contract does not expose approved Core to AITAP actions: %v %v", intelligenceIDs, err)
	}
	installed, err := Installations(h.appData, h.mandates)
	if err != nil || len(installed) != 1 || !installed[0].Consistent {
		t.Fatalf("upgrade not durable: %+v %v", installed, err)
	}
	again, err := preparer.Prepare(context.Background(), testMandateID, upgradeSel, []string{"README.md"})
	if err != nil || again.Status != "already_prepared" {
		t.Fatalf("retry failed: %+v %v", again, err)
	}
	if err := os.WriteFile(result.ContractPath, oldRaw, 0600); err != nil {
		t.Fatal(err)
	}
	recovered, err := preparer.Prepare(context.Background(), testMandateID, upgradeSel, []string{"README.md"})
	if err != nil || recovered.ContractDigest != result.ContractDigest {
		t.Fatalf("pending transition did not resume: %+v %v", recovered, err)
	}
	active, err := mandatecontract.LoadVerified(dir, identityPath)
	if err != nil || active.ContractDigest != result.ContractDigest {
		t.Fatal("active contract not restored")
	}
	// A crash before the state commit leaves immutable candidate artifacts.
	// Repeating the explicit operation must reuse the signed transition receipt.
	if err := os.WriteFile(result.StatePath, oldStateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(result.ContractPath, oldRaw, 0600); err != nil {
		t.Fatal(err)
	}
	recovered, err = preparer.Prepare(context.Background(), testMandateID, upgradeSel, []string{"README.md"})
	if err != nil || recovered.ContractDigest != result.ContractDigest {
		t.Fatalf("precommit retry failed: %+v %v", recovered, err)
	}
}
