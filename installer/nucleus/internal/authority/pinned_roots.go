package authority

import (
	"crypto/ed25519"
	"encoding/hex"
)

// DevelopmentPinnedRoots is deliberately non-production. The key is the
// public key from RFC 8032 test vector 1 and has no production authority.
// José must approve and provision the production root separately.
func DevelopmentPinnedRoots() map[string]ed25519.PublicKey {
	raw, _ := hex.DecodeString("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
	return map[string]ed25519.PublicKey{"development-rfc8032-root": ed25519.PublicKey(raw)}
}
