# GUÍA DE IMPLEMENTACIÓN - NUCLEUS SYNAPSE PARA ELECTRON

## 📋 RESUMEN EJECUTIVO

Esta guía documenta la integración completa entre Nucleus (CLI) y Sentinel (navegador) a través de Temporal workflows, lista para ser consumida desde Electron.

---

## 🎯 ARQUITECTURA GENERAL

```
Electron App
    ↓ (spawn child_process)
nucleus synapse launch profile_001 --json
    ↓ (inicia Temporal workflow)
ProfileLifecycleWorkflow
    ↓ (ejecuta activity)
SentinelActivities.LaunchSentinel
    ↓ (spawn subprocess)
sentinel launch profile_001
    ↓ (retorna JSON por stdout)
{success: true, chrome_pid: 12345, debug_port: 9222, ...}
    ↓ (se propaga hacia arriba)
nucleus retorna JSON final a Electron
```

---

## 🔧 PREREQUISITOS

### 1. Binarios Requeridos

**Ubicación esperada:**
```
C:\bloom\native\bin\win32\
├── nucleus\
│   └── nucleus.exe
└── sentinel\
    └── sentinel.exe
```

### 2. Servidor Temporal

**Iniciar Temporal (una sola vez):**
```batch
nucleus temporal start
```

**Verificar que Temporal está corriendo:**
```batch
curl http://localhost:7233
```

### 3. Worker de Temporal

**Iniciar worker (mantener corriendo):**
```batch
nucleus worker start
```

Este proceso debe estar corriendo SIEMPRE para que los workflows se ejecuten.

---

## 🚀 USO DESDE ELECTRON

### Opción 1: JSON Output (Recomendado)

```javascript
const { spawn } = require('child_process');

function launchProfile(profileId, options = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--json', 'synapse', 'launch', profileId];
    
    // Agregar flags opcionales
    if (options.mode) {
      args.push('--mode', options.mode);
    }
    if (options.email) {
      args.push('--email', options.email);
    }
    if (options.service) {
      args.push('--service', options.service);
    }
    
    const nucleus = spawn('nucleus.exe', args, {
      cwd: 'C:\\bloom\\native\\bin\\win32\\nucleus',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    nucleus.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    nucleus.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    nucleus.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (err) {
          reject(new Error(`Invalid JSON response: ${stdout}`));
        }
      } else {
        reject(new Error(`Launch failed: ${stderr}`));
      }
    });
  });
}

// USO
launchProfile('profile_001', { mode: 'landing', email: 'test@mail.com' })
  .then(result => {
    console.log('Launch successful:', result);
    console.log('Chrome PID:', result.chrome_pid);
    console.log('Debug port:', result.debug_port);
    console.log('Extension loaded:', result.extension_loaded);
  })
  .catch(err => {
    console.error('Launch failed:', err);
  });
```

---

## 📤 FORMATO DE RESPUESTA

### ✅ Respuesta Exitosa

```json
{
  "success": true,
  "profile_id": "profile_001",
  "launch_id": "launch_profile_001_1707145200123456789",
  "chrome_pid": 12345,
  "debug_port": 9222,
  "extension_loaded": true,
  "effective_config": {
    "mode": "landing",
    "headless": false,
    "user_data_dir": "C:\\profiles\\profile_001"
  },
  "state": "READY",
  "timestamp": 1707145200
}
```

### ❌ Respuesta de Error

```json
{
  "success": false,
  "profile_id": "profile_001",
  "launch_id": "launch_profile_001_1707145200123456789",
  "state": "FAILED",
  "error": "Chrome binary not found",
  "timestamp": 1707145200
}
```

---

## 🎛️ COMANDOS DISPONIBLES

### 1. Launch (Iniciar Perfil)

**Comando:**
```batch
nucleus --json synapse launch <profile_id> [flags]
```

