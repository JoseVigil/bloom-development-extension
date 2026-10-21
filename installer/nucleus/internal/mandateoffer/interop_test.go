package mandateoffer

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
)

// Consume exactamente la respuesta que produjo el Backend (backend/test/mandate-offers.spec.ts)
// y la definición firmada por el publicador (mandatedefinition/testdata).
func TestInstallConsumesBackendDeliveryVector(t *testing.T) {
	var delivery struct {
		OrganizationID, InstallationID, Issuer, AuthorityKeyID, AuthorityPublicKeyBase64 string
		DefinitionID, Version, Digest, ResponseBase64                                    string
	}
	raw, err := os.ReadFile(filepath.Join("testdata", "mandate-offer-delivery-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var generic map[string]string
	_ = json.Unmarshal(raw, &generic)
	delivery.OrganizationID, delivery.InstallationID, delivery.Issuer = generic["organization_id"], generic["installation_id"], generic["issuer"]
	delivery.AuthorityKeyID, delivery.AuthorityPublicKeyBase64 = generic["authority_key_id"], generic["authority_public_key_base64"]
	delivery.DefinitionID, delivery.Version, delivery.Digest, delivery.ResponseBase64 = generic["definition_id"], generic["version"], generic["digest"], generic["response_base64"]
	var definitionVector map[string]string
	rawDef, err := os.ReadFile(filepath.Join("..", "mandatedefinition", "testdata", "mandate-definition-v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	_ = json.Unmarshal(rawDef, &definitionVector)
	publisherPub, _ := base64.RawURLEncoding.DecodeString(definitionVector["public_key_base64url"])
	authorityPub, _ := base64.StdEncoding.DecodeString(delivery.AuthorityPublicKeyBase64)
	body, _ := base64.StdEncoding.DecodeString(delivery.ResponseBase64)

	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/v1/mandate/offers/"+delivery.DefinitionID+"/versions/"+delivery.Version || r.URL.Query().Get("digest") != delivery.Digest {
			w.WriteHeader(404)
			return
		}
		_, _ = w.Write(body)
	}))
	defer server.Close()
	_, installationKey, _ := ed25519.GenerateKey(nil)
	appData, mandates := t.TempDir(), filepath.Join(t.TempDir(), ".mandates")
	client := &mandatedelivery.Client{BaseURL: server.URL, Signer: installationKey,
		Store: &mandatedelivery.Store{Root: filepath.Join(appData, "authority", "mandate-delivery")},
		Context: mandatedelivery.Context{OrganizationID: delivery.OrganizationID, InstallationID: delivery.InstallationID, Issuer: delivery.Issuer,
			Trust: authority.TrustBundle{delivery.Issuer: {delivery.AuthorityKeyID: ed25519.PublicKey(authorityPub)}}}}
	in := &Installer{OrganizationID: delivery.OrganizationID, InstallationID: delivery.InstallationID, AppDataDir: appData, MandatesRoot: mandates,
		Receiver: client,
		PublisherKeys: func() (map[string]ed25519.PublicKey, error) {
			return map[string]ed25519.PublicKey{definitionVector["key_id"]: ed25519.PublicKey(publisherPub)}, nil
		},
		Eligibility: func(string) (Eligibility, error) {
			return Eligibility{BindingStatus: "bound", LocationStatus: "present", ContinuityStatus: "matched"}, nil
		},
		NewID: func() (string, error) { return testMandateID, nil }, Now: time.Now}
	result, err := in.Install(context.Background(), mandatedelivery.OfferSelection{DefinitionID: delivery.DefinitionID, Version: delivery.Version, Digest: delivery.Digest}, testProject)
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := os.ReadFile(result.DefinitionPath)
	if requests != 1 || mandatedefinition.FileDigest(stored) != delivery.Digest || result.Instance.Definition.Preparation != "not_defined" {
		t.Fatalf("requests=%d result=%+v", requests, result)
	}
}
