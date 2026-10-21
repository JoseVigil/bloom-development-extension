// mandate-definition-sign is the publisher's offline tool for the initial
// Mandate offer. The private key never reaches the Backend or Nucleus:
//
//	keygen  creates a publisher key file (0600) and prints the public half
//	sign    builds and signs a definition (preparation not_defined) and prints its digest
//
// The Backend receives only the signed definition and the public key.
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"nucleus/internal/mandatedefinition"
)

type keyFile struct {
	KeyID              string `json:"key_id"`
	SeedBase64         string `json:"seed_base64"`
	PublicKeyBase64URL string `json:"public_key_base64url"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: mandate-definition-sign keygen|sign [flags]")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "keygen":
		err = keygen(os.Args[2:])
	case "sign":
		err = sign(os.Args[2:])
	default:
		err = fmt.Errorf("unknown subcommand %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func keygen(args []string) error {
	fs := flag.NewFlagSet("keygen", flag.ExitOnError)
	out := fs.String("out", "", "key file to create (must not exist)")
	keyID := fs.String("key-id", "", "key_id published in the trust manifest")
	_ = fs.Parse(args)
	if *out == "" || *keyID == "" {
		return fmt.Errorf("--out and --key-id are required")
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	k := keyFile{KeyID: *keyID, SeedBase64: base64.StdEncoding.EncodeToString(priv.Seed()), PublicKeyBase64URL: base64.RawURLEncoding.EncodeToString(pub)}
	data, _ := json.MarshalIndent(k, "", "  ")
	f, err := os.OpenFile(*out, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(append(data, '\n')); err != nil {
		return err
	}
	fmt.Printf("MANDATE_DEFINITION_KEY_ID=%s\nMANDATE_DEFINITION_PUBLIC_KEY_B64URL=%s\n", k.KeyID, k.PublicKeyBase64URL)
	return nil
}

func sign(args []string) error {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	keyPath := fs.String("key", "", "publisher key file")
	definitionID := fs.String("definition-id", "", "definition_id (UUID, stable across versions)")
	version := fs.String("version", "", "semver version")
	label := fs.String("label", "Genesis", "label shown in Wisdom")
	purpose := fs.String("purpose", "", "short purpose shown in Wisdom")
	publisher := fs.String("publisher", "bloom", "publisher_id")
	policy := fs.String("policy", "", "policy JSON file")
	registry := fs.String("registry", "", "registry JSON file")
	out := fs.String("out", "", "signed definition file to create (must not exist)")
	_ = fs.Parse(args)
	if *keyPath == "" || *definitionID == "" || *version == "" || *purpose == "" || *policy == "" || *registry == "" || *out == "" {
		return fmt.Errorf("--key, --definition-id, --version, --purpose, --policy, --registry and --out are required")
	}
	raw, err := os.ReadFile(*keyPath)
	if err != nil {
		return err
	}
	var k keyFile
	if err := json.Unmarshal(raw, &k); err != nil {
		return err
	}
	seed, err := base64.StdEncoding.DecodeString(k.SeedBase64)
	if err != nil || len(seed) != ed25519.SeedSize {
		return fmt.Errorf("invalid key file")
	}
	policyRaw, err := os.ReadFile(*policy)
	if err != nil {
		return err
	}
	registryRaw, err := os.ReadFile(*registry)
	if err != nil {
		return err
	}
	payload, err := mandatedefinition.BuildInitialOfferPayload(mandatedefinition.InitialOfferInput{
		DefinitionID: *definitionID, Version: *version, Label: *label, Purpose: *purpose, PublisherID: *publisher, KeyID: k.KeyID,
		PublishedAt: time.Now().UTC().Truncate(time.Second).Format(time.RFC3339), PolicyRaw: policyRaw, RegistryRaw: registryRaw})
	if err != nil {
		return err
	}
	signed, err := mandatedefinition.Sign(payload, ed25519.NewKeyFromSeed(seed))
	if err != nil {
		return err
	}
	if _, err := mandatedefinition.Verify(signed, map[string]ed25519.PublicKey{k.KeyID: ed25519.NewKeyFromSeed(seed).Public().(ed25519.PublicKey)}); err != nil {
		return err
	}
	f, err := os.OpenFile(*out, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Write(signed); err != nil {
		return err
	}
	fmt.Printf("definition_id=%s\nversion=%s\ndigest=%s\n", payload.DefinitionID, payload.Version, mandatedefinition.FileDigest(signed))
	return nil
}
