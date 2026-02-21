package ignition

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sentinel/internal/core"
	"sentinel/internal/process"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

type Ignition struct {
	Core      *core.Core
	Guardians map[string]interface{}
	Session   struct {
		ServicePID int
		BrowserPID int
		LaunchID   string
		LaunchedAt time.Time
	}
	SpecPath  string
}

func New(c *core.Core) *Ignition {
	return &Ignition{
		Core:      c,
		Guardians: make(map[string]interface{}),
		SpecPath:  "",
	}
}

// ── Definición de IgnitionSpec ───────────────────────────────────────────────

type IgnitionSpec struct {
	Engine struct {
		Executable string `json:"executable"`
		Type       string `json:"type"`
	} `json:"engine"`
	EngineFlags []string `json:"engine_flags"`
	Paths struct {
		Extension string `json:"extension"`
		LogsBase  string `json:"logs_base"`
		UserData  string `json:"user_data"`
	} `json:"paths"`
	TargetURL   string   `json:"target_url"`
	CustomFlags []string `json:"custom_flags"`
	LaunchID    string   `json:"launch_id"`
	ProfileID   string   `json:"profile_id"`
}

func init() {
	core.RegisterCommand("RUNTIME", func(c *core.Core) *cobra.Command {
		var mode string
		var saveOverrides bool

		var overrideAlias string
		var overrideRole string
		var overrideEmail string
		var overrideExtension string
		var overrideService string
		var overrideRegister bool
		var overrideHeartbeat bool
		var overrideStep int

		var linkedAccounts arrayFlags

		var configFile string

		cmd := &cobra.Command{
			Use:   "launch [profile_id]",
			Short: "Arranca una instancia de navegador para un perfil",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				ig := New(c)

				overrides := buildOverridesFromFlags(
					overrideAlias, overrideRole, overrideEmail, overrideExtension, overrideService,
					overrideRegister, overrideHeartbeat, overrideStep,
					cmd.Flags().Changed("override-register"),
					cmd.Flags().Changed("override-heartbeat"),
				)

				if len(linkedAccounts) > 0 {
					accounts, err := parseLinkedAccounts(linkedAccounts)
					if err != nil {
						if c.IsJSON {
							outputLaunchError(fmt.Errorf("error parseando linked accounts: %v", err))
						} else {
							c.Logger.Error("Error parseando linked accounts: %v", err)
						}
						os.Exit(1)
					}
					overrides["linked_accounts"] = accounts
				}

				if configFile != "" {
					fileOverrides, err := loadOverridesFromFile(configFile)
					if err != nil {
						if c.IsJSON {
							outputLaunchError(fmt.Errorf("error leyendo config-file: %v", err))
						} else {
							c.Logger.Error("Error leyendo config-file: %v", err)
						}
						os.Exit(1)
					}
					overrides = mergeOverrides(fileOverrides, overrides)
				}

				configOverride := ""
				if len(overrides) > 0 {
					b, err := json.Marshal(overrides)
					if err != nil {
						c.Logger.Error("Error serializando overrides: %v", err)
						os.Exit(1)
					}
					configOverride = string(b)
				}

				// Lanzamiento real
				chromePID, debugPort, extLoaded, effectiveConfig, err := ig.Launch(profileID, mode, configOverride)
				if err != nil {
					if c.IsJSON {
						outputLaunchError(err)
					} else {
						c.Logger.Error("Fallo al lanzar perfil %s: %v", profileID, err)
					}
					os.Exit(1)
				}

				ig.Session.BrowserPID = chromePID

				if c.IsJSON {
					outputLaunchJSON(profileID, chromePID, debugPort, extLoaded, effectiveConfig)
				} else {
					c.Logger.Success("Perfil %s lanzado exitosamente", profileID)
					c.Logger.Info("  PID: %d   Puerto debug: %d   Ext cargada: %v", chromePID, debugPort, extLoaded)
				}

				if saveOverrides && len(overrides) > 0 {
					if err := ig.updateProfileWithOverrides(profileID, overrides); err != nil {
						c.Logger.Info("[WARN] No se pudieron persistir overrides: %v", err)
					} else {
						c.Logger.Info("Overrides persistidos en profiles.json")
					}
				}

				if c.IsJSON {
					os.Exit(0)
				}
				select {}
			},
		}

		cmd.Flags().StringVar(&mode, "mode", "landing", "Modo de lanzamiento (landing o discovery)")
		cmd.Flags().BoolVar(&saveOverrides, "save", false, "Persistir overrides en profiles.json")
		cmd.Flags().StringVar(&overrideAlias, "override-alias", "", "Sobrescribir alias del perfil")
		cmd.Flags().StringVar(&overrideRole, "override-role", "", "Sobrescribir rol")
		cmd.Flags().StringVar(&overrideEmail, "override-email", "", "Sobrescribir email")
		cmd.Flags().StringVar(&overrideExtension, "override-extension", "", "Sobrescribir extension ID")
		cmd.Flags().StringVar(&overrideService, "override-service", "", "Sobrescribir servicio de registro (google, twitter, github, etc)")
		cmd.Flags().BoolVar(&overrideRegister, "override-register", false, "Sobrescribir flag de registro")
		cmd.Flags().BoolVar(&overrideHeartbeat, "override-heartbeat", false, "Sobrescribir flag de heartbeat")
		cmd.Flags().IntVar(&overrideStep, "override-step", 0, "Sobrescribir step actual")
		cmd.Flags().Var(&linkedAccounts, "add-account", "Agregar linked account (provider,email_or_username,status). Repetible")
		cmd.Flags().StringVar(&configFile, "config-file", "", "Cargar overrides desde JSON (@archivo o - para stdin)")

		return cmd
	})
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type arrayFlags []string

