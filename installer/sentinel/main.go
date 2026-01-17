package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"syscall"
)

// JSONRPCRequest representa un comando desde Electron
type JSONRPCRequest struct {
	Method string                 `json:"method"`
	Params map[string]interface{} `json:"params"`
	ID     interface{}            `json:"id"`
}

// JSONRPCResponse representa la respuesta a Electron
type JSONRPCResponse struct {
	Result interface{} `json:"result,omitempty"`
	Error  *RPCError   `json:"error,omitempty"`
	ID     interface{} `json:"id"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// SentinelCore gestiona el ciclo de vida completo
type SentinelCore struct {
	config    *BlueprintConfig
	pm        *ProcessManager
	logHub    *LogHub
	ctx       context.Context
	cancel    context.CancelFunc
	paths     *PathResolver
}

func main() {
	// Setup logging
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[SENTINEL] Initializing Synapse Sentinel v1.0...")

	// Resolver rutas relativas al ejecutable
	paths, err := NewPathResolver()
	if err != nil {
		log.Fatalf("[SENTINEL] FATAL: Cannot resolve paths: %v", err)
	}

	// Validar que existan los archivos críticos
	if err := paths.Validate(); err != nil {
		log.Fatalf("[SENTINEL] FATAL: Path validation failed: %v", err)
	}
	log.Printf("[SENTINEL] Executable dir: %s", paths.executableDir)
	log.Printf("[SENTINEL] Logs dir: %s", paths.logsDir)

	// Cargar configuración desde la ruta resuelta
	cfg, err := LoadBlueprint(paths.GetBlueprintPath())
	if err != nil {
		log.Fatalf("[SENTINEL] FATAL: Cannot load blueprint: %v", err)
	}
	log.Println("[SENTINEL] Blueprint loaded successfully")

	// Crear contexto raíz con cancelación
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Inicializar componentes
	sentinel := &SentinelCore{
		config:    cfg,
		pm:        NewProcessManager(ctx, paths),
		logHub:    NewLogHub(ctx, paths),
		ctx:       ctx,
		cancel:    cancel,
		paths:     paths,
	}

	// Capturar señales del sistema (SIGINT, SIGTERM)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		log.Printf("[SENTINEL] Received signal: %v. Initiating graceful shutdown...", sig)
		sentinel.Shutdown()
	}()

	// Iniciar Log Hub
	go sentinel.logHub.Start()

	// Loop principal: escuchar comandos JSON-RPC desde stdin
	log.Println("[SENTINEL] Ready. Listening for JSON-RPC commands on stdin...")
	decoder := json.NewDecoder(os.Stdin)

	for {
		var req JSONRPCRequest
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				log.Println("[SENTINEL] Stdin closed. Exiting...")
				break
			}
			log.Printf("[SENTINEL] ERROR: Invalid JSON-RPC: %v", err)
			continue
		}

		// Procesar comando
		resp := sentinel.HandleCommand(req)
		
		// Enviar respuesta
		if err := json.NewEncoder(os.Stdout).Encode(resp); err != nil {
			log.Printf("[SENTINEL] ERROR: Cannot send response: %v", err)
		}
	}

	sentinel.Shutdown()
}

// HandleCommand despacha comandos JSON-RPC
func (s *SentinelCore) HandleCommand(req JSONRPCRequest) JSONRPCResponse {
	log.Printf("[SENTINEL] Command received: %s", req.Method)

	switch req.Method {
	case "launch":
		return s.handleLaunch(req)
	case "stop":
		return s.handleStop(req)
	case "status":
		return s.handleStatus(req)
	default:
		return JSONRPCResponse{
			Error: &RPCError{
				Code:    -32601,
				Message: fmt.Sprintf("Method not found: %s", req.Method),
			},
			ID: req.ID,
		}
	}
}

// handleLaunch ejecuta la secuencia de lanzamiento bulletproof
func (s *SentinelCore) handleLaunch(req JSONRPCRequest) JSONRPCResponse {
	profileID, ok := req.Params["profile_id"].(string)
	if !ok || profileID == "" {
		return JSONRPCResponse{
			Error: &RPCError{Code: -32602, Message: "Missing profile_id"},
			ID:    req.ID,
		}
	}

	mode, _ := req.Params["mode"].(string)
	if mode == "" {
		mode = "discovery"
	}

	log.Printf("[SENTINEL] Launching profile: %s (mode: %s)", profileID, mode)

	// PASO 1: Pre-flight checks
	if err := s.pm.PreflightChecks(profileID); err != nil {
		return JSONRPCResponse{
			Error: &RPCError{Code: 1001, Message: fmt.Sprintf("Preflight failed: %v", err)},
			ID:    req.ID,
		}
	}

	// PASO 2: Construir spec de lanzamiento
	launchSpec := s.buildLaunchSpec(profileID, mode)

	// PASO 3: Iniciar Brain service
	if err := s.pm.StartBrainService(); err != nil {
		return JSONRPCResponse{
			Error: &RPCError{Code: 1002, Message: fmt.Sprintf("Brain service failed: %v", err)},
			ID:    req.ID,
		}
	}

	// PASO 4: Lanzar Chromium
	if err := s.pm.LaunchChromium(launchSpec); err != nil {
		return JSONRPCResponse{
			Error: &RPCError{Code: 1003, Message: fmt.Sprintf("Chromium launch failed: %v", err)},
			ID:    req.ID,
		}
	}

	return JSONRPCResponse{
		Result: map[string]interface{}{
			"status":     "launched",
			"profile_id": profileID,
			"mode":       mode,
		},
		ID: req.ID,
	}
}

func (s *SentinelCore) handleStop(req JSONRPCRequest) JSONRPCResponse {
	log.Println("[SENTINEL] Stopping all processes...")
	s.pm.StopAll()
	return JSONRPCResponse{
		Result: map[string]string{"status": "stopped"},
		ID:     req.ID,
	}
}

func (s *SentinelCore) handleStatus(req JSONRPCRequest) JSONRPCResponse {
	status := s.pm.GetStatus()
	return JSONRPCResponse{
		Result: status,
		ID:     req.ID,
	}
}

// buildLaunchSpec construye la especificación de lanzamiento
func (s *SentinelCore) buildLaunchSpec(profileID, mode string) *LaunchSpec {
	spec := &LaunchSpec{
		ProfileID: profileID,
		Flags:     make([]string, 0),
	}

	// Inyectar flags desde blueprint
	spec.Flags = append(spec.Flags, s.config.Engine.Flags.Security...)
	spec.Flags = append(spec.Flags, s.config.Engine.Flags.Isolation...)
	spec.Flags = append(spec.Flags, s.config.Engine.Flags.UX...)
	spec.Flags = append(spec.Flags, s.config.Engine.Flags.Network...)

	// Resolver URL según modo
	if mode == "discovery" {
		spec.URL = s.config.Navigation.DiscoveryURL
	} else if mode == "landing" {
		spec.URL = s.config.Navigation.LandingURL
	} else {
		spec.URL = "about:blank"
	}

	return spec
}

// Shutdown limpieza quirúrgica
func (s *SentinelCore) Shutdown() {
	log.Println("[SENTINEL] Executing surgical cleanup...")
	s.cancel() // Cancela todos los contextos
	s.pm.StopAll()
	s.logHub.Stop()
	log.Println("[SENTINEL] Shutdown complete. Goodbye.")
}