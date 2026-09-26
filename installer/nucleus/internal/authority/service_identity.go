package authority

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"path/filepath"
)

// ServiceIdentityPath is separate from the installation signing identity.
func ServiceIdentityPath(appDataDir string) string {
	return filepath.Join(appDataDir, "authority", "aitap-service-identity.json")
}

// CreateServiceIdentity is an explicit local enrollment step. Runtime Vault
// requests never create an identity or a grant as a side effect.
func CreateServiceIdentity(appDataDir string) (string, error) {
	identity, err := LoadOrCreateLocalIdentity(ServiceIdentityPath(appDataDir))
	if err != nil {
		return "", err
	}
	if len(identity.PublicKey) != ed25519.PublicKeySize {
		return "", errors.New("invalid service identity")
	}
	return base64.RawURLEncoding.EncodeToString(identity.PublicKey), nil
}
