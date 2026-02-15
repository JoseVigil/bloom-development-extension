package inspection

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCalculateSHA256 tests SHA-256 hash calculation
func TestCalculateSHA256(t *testing.T) {
	// Create a temporary test file
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	content := []byte("Hello, World!")
	
	if err := os.WriteFile(testFile, content, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Calculate hash
	hash, err := CalculateSHA256(testFile)
	if err != nil {
		t.Fatalf("CalculateSHA256 failed: %v", err)
	}

	// Expected SHA-256 of "Hello, World!"
	expected := "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
	if hash != expected {
		t.Errorf("Expected hash %s, got %s", expected, hash)
	}
}

// TestCalculateSHA256_NonExistent tests behavior with missing file
func TestCalculateSHA256_NonExistent(t *testing.T) {
	_, err := CalculateSHA256("/non/existent/file.txt")
	if err == nil {
		t.Error("Expected error for non-existent file, got nil")
	}
}

// TestParseVersionFromOutput tests version parsing from various formats
func TestParseVersionFromOutput(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Temporal format",
			input:    "temporal version 1.22.0",
			expected: "1.22.0",
		},
		{
			name:     "Ollama format",
			input:    "ollama version is 0.1.25",
			expected: "0.1.25",
		},
		{
			name:     "Node format",
			input:    "v20.11.0",
			expected: "20.11.0",
		},
		{
			name:     "Chrome format",
			input:    "Google Chrome 146.0.7635.0",
			expected: "146.0.7635.0",
		},
		{
			name:     "Simple version",
			input:    "version 3.2.1",
			expected: "3.2.1",
		},
		{
			name:     "No version",
			input:    "Some random output",
			expected: "unknown",
		},
		{
			name:     "Version with suffix",
			input:    "version 1.2.3-beta",
			expected: "1.2.3-beta",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ParseVersionFromOutput(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

// TestFormatSize tests human-readable size formatting
func TestFormatSize(t *testing.T) {
	tests := []struct {
		name     string
		bytes    int64
		expected string
	}{
		{"Bytes", 500, "500 B"},
		{"Kilobytes", 1536, "1.5 KB"},
		{"Megabytes", 15728640, "15.0 MB"},
		{"Gigabytes", 1073741824, "1.0 GB"},
		{"Large GB", 2147483648, "2.0 GB"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := FormatSize(tt.bytes)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

// TestFileExists tests file existence checking
func TestFileExists(t *testing.T) {
	tmpDir := t.TempDir()
	
	// Create a test file
	testFile := filepath.Join(tmpDir, "exists.txt")
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Test existing file
	if !FileExists(testFile) {
		t.Error("Expected file to exist")
	}

	// Test non-existent file
	if FileExists(filepath.Join(tmpDir, "nonexistent.txt")) {
		t.Error("Expected file to not exist")
	}

	// Test directory (should return false)
	if FileExists(tmpDir) {
		t.Error("Expected directory to return false")
	}
}

// TestGetFileInfo tests file info retrieval
func TestGetFileInfo(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.txt")
	content := []byte("Hello, World!")
	
	if err := os.WriteFile(testFile, content, 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	size, modTime, err := GetFileInfo(testFile)
	if err != nil {
		t.Fatalf("GetFileInfo failed: %v", err)
	}

	if size != int64(len(content)) {
		t.Errorf("Expected size %d, got %d", len(content), size)
	}

	if modTime.IsZero() {
		t.Error("Expected non-zero modification time")
	}
}

// TestExtractBinaryName tests binary name extraction
func TestExtractBinaryName(t *testing.T) {
	tests := []struct {
		path     string
		expected string
	}{
		{"brain/brain.exe", "Brain"},
		{"nucleus/nucleus.exe", "Nucleus"},
		{"native/bloom-host.exe", "Host"},
		{"conductor/bloom-conductor.exe", "Conductor"},
		{"cortex/bloom-cortex.blx", "Cortex"},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			result := extractBinaryName(tt.path)
			if result != tt.expected {
				t.Errorf("Expected %s, got %s", tt.expected, result)
			}
		})
	}
}

// TestCalculateSummary tests summary calculation
func TestCalculateSummary(t *testing.T) {
	managed := []ManagedBinary{
		{Status: "healthy", SizeBytes: 1000},
		{Status: "healthy", SizeBytes: 2000},
		{Status: "missing", SizeBytes: 0},
	}

	external := []ExternalBinary{
		{Status: "healthy", SizeBytes: 5000, UpdateAvailable: true},
		{Status: "unknown", SizeBytes: 3000, UpdateAvailable: false},
	}

	summary := calculateSummary(managed, external)

	if summary.TotalBinaries != 5 {
		t.Errorf("Expected 5 total binaries, got %d", summary.TotalBinaries)
	}
	if summary.ManagedCount != 3 {
		t.Errorf("Expected 3 managed binaries, got %d", summary.ManagedCount)
	}
	if summary.ExternalCount != 2 {
		t.Errorf("Expected 2 external binaries, got %d", summary.ExternalCount)
	}
	if summary.HealthyCount != 3 {
		t.Errorf("Expected 3 healthy binaries, got %d", summary.HealthyCount)
	}
	if summary.MissingCount != 1 {
		t.Errorf("Expected 1 missing binary, got %d", summary.MissingCount)
	}
	if summary.UpdatesAvailable != 1 {
		t.Errorf("Expected 1 update available, got %d", summary.UpdatesAvailable)
	}
	if summary.TotalSizeBytes != 11000 {
		t.Errorf("Expected 11000 total bytes, got %d", summary.TotalSizeBytes)
	}
}

// Benchmark tests
func BenchmarkCalculateSHA256(b *testing.B) {
	// Create a 1MB test file
	tmpDir := b.TempDir()
	testFile := filepath.Join(tmpDir, "benchmark.bin")
	content := make([]byte, 1024*1024) // 1MB
	
	if err := os.WriteFile(testFile, content, 0644); err != nil {
		b.Fatalf("Failed to create test file: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = CalculateSHA256(testFile)
	}
}

func BenchmarkParseVersionFromOutput(b *testing.B) {
	input := "temporal version 1.22.0"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = ParseVersionFromOutput(input)
	}
}