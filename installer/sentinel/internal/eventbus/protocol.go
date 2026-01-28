package eventbus

/*
PROTOCOLO DE COMUNICACIÓN SENTINEL ↔ BRAIN

═══════════════════════════════════════════════════════════════════════════════
1. FORMATO DE MENSAJE (TCP)
═══════════════════════════════════════════════════════════════════════════════

Cada mensaje sigue el protocolo de "prefijo de longitud" (Length-Prefix Protocol):

  ┌─────────────┬──────────────────────────────────┐
  │   HEADER    │           PAYLOAD                │
  │   4 bytes   │         N bytes                  │
  │  BigEndian  │          JSON                    │
  └─────────────┴──────────────────────────────────┘

- HEADER: uint32 BigEndian que indica el tamaño del payload en bytes
- PAYLOAD: JSON serializado del evento/comando

═══════════════════════════════════════════════════════════════════════════════
2. ESTRUCTURA DE EVENTOS
═══════════════════════════════════════════════════════════════════════════════

Todos los eventos siguen esta estructura JSON:

{
  "type": "EVENT_TYPE",           // Tipo de evento (REGISTER_SENTINEL, LAUNCH_PROFILE, etc.)
  "profile_id": "profile_001",    // ID del perfil (opcional)
  "launch_id": "abc123",          // ID de lanzamiento (opcional)
  "timestamp": 1234567890123456,  // Timestamp en nanosegundos
  "sequence": 42,                 // Número de secuencia (opcional)
  "status": "success",            // Estado del evento (opcional)
  "data": {                       // Datos adicionales (opcional)
    "key": "value"
  },
  "error": "mensaje de error"     // Mensaje de error si aplica (opcional)
}

═══════════════════════════════════════════════════════════════════════════════
3. CICLO DE VIDA DEL DAEMON
═══════════════════════════════════════════════════════════════════════════════

3.1. STARTUP SEQUENCE
----------------------

1. Sentinel inicia: sentinel --mode daemon
2. Sentinel conecta con Brain (127.0.0.1:5678)
3. Sentinel envía: REGISTER_SENTINEL
   {
     "type": "REGISTER_SENTINEL",
     "timestamp": 1234567890123456,
     "data": {
       "version": "1.0.0",
       "hostname": "DESKTOP-XYZ",
       "pid": 12345
     }
   }

4. Brain responde: REGISTER_ACK
   {
     "type": "REGISTER_ACK",
     "status": "success",
     "timestamp": 1234567890123457
   }

5. Sentinel emite a Electron (stdout):
   {
     "type": "DAEMON_READY",
     "status": "running",
     "timestamp": 1234567890123458,
     "data": {
       "pid": 12345,
       "version": "1.0.0"
     }
   }

3.2. REHIDRATACIÓN (REHYDRATION)
---------------------------------

Al iniciar, Sentinel intenta recuperar eventos perdidos:

1. Sentinel lee /tmp/sentinel_last_event.txt → último timestamp
2. Sentinel envía: POLL_EVENTS
   {
     "type": "POLL_EVENTS",
     "timestamp": 1234567890123456,
     "data": {
       "since": 1234567000000000
     }
   }

3. Brain responde con todos los eventos desde ese timestamp

═══════════════════════════════════════════════════════════════════════════════
4. COMUNICACIÓN ELECTRON → SENTINEL (STDIN)
═══════════════════════════════════════════════════════════════════════════════

Electron envía comandos a Sentinel vía stdin (una línea JSON por comando):

4.1. LANZAR PERFIL
------------------
Input (stdin):
{"command": "launch", "profile_id": "profile_001", "id": "msg_001"}

Output (stdout) - ACK inmediato:
{"type": "ACK", "id": "msg_001", "status": "processing", "timestamp": 1234567890123456}

Output (stdout) - Resultado:
{"type": "COMMAND_RESULT", "id": "msg_001", "status": "success", "profile_id": "profile_001", "timestamp": 1234567890123457}

4.2. DETENER PERFIL
-------------------
Input (stdin):
{"command": "stop", "profile_id": "profile_001", "id": "msg_002"}

4.3. SOLICITAR ESTADO
---------------------
Input (stdin):
{"command": "status", "profile_id": "profile_001", "id": "msg_003"}

4.4. ENVIAR INTENT
------------------
Input (stdin):
{
  "command": "intent",
  "profile_id": "profile_001",
  "id": "msg_004",
  "data": {
    "intent_type": "navigate",
    "payload": {
      "url": "https://example.com"
    }
  }
}

4.5. SOLICITAR EVENTOS HISTÓRICOS
----------------------------------
Input (stdin):
{
  "command": "poll_events",
  "id": "msg_005",
  "data": {
    "since": 1234567000000000
  }
}

4.6. SHUTDOWN GRACEFUL
----------------------
Input (stdin):
{"command": "exit", "id": "msg_006"}

Output (stdout):
{"type": "DAEMON_SHUTDOWN", "status": "stopping", "timestamp": 1234567890123456}

═══════════════════════════════════════════════════════════════════════════════
5. EVENTOS BRAIN → SENTINEL → ELECTRON
═══════════════════════════════════════════════════════════════════════════════

Todos los eventos que recibe Sentinel del Brain se reenvían a Electron vía stdout.

5.1. ONBOARDING EVENTS
----------------------
{
  "type": "ONBOARDING_STARTED",
  "profile_id": "profile_001",
  "launch_id": "abc123",
  "timestamp": 1234567890123456
}

{
  "type": "ONBOARDING_COMPLETE",
  "profile_id": "profile_001",
  "launch_id": "abc123",
  "timestamp": 1234567890123457,
  "data": {
    "duration_ms": 5432
  }
}

{
  "type": "ONBOARDING_FAILED",
  "profile_id": "profile_001",
  "launch_id": "abc123",
  "timestamp": 1234567890123458,
  "error": "Extension handshake timeout"
}

5.2. EXTENSION EVENTS
---------------------
{
  "type": "EXTENSION_ERROR",
  "profile_id": "profile_001",
  "timestamp": 1234567890123456,
  "error": "Connection lost with extension",
  "data": {
    "phase": "synapse_initialization"
  }
}

5.3. GUARDIAN EVENTS (del guardian.go actualizado)
---------------------------------------------------
{
  "type": "HEARTBEAT_FAILED",
  "profile_id": "profile_001",
  "timestamp": 1234567890123456,
  "data": {
    "failures": 1,
    "max": 3
  }
}

{
  "type": "SERVICE_RECOVERY_STARTED",
  "profile_id": "profile_001",
  "timestamp": 1234567890123457,
  "data": {
    "brain_pid": 12345
  }
}

{
  "type": "SERVICE_RECOVERY_COMPLETE",
  "profile_id": "profile_001",
  "timestamp": 1234567890123458,
  "data": {
    "new_brain_pid": 67890
  }
}

═══════════════════════════════════════════════════════════════════════════════
6. RECONEXIÓN AUTOMÁTICA
═══════════════════════════════════════════════════════════════════════════════

Si la conexión con el Brain se pierde:

1. EventBus detecta desconexión (EOF o error de red)
2. EventBus cierra socket actual
3. EventBus programa reconexión con backoff exponencial:
   - Intento 1: 2 segundos
   - Intento 2: 4 segundos
   - Intento 3: 8 segundos
   - Intento N: min(2^N, 60) segundos (máximo 60s)

4. Al reconectar, envía REGISTER_SENTINEL nuevamente
5. Solicita eventos perdidos con POLL_EVENTS

═══════════════════════════════════════════════════════════════════════════════
7. HEALTH CHECK
═══════════════════════════════════════════════════════════════════════════════

Cada 30 segundos, EventBus envía un PING al Brain:

{
  "type": "PING",
  "timestamp": 1234567890123456
}

Si el PING falla, se activa el proceso de reconexión.

═══════════════════════════════════════════════════════════════════════════════
8. EJEMPLOS DE USO
═══════════════════════════════════════════════════════════════════════════════

8.1. DESDE ELECTRON (Node.js)
------------------------------

const { spawn } = require('child_process');

// Iniciar Sentinel en modo daemon
const sentinel = spawn('sentinel', ['--mode', 'daemon']);

// Leer eventos del Brain (stdout)
sentinel.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  
  lines.forEach(line => {
    try {
      const event = JSON.parse(line);
      
      switch (event.type) {
        case 'DAEMON_READY':
          console.log('✓ Sentinel listo');
          break;
        
        case 'ONBOARDING_COMPLETE':
          console.log(`✓ Onboarding completado: ${event.profile_id}`);
          break;
        
        case 'EXTENSION_ERROR':
          console.error(`⚠️  Error de extensión: ${event.error}`);
          break;
      }
    } catch (err) {
      console.error('Error parseando evento:', err);
    }
  });
});

// Logs de debug (stderr)
sentinel.stderr.on('data', (data) => {
  console.log('[Sentinel]', data.toString());
});

// Enviar comando a Sentinel (stdin)
function sendCommand(cmd) {
  sentinel.stdin.write(JSON.stringify(cmd) + '\n');
}

// Ejemplo: lanzar perfil
sendCommand({
  command: 'launch',
  profile_id: 'profile_001',
  id: 'msg_' + Date.now()
});

// Ejemplo: cerrar gracefully
process.on('exit', () => {
  sendCommand({
    command: 'exit',
    id: 'msg_exit'
  });
});

8.2. DESDE CLI (testing manual)
--------------------------------

Terminal 1 (Sentinel Daemon):
$ sentinel --mode daemon

Terminal 2 (Enviar comandos):
$ echo '{"command":"launch","profile_id":"p001","id":"m1"}' | nc localhost sentinel_stdin

═══════════════════════════════════════════════════════════════════════════════
9. MULTIPLEXADO DE SALIDA (CRÍTICO)
═══════════════════════════════════════════════════════════════════════════════

REGLA DE ORO: stdout SOLO para eventos JSON, stderr para logs.

✓ CORRECTO:
  log.New(os.Stderr, "[Daemon] ", log.LstdFlags)
  fmt.Fprintln(os.Stderr, "Debug info")
  
✗ INCORRECTO:
  fmt.Println("Debug info")  // ¡Rompe el parser de Electron!

═══════════════════════════════════════════════════════════════════════════════
*/

