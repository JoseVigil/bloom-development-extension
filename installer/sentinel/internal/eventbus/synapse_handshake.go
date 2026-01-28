package eventbus

import (
	"fmt"
	"log"
	"time"
)

/*
═══════════════════════════════════════════════════════════════════════════════
SYNAPSE PROTOCOL - HANDSHAKE DE 3 FASES
═══════════════════════════════════════════════════════════════════════════════

El protocolo Synapse establece una comunicación confiable entre la extensión
de Chrome (Bloom Extension) y el Brain a través de un handshake de 3 fases.
Sentinel monitorea este proceso y reporta el estado a la UI.

───────────────────────────────────────────────────────────────────────────────
FASE 1: INJECTION & DISCOVERY
───────────────────────────────────────────────────────────────────────────────

Objetivo: La extensión se inyecta en la página y descubre el endpoint del Brain.

Flujo:
1. Brain lanza Chrome con perfil específico
2. Extensión se carga automáticamente
3. Extensión envía mensaje de discovery:
   
   Extension → Brain:
   {
     "type": "SYNAPSE_DISCOVERY",
     "profile_id": "profile_001",
     "extension_id": "chrome-extension://abc123...",
     "version": "1.0.0",
     "timestamp": 1234567890123456
   }

4. Brain responde con configuración:
   
   Brain → Extension:
   {
     "type": "SYNAPSE_CONFIG",
     "brain_endpoint": "ws://127.0.0.1:5678",
     "profile_id": "profile_001",
     "security_token": "token_xyz...",
     "timestamp": 1234567890123457
   }

Eventos emitidos por Sentinel:
- SYNAPSE_PHASE_1_STARTED
- SYNAPSE_PHASE_1_COMPLETE
- SYNAPSE_PHASE_1_TIMEOUT (si falla)

Estado esperado: La extensión conoce el endpoint del Brain.

───────────────────────────────────────────────────────────────────────────────
FASE 2: WEBSOCKET ESTABLISHMENT
───────────────────────────────────────────────────────────────────────────────

Objetivo: Establecer conexión WebSocket persistente entre extensión y Brain.

Flujo:
1. Extensión intenta conectar al WebSocket del Brain
2. Brain acepta la conexión y valida el security_token
3. Extensión envía handshake inicial:
   
   Extension → Brain (WebSocket):
   {
     "type": "SYNAPSE_HANDSHAKE",
     "profile_id": "profile_001",
     "security_token": "token_xyz...",
     "capabilities": ["dom_access", "network_intercept", "storage"],
     "timestamp": 1234567890123458
   }

4. Brain confirma y envía configuración de runtime:
   
   Brain → Extension (WebSocket):
   {
     "type": "SYNAPSE_READY",
     "profile_id": "profile_001",
     "session_id": "session_abc...",
     "permissions": {
       "can_inject_scripts": true,
       "can_intercept_network": true,
       "can_access_storage": true
     },
     "timestamp": 1234567890123459
   }

Eventos emitidos por Sentinel:
- SYNAPSE_PHASE_2_STARTED
- SYNAPSE_PHASE_2_COMPLETE
- SYNAPSE_PHASE_2_FAILED (si falla conexión WS)

Estado esperado: WebSocket activo y autenticado.

───────────────────────────────────────────────────────────────────────────────
FASE 3: RUNTIME INITIALIZATION
───────────────────────────────────────────────────────────────────────────────

Objetivo: Inicializar el runtime de la extensión y preparar para intents.

Flujo:
1. Extensión carga módulos de runtime (DOM, Network, Storage, etc.)
2. Extensión registra handlers para diferentes tipos de intents
3. Extensión envía confirmación de ready:
   
   Extension → Brain (WebSocket):
   {
     "type": "RUNTIME_READY",
     "profile_id": "profile_001",
     "session_id": "session_abc...",
     "loaded_modules": [
       "dom_manager",
       "network_interceptor",
       "storage_bridge",
       "intent_router"
     ],
     "timestamp": 1234567890123460
   }

4. Brain confirma que el perfil está operacional:
   
   Brain → Sentinel:
   {
     "type": "ONBOARDING_COMPLETE",
     "profile_id": "profile_001",
     "session_id": "session_abc...",
     "launch_id": "launch_xyz...",
     "duration_ms": 5432,
     "timestamp": 1234567890123461
   }

Eventos emitidos por Sentinel:
- SYNAPSE_PHASE_3_STARTED
- SYNAPSE_PHASE_3_COMPLETE (= ONBOARDING_COMPLETE)
- SYNAPSE_PHASE_3_FAILED (si módulos fallan al cargar)

Estado final: Perfil listo para recibir intents.

───────────────────────────────────────────────────────────────────────────────
DIAGRAMA DE SECUENCIA COMPLETO
───────────────────────────────────────────────────────────────────────────────

Brain          Extension       Sentinel        Electron
  |                |               |               |
  |-- LAUNCH ----->|               |               |
  |                |               |               |
  |<- DISCOVERY ---|               |               |
  |-- CONFIG ----->|               |               |
  |                |          [PHASE_1_COMPLETE]   |
  |                |               |-------------->|
  |                |               |               |
  |<-- WS CONN ----|               |               |
  |-- READY ------>|               |               |
  |                |          [PHASE_2_COMPLETE]   |
  |                |               |-------------->|
  |                |               |               |
  |<- RUNTIME_READY|               |               |
  |-- ONBOARDING ->|-------------->|               |
  |    COMPLETE    |          [ONBOARDING_COMPLETE]|
  |                |               |-------------->|
  |                |               |               |
  |                |               |      [UI UPDATE]
  |                |               |               |

───────────────────────────────────────────────────────────────────────────────
TIMEOUTS Y MANEJO DE ERRORES
───────────────────────────────────────────────────────────────────────────────

Cada fase tiene un timeout específico:

FASE 1: 10 segundos
- Si la extensión no envía SYNAPSE_DISCOVERY en 10s → PHASE_1_TIMEOUT
- Causa común: Extension no se cargó, Chrome bloqueó la extensión

FASE 2: 5 segundos
- Si el WebSocket no se establece en 5s → PHASE_2_FAILED
- Causa común: Brain no está escuchando, firewall bloqueando

FASE 3: 15 segundos
- Si los módulos no cargan en 15s → PHASE_3_FAILED
- Causa común: Error en el código de la extensión, permisos faltantes

TOTAL: Hasta 30 segundos para onboarding completo.

Eventos de error que Sentinel monitorea:
- EXTENSION_LOAD_FAILED: Chrome no pudo cargar la extensión
- WEBSOCKET_CONNECTION_FAILED: No se pudo establecer WS
- MODULE_INITIALIZATION_FAILED: Módulo de runtime falló
- SECURITY_TOKEN_INVALID: Token de seguridad no válido
- HANDSHAKE_TIMEOUT: Timeout general del handshake

───────────────────────────────────────────────────────────────────────────────
INTEGRACIÓN CON GUARDIAN
───────────────────────────────────────────────────────────────────────────────

El Guardian (guardian.go) monitorea el handshake de 3 fases:

1. Si PHASE_1_TIMEOUT ocurre 3 veces consecutivas:
   → Guardian emite EXTENSION_ERROR
   → Guardian intenta relanzar Chrome con la extensión
   → Si falla nuevamente, notifica a Electron para intervención manual

2. Si PHASE_2_FAILED ocurre:
   → Guardian verifica que el Brain esté vivo (puerto 5678)
   → Si Brain está muerto, intenta relanzarlo
   → Si Brain está vivo pero WS falla, reporta error de red

3. Si PHASE_3_FAILED ocurre:
   → Guardian captura logs de la extensión
   → Emite EXTENSION_ERROR con detalles del módulo que falló
   → Sugiere al usuario revisar la consola de Chrome DevTools

───────────────────────────────────────────────────────────────────────────────
MONITOREO EN SENTINEL DAEMON
───────────────────────────────────────────────────────────────────────────────

Cuando Sentinel está en modo daemon, monitorea todos los eventos del handshake
y los reenvía a Electron para que la UI pueda mostrar el progreso:

Ejemplo de eventos en la UI:

[Launching profile_001...]
✓ Phase 1: Extension discovered (2.3s)
✓ Phase 2: WebSocket connected (1.1s)
✓ Phase 3: Runtime initialized (4.8s)
✓ Profile ready (total: 8.2s)

Si hay un error:

[Launching profile_001...]
✓ Phase 1: Extension discovered (2.3s)
✗ Phase 2: WebSocket connection failed
  Error: Brain not responding on port 5678
  Guardian attempting recovery...
✓ Brain service restarted (PID: 67890)
  Retrying handshake...
✓ Phase 2: WebSocket connected (1.5s)
✓ Phase 3: Runtime initialized (5.1s)
✓ Profile ready (total: 18.4s)

───────────────────────────────────────────────────────────────────────────────
CÓDIGO DE EJEMPLO - MONITOREO DEL HANDSHAKE
───────────────────────────────────────────────────────────────────────────────
*/