**Flags disponibles:**
- `--mode <string>`: Modo de lanzamiento (landing, discovery, headless)
- `--email <string>`: Email asociado al perfil
- `--service <string>`: Servicio (google, facebook, etc.)
- `--account <string>`: Identificador de cuenta
- `--alias <string>`: Alias del perfil
- `--extension <string>`: Path a extensión adicional
- `--role <string>`: Rol del usuario
- `--step <string>`: Paso de ejecución
- `--heartbeat`: Habilitar tracking de heartbeat
- `--register`: Registrar perfil nuevo
- `--config <path>`: Archivo JSON de configuración
- `--save`: Guardar configuración para uso futuro

**Ejemplos:**
```batch
# Básico
nucleus --json synapse launch profile_001

# Con modo específico
nucleus --json synapse launch profile_001 --mode discovery

# Con configuración completa
nucleus --json synapse launch profile_001 --email test@mail.com --service google --mode landing

# Desde archivo de configuración
nucleus --json synapse launch --config launch_config.json
```

### 2. Workflow Status (Consultar Estado)

**Comando:**
```batch
nucleus workflow status <profile_id>
```

**Respuesta:**
```
─────────────────────────────────────
Profile ID: profile_001
Estado: READY
Última actualización: 2026-02-05T19:00:00Z
Sentinel activo: true
─────────────────────────────────────
```

### 3. Workflow Signal (Enviar Señal)

**Comando:**
```batch
nucleus workflow signal <profile_id> <event_type>
```

**Eventos disponibles:**
- `ONBOARDING_STARTED`
- `ONBOARDING_COMPLETE`
- `ONBOARDING_FAILED`
- `EXTENSION_ERROR`
- `HEARTBEAT_FAILED`
- `SERVICE_RECOVERY_STARTED`
- `SERVICE_RECOVERY_COMPLETE`

**Ejemplo:**
```batch
nucleus workflow signal profile_001 ONBOARDING_COMPLETE
```

---

## 🔄 CICLO DE VIDA DEL WORKFLOW

### Estados del Perfil

1. **IDLE**: Estado inicial, esperando señal
2. **ONBOARDING**: Proceso de inicialización
3. **READY**: Sentinel corriendo exitosamente
4. **DEGRADED**: Errores no críticos (extensión fallida, heartbeat perdido)
5. **RECOVERING**: Intentando recuperar de error
6. **FAILED**: Error crítico, requiere intervención

### Flujo Típico

```
IDLE
  → (signal: ONBOARDING_COMPLETE)
ONBOARDING
  → (activity: LaunchSentinel)
READY
  → (Sentinel corriendo)
```

### Flujo de Error y Recovery

```
READY
  → (signal: HEARTBEAT_FAILED)
DEGRADED
  → (child workflow: RecoveryFlowWorkflow)
RECOVERING
  → (intentos de reinicio)
READY / FAILED
```

---

## 🛠️ INTEGRACIÓN AVANZADA EN ELECTRON

### Implementación Completa con Event Emitter

