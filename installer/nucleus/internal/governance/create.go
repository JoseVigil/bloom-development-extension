// File: nucleus/internal/governance/create.go
// Comando: nucleus create
// Categoría: GOVERNANCE
// Descripción: Crea la estructura local de un Bloom Nucleus invocando brain nucleus create
// como subprocess. Es el entry point de Workspace y del onboarding stepper.
package governance

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

// ─── Auto-Registro ──────────────────────────────────────────────────────────
// init() se ejecuta automáticamente cuando el paquete es importado.
// Requiere que main.go tenga: _ "nucleus/internal/governance"
func init() {
	core.RegisterCommand("GOVERNANCE", createCreateCommand)
}

// ─── Factory Function ────────────────────────────────────────────────────────

func createCreateCommand(c *core.Core) *cobra.Command {
	var org       string
	var path      string
	var url       string
	var force     bool
	var temporary bool

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create a new Bloom Nucleus project structure",

		Long: `Creates the local Bloom Nucleus filesystem structure by invoking brain nucleus create.

This command is the entry point for Workspace and the onboarding stepper.
It resolves the org slug, then delegates the full tree creation to brain.

Sentinel does NOT intervene here — brain creates the directory tree directly
from the user's inputs.

Post-create sequence (handled by separate commands, NOT here):

  1. GitHub auth  →  brain github auth-login
  2. Nucleus init →  nucleus init --github-id <handle> --master
                     (generates .ownership.json and nucleus-governance.json)
  3. Link projects → brain project add <path> -n <nucleus_path>`,

		Args: cobra.NoArgs,

		// ── Annotations: OBLIGATORIOS según Guía Maestra ──────────────────
		// "category"      → agrupa el comando en el help bajo GOVERNANCE
		// "json_response" → documenta el contrato JSON para Electron/Workspace
		Annotations: map[string]string{
			"category": "GOVERNANCE",
			"json_response": `{
  "nucleus_name": "nucleus-bloom-labs",
  "path": "/home/user/repos/my-project/.bloom/.nucleus-bloom-labs",
  "organization": {
    "name": "bloom-labs",
    "url": ""
  },
  "files_created": [
    ".core/.nucleus-config.json",
    ".core/.rules.bl",
    ".core/.standards.bl",
    ".core/.policies.bl",
    ".core/.meta.json",
    ".governance/architecture/.principles.bl",
    ".governance/architecture/.patterns.bl",
    ".governance/security/.security-standards.bl",
    ".governance/security/.compliance-requirements.bl",
    ".governance/quality/.code-standards.bl",
    ".governance/quality/.testing-requirements.bl",
    ".cache/.projects-snapshot.json",
    ".cache/.semantic-index.json",
    ".cache/.last-sync.json",
    ".relations/.project-links.json",
    "findings/README.md",
    "reports/health-dashboard.json"
  ],
  "projects_detected": 0,
  "is_git_repo": false,
  "timestamp": "2026-06-24T10:00:00.000000"
}`,
		},

		Example: `  # Crear nucleus con org explícita
  nucleus create --org bloom-labs --path /home/user/repos/my-project

  # Crear nucleus con org y URL
  nucleus create --org bloom-labs --url https://bloom-labs.com --path /home/user/repos/my-project

  # Crear nucleus temporal (usa "bloom-local" como slug)
  nucleus create --temporary --path /home/user/repos/my-project

  # Sin --org: también usa "bloom-local" automáticamente
  nucleus create --path /home/user/repos/my-project

  # Sobreescribir si ya existe
  nucleus create --org bloom-labs --path /home/user/repos/my-project --force

  # Modo JSON (para Workspace vía IPC)
  nucleus --json create --org bloom-labs --path /home/user/repos/my-project`,

		Run: func(cmd *cobra.Command, args []string) {
			// ── 1. Resolver el org slug ────────────────────────────────────
			// Si --temporary o --org vacío → usar "bloom-local"
			orgSlug := resolveOrgSlug(org, temporary)

			// ── 2. Invocar brain como subprocess ──────────────────────────
			if err := runBrainCreate(c, orgSlug, path, url, force); err != nil {
				// brain ya escribió en stderr; solo propagamos el exit code
				if exitErr, ok := err.(*exec.ExitError); ok {
					os.Exit(exitErr.ExitCode())
				}
				// Error de infraestructura (brain no encontrado, etc.)
				fmt.Fprintf(os.Stderr, "Error: %v\n", err)
				os.Exit(1)
			}
		},
	}

	// ── Flags ────────────────────────────────────────────────────────────────
	cmd.Flags().StringVar(&org,       "org",       "", "Organization name or GitHub handle")
	cmd.Flags().StringVar(&path,      "path",      "", "Target path for nucleus creation (required)")
	cmd.Flags().StringVar(&url,       "url",       "", "Organization URL")
	cmd.Flags().BoolVar(&force,       "force",     false, "Overwrite existing nucleus directory")
	cmd.Flags().BoolVar(&temporary,   "temporary", false, "Use 'bloom-local' as temporary org name (skips --org)")

	// --path es el único flag obligatorio
	_ = cmd.MarkFlagRequired("path")

	return cmd
}

// ─── Lógica de Negocio ───────────────────────────────────────────────────────

// resolveOrgSlug determina el slug final que se pasa a brain.
// Reglas de precedencia:
//   1. --temporary → siempre "bloom-local"
//   2. --org vacío → "bloom-local"
//   3. --org presente → slugificar el valor
func resolveOrgSlug(org string, temporary bool) string {
	if temporary || org == "" {
		return "bloom-local"
	}
	return slugify(org)
}

// runBrainCreate invoca "brain nucleus create" como subprocess y retransmite
// su stdout/stderr directamente. Workspace recibe el JSON de brain tal cual,
// sin wrapping adicional, lo que respeta el contrato documentado en json_response.
func runBrainCreate(c *core.Core, orgSlug, targetPath, url string, force bool) error {
	// ── Resolver path al binario brain ────────────────────────────────────
	brainPath, err := core.ResolveBrainPath()
	if err != nil {
		// Fallback: intentar "brain" en PATH del sistema
		brainPath = "brain"
	}

	// ── Construir argumentos para brain ───────────────────────────────────
	// --json se pasa siempre que nucleus fue invocado con --json,
	// porque c.Config.OutputJSON refleja el flag global de nucleus.
	brainArgs := []string{"nucleus", "create",
		"--org", orgSlug,
		"--path", targetPath,
	}
	if c.IsJSON {
		// Insertar --json al inicio (flag global de brain)
		brainArgs = append([]string{"--json"}, brainArgs...)
	}
	if url != "" {
		brainArgs = append(brainArgs, "--url", url)
	}
	if force {
		brainArgs = append(brainArgs, "--force")
	}

	// ── Ejecutar subprocess ───────────────────────────────────────────────
	// stdout y stderr fluyen directamente: Workspace recibe el JSON de brain
	// sin intermediarios, preservando el contrato de salida.
	subCmd := exec.Command(brainPath, brainArgs...)
	subCmd.Stdout = os.Stdout
	subCmd.Stderr = os.Stderr

	return subCmd.Run()
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// slugify convierte un string arbitrario al formato válido para GitHub handles:
// minúsculas, espacios y underscores → guiones, elimina caracteres no permitidos.
//
// Ejemplos:
//   "Bloom Labs"  → "bloom-labs"
//   "My_Org 2024" → "my-org-2024"
//   "Hello World!" → "hello-world"
func slugify(s string) string {
	s = strings.ToLower(s)
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "_", "-")

	var result strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}
	return result.String()
}
