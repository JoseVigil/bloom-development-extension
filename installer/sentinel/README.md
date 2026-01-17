# Synapse Sentinel v1.0 - Orquestador de Sistemas

## 📋 Descripción

**Sentinel** es el orquestador maestro del ecosistema Synapse v2.0. Actúa como supervisor de procesos entre Electron (UI) y el motor de automatización (Python/C++/Chromium).

### Filosofía Arquitectónica
> "Go controla el mundo físico (procesos, archivos, logs, red), Python (Brain) controla el mundo cognitivo (Gemini, Lógica de Negocio)."

## 🎯 Características Principales

### 1. **Process Supervisor (Reaper)**
- Gestión completa del ciclo de vida de procesos
- Cancelación en cascada: si Sentinel muere, todos sus hijos mueren
- Limpieza quirúrgica automática (no más procesos zombie)
- Auto-limpieza de archivos spec temporales

### 2. **Spec-Driven Launch (v1.2)**
- Genera archivos JSON de especificación para cada lanzamiento
- Delega ejecución a `brain.exe` con `--spec [archivo.json]`
- Resuelve rutas dinámicas automáticamente:
  - `user_data_dir`: `%LOCALAPPDATA%/BloomNucleus/profiles/[UUID]`
  - `extension_path`: `[user_data_dir]/extension`
  - `executable_path`: Desde `blueprint.json`
- Garantiza que `sync_profile_resources` de Python se ejecute correctamente

### 2. **Dynamic Configuration Injection**
- Sin recompilación: cambios en `blueprint.json` se aplican inmediatamente
- Flags de Chromium inyectados dinámicamente
- Rutas y URLs configurables

### 3. **Unified Log Aggregator**
- Agrega logs de múltiples fuentes en un solo stream
- Formato JSON estructurado para Electron
- Tail en tiempo real de:
  - `synapse_native.log`
  - `synapse_browser.log`
  - `brain.log`

### 4. **Bulletproof Launch Sequence**
- Pre-flight checks (puerto 5678, archivos de bloqueo)
- Handshake verification con Brain service
- Manejo robusto de errores

## 🏗️ Estructura del Proyecto

```
sentinel/
├── main.go              # Entry point, JSON-RPC dispatcher
├── config.go            # Blueprint parser y validación
├── process_manager.go   # Gestor de procesos (Reaper)
├── logger_hub.go        # Agregador de logs
├── blueprint.json       # Configuración central
└── README.md           # Este archivo
```

## 🚀 Compilación

### Windows
```bash
go build -o sentinel.exe
```

### macOS/Linux
```bash
go build -o sentinel
chmod +x sentinel
```

### Cross-compilation
```bash
# Para Windows desde macOS/Linux
GOOS=windows GOARCH=amd64 go build -o sentinel.exe

# Para macOS desde Windows/Linux
GOOS=darwin GOARCH=amd64 go build -o sentinel
```

## 📡 Comunicación JSON-RPC

Sentinel escucha comandos en `stdin` y responde en `stdout`.

### Comandos Disponibles

#### 1. Launch (Lanzar perfil)
```json
{
  "method": "launch",
  "params": {
    "profile_id": "UUID-del-perfil",
    "mode": "discovery"
  },
  "id": 1
}
```

**Respuesta:**
```json
{
  "result": {
    "status": "launched",
    "profile_id": "UUID-del-perfil",
    "mode": "discovery"
  },
  "id": 1
}
```

#### 2. Stop (Detener procesos)
```json
{
  "method": "stop",
  "params": {},
  "id": 2
}
```

#### 3. Status (Estado del sistema)
```json
{
  "method": "status",
  "params": {},
  "id": 3
}
```

**Respuesta:**
```json
{
  "result": {
    "running_processes": ["brain_service", "chromium_UUID"],
    "port_5678_open": true
  },
  "id": 3
}
```

## 🔧 Blueprint Configuration

El archivo `blueprint.json` controla el comportamiento completo de Sentinel:

```json
{
  "engine": {
    "strategy": "internal_chromium",
    "flags": {
      "security": ["--no-sandbox", "--disable-web-security"],
      "isolation": ["--disable-features=IsolateOrigins"],
      "ux": ["--no-first-run"],
      "network": ["--remote-debugging-port=0"]
    }
  },
  "chromium": {
    "executable_path": "chrome-win/chrome.exe"
  },
  "navigation": {
    "discovery_url": "chrome-extension://...",
    "landing_url": "chrome-extension://..."
  }
}
```

### Spec File Generado (temp_spec_[UUID].json)

Sentinel genera automáticamente:

```json
{
  "executable_path": "chrome-win/chrome.exe",
  "user_data_dir": "C:/Users/[user]/AppData/Local/BloomNucleus/profiles/[UUID]",
  "extension_path": "C:/Users/[user]/AppData/Local/BloomNucleus/profiles/[UUID]/extension",
  "url": "chrome-extension://hpblclepliicmihaplldignhjdggnkdh/discovery/index.html",
  "flags": ["--no-sandbox", "--disable-web-security", ...]
}
```

### Modificar Configuración
1. Edita `blueprint.json`
2. Reinicia Sentinel
3. **No requiere recompilación**

## 🔄 Secuencia de Lanzamiento (Spec-Driven)

