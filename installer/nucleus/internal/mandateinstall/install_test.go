package mandateinstall

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"nucleus/internal/mandatedelivery"
)

const installTestOrgID = "org-test"
const installTestInstallationID = "installation-test"

func sha256HexOfTestContent(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

// writeMandateReceiptFixture escribe un receipt.json en el mismo layout que
// mandatedelivery.Store.Accept ya produce (org-{hash}/installation-{hash}/mandate-{hash}/
// version-{hash}/receipt.json) — sin pasar por Accept ni por ninguna firma real: esta
// materialización no re-verifica la firma del delivery, así que los tests no necesitan una
// firma Ed25519 válida, sólo el JSON que Accept ya habría escrito.
func writeMandateReceiptFixture(t *testing.T, appDataDir, mandateID, version, envelopeDigest, mandateBase64 string, acceptedAt time.Time) {
	t.Helper()
	delivery := mandatedelivery.Delivery{
		Envelope: mandatedelivery.Envelope{
			MandateID:      mandateID,
			OrganizationID: installTestOrgID,
			InstallationID: installTestInstallationID,
			Version:        version,
			Digest:         envelopeDigest,
			IssuedAt:       acceptedAt.UTC().Format(time.RFC3339Nano),
			Signature:      "irrelevant-not-reverified",
			KeyID:          "key-1",
		},
		MandateBase64: mandateBase64,
	}
	body, err := json.Marshal(delivery)
	if err != nil {
		t.Fatal(err)
	}
	receipt := mandatedelivery.Receipt{
		OrganizationID: installTestOrgID,
		InstallationID: installTestInstallationID,
		MandateID:      mandateID,
		Version:        version,
		Digest:         envelopeDigest,
		KeyID:          "key-1",
		Domain:         mandatedelivery.Domain,
		AcceptedAt:     acceptedAt,
		Body:           body,
	}
	raw, err := json.Marshal(receipt)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(
		mandateReceiptVersionsDir(appDataDir, installTestOrgID, installTestInstallationID, mandateID),
		mandateReceiptHashComponent("version-", version),
	)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "receipt.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
}

// ── LoadLatestReceipt ──────────────────────────────────────────────

// TestLoadLatestReceiptMissing cubre: "recibo inexistente para el mandateId dado → error
// claro, sin tocar el filesystem de mandates".
func TestLoadLatestReceiptMissing(t *testing.T) {
	appDataDir := t.TempDir()
	_, err := LoadLatestReceipt(appDataDir, installTestOrgID, installTestInstallationID, "does-not-exist")
	if err == nil {
		t.Fatal("expected error for missing receipt")
	}
}

// TestLoadLatestReceiptPicksMostRecentVersion cubre: "con más de un version-* bajo el
// mismo mandate-{hash} → toma el de AcceptedAt más reciente".
func TestLoadLatestReceiptPicksMostRecentVersion(t *testing.T) {
	appDataDir := t.TempDir()
	mandateID := "m-multi"
	older := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	newer := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	oldContent := []byte(`{"status":"signed","v":"old"}`)
	newContent := []byte(`{"status":"signed","v":"new"}`)
	writeMandateReceiptFixture(t, appDataDir, mandateID, "1.0.0",
		sha256HexOfTestContent(oldContent), base64.StdEncoding.EncodeToString(oldContent), older)
	writeMandateReceiptFixture(t, appDataDir, mandateID, "2.0.0",
		sha256HexOfTestContent(newContent), base64.StdEncoding.EncodeToString(newContent), newer)

	receipt, err := LoadLatestReceipt(appDataDir, installTestOrgID, installTestInstallationID, mandateID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receipt.Version != "2.0.0" {
		t.Fatalf("expected the most recent version (2.0.0), got %s", receipt.Version)
	}
}

// ── ExtractContent ─────────────────────────────────────────────────

func TestExtractContentValid(t *testing.T) {
	content := []byte(`{"status":"signed","mandateId":"m1"}`)
	delivery := mandatedelivery.Delivery{
		Envelope:      mandatedelivery.Envelope{MandateID: "m1", Digest: sha256HexOfTestContent(content)},
		MandateBase64: base64.StdEncoding.EncodeToString(content),
	}
	body, err := json.Marshal(delivery)
	if err != nil {
		t.Fatal(err)
	}
	receipt := mandatedelivery.Receipt{MandateID: "m1", Body: body}

	gotDelivery, gotContent, err := ExtractContent(receipt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(gotContent) != string(content) {
		t.Fatalf("content mismatch: got %s want %s", gotContent, content)
	}
	if gotDelivery.Envelope.MandateID != "m1" {
		t.Fatalf("unexpected mandate id: %s", gotDelivery.Envelope.MandateID)
	}
}

// TestExtractContentCorruptDigest cubre: "recibo con body_base64 corrupto (digest no
// coincide) → error duro, nada se escribe".
func TestExtractContentCorruptDigest(t *testing.T) {
	content := []byte(`{"status":"signed","mandateId":"m1"}`)
	delivery := mandatedelivery.Delivery{
		Envelope:      mandatedelivery.Envelope{MandateID: "m1", Digest: "0000corrupt0000"},
		MandateBase64: base64.StdEncoding.EncodeToString(content),
	}
	body, err := json.Marshal(delivery)
	if err != nil {
		t.Fatal(err)
	}
	receipt := mandatedelivery.Receipt{MandateID: "m1", Body: body}

	if _, _, err := ExtractContent(receipt); err == nil {
		t.Fatal("expected error for digest mismatch")
	}
}

func TestExtractContentInvalidBase64(t *testing.T) {
	delivery := mandatedelivery.Delivery{
		Envelope:      mandatedelivery.Envelope{MandateID: "m1", Digest: "irrelevant"},
		MandateBase64: "not-valid-base64!!",
	}
	body, err := json.Marshal(delivery)
	if err != nil {
		t.Fatal(err)
	}
	receipt := mandatedelivery.Receipt{MandateID: "m1", Body: body}

	if _, _, err := ExtractContent(receipt); err == nil {
		t.Fatal("expected error for invalid base64")
	}
}

// ── MaterializeFile ────────────────────────────────────────────────

// TestMaterializeFileNewWrite cubre: "recibo válido, mandate.json no existe todavía → se
// crea con el contenido exacto (comparar bytes contra un fixture)".
func TestMaterializeFileNewWrite(t *testing.T) {
	root := t.TempDir()
	content := []byte(`{"status":"signed","mandateId":"m1"}`)

	path, already, err := MaterializeFile(root, "m1", content)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if already {
		t.Fatal("expected a fresh write, not already installed")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(content) {
		t.Fatalf("bytes mismatch: got %s want %s", got, content)
	}
}

// TestMaterializeFileIdempotent cubre: "re-ejecutar el comando con el mismo recibo →
// idempotente, no reescribe, reporta éxito".
func TestMaterializeFileIdempotent(t *testing.T) {
	root := t.TempDir()
	content := []byte(`{"status":"signed","mandateId":"m1"}`)

	path1, already1, err := MaterializeFile(root, "m1", content)
	if err != nil {
		t.Fatalf("unexpected error on first write: %v", err)
	}
	if already1 {
		t.Fatal("first write should not be already_installed")
	}
	info1, err := os.Stat(path1)
	if err != nil {
		t.Fatal(err)
	}

	path2, already2, err := MaterializeFile(root, "m1", content)
	if err != nil {
		t.Fatalf("unexpected error on second write: %v", err)
	}
	if !already2 {
		t.Fatal("re-run with the same receipt should be idempotent")
	}
	if path1 != path2 {
		t.Fatalf("path changed between runs: %s vs %s", path1, path2)
	}
	info2, err := os.Stat(path2)
	if err != nil {
		t.Fatal(err)
	}
	if !info1.ModTime().Equal(info2.ModTime()) {
		t.Fatal("idempotent re-run must not rewrite the file")
	}
}

// TestMaterializeFileContentConflict cubre: "mandate.json ya existe con contenido distinto
// al del recibo → error duro, no se pisa".
func TestMaterializeFileContentConflict(t *testing.T) {
	root := t.TempDir()
	original := []byte(`{"status":"signed","mandateId":"m1","v":1}`)
	conflicting := []byte(`{"status":"signed","mandateId":"m1","v":2}`)

	if _, _, err := MaterializeFile(root, "m1", original); err != nil {
		t.Fatalf("unexpected error on first write: %v", err)
	}
	if _, _, err := MaterializeFile(root, "m1", conflicting); err == nil {
		t.Fatal("expected error when content differs from what's on disk")
	}

	got, err := os.ReadFile(filepath.Join(root, "m1", "mandate.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(original) {
		t.Fatal("conflicting write must not overwrite the existing mandate.json")
	}
}
