# Sentinel - Fase 2: Discovery + Health Modular

## Estructura Implementada

```
sentinel/
├── main.go                          # Orquestación principal + comando health
├── go.mod                           # Módulo Go
├── blueprint.json                   # Configuración base
├── build.bat                        # Script de compilación Windows
└── internal/
    ├── core/                        # Módulo Core (Fase 1)
    │   ├── core.go
    │   ├── paths.go
    │   ├── config.go
    │   └── logger.go
    ├── discovery/                   # NUEVO: Autodescubrimiento
    │   └── discovery.go
    ├── health/                      # NUEVO: Auditoría de servicios
    │   └── health.go
    └── persistence/                 # NUEVO: Persistencia nucleus.json
        └── persistence.go
```

## Módulos Implementados

### 1. `internal/discovery` (Localización Proactiva)
**Funcionalidad:**
- Búsqueda en cascada de binarios (`brain.exe`, `chrome.exe`)
  - Prioridad 1: Misma carpeta que Sentinel
  - Prioridad 2: Rutas estándar en AppData
- Scanner de VSCode: Busca extensión `JoseVigil.bloom-nucleus-installer`
  - Escanea `%USERPROFILE%/.vscode/extensions`
  - Valida `package.json` del plugin
- Retorna `SystemMap` con rutas absolutas validadas

**Struct de retorno:**
```go
type SystemMap struct {
    BrainPath      string
    ChromePath     string
    VSCodePlugin   string
    PluginVersion  string
}
```

### 2. `internal/health` (Auditoría de Servicios)
**Funcionalidad:**
- Validación de ejecutables usando `SystemMap`
- Escaneo de red concurrente (goroutines):
  - Puerto 5678 TCP (Brain TCP Service)
  - Puerto 3001 HTTP GET `/health` (Chrome Extension Backend)
- Check lógico: `brain.exe --json health onboarding-status`
- Genera `HealthReport` completo

**Struct de retorno:**
```go
type HealthReport struct {
    Timestamp           string
    SystemMap           *discovery.SystemMap
    ExecutablesValid    bool
    Services            []ServiceStatus
    OnboardingCompleted bool
}
```

### 3. `internal/persistence` (Persistencia)
**Funcionalidad:**
- Centraliza hallazgos en `AppData/config/nucleus.json`
- Estructura: "Caja Negra" del estado del sistema

**Formato nucleus.json:**
```json
{
  "last_scan": "2025-01-17T15:30:00Z",
  "paths": {
    "brain_path": "C:\\...",
    "chrome_path": "C:\\...",
    "vscode_plugin": "C:\\...",
    "plugin_version": "1.0.0"
  },
  "services": [
    {
      "name": "Brain TCP Service",
      "available": true,
      "details": "Puerto 5678 abierto"
    }
  ],
  "onboarding_completed": false
}
```

## Comandos Disponibles

### Modo Default (sin argumentos)
```bash
sentinel.exe
```
Comportamiento: Inicialización base + validación de rutas + carga de perfiles

### Comando Health
```bash
sentinel.exe health
```

**Secuencia de ejecución:**
1. **Discovery** → Localiza binarios y plugin VSCode
2. **Health Scan** → Audita servicios de red y estado lógico
3. **Write nucleus.json** → Persiste estado en AppData/config/
4. **JSON Output** → Imprime reporte completo en consola

**Salida ejemplo:**
```
[INFO] Iniciando escaneo del sistema...
[INFO] Fase 1: Autodescubrimiento de componentes
[SUCCESS] ✓ brain.exe: C:\...\brain.exe
[SUCCESS] ✓ chrome.exe: C:\...\chrome.exe
[WARNING] VSCode Plugin no encontrado
[INFO] Fase 2: Auditoría de servicios
[WARNING] ✗ Brain TCP Service: Puerto 5678 cerrado o inaccesible
[SUCCESS] ✓ Chrome Extension Backend: HTTP 200 OK en puerto 3001
[WARNING] ⚠ Onboarding pendiente
[INFO] Fase 3: Persistiendo estado del sistema
[SUCCESS] ✓ Estado guardado en nucleus.json
[INFO] Reporte completo:
{
  "timestamp": "2025-01-17T15:30:00Z",
  ...
}
```

## Compilación

```bash
build.bat
```

Genera:
- Salida: `../native/bin/win32/sentinel.exe` (32-bit)
- Copia `blueprint.json` si no existe en destino
- Flags: `GOOS=windows GOARCH=386 CGO_ENABLED=0`

## Diagnóstico Inteligente

Sentinel ahora puede informar exactamente:
- ✓ Qué piezas están instaladas y dónde
- ✗ Qué binarios faltan
- ⚠ Qué puertos están bloqueados
- ℹ Estado del onboarding del usuario

**Ejemplo de diagnóstico:**
```json
{
  "error": "discovery_failed",
  "details": "brain.exe no encontrado en ninguna ubicación"
}
```

## Próximos Pasos

Con `sentinel health` implementado, el sistema puede:
1. Autodiagnosticarse completamente
2. Reportar configuración real del usuario
3. Detectar servicios caídos antes de operar
4. Guardar estado histórico en nucleus.json

---

**Versión:** 1.0.0 (Fase 2 completa)  
**Target:** Windows 32-bit  
**Arquitectura:** Modular + Discovery + Health + Persistence