// HandshakePhase representa las fases del handshake Synapse
type HandshakePhase int

const (
	PhaseDiscovery HandshakePhase = iota + 1
	PhaseWebSocket
	PhaseRuntimeInit
	PhaseComplete
)

// HandshakeMonitor monitorea el progreso del handshake de 3 fases
type HandshakeMonitor struct {
	ProfileID    string
	LaunchID     string
	CurrentPhase HandshakePhase
	StartTime    time.Time
	PhaseTimers  map[HandshakePhase]time.Time
	Errors       []string
	client       *SentinelClient
}

// NewHandshakeMonitor crea un nuevo monitor de handshake
func NewHandshakeMonitor(profileID, launchID string, client *SentinelClient) *HandshakeMonitor {
	return &HandshakeMonitor{
		ProfileID:    profileID,
		LaunchID:     launchID,
		CurrentPhase: PhaseDiscovery,
		StartTime:    time.Now(),
		PhaseTimers:  make(map[HandshakePhase]time.Time),
		client:       client,
	}
}

// Start inicia el monitoreo del handshake
func (hm *HandshakeMonitor) Start() {
	hm.PhaseTimers[PhaseDiscovery] = time.Now()
	
	// Registrar handlers para eventos de cada fase
	hm.client.On("SYNAPSE_PHASE_1_COMPLETE", hm.handlePhase1Complete)
	hm.client.On("SYNAPSE_PHASE_2_COMPLETE", hm.handlePhase2Complete)
	hm.client.On("ONBOARDING_COMPLETE", hm.handlePhase3Complete)
	
	// Registrar handlers para errores
	hm.client.On("SYNAPSE_PHASE_1_TIMEOUT", hm.handlePhase1Timeout)
	hm.client.On("SYNAPSE_PHASE_2_FAILED", hm.handlePhase2Failed)
	hm.client.On("SYNAPSE_PHASE_3_FAILED", hm.handlePhase3Failed)
}

