# bloom-launcher

Agente de sesión de usuario para Bloom Nucleus.
Resuelve el problema de Session 0 isolation en Windows.

## El problema

Nucleus (BloomNucleusService) y Brain (BloomBrainService) corren como servicios
NSSM en Session 0 de Windows. Session 0 está aislada del desktop del usuario:
no tiene acceso a displays, cursor, compositor de DirectX.

Cuando Brain lanza Chrome desde Session 0, Chromium arranca en el contexto
incorrecto y falla con:

```
screen_win.cc   — Unable to find a primary display
DCompositionCreateDevice failed: Access is denied (0x80070005)
Unable to get cursor info. Error = 5: Access is denied
SANDBOX_ERROR (×15)
```

## La solución

bloom-launcher.exe actúa como puente de sesión. Escucha en un named pipe
(`\\.\pipe\bloom-launcher`) y cuando recibe una solicitud de launch, usa las
Windows Terminal Services APIs para obtener el token del usuario interactivo y
lanzar Chrome directamente en su sesión.

El proceso completo dentro de `internal/executor/launch.go`:

1. **`WTSGetActiveConsoleSessionId`** — obtiene el ID numérico de la sesión
   interactiva activa (normalmente Session 1).
2. **`WTSQueryUserToken`** — obtiene el access token del usuario de esa sesión.
   Requiere `SeTcbPrivilege`, disponible cuando el proceso corre como SYSTEM.
3. **`DuplicateTokenEx`** — convierte el token a tipo Primary
   (`CreateProcessAsUser` rechaza tokens de impersonación).
4. **`CreateEnvironmentBlock`** — genera el bloque de entorno del usuario
   (`USERPROFILE`, `APPDATA`, `TEMP`). Sin esto Chrome hereda el entorno de SYSTEM.
5. **`CreateProcessAsUserW`** con `Desktop: "winsta0\\default"` — lanza Chrome
   asignado al desktop interactivo del usuario. Este campo es el que resuelve
   los errores de display y DComposition.

### Qué NO cambia

- Toda la lógica de construcción de args (`profile_launcher.py` en Brain)
- El contrato JSON del named pipe
- Sentinel, Nucleus, la cadena de orquestación completa
- El lock de Chrome (`.chrome_app.lock`)

Solo cambia el mecanismo de launch final: de `subprocess.Popen` en Session 0
a `CreateProcessAsUserW` con token de Session 1.

## Estructura

```
bloom-launcher/
├── cmd/main.go                    # Entry point, CLI
├── internal/
│   ├── pipe/server.go             # Named pipe server (Windows)
│   ├── executor/launch.go         # CreateProcessAsUserW en Session 1
│   ├── startup/startup_windows.go # HKCU\Run registration
│   └── logger/logger.go           # Logger → AppData/logs/launcher/
├── go.mod
└── go.sum
```

## Dependencias

```
module bloom-launcher
go 1.21

require (
    github.com/Microsoft/go-winio v0.6.1
    golang.org/x/sys v0.17.0
)
```

`internal/executor/launch.go` usa únicamente `syscall` (stdlib). Las dependencias
del go.mod las consumen otros módulos internos; no se requieren dependencias
externas nuevas para la funcionalidad de Session 0.

## Comandos

```
bloom-launcher.exe serve      # Arrancar daemon (default sin args)
bloom-launcher.exe install    # Registrar en HKCU\Run + arrancar
bloom-launcher.exe uninstall  # Desregistrar de HKCU\Run
bloom-launcher.exe status     # RUNNING | STOPPED
bloom-launcher.exe version    # Versión
```

## Protocolo del named pipe

JSON newline-delimited sobre `\\.\pipe\bloom-launcher`.

**Request** (Brain → launcher):
```json
{
  "request_id": "uuid",
  "profile_id": "1d3dad54-...",
  "args": ["C:\\...\\chrome.exe", "--no-sandbox", "--load-extension=...", "..."]
}
```

**Response** (launcher → Brain):
```json
{
  "request_id": "uuid",
  "success": true,
  "pid": 22540
}
```

El proceso Chrome lanzado es completamente detached — bloom-launcher no espera
su terminación.

## Deploy

Electron instala el binario y registra el autostart. El launcher no necesita
estar corriendo en Session 1 para funcionar: al recibir una solicitud en el
pipe, obtiene el token de la sesión activa en ese momento mediante
`WTSQueryUserToken`. Si no hay sesión interactiva disponible (headless, RDP
sin consola física), retorna error claro: `LauncherUnavailableError`.

Path de instalación:
```
C:\Users\<user>\AppData\Local\BloomNucleus\bin\launcher\bloom-launcher.exe
```

Registro autostart:
```
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  BloomLauncher = "...bin\launcher\bloom-launcher.exe serve"
```

## Build

```bat
GOOS=windows GOARCH=amd64 go build -o bloom-launcher.exe ./cmd/
```

## Resiliencia

- **Pipe unavailable**: Brain detecta el error, intenta arrancar
  `bloom-launcher.exe` directamente y reintenta después de 5s.
- **HKCU\Run borrado**: bloom-launcher detecta la entrada faltante al arrancar
  y auto-repara el registro.
- **Sin sesión interactiva**: `WTSGetActiveConsoleSessionId` retorna
  `0xFFFFFFFF`; el launcher retorna `LauncherUnavailableError` con mensaje claro
  en lugar de colgar.
- **Token inválido**: si `WTSQueryUserToken` falla (permisos insuficientes),
  el error sube por la cadena con el código Win32 exacto.