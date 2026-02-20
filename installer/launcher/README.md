# bloom-launcher

Agente de sesión de usuario para Bloom Nucleus.
Resuelve el problema de Session 0 isolation en Windows.

## El problema

Nucleus (BloomNucleusService) y Brain (BloomBrainService) corren como servicios
NSSM en Session 0 de Windows. Session 0 está aislada del desktop del usuario —
no tiene acceso a displays, cursor, compositor de Windows.

Cuando Brain hace subprocess.Popen(chrome.exe) desde Session 0, Chromium arranca
pero no puede crear ventanas visibles:
  - No displays detected → Fallback to fake display
  - DCompositionCreateDevice failed: Access is denied (0x80070005)

## La solución

bloom-launcher.exe corre en Session 1 (sesión interactiva del usuario).
Se registra en HKCU\Run para arrancar con el login del usuario.
Escucha en un named pipe: \\.\pipe\bloom-launcher

Cuando Brain necesita lanzar Chrome:
1. Conecta al named pipe (cruza la barrera Session 0 → Session 1)
2. Envía los args completos de Chrome como JSON
3. bloom-launcher hace el Popen en Session 1 (tiene display)
4. Retorna el PID a Brain

## Lo que NO cambia

- Toda la lógica de construcción de args (profile_launcher.py)
- El contrato JSON de handoff
- Sentinel, nucleus, la cadena de orquestación completa
- El lock de Chrome (.chrome_app.lock)

Solo cambia quién hace el Popen final.

## Estructura

```
bloom-launcher/
├── cmd/main.go                    # Entry point, CLI
├── internal/
│   ├── pipe/server.go             # Named pipe server (Windows)
│   ├── executor/launch.go         # Popen de Chrome en Session 1
│   ├── startup/startup_windows.go # HKCU\Run registration
│   └── logger/logger.go           # Logger a AppData/logs/launcher/
├── bloom_launcher_client.py       # Cliente Python para Brain
├── PATCH_profile_launcher.py      # Diff exacto a aplicar en Brain
└── service-installer-launcher.js  # Integración con el instalador

```

## Comandos

```
bloom-launcher.exe serve      # Arrancar daemon (default sin args)
bloom-launcher.exe install    # Registrar en HKCU\Run + arrancar
bloom-launcher.exe uninstall  # Desregistrar de HKCU\Run
bloom-launcher.exe status     # RUNNING | STOPPED
bloom-launcher.exe version    # Versión
```

## Named Pipe

Protocolo: JSON newline-delimited

Request (Brain → launcher):
{
  "request_id": "uuid",
  "profile_id": "1d3dad54-...",
  "args": ["C:\\...\\chrome.exe", "--no-sandbox", "--load-extension=...", ...]
}

Response (launcher → Brain):
{
  "request_id": "uuid",
  "success": true,
  "pid": 22540
}

## Resiliencia

- Si el usuario mata el proceso: Brain detecta pipe unavailable,
  intenta arrancar bloom-launcher.exe directamente, espera 5s.
- Si el usuario borra HKCU\Run: bloom-launcher lo detecta al arrancar
  y auto-repara la entrada.
- Si no hay sesión interactiva (acceso remoto headless): LauncherUnavailableError
  sube por la cadena con mensaje claro.

## Build

```
GOOS=windows GOARCH=amd64 go build -o bloom-launcher.exe ./cmd/
```

## Instalación (en service-installer-metamorph.js o equivalente)

```javascript
const { installLauncher } = require('./service-installer-launcher');
await installLauncher();
```