func (hm *HandshakeMonitor) handlePhase1Complete(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	duration := time.Since(hm.PhaseTimers[PhaseDiscovery])
	hm.CurrentPhase = PhaseWebSocket
	hm.PhaseTimers[PhaseWebSocket] = time.Now()
	
	// Log del progreso
	log.Printf("✓ Phase 1 complete for %s (%.1fs)", hm.ProfileID, duration.Seconds())
}

func (hm *HandshakeMonitor) handlePhase2Complete(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	duration := time.Since(hm.PhaseTimers[PhaseWebSocket])
	hm.CurrentPhase = PhaseRuntimeInit
	hm.PhaseTimers[PhaseRuntimeInit] = time.Now()
	
	log.Printf("✓ Phase 2 complete for %s (%.1fs)", hm.ProfileID, duration.Seconds())
}

func (hm *HandshakeMonitor) handlePhase3Complete(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	duration := time.Since(hm.PhaseTimers[PhaseRuntimeInit])
	totalDuration := time.Since(hm.StartTime)
	hm.CurrentPhase = PhaseComplete
	
	log.Printf("✓ Phase 3 complete for %s (%.1fs)", hm.ProfileID, duration.Seconds())
	log.Printf("✓ Handshake complete for %s (total: %.1fs)", hm.ProfileID, totalDuration.Seconds())
}

func (hm *HandshakeMonitor) handlePhase1Timeout(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	hm.Errors = append(hm.Errors, "Phase 1 timeout: Extension discovery failed")
	log.Printf("✗ Phase 1 timeout for %s", hm.ProfileID)
}

func (hm *HandshakeMonitor) handlePhase2Failed(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	hm.Errors = append(hm.Errors, fmt.Sprintf("Phase 2 failed: %s", event.Error))
	log.Printf("✗ Phase 2 failed for %s: %s", hm.ProfileID, event.Error)
}

func (hm *HandshakeMonitor) handlePhase3Failed(event Event) {
	if event.ProfileID != hm.ProfileID {
		return
	}
	
	hm.Errors = append(hm.Errors, fmt.Sprintf("Phase 3 failed: %s", event.Error))
	log.Printf("✗ Phase 3 failed for %s: %s", hm.ProfileID, event.Error)
}

/*
───────────────────────────────────────────────────────────────────────────────
USO EN ELECTRON
───────────────────────────────────────────────────────────────────────────────

// En el frontend, mostrar progreso del handshake:

const handshakeStages = [
  { phase: 1, name: 'Extension Discovery', timeout: 10 },
  { phase: 2, name: 'WebSocket Connection', timeout: 5 },
  { phase: 3, name: 'Runtime Initialization', timeout: 15 }
];

function HandshakeProgress({ profileId }) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    window.sentinel.onEvent((event) => {
      if (event.profile_id !== profileId) return;
      
      switch (event.type) {
        case 'SYNAPSE_PHASE_1_COMPLETE':
          setCurrentPhase(1);
          break;
        case 'SYNAPSE_PHASE_2_COMPLETE':
          setCurrentPhase(2);
          break;
        case 'ONBOARDING_COMPLETE':
          setCurrentPhase(3);
          break;
        case 'SYNAPSE_PHASE_1_TIMEOUT':
        case 'SYNAPSE_PHASE_2_FAILED':
        case 'SYNAPSE_PHASE_3_FAILED':
          setError(event.error);
          break;
      }
    });
  }, [profileId]);
  
  return (
    <div className="handshake-progress">
      {handshakeStages.map((stage, i) => (
        <div key={i} className={
          i < currentPhase ? 'complete' :
          i === currentPhase ? 'active' : 'pending'
        }>
          {stage.name}
          {i < currentPhase && ' ✓'}
          {i === currentPhase && ' ⏳'}
        </div>
      ))}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
*/