// Constantes de tipos de eventos
const (
	// Eventos de registro y lifecycle
	EventTypeRegisterSentinel  = "REGISTER_SENTINEL"
	EventTypeRegisterAck       = "REGISTER_ACK"
	EventTypeDaemonReady       = "DAEMON_READY"
	EventTypeDaemonShutdown    = "DAEMON_SHUTDOWN"
	EventTypeSentinelShutdown  = "SENTINEL_SHUTDOWN"
	
	// Eventos de comandos
	EventTypeLaunchProfile     = "LAUNCH_PROFILE"
	EventTypeStopProfile       = "STOP_PROFILE"
	EventTypeRequestStatus     = "REQUEST_STATUS"
	EventTypeSubmitIntent      = "SUBMIT_INTENT"
	EventTypePollEvents        = "POLL_EVENTS"
	
	// Eventos de onboarding
	EventTypeOnboardingStarted = "ONBOARDING_STARTED"
	EventTypeOnboardingComplete = "ONBOARDING_COMPLETE"
	EventTypeOnboardingFailed  = "ONBOARDING_FAILED"
	
	// Eventos de extensión
	EventTypeExtensionError    = "EXTENSION_ERROR"
	EventTypeExtensionReady    = "EXTENSION_READY"
	
	// Eventos de intent
	EventTypeIntentResponse    = "INTENT_RESPONSE"
	EventTypeIntentError       = "INTENT_ERROR"
	
	// Eventos de health
	EventTypePing              = "PING"
	EventTypePong              = "PONG"
	EventTypeHeartbeatFailed   = "HEARTBEAT_FAILED"
	EventTypeHeartbeatRecovered = "HEARTBEAT_RECOVERED"
	
	// Eventos de guardian
	EventTypeResourceAnomaly   = "RESOURCE_ANOMALY"
	EventTypeServiceRecoveryStarted = "SERVICE_RECOVERY_STARTED"
	EventTypeServiceRecoveryComplete = "SERVICE_RECOVERY_COMPLETE"
	EventTypeServiceRecoveryFailed = "SERVICE_RECOVERY_FAILED"
	
	// Respuestas generales
	EventTypeAck               = "ACK"
	EventTypeCommandResult     = "COMMAND_RESULT"
	EventTypeError             = "ERROR"
)