```javascript
const { spawn } = require('child_process');
const EventEmitter = require('events');

class NucleusLauncher extends EventEmitter {
  constructor(nucleusPath = 'nucleus.exe') {
    super();
    this.nucleusPath = nucleusPath;
    this.activeProfiles = new Map();
  }

  async launch(profileId, options = {}) {
    const args = ['--json', 'synapse', 'launch', profileId];
    
    // Construir argumentos
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        args.push(`--${key}`, String(value));
      }
    });

    return new Promise((resolve, reject) => {
      const nucleus = spawn(this.nucleusPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      nucleus.stdout.on('data', (data) => {
        stdout += data.toString();
        this.emit('log', { profileId, stream: 'stdout', data: data.toString() });
      });

      nucleus.stderr.on('data', (data) => {
        stderr += data.toString();
        this.emit('log', { profileId, stream: 'stderr', data: data.toString() });
      });

      nucleus.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            
            if (result.success) {
              // Guardar referencia del perfil activo
              this.activeProfiles.set(profileId, {
                chromePid: result.chrome_pid,
                debugPort: result.debug_port,
                launchId: result.launch_id,
                state: result.state
              });
              
              this.emit('launched', { profileId, result });
              resolve(result);
            } else {
              this.emit('error', { profileId, error: result.error });
              reject(new Error(result.error));
            }
          } catch (err) {
            this.emit('error', { profileId, error: `Parse error: ${err.message}` });
            reject(new Error(`Invalid JSON: ${stdout}`));
          }
        } else {
          this.emit('error', { profileId, error: stderr });
          reject(new Error(`Exit code ${code}: ${stderr}`));
        }
      });
    });
  }

  async getStatus(profileId) {
    return new Promise((resolve, reject) => {
      const nucleus = spawn(this.nucleusPath, ['workflow', 'status', profileId], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';

      nucleus.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      nucleus.on('close', (code) => {
        if (code === 0) {
          // Parsear output de status (es texto, no JSON)
          const status = this._parseStatusOutput(stdout);
          resolve(status);
        } else {
          reject(new Error(`Failed to get status: ${code}`));
        }
      });
    });
  }

  async sendSignal(profileId, eventType) {
    return new Promise((resolve, reject) => {
      const nucleus = spawn(this.nucleusPath, ['workflow', 'signal', profileId, eventType], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      nucleus.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to send signal: ${code}`));
        }
      });
    });
  }

  getActiveProfile(profileId) {
    return this.activeProfiles.get(profileId);
  }

  _parseStatusOutput(output) {
    // Parsear output de texto del comando status
    const lines = output.split('\n');
    const status = {};
    
    lines.forEach(line => {
      if (line.includes('Profile ID:')) {
        status.profileId = line.split(':')[1].trim();
      } else if (line.includes('Estado:')) {
        status.state = line.split(':')[1].trim();
      } else if (line.includes('Sentinel activo:')) {
        status.sentinelRunning = line.split(':')[1].trim() === 'true';
      }
    });
    
    return status;
  }
}

// USO EN ELECTRON
const launcher = new NucleusLauncher('C:\\bloom\\native\\bin\\win32\\nucleus\\nucleus.exe');

// Escuchar eventos
launcher.on('launched', ({ profileId, result }) => {
  console.log(`Profile ${profileId} launched successfully`);
  console.log(`Chrome PID: ${result.chrome_pid}`);
  console.log(`Debug port: ${result.debug_port}`);
});

launcher.on('error', ({ profileId, error }) => {
  console.error(`Error launching ${profileId}:`, error);
});

launcher.on('log', ({ profileId, stream, data }) => {
  console.log(`[${profileId}][${stream}]`, data);
});

// Lanzar perfil
async function main() {
  try {
    const result = await launcher.launch('profile_001', {
      mode: 'landing',
      email: 'test@mail.com',
      service: 'google'
    });
    
    console.log('Launch result:', result);
    
    // Consultar estado después de 5 segundos
    setTimeout(async () => {
      const status = await launcher.getStatus('profile_001');
      console.log('Profile status:', status);
    }, 5000);
    
  } catch (err) {
    console.error('Launch failed:', err);
  }
}

