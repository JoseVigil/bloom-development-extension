package authority

import (
	"encoding/base64"
	"os"
	"testing"
)

func TestServiceIdentityStableAndSeparate(t *testing.T) {
	dir := t.TempDir()
	first, err := CreateServiceIdentity(dir)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CreateServiceIdentity(dir)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Fatal("restart changed service identity")
	}
	raw, err := base64.RawURLEncoding.DecodeString(first)
	if err != nil || len(raw) != 32 {
		t.Fatal("invalid public key")
	}
	if _, err = os.Stat(ServiceIdentityPath(dir)); err != nil {
		t.Fatal(err)
	}
}