func (i *arrayFlags) String() string {
	return strings.Join(*i, ",")
}

func (i *arrayFlags) Set(value string) error {
	*i = append(*i, value)
	return nil
}

func (i *arrayFlags) Type() string {
	return "string"
}

func buildOverridesFromFlags(alias, role, email, extension, service string, register, heartbeat bool, step int, registerChanged, heartbeatChanged bool) map[string]interface{} {
	overrides := make(map[string]interface{})
	if alias != "" { overrides["profile_alias"] = alias }
	if role != "" { overrides["role"] = role }
	if email != "" { overrides["email"] = email }
	if extension != "" { overrides["extension_id"] = extension }
	if service != "" { overrides["service"] = service }
	if registerChanged { overrides["register"] = register }
	if heartbeatChanged { overrides["heartbeat"] = heartbeat }
	if step > 0 { overrides["step"] = step }
	return overrides
}

func parseLinkedAccounts(inputs []string) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, 0, len(inputs))
	for _, input := range inputs {
		parts := strings.SplitN(input, ",", 3)
		if len(parts) != 3 {
			return nil, fmt.Errorf("formato inválido: %q (esperado provider,identifier,status)", input)
		}
		provider := strings.TrimSpace(parts[0])
		identifier := strings.TrimSpace(parts[1])
		status := strings.TrimSpace(parts[2])

		if status != "active" && status != "inactive" && status != "error" {
			return nil, fmt.Errorf("status inválido: %s", status)
		}

		acc := map[string]interface{}{
			"provider": provider,
			"status":   status,
		}
		if strings.Contains(identifier, "@") {
			acc["email"] = identifier
		} else {
			acc["username"] = identifier
		}
		result = append(result, acc)
	}
	return result, nil
}

func loadOverridesFromFile(path string) (map[string]interface{}, error) {
	var data []byte
	var err error

	switch {
	case path == "-":
		data, err = io.ReadAll(os.Stdin)
	case path != "" && path[0] == '@':
		data, err = os.ReadFile(path[1:])
	default:
		data, err = os.ReadFile(path)
	}
	if err != nil {
		return nil, err
	}

	var overrides map[string]interface{}
	if err := json.Unmarshal(data, &overrides); err != nil {
		return nil, fmt.Errorf("JSON inválido: %w", err)
	}
	return overrides, nil
}

func mergeOverrides(base, priority map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{}, len(base)+len(priority))
	for k, v := range base { result[k] = v }
	for k, v := range priority { result[k] = v }
	return result
}

func outputLaunchJSON(profileID string, pid, port int, extLoaded bool, config map[string]interface{}) {
	result := map[string]interface{}{
		"success":          true,
		"profile_id":       profileID,
		"chrome_pid":       pid,
		"debug_port":       port,
		"extension_loaded": extLoaded,
		"effective_config": config,
	}
	b, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(b))
}

func outputLaunchError(err error) {
	result := map[string]interface{}{
		"success": false,
		"error":   err.Error(),
	}
	b, _ := json.Marshal(result)
	fmt.Println(string(b))
}

// ── Métodos de parada ────────────────────────────────────────────────────────

func (ig *Ignition) Stop(profileID string) error {
	pid := ig.Session.BrowserPID
	if pid == 0 {
		return fmt.Errorf("no hay proceso registrado para el perfil %s", profileID)
	}
	if !ig.isBloomProcess(pid) {
		return fmt.Errorf("PID %d no pertenece a Bloom/Chromium controlado", pid)
	}

	err := process.KillProcessTree(pid)

	// ── HISTORY: cerrar registro con resultado final ───────────────────────────
	result := LaunchResultCleanExit
	if err != nil {
		result = LaunchResultKilled
	}
	if ig.Session.LaunchID != "" {
		if closeErr := ig.CloseLaunchRecord(profileID, ig.Session.LaunchID, result, ig.Session.LaunchedAt); closeErr != nil {
			ig.Core.Logger.Info("[WARN] No se pudo cerrar launch record: %v", closeErr)
		}
	}
	// ─────────────────────────────────────────────────────────────────────────

	return err
}

func (ig *Ignition) isBloomProcess(pid int) bool {
	if runtime.GOOS != "windows" {
		return true
	}
	cmd := exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid), "get", "ExecutablePath", "/format:list")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	path := strings.ToLower(string(output))
	bloomPath := strings.ToLower(filepath.Join(ig.Core.Paths.BinDir, "chrome-win"))
	return strings.Contains(path, bloomPath)
}