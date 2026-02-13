# Metamorph - System State Reconciler

A declarative system state reconciler for managing binaries and configuration through manifest-driven updates with atomic operations and rollback capabilities.

## 🏗️ Architecture

Metamorph uses the **Cobra CLI framework** following Go best practices for enterprise-grade command-line applications.

### Project Structure

```
metamorph/
├── main.go                          # Entry point
├── go.mod                           # Go module definition
├── scripts/
│   ├── build.bat                    # Windows build script with ANSI colors
│   └── build_number.txt            # Auto-incremented build number
├── internal/
│   ├── cli/
│   │   └── commands/               # Cobra command structure
│   │       ├── root.go             # Root command & global flags
│   │       ├── version.go          # version command
│   │       ├── info.go             # info command
│   │       ├── status.go           # status command
│   │       ├── inspect.go          # inspect command
│   │       ├── reconcile.go        # reconcile command
│   │       ├── generate_manifest.go # generate-manifest command
│   │       ├── rollback.go         # rollback command
│   │       └── cleanup.go          # cleanup command
│   └── core/
│       ├── version.go              # Version constants
│       ├── build_info.go           # Auto-generated build info
│       ├── logger.go               # Logging utilities
│       └── paths.go                # Path configuration
└── metamorph-config.json           # Configuration file

```

## 🚀 Building

### Prerequisites
- Go 1.22 or higher
- Windows 10+ (for ANSI color support)

### Build Commands

```bash
cd scripts
build.bat
```

The build script will:
1. ✅ Auto-detect architecture (win32/win64)
2. 🔢 Increment build number automatically
3. ⚙️ Compile with optimizations (`-ldflags="-s -w"`)
4. 📦 Copy resources to output directory
5. 📖 Generate help documentation
6. 📊 Register telemetry via Nucleus CLI
7. 🎨 Display colorized build output

### Build Output

```
native/bin/{platform}/metamorph/
├── metamorph.exe
├── metamorph-config.json
└── help/
    ├── metamorph_help.txt
    └── metamorph_info.json
```

## 📦 Commands

### System Commands
```bash
# Display version information
metamorph version
metamorph version --json

# Display system information
metamorph info
metamorph info --json
```

### Inspection Commands
```bash
# Show current system status
metamorph status
metamorph status --json

# Inspect all managed binaries
metamorph inspect
metamorph inspect --json
```

### Reconciliation Commands
```bash
# Reconcile system against manifest
metamorph reconcile --manifest system.json
metamorph reconcile --manifest system.json --dry-run
metamorph reconcile --manifest system.json --json

# Generate manifest from current state
metamorph generate-manifest
metamorph generate-manifest > current-state.json
```

### Rollback & Maintenance
```bash
# Rollback to previous snapshot
metamorph rollback --latest
metamorph rollback --snapshot 20260213_143000

# Clean up staging and snapshots
metamorph cleanup --all
metamorph cleanup --snapshots
metamorph cleanup --staging
```

## 🎯 Global Flags

All commands support these global flags:

- `--json` - Output in JSON format
- `--verbose` / `-v` - Enable verbose output
- `--help` / `-h` - Display help

## 🔧 Development

### Adding New Commands

1. Create new file in `internal/cli/commands/`
2. Define command using Cobra structure:

```go
package commands

import "github.com/spf13/cobra"

var myCmd = &cobra.Command{
    Use:   "mycommand",
    Short: "Short description",
    Long:  "Long description",
    RunE: func(cmd *cobra.Command, args []string) error {
        // Implementation
        return nil
    },
}

func init() {
    rootCmd.AddCommand(myCmd)
    
    // Add command-specific flags
    myCmd.Flags().StringVar(&myVar, "flag", "", "Description")
}
```

### Version Format

Versions follow the pattern: `v{major}.{minor}.{patch}-build.{number}`

Example: `v1.0.0-build.42`

- Version defined in: `internal/core/version.go`
- Build number auto-incremented in: `scripts/build_number.txt`
- Build info generated in: `internal/core/build_info.go`

## 📝 Configuration

The `metamorph-config.json` file contains system-wide configuration settings. It's automatically copied to the output directory during build.

## 🎨 Build Script Features

The `build.bat` script includes:

- ✅ ANSI color support (Windows 10+)
- 📊 Detailed build progress visualization
- 🔍 Architecture auto-detection
- 🔢 Automatic build number management
- 📋 Comprehensive logging to `%LOCALAPPDATA%\BloomNucleus\logs\build\metamorph_build.log`
- 📦 Resource copying
- 📖 Help documentation generation
- 🔗 Nucleus CLI telemetry integration

## 🏷️ Version History

- **v1.0.0** - Initial release with Cobra framework
  - Full CLI restructure using best practices
  - Proper command separation
  - Enhanced build system with colors
  - Correct build number tracking

## 📄 License

Copyright © 2026 Bloom Technologies