```
[Electron] → JSON-RPC → [Sentinel]
                           ↓
                    1. Preflight Checks
                       - Port 5678 libre?
                       - Limpiar locks
                           ↓
                    2. Generate Launch Spec
                       - Leer blueprint.json
                       - Resolver rutas dinámicas
                       - Crear temp_spec_[UUID].json
                           ↓
                    3. Start Brain Service
                       - brain.exe service start
                       - Esperar handshake :5678
                           ↓
                    4. Spec-Driven Launch
                       - brain.exe profile launch [UUID] --spec [archivo.json]
                       - Python ejecuta sync_profile_resources
                       - Python lanza Chromium con spec
                       - Monitor PID
                           ↓
                    [SUCCESS] → Response → [Electron]
                    
                    [On Shutdown]
                       - Kill processes
                       - Delete temp_spec_*.json
```

## 🛡️ Manejo de Errores

Sentinel usa códigos de error específicos:

- `1001`: Preflight check failed
- `1002`: Brain service startup failed
- `1003`: Chromium launch failed
- `-32601`: Método no encontrado
- `-32602`: Parámetros inválidos

## 🧪 Testing desde Terminal

```bash
# Lanzar Sentinel
./sentinel

# Enviar comando (en otra terminal)
echo '{"method":"launch","params":{"profile_id":"test-uuid","mode":"discovery"},"id":1}' | ./sentinel

# Ver logs en tiempo real
./sentinel 2>&1 | grep LOG_HUB
```

## 📊 Logs

Sentinel busca y agrega logs desde **`%LOCALAPPDATA%/BloomNucleus/logs/`** (Windows) o **`~/.local/share/BloomNucleus/logs`** (macOS/Linux).

### Log Hub con Retry Infinito
El agregador de logs espera pacientemente hasta que los archivos aparezcan:
```
[LOG_HUB] Waiting for synapse_native.log...
[LOG_HUB] Waiting for synapse_browser.log...
[LOG_HUB] ✓ Watching synapse_native.log
[LOG_HUB] ✓ Watching synapse_browser.log
```

Sentinel emite dos tipos de logs:

### 1. Logs Internos (stderr)
```
[SENTINEL] Initializing Synapse Sentinel v1.0...
[PREFLIGHT] Starting preflight checks...
[BRAIN] Service ready on port 5678 ✓
```

### 2. Logs Agregados (stdout, formato JSON)
```json
[LOG] {"timestamp":"2025-01-17T10:30:00Z","source":"synapse_native.log","level":"info","message":"Extension loaded"}
```

### Debugging de Flags
Sentinel registra cada flag inyectado:
```
[CHROMIUM] Injecting 14 flags from blueprint
[CHROMIUM]   → --no-sandbox
[CHROMIUM]   → --disable-web-security
[CHROMIUM]   → --test-type
...
```

### Spec Generation Logs
```
[SPEC] Generated launch spec: C:/Users/.../logs/temp_spec_abc123.json
[SPEC] Executable: chrome-win/chrome.exe
[SPEC] User data: C:/Users/.../BloomNucleus/profiles/abc123
[SPEC] Extension: C:/Users/.../BloomNucleus/profiles/abc123/extension
[SPEC] URL: chrome-extension://hpblclepliicmihaplldignhjdggnkdh/discovery/index.html
[SPEC] Flags: 14 items
```

### Launch Command
```
[CHROMIUM] Launching profile: abc123 (spec-driven)
[CHROMIUM] Launched with PID: 12345 (spec: C:/.../temp_spec_abc123.json)
```

## 🔐 Seguridad

- **No hardcoded secrets**: Todas las configuraciones en blueprint.json
- **Process isolation**: Cada perfil corre en su propio contexto
- **Graceful shutdown**: SIGTERM/SIGINT manejados correctamente

## 🐛 Troubleshooting

### Problema: "Port 5678 already in use"
```bash
# Windows
netstat -ano | findstr :5678
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:5678 | xargs kill -9
```

### Problema: "Blueprint validation failed"
- Verifica que `blueprint.json` esté en el mismo directorio que el binario
- Valida el JSON con `jq . blueprint.json`

### Problema: "Chromium won't start"
- Verifica que `brain.exe` esté en el PATH
- Revisa los logs en `synapse_native.log`

## 📝 TODOs / Roadmap

### Fase A (Completado ✓)
- [x] Process supervisor con context cancellation
- [x] Blueprint parser
- [x] JSON-RPC dispatcher
- [x] Preflight checks
- [x] Log aggregator
- [x] Spec-driven launch (v1.2)
- [x] Auto-cleanup de archivos temporales

### Fase B (Siguiente)
- [ ] Implementar `killPortOwner` específico por OS
- [ ] Hot-reload de blueprint.json (sin reiniciar)
- [ ] Métricas de performance (CPU/RAM de procesos)
- [ ] Health checks periódicos de Brain service

### Fase C (Futuro)
- [ ] Git integration (commit automation)
- [ ] AI-powered diagnostics
- [ ] Multi-profile parallelization
- [ ] Distributed orchestration

## 🤝 Integración con Electron

```javascript
// electron/main.js
const { spawn } = require('child_process');

const sentinel = spawn('./sentinel', [], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Enviar comando
const cmd = {
  method: 'launch',
  params: { profile_id: 'uuid', mode: 'discovery' },
  id: Date.now()
};
sentinel.stdin.write(JSON.stringify(cmd) + '\n');

// Recibir respuesta
sentinel.stdout.on('data', (data) => {
  const response = JSON.parse(data);
  console.log('Sentinel response:', response);
});
```

## 📜 Licencia

Proyecto interno - Synapse v2.0

---

**Desarrollado con ❤️ por el equipo de Synapse**