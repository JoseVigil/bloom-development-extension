package ignition

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sentinel/internal/core"
	"sentinel/internal/health"
	"strings"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("RUNTIME", func(c *core.Core) *cobra.Command {
		// === FLAGS PRINCIPALES ===
		var mode string
		var saveOverrides bool
		
		// === OVERRIDE FLAGS SIMPLES ===
		var overrideAlias string
		var overrideRole string
		var overrideEmail string
		var overrideExtension string
		var overrideRegister bool
		var overrideStep int
		
		// === OVERRIDE FLAGS PARA LINKED ACCOUNTS ===
		var linkedAccounts arrayFlags
		
		// === OVERRIDE AVANZADO ===
		var configFile string
		
		cmd := &cobra.Command{
			Use:   "launch [profile_id]",
			Short: "Arranca una instancia de navegador para un perfil",
			Args:  cobra.ExactArgs(1),
			Example: `  sentinel launch profile_001 --mode landing
  sentinel launch profile_002 --mode discovery --override-alias "TestWorker"
  sentinel launch profile_003 --override-role "Premium" --save
  sentinel launch profile_004 --add-account "Google,user@gmail.com,active" --save
  sentinel launch profile_005 --config-file @overrides.json --save
  sentinel --json launch profile_006 --mode discovery | jq .`,
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				ig := New(c)
				
				// === CONSTRUIR OBJETO DE OVERRIDES ===
				overrides := buildOverridesFromFlags(
					overrideAlias,
					overrideRole,
					overrideEmail,
					overrideExtension,
					overrideRegister,
					overrideStep,
					cmd.Flags().Changed("override-register"),
				)
				
				// === PARSEAR LINKED ACCOUNTS ===
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
				
				// === APLICAR OVERRIDES DESDE ARCHIVO/STDIN ===
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
				
				// === PERSISTIR OVERRIDES SI --save ===
				if saveOverrides && len(overrides) > 0 {
					if err := ig.updateProfileWithOverrides(profileID, overrides); err != nil {
						c.Logger.Error("⚠️  No se pudo guardar config: %v", err)
					} else {
						c.Logger.Info("✅ Config guardada permanentemente en profiles.json")
					}
				}
				
				// === CONVERTIR A JSON STRING ===
				configOverride := ""
				if len(overrides) > 0 {
					overrideBytes, _ := json.Marshal(overrides)
					configOverride = string(overrideBytes)
				}
				
				// === EJECUTAR LAUNCH ===
				chromePID, port, extLoaded, effectiveConfig, err := ig.Launch(profileID, mode, configOverride)
				if err != nil {
					if c.IsJSON {
						outputLaunchError(err)
					} else {
						c.Logger.Error("Fallo de lanzamiento: %v", err)
					}
					os.Exit(1)
				}
				
				if c.IsJSON {
					outputLaunchJSON(profileID, chromePID, port, extLoaded, effectiveConfig)
					os.Exit(0)
				}
				select {}
			},
		}
		
		// === DEFINICIÓN DE FLAGS ===
		cmd.Flags().StringVar(&mode, "mode", "landing", "Modo de lanzamiento (landing o discovery)")
		cmd.Flags().BoolVar(&saveOverrides, "save", false, "Persistir overrides en profiles.json")
		cmd.Flags().StringVar(&overrideAlias, "override-alias", "", "Sobrescribir alias del perfil")
		cmd.Flags().StringVar(&overrideRole, "override-role", "", "Sobrescribir rol (ej: Worker, Specialist, Premium)")
		cmd.Flags().StringVar(&overrideEmail, "override-email", "", "Sobrescribir email")
		cmd.Flags().StringVar(&overrideExtension, "override-extension", "", "Sobrescribir extension ID")
		cmd.Flags().BoolVar(&overrideRegister, "override-register", false, "Sobrescribir flag de registro")
		cmd.Flags().IntVar(&overrideStep, "override-step", 0, "Sobrescribir step actual")
		cmd.Flags().Var(&linkedAccounts, "add-account", "Agregar linked account (formato: provider,email_or_username,status). Repetible")
		cmd.Flags().StringVar(&configFile, "config-file", "", "Cargar overrides desde JSON. Usar @archivo.json o - para STDIN")
		
		// Anotaciones
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - El perfil debe existir (usar 'sentinel seed' primero)
  - brain.exe disponible y ejecutable
  - Puerto 5678 libre para servicio Brain
  - Extension ID válido en ignition_spec.json
  - bloom-host.exe en bin/native/ para Native Messaging`

		return cmd
	})
}

// ========== HELPER FUNCTIONS ==========

// buildOverridesFromFlags construye el mapa de overrides desde flags individuales
func buildOverridesFromFlags(
	alias, role, email, extension string,
	register bool,
	step int,
	registerChanged bool,
) map[string]interface{} {
	overrides := make(map[string]interface{})
	
	if alias != "" {
		overrides["profile_alias"] = alias
	}
	if role != "" {
		overrides["role"] = role
	}
	if email != "" {
		overrides["email"] = email
	}
	if extension != "" {
		overrides["extension_id"] = extension
	}
	if registerChanged {
		overrides["register"] = register
	}
	if step > 0 {
		overrides["step"] = step
	}
	
	return overrides
}

// parseLinkedAccounts convierte el formato "provider,email,status" a objetos
func parseLinkedAccounts(accounts []string) ([]map[string]interface{}, error) {
	result := make([]map[string]interface{}, 0, len(accounts))
	
	for _, acc := range accounts {
		parts := strings.Split(acc, ",")
		if len(parts) != 3 {
			return nil, fmt.Errorf("formato inválido: %s (debe ser provider,email_or_username,status)", acc)
		}
		
		provider := strings.TrimSpace(parts[0])
		identifier := strings.TrimSpace(parts[1])
		status := strings.TrimSpace(parts[2])
		
		// Validar status
		if status != "active" && status != "inactive" && status != "error" {
			return nil, fmt.Errorf("status inválido: %s (debe ser active, inactive o error)", status)
		}
		
		account := map[string]interface{}{
			"provider": provider,
			"status":   status,
		}
		
		// Determinar si es email o username (simple heurística)
		if strings.Contains(identifier, "@") {
			account["email"] = identifier
			account["username"] = nil
		} else {
			account["email"] = nil
			account["username"] = identifier
		}
		
		result = append(result, account)
	}
	
	return result, nil
}

// loadOverridesFromFile carga overrides desde archivo o STDIN
func loadOverridesFromFile(path string) (map[string]interface{}, error) {
	var data []byte
	var err error
	
	switch {
	case path == "-":
		data, err = io.ReadAll(os.Stdin)
		if err != nil {
			return nil, fmt.Errorf("error leyendo desde STDIN: %v", err)
		}
	case len(path) > 0 && path[0] == '@':
		data, err = os.ReadFile(path[1:])
		if err != nil {
			return nil, fmt.Errorf("error leyendo archivo %s: %v", path[1:], err)
		}
	default:
		data, err = os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("error leyendo archivo %s: %v", path, err)
		}
	}
	
	var overrides map[string]interface{}
	if err := json.Unmarshal(data, &overrides); err != nil {
		return nil, fmt.Errorf("JSON inválido: %v", err)
	}
	
	return overrides, nil
}

// mergeOverrides combina mapas dando prioridad al segundo
func mergeOverrides(base, priority map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	
	for k, v := range base {
		result[k] = v
	}
	
	for k, v := range priority {
		result[k] = v
	}
	
	return result
}

// arrayFlags permite flags repetibles (--add-account múltiples veces)
type arrayFlags []string

func (i *arrayFlags) String() string {
	return strings.Join(*i, ",")
}

func (i *arrayFlags) Set(value string) error {
	*i = append(*i, value)
	return nil
}

func (i *arrayFlags) Type() string {
	return "stringArray"
}

// ========== OUTPUT FUNCTIONS ==========

func outputLaunchJSON(profileID string, chromePID, port int, extLoaded bool, effectiveConfig map[string]interface{}) {
	result := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"profile_id":       profileID,
			"chrome_pid":       chromePID,
			"port":             port,
			"extension_loaded": extLoaded,
			"effective_config": effectiveConfig,
		},
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func outputLaunchError(err error) {
	result := map[string]interface{}{
		"success": false,
		"error":   err.Error(),
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

// ========== TYPE DEFINITIONS ==========

type IgnitionSpec struct {
	Engine struct {
		Executable string `json:"executable"`
		Type       string `json:"type"`
	} `json:"engine"`
	EngineFlags []string `json:"engine_flags"`
	Paths       struct {
		Extension string `json:"extension"`
		LogsBase  string `json:"logs_base"`
		UserData  string `json:"user_data"`
	} `json:"paths"`
	TargetURL   string   `json:"target_url"`
	CustomFlags []string `json:"custom_flags"`
	LaunchID    string   `json:"launch_id"`
	ProfileID   string   `json:"profile_id"`
}

type LaunchResponse struct {
	Status string `json:"status"`
	Data   struct {
		ProfileID string `json:"profile_id"`
		Launch struct {
			LaunchID string `json:"launch_id"`
			PID      int    `json:"pid"`
		} `json:"launch"`
		LogFiles struct {
			DebugLog string `json:"debug_log"`
			NetLog   string `json:"net_log"`
		} `json:"log_files"`
	} `json:"data"`
}

type Ignition struct {
	Core      *core.Core
	Guardians map[string]*health.GuardianInstance
	SpecPath  string
	Session   struct {
		ServicePID int
		BrowserPID int
		LaunchID   string
	}
}

func New(c *core.Core) *Ignition {
	return &Ignition{
		Core:      c,
		Guardians: make(map[string]*health.GuardianInstance),
	}
}