main();
```

---

## 🔍 DEBUGGING Y TROUBLESHOOTING

### 1. Verificar que Temporal está corriendo

```batch
curl http://localhost:7233
```

Si falla:
```batch
nucleus temporal start
```

### 2. Verificar que el Worker está corriendo

El worker debe estar activo para procesar workflows:
```batch
nucleus worker start
```

### 3. Ver logs de Sentinel

Los logs de Sentinel se guardan en:
```
C:\Users\<USER>\AppData\Local\BloomNucleus\logs\orchestration\sentinel_<profile_id>.log
```

### 4. Ver telemetría

```
C:\Users\<USER>\AppData\Local\BloomNucleus\logs\orchestration\telemetry.json
```

Cada línea es un evento JSON:
```json
{"timestamp":1707145200000000000,"event_id":"sentinel_launch_profile_001_123","category":"orchestration","event_type":"sentinel_launch","status":"started","profile_id":"profile_001"}
{"timestamp":1707145205000000000,"event_id":"sentinel_launch_profile_001_123","category":"orchestration","event_type":"sentinel_launch","status":"completed","profile_id":"profile_001","success":true,"chrome_pid":12345}
```

### 5. Errores Comunes

**Error: "failed to create temporal client: connection refused"**
- Solución: Iniciar Temporal (`nucleus temporal start`)

**Error: "workflow execution failed: timeout"**
- Solución: Verificar que el worker está corriendo (`nucleus worker start`)

**Error: "sentinel binary not found"**
- Solución: Verificar que `sentinel.exe` existe en la ruta esperada
- Configurar en: `internal/orchestration/temporal/bootstrap.go` o `worker.go`

**Error: "profile_id is required"**
- Solución: Pasar profile_id como primer argumento: `nucleus synapse launch profile_001`

---

## 📊 MONITOREO Y MÉTRICAS

### Consultar estado de workflow

```javascript
const status = await launcher.getStatus('profile_001');
console.log(status);
// {
//   profileId: 'profile_001',
//   state: 'READY',
//   sentinelRunning: true
// }
```

### Consultar perfil activo

```javascript
const profile = launcher.getActiveProfile('profile_001');
console.log(profile);
// {
//   chromePid: 12345,
//   debugPort: 9222,
//   launchId: 'launch_profile_001_1707145200',
//   state: 'READY'
// }
```

---

## 🎯 PRÓXIMOS PASOS

1. **Implementar stop/shutdown**: Agregar comando `nucleus synapse stop <profile_id>`
2. **Implementar status con JSON**: Modificar `workflow status` para que retorne JSON con `--json`
3. **Implementar submit**: Agregar comando para enviar intents: `nucleus synapse submit <profile_id> <intent>`
4. **Monitoring dashboard**: Crear UI en Electron para visualizar workflows activos
5. **Batch operations**: Lanzar múltiples perfiles en paralelo

---

## 📝 NOTAS FINALES

### Configuración de Sentinel

El path al binario de Sentinel se configura en la inicialización de `SentinelActivities`. 

**Ubicación:** `internal/orchestration/temporal/worker.go` o `bootstrap.go`

```go
sentinelActivities := activities.NewSentinelActivities(
    logsDir,
    telemetryPath,
    "C:\\bloom\\native\\bin\\win32\\sentinel\\sentinel.exe", // ← CONFIGURAR AQUÍ
)
```

### Performance

- **Tiempo típico de launch**: 5-10 segundos
- **Timeout del workflow**: 30 minutos
- **Reintentos automáticos**: 3 intentos con backoff exponencial
- **Polling de status**: Cada 1 segundo durante 60 segundos máximo

### Seguridad

- Nucleus no expone ningún puerto de red
- Toda comunicación es local vía Temporal
- Los perfiles se guardan en `user_data_dir` configurado en Sentinel
- Las credenciales NO se pasan por línea de comandos (usar `--config` con archivo)

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

- [ ] Nucleus compilado y en PATH
- [ ] Sentinel compilado y ubicado correctamente
- [ ] Temporal server iniciado (`nucleus temporal start`)
- [ ] Worker iniciado (`nucleus worker start`)
- [ ] Path de Sentinel configurado en worker
- [ ] Comando `nucleus synapse launch profile_001` funciona manualmente
- [ ] Integración en Electron usando `child_process`
- [ ] Manejo de respuesta JSON implementado
- [ ] Manejo de errores implementado
- [ ] Logs y telemetría configurados

---

**Versión:** 1.0.0  
**Fecha:** 2026-02-05  
**Build:** 90