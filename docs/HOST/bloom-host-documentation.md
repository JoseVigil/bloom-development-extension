# bloom-host — Documentación Técnica

> **Protocolo Synapse — Native Messaging Bridge**
> Versión del documento: 1.0 | Basada en código fuente completo

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Posición en la Arquitectura Bloom](#2-posición-en-la-arquitectura-bloom)
3. [Estructura del Repositorio](#3-estructura-del-repositorio)
4. [Compilación — build.sh](#4-compilación--buildsh)
5. [Modos de Operación](#5-modos-de-operación)
6. [Protocolo Synapse — Handshake de 3 Fases](#6-protocolo-synapse--handshake-de-3-fases)
7. [Sistema de Identidad (Late Binding)](#7-sistema-de-identidad-late-binding)
8. [Arquitectura de Threads](#8-arquitectura-de-threads)
9. [Comunicación Chrome ↔ Host ↔ Brain](#9-comunicación-chrome--host--brain)
10. [Chunked Messages](#10-chunked-messages)
11. [Sistema de Logging — SynapseLogManager](#11-sistema-de-logging--synapselogmanager)
12. [Rutas de Logs por Plataforma](#12-rutas-de-logs-por-plataforma)
13. [Quién Lanza el Host — Por Plataforma](#13-quién-lanza-el-host--por-plataforma)
14. [CLI — Comandos de Diagnóstico](#14-cli--comandos-de-diagnóstico)
15. [Constantes y Límites del Protocolo](#15-constantes-y-límites-del-protocolo)
16. [Ciclo de Vida Completo](#16-ciclo-de-vida-completo)
17. [Diagnóstico de Arranque — PRE_BOOT Log](#17-diagnóstico-de-arranque--pre_boot-log)

---

## 1. Visión General

**bloom-host** es el proceso C++ que actúa como puente de comunicación entre **Cortex** (la Chrome Extension) y **Brain** (el motor Python). Es el componente que implementa el lado nativo del protocolo **Chrome Native Messaging** y a su vez mantiene una conexión TCP persistente hacia Brain.

```
Cortex (Chrome Extension)
    ↕  Native Messaging (stdin/stdout, framing 4 bytes LE)
bloom-host  ←→  Brain (TCP localhost:5678, framing 4 bytes BE)
```

El host es un proceso **stateless**: no almacena contexto de negocio. Su única responsabilidad es establecer el canal de comunicación, validar el handshake de 3 fases del Protocolo Synapse, y rutear mensajes JSON bidireccionalmente entre ambos extremos.

### Características clave

- Handshake de 3 fases (extensión_ready → host_ready → PROFILE_CONNECTED)
- Sistema de identidad con late binding (CLI args o primer mensaje de stdin)
- Reconexión automática a Brain con backoff exponencial
- Keepalive activo hacia Chrome para evitar el timeout de ~6s del Service Worker
- Logging dual: canal nativo (host) + canal extensión (cortex)
- Modo `--init` pre-launch ejecutado por Sentinel con token completo del usuario
- PRE_BOOT log antes de cualquier inicialización para diagnóstico de crashes

---

## 2. Posición en la Arquitectura Bloom

```
Sentinel (daemon)
    │
    ├── bloom-host --init (pre-launch, token completo)
    │
    └── registra NM manifest → Chrome arranca bloom-host via Native Messaging
                                        │
                              bloom-host (este proceso)
                                  │                    │
                          stdin/stdout              TCP :5678
                    (Chrome NM protocol)        (Brain protocol)
                          │                            │
                    Cortex Extension              Brain (Python)
                    (background.js)              (SynapseManager)
```

**Brain** escucha en `localhost:5678`. bloom-host se conecta a Brain como **cliente TCP** y se reconecta automáticamente si la conexión cae.

**Chrome** lanza bloom-host como proceso hijo a través del Native Messaging manifest. La comunicación es por `stdin`/`stdout` con framing de 4 bytes en Little Endian.

---

## 3. Estructura del Repositorio

```
bloom-development-extension/host/
├── bloom-host.cpp          # Main — lógica central, threads, handshake
├── synapse_logger.cpp/h    # Sistema de logging dual (host + cortex)
├── platform_utils.cpp/h    # Abstracciones de red y utilidades por OS
├── chunked_buffer.cpp/h    # Ensamblado de mensajes chunkeados
├── cli_handler.cpp/h       # Handler legacy de CLI args
├── cli_parser.h            # Parser CLI completo: --version, --info, --health
├── help_renderer.cpp/h     # Renderizador de ayuda con ANSI colors
├── build.sh                # Script de compilación cross-platform
├── nlohmann/               # nlohmann/json.hpp (header-only JSON)
├── mingw-deps/             # OpenSSL 3.0.15 para cross-compilación Windows
├── build_number.darwin.txt
├── build_number.linux.txt
├── build_number.windows.txt
└── version_number.txt
└── HostExecutor.ts         # TypeScript wrapper (VS Code plugin)
```

### Archivos generados en build

```
installer/host/
├── build_info.h            # Auto-generado: BUILD_NUMBER, VERSION_STRING, BUILD_DATE
├── build_number.txt
└── version_number.txt

installer/native/bin/
├── win64/host/
│   ├── bloom-host.exe
│   ├── libwinpthread-1.dll
│   ├── libgcc_s_seh-1.dll
│   ├── libstdc++-6.dll
│   └── help/help.txt
├── darwin_arm64/host/
│   ├── bloom-host
│   └── help/help.txt
├── darwin_x64/host/
│   ├── bloom-host
│   └── help/help.txt
└── linux_x64/host/
    ├── bloom-host
    └── help/help.txt
```

---

## 4. Compilación — build.sh

El script `build.sh` es el punto de entrada único para compilar bloom-host en todas las plataformas. Se invoca directamente o desde `build-all.py` (que inyecta `BLOOM_PROJECT_ROOT`).

### Plataformas de compilación

| Target | Compilador | Condición de activación |
|--------|-----------|------------------------|
| Windows (win64) | `x86_64-w64-mingw32-g++` (MinGW cross) | `command -v x86_64-w64-mingw32-g++` disponible |
| macOS ARM64 | `clang++ -arch arm64` | `$OSTYPE == darwin*` |
| macOS x86_64 | `clang++ -arch x86_64` | `$OSTYPE == darwin*` |
| Linux x64 | `g++` nativo | `$OSTYPE == linux-gnu*` |

### Flags de compilación

```bash
# Windows (MinGW)
x86_64-w64-mingw32-g++ -std=c++20 -O2 -I. -I<openssl_include> \
    <sources> -o bloom-host.exe \
    -L<openssl_lib> <openssl_lib>/libssl.a <openssl_lib>/libcrypto.a \
    -lws2_32 -lshell32 -lcrypt32 -luser32 -lgdi32 \
    -static-libgcc -static-libstdc++ \
    -Wl,--subsystem,console

# macOS ARM64
clang++ -arch arm64 -std=c++20 -O2 -I. -I<openssl_include> \
    <sources> -o bloom-host -L<openssl_lib> -lssl -lcrypto

# macOS x86_64
clang++ -arch x86_64 -std=c++20 -O2 -I. -I<openssl_include> \
    <sources> -o bloom-host -L<openssl_lib> -lssl -lcrypto

# Linux
g++ -std=c++20 -O2 -I. \
    <sources> -o bloom-host \
    -lpthread -lssl -lcrypto -static-libgcc -static-libstdc++
```

### Build number management

El build number se gestiona con archivos de texto en `installer/host/`. En cada invocación de `build.sh`:

1. Lee `build_number.txt` → `CURRENT_BUILD`
2. Incrementa → `NEXT_BUILD`
3. Escribe `NEXT_BUILD` en el archivo
4. Genera `build_info.h` con `BUILD_NUMBER`, `BUILD_DATE`, `BUILD_TIME`, `VERSION_STRING`

```c
// build_info.h — auto-generado
#define BUILD_NUMBER 142
#define BUILD_DATE   "2026-06-14"
#define BUILD_TIME   "10:32:15"
#define VERSION_STRING "2.1.0"
```

### Dependencias OpenSSL

**Windows**: El script busca OpenSSL en este orden de prioridad:
1. `mingw-deps/openssl-mingw/` (compilado localmente por `setup-openssl-mingw.sh`)
2. Homebrew MinGW OpenSSL (`/opt/homebrew/opt/mingw-w64-openssl`)
3. Búsqueda `find` en el sistema

**macOS**: Homebrew OpenSSL@3 en `/opt/homebrew/opt/openssl@3` (ARM64) o `/usr/local/opt/openssl@3` (Intel).

**Linux**: Sistema (`-lssl -lcrypto` del sistema).

### Generación de help.txt

Al finalizar la compilación, el script ejecuta `bloom-host --help` con el binario nativo y guarda el resultado en `<out_dir>/<platform>/host/help/help.txt` para cada plataforma compilada.

---

## 5. Modos de Operación

bloom-host tiene tres modos de ejecución distintos, detectados por los argumentos de línea de comandos:

### Modo 1: CLI Informativo

```bash
bloom-host --version        # Versión simple
bloom-host --version --json # Versión en JSON
bloom-host --info           # Info completa del sistema
bloom-host --info --json    # Info en JSON (para Metamorph)
bloom-host --health         # Health check en 4 pasos
bloom-host --help           # Ayuda visual con ANSI colors
```

El handler `CLIParser::parse_and_execute()` intercepta estos flags antes de que el proceso llegue al loop de Native Messaging. Si retorna `handled=true`, el proceso termina con el exit code correspondiente.

### Modo 2: Pre-Launch Init (`--init`)

```bash
bloom-host --init \
    --profile-id <uuid> \
    --launch-id <launch_id> \
    --user-base-dir <path_to_BloomNucleus> \
    [--json]
```

Sentinel invoca este modo **antes** de que Chrome arranque, mientras aún tiene el token completo del usuario (no el token restringido de Chrome). Responsabilidades:

1. Crear la estructura de directorios de logs
2. Abrir y escribir headers en los archivos de log
3. Salir con código `0` (éxito) o `1` (fallo)
4. Si `--json` está presente: emitir resultado parseado en stdout, redirigir stderr a `/dev/null`

```json
// stdout con --json --init exitoso
{
  "ok": true,
  "profile_id": "14c11dbf-7f2a-43be-beba-7ae757cc7486",
  "launch_id": "009_14c11dbf_045012",
  "log_directory": "/home/user/.local/share/BloomNucleus/logs/host/profiles/14c11dbf.../009_.../",
  "host_log": "/home/user/.local/share/BloomNucleus/logs/host/profiles/.../host_20260614.log",
  "extension_log": "/home/user/.local/share/BloomNucleus/logs/host/profiles/.../cortex_extension_20260614.log",
  "timestamp": 1749900000000
}
```

### Modo 3: Native Messaging (operación normal)

Cuando Chrome lanza el host a través del NM manifest, el proceso entra al loop principal de stdin/stdout. Este es el modo de operación normal.

---

## 6. Protocolo Synapse — Handshake de 3 Fases

El Protocolo Synapse define un handshake de 3 fases que debe completarse antes de que el host acepte rutear mensajes de Brain hacia Chrome.

### Estado del handshake

```cpp
enum HandshakeState {
    HANDSHAKE_NONE,            // Sin comunicación
    HANDSHAKE_EXTENSION_READY, // Fase 1: Extension envió extension_ready
    HANDSHAKE_HOST_READY,      // Fase 2: Host respondió host_ready
    HANDSHAKE_CONFIRMED        // Fase 3: Brain notificado de PROFILE_CONNECTED
};
```

### Flujo normal (con CLI args del manifest)

```
Chrome/Cortex                bloom-host                     Brain
     │                           │                            │
     │                           │── TCP connect ────────────▶│
     │                           │                            │
     │── extension_ready ───────▶│  [FASE 1]                  │
     │   {profile_id, launch_id} │                            │
     │                           │── REGISTER_HOST ──────────▶│
     │                           │   {profile_id, launch_id,  │
     │                           │    pid, timestamp}          │
     │                           │                            │
     │                           │◀── REGISTER_ACK ───────────│
     │                           │                            │
     │◀── host_ready ────────────│  [FASE 2]                  │
     │   {version, build,        │                            │
     │    capabilities,          │                            │
     │    max_message_size,       │                            │
     │    cortex_log_path}        │                            │
     │                           │                            │
     │                           │── PROFILE_CONNECTED ──────▶│  [FASE 3]
     │                           │   {profile_id, launch_id,  │
     │                           │    handshake_confirmed:true}│
     │                           │                            │
     ═══════ SISTEMA LISTO PARA COMANDOS ═══════════════════════
```

### Flujo alternativo: REGISTER_ACK antes de extension_ready

Cuando el TCP conecta más rápido que Chrome envía `extension_ready`, Brain responde con `REGISTER_ACK` antes de que haya llegado el primer mensaje de stdin. En ese caso:

```
bloom-host                     Brain                  Chrome/Cortex
     │                            │                        │
     │── TCP connect ────────────▶│                        │
     │── REGISTER_HOST ──────────▶│                        │
     │◀── REGISTER_ACK ───────────│                        │
     │                            │                        │
     │── host_ready (proactivo) ──────────────────────────▶│
     │   [send_host_ready_to_chrome()]                     │
     │                            │                        │
     │◀─── extension_ready ───────────────────────────────-│
     │   (handle_extension_ready es no-op: estado ≠ NONE)  │
     │                            │                        │
     │── PROFILE_CONNECTED ──────▶│                        │
```

El envío proactivo de `host_ready` es crítico: Chrome mata el proceso NM si no recibe nada en stdout en aproximadamente 6 segundos.

### Mensaje host_ready

```json
{
  "command": "host_ready",
  "version": "2.1.0",
  "build": 142,
  "capabilities": ["chunked_messages", "slave_mode_timeout", "size_validation"],
  "max_message_size": 1020000,
  "cortex_log_path": "/path/to/cortex_extension_20260614.log",
  "timestamp": 1749900000000
}
```

El campo `cortex_log_path` es opcional: solo está presente cuando el logger ya está inicializado. Permite a Cortex saber dónde escribir sus propios logs.

---

## 7. Sistema de Identidad (Late Binding)

La identidad del proceso (profile_id + launch_id) puede resolverse por dos caminos:

### Path 1: CLI args (modo con manifest completo)

Cuando Brain/Sentinel inyecta los argumentos en el NM manifest:

```
bloom-host --profile-id <uuid> --launch-id <id> --user-base-dir <path>
```

En `main()`, si `cli_profile_id` y `cli_launch_id` no están vacíos:

1. Se asignan a `g_profile_id` y `g_launch_id` bajo mutex
2. Se intenta `initialize_from_telemetry()` usando `telemetry.json`
3. Si falla, fallback a `g_logger.initialize()`
4. Se dispara `identity_resolved.store(true)` + `notify_all()`

El thread TCP espera en `g_identity_cv` hasta que la identidad esté resuelta antes de enviar `REGISTER_HOST`.

### Path 2: extension_ready en stdin (sin CLI args)

Cuando los args no están disponibles (caso legacy o primer boot sin manifest actualizado):

1. Main lee el **primer mensaje de stdin** directamente (antes de iniciar threads)
2. Valida que `command == "extension_ready"`
3. Extrae `profile_id` y `launch_id` del JSON
4. Inicializa logger y dispara `identity_resolved`
5. **Recién entonces** arranca los threads TCP, heartbeat y keepalive

### Extracción de identidad durante operación

Para el caso donde el handshake ya está en curso pero la identidad aún no se resolvió (condición de carrera), existen dos mecanismos adicionales:

**`try_extract_profile_id_from_raw()`**: parsing de string manual del JSON sin deserializar, busca `"profile_id"` y extrae el UUID validando el formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`. Solo extrae `profile_id`; el logger no se inicializa hasta tener también `launch_id`.

**`try_extract_identity()`**: parsing JSON completo, solo actúa sobre mensajes `type == "SYSTEM_HELLO"`.

### El bug del argc-1 (ya corregido)

`platform_utils.cpp` documenta un bug histórico importante:

```cpp
// BUG FIX: era `i < argc - 1`, lo que excluía el último par posible
// cuando Chrome agrega la origin como arg extra al final del manifest args,
// desplazando --user-base-dir al penúltimo slot.
for (int i = 1; i < argc; ++i) {  // CORRECTO: iterar hasta argc
    if (std::string(argv[i]) == flag) {
        if (i + 1 < argc) {
            return std::string(argv[i + 1]);
        }
    }
}
```

Chrome añade la `origin` de la extensión como argumento adicional al final de los args del manifest. Esto desplazaba `--user-base-dir` al último slot, que el loop con `i < argc - 1` nunca procesaba. El resultado: `--user-base-dir` llegaba vacío y el logger usaba `get_default_base_dir()` que en ciertos contextos resuelve incorrectamente.

---

## 8. Arquitectura de Threads

bloom-host opera con 4 threads simultáneos después del arranque:

### Thread Principal — stdin loop

Lee mensajes de Chrome en formato Native Messaging (4 bytes LE + payload JSON). Es el único thread que lee de stdin. Para cada mensaje llama a `handle_chrome_message()`.

```
while (!shutdown_requested) {
    read 4 bytes LE → len
    read len bytes  → msg_str
    handle_chrome_message(msg_str)
}
```

La salida del loop (por EOF en stdin, es decir Chrome cerrado) dispara el shutdown graceful.

### Thread TCP — `tcp_client_loop()`

Gestiona la conexión hacia Brain. Comportamiento:

1. Espera en `g_identity_cv` hasta que la identidad esté resuelta (máx. `MAX_IDENTITY_WAIT_MS = 10000ms`)
2. Conecta a `localhost:5678`
3. Envía `REGISTER_HOST`
4. Vacía la cola de mensajes pendientes (`g_pending_messages`)
5. Loop de recepción: `recv` 4 bytes BE → `ntohl` → `recv` payload → `handle_service_message()`
6. En desconexión: espera con backoff exponencial (base 500ms, max 2^5 × 500ms = 16s) y reconecta

El socket se almacena en `service_socket` (atómico), que los otros threads consultan para saber si hay conexión activa.

### Thread Heartbeat — `heartbeat_loop()`

Cada `HEARTBEAT_INTERVAL_SEC = 10` segundos envía a Brain:

```json
{
  "type": "HEARTBEAT",
  "timestamp": 1749900000000,
  "stats": {
    "messages_sent": 42,
    "messages_received": 38,
    "heartbeat_count": 7,
    "handshake_state": 3,
    "pending_queue": 0
  },
  "profile_id": "14c11dbf-..."
}
```

### Thread Chrome Keepalive — `chrome_keepalive_loop()`

Cada `CHROME_KEEPALIVE_INTERVAL_MS = 3000ms` (< 6s) envía a Chrome:

```json
{
  "command": "keepalive",
  "timestamp": 1749900000000,
  "heartbeat_count": 7
}
```

Solo activo cuando `handshake_state == HANDSHAKE_CONFIRMED`. Antes de ese punto, `host_ready` ya mantiene el pipe activo.

**Por qué existe**: Chrome implementa un idle timeout de ~6 segundos en el pipe de Native Messaging. Si el proceso host no escribe nada en stdout durante ese tiempo, Chrome mata el proceso. El keepalive garantiza que el pipe se mantenga vivo independientemente del tráfico de Brain.

---

## 9. Comunicación Chrome ↔ Host ↔ Brain

### Framing Chrome (Native Messaging)

```
[ 4 bytes Little Endian | JSON payload ]
    uint32_t len (LE)     len bytes UTF-8
```

### Framing Brain (TCP)

```
[ 4 bytes Big Endian | JSON payload ]
    uint32_t len (BE, network order)   len bytes UTF-8
```

La diferencia de endianness es intencional: el protocolo Chrome NM usa LE, los protocolos TCP de red usan BE (network order). El host convierte con `htonl`/`ntohl`.

### Límite de tamaño — El muro de 1MB

```cpp
const size_t MAX_CHROME_MSG_SIZE = 1020000; // bytes
```

Chrome tiene un límite de ~1MB en mensajes Native Messaging. Cuando `write_message_to_chrome()` recibe un mensaje mayor:

1. **No envía** el mensaje (aborta el write)
2. Emite `EXTENSION_ERROR` con `code: "MSG_TOO_BIG"` hacia Brain vía TCP
3. Registra en log

### Ruteo de mensajes

**Chrome → Brain** (`handle_chrome_message`):
- Si `command == "extension_ready"` → `handle_extension_ready()` (no rutear)
- Si `bloom_chunk` presente → `ChunkedMessageBuffer::process_chunk()`; cuando el mensaje está completo → `write_to_service()`
- Cualquier otro → `write_to_service()` directo

**Brain → Chrome** (`handle_service_message`):
- Si `type == "REGISTER_ACK"` → `send_host_ready_to_chrome()` (no rutear)
- Si `type == "PING"` → responder `PONG` al Brain (no rutear)
- Si `type == "REQUEST_IDENTITY"` → responder `IDENTITY_RESPONSE` al Brain (no rutear)
- Si handshake no confirmado → descartar (log `MSG_BLOCKED_NO_HANDSHAKE`)
- Cualquier otro → `write_message_to_chrome()`

### Shutdown graceful

Cuando stdin llega a EOF (Chrome cerró la conexión):

1. Main loop termina
2. Se envía `UNREGISTER_HOST` directamente al socket de Brain (sin pasar por el mutex de `write_to_service` para evitar deadlock)
3. Se cierra el socket
4. `shutdown_requested.store(true)` + `notify_all()`
5. Join de los tres threads

```json
{
  "type": "UNREGISTER_HOST",
  "profile_id": "...",
  "launch_id": "...",
  "reason": "STDIN_EOF",
  "timestamp": 1749900000000
}
```

---

## 10. Chunked Messages

Para mensajes que superan el límite de 1MB de Chrome (enviados desde Cortex hacia Brain), el protocolo implementa fragmentación en chunks con verificación SHA-256.

### Formato de un chunk

Un mensaje chunkeado se compone de 3 tipos de frames enviados en secuencia:

**Header frame**:
```json
{
  "bloom_chunk": {
    "type": "header",
    "message_id": "msg_uuid",
    "total_chunks": 5,
    "total_size_bytes": 4500000
  }
}
```

**Data frames** (uno por chunk):
```json
{
  "bloom_chunk": {
    "type": "data",
    "message_id": "msg_uuid",
    "data": "<base64 encoded chunk>"
  }
}
```

**Footer frame**:
```json
{
  "bloom_chunk": {
    "type": "footer",
    "message_id": "msg_uuid",
    "checksum_verify": "<sha256 hex del payload completo>"
  }
}
```

### Procesamiento en `ChunkedMessageBuffer`

El buffer mantiene un mapa de mensajes en progreso indexados por `message_id`. El ensamblado es thread-safe (mutex interno).

Cuando llega el footer:
1. Calcula SHA-256 del buffer acumulado (usando OpenSSL `SHA256()`)
2. Compara con `checksum_verify`
3. Si coincide: retorna `COMPLETE_VALID` y el mensaje ensamblado
4. Si no coincide: elimina el buffer y retorna `COMPLETE_INVALID_CHECKSUM`

---

## 11. Sistema de Logging — SynapseLogManager

`SynapseLogManager` gestiona **dos canales de log separados**:

| Canal | Archivo | Contenido |
|-------|---------|-----------|
| `native_log` | `host_YYYYMMDD.log` | Eventos del proceso C++ (bloom-host) |
| `browser_log` | `cortex_extension_YYYYMMDD.log` | Mensajes redirigidos desde Cortex |

### Estados del logger

El logger puede encontrarse en estos estados durante el ciclo de vida del proceso:

1. **No inicializado** (`ready == false`): Los mensajes de `log_native()` van a una cola circular (`pending_queue`, máx. 100 entradas) con su timestamp original.
2. **Inicializado** (`ready == true`): Escribe directamente a disco + stderr. Al inicializarse, vacía la `pending_queue` al archivo bajo el encabezado `--- PENDING LOG FLUSH ---`.

### Inicialización — dos caminos

#### `initialize_from_telemetry()` (preferido)

Lee `telemetry.json` y extrae los paths absolutos ya escritos por Brain:

```json
{
  "active_streams": {
    "host_009_14c11dbf_045012": {
      "path": "/home/user/.local/share/BloomNucleus/logs/host/profiles/14c11dbf-.../009_.../host_20260614.log"
    },
    "cortex_009_14c11dbf_045012": {
      "path": "/home/user/.local/share/BloomNucleus/logs/host/profiles/14c11dbf-.../009_.../cortex_extension_20260614.log"
    }
  }
}
```

Ventaja: los paths son absolutos y correctos independientemente del contexto de proceso. Evita el problema de `%LOCALAPPDATA%` en Session 0 (Windows) o `$HOME` mal resuelto (Linux sin env heredado).

#### `initialize()` (fallback)

Construye los paths desde cero usando `get_base_log_directory()` y crea la estructura de directorios. Susceptible a problemas cuando el proceso no hereda el entorno del usuario correcto.

```
<base>/logs/host/profiles/<profile_id>/<launch_id>/
    host_YYYYMMDD.log
    cortex_extension_YYYYMMDD.log
    nm_init_diag_<launch_id>.log
```

### Archivo de diagnóstico — nm_init_diag

El logger escribe un archivo `nm_init_diag_<launch_id>.log` que registra el proceso de inicialización del propio logger:

```
[DIAG] initialize() called profile=14c11dbf-... launch=009_... user_base_dir=/home/user/.local/share/BloomNucleus
[DIAG] attempting open host=...host_20260614.log ext=...cortex_extension_20260614.log
[DIAG] open results native=OK browser=OK
[DIAG] INIT_SUCCESS ready=true
```

Este archivo existe **antes** de que el logger principal esté listo, permitiendo diagnosticar fallos de inicialización del propio logger.

### Registro de telemetría en macOS

En macOS (no Windows), el logger se auto-registra en nucleus llamando a `nucleus register-stream` después de inicializarse:

```cpp
#if !defined(_WIN32) && !defined(__MINGW32__) && !defined(__MINGW64__)
{
    std::string nucleus_bin = bloom_root + "/bin/nucleus/nucleus";
    std::string cmd = "\"" + nucleus_bin + "\""
        + " register-stream"
        + " --launch-id " + launch_id
        + " --stream-id host_"   + launch_id + " --path \"" + host_log_path + "\""
        + " --stream-id cortex_" + launch_id + " --path \"" + extension_log_path + "\""
        + " 2>/dev/null &";
    std::system(cmd.c_str());
}
#endif
```

En Windows este paso es responsabilidad de Brain (que tiene el contexto de sesión correcto).

---

## 12. Rutas de Logs por Plataforma

### Windows

```
%LOCALAPPDATA%\BloomNucleus\logs\host\profiles\<profile_id>\<launch_id>\
    host_YYYYMMDD.log
    cortex_extension_YYYYMMDD.log
    nm_init_diag_<launch_id>.log
```

Ejemplo:
```
C:\Users\josev\AppData\Local\BloomNucleus\logs\host\profiles\
    14c11dbf-7f2a-43be-beba-7ae757cc7486\
    009_14c11dbf_045012\
    host_20260614.log
```

**Consideración Windows**: Cuando Chrome spawna el host en Session 0 (contexto SYSTEM), `%LOCALAPPDATA%` resuelve al perfil del sistema, no del usuario. Por eso existe el argumento `--user-base-dir` que Sentinel inyecta en el NM manifest con el path resuelto con el token real del usuario.

### macOS

```
~/Library/BloomNucleus/logs/host/profiles/<profile_id>/<launch_id>/
    host_YYYYMMDD.log
    cortex_extension_YYYYMMDD.log
    nm_init_diag_<launch_id>.log
```

Ejemplo:
```
/Users/josev/Library/BloomNucleus/logs/host/profiles/
    14c11dbf-7f2a-43be-beba-7ae757cc7486/
    009_14c11dbf_045012/
    host_20260614.log
```

El valor base (`~/Library/BloomNucleus`) se obtiene en `get_base_log_directory()` via `getenv("HOME")`. En macOS Chrome hereda correctamente `$HOME` del entorno del usuario.

### Linux

```
~/.local/share/BloomNucleus/logs/host/profiles/<profile_id>/<launch_id>/
    host_YYYYMMDD.log
    cortex_extension_YYYYMMDD.log
    nm_init_diag_<launch_id>.log
```

Ejemplo:
```
/home/josev/.local/share/BloomNucleus/logs/host/profiles/
    14c11dbf-7f2a-43be-beba-7ae757cc7486/
    009_14c11dbf_045012/
    host_20260614.log
```

**Nota importante**: En `get_default_base_dir()` (en `bloom-host.cpp`), el path base de Linux es:

```cpp
const char* home = std::getenv("HOME");
return home ? std::string(home) + "/.local/share/BloomNucleus" : "";
```

Y en `get_base_log_directory()` del logger (en `synapse_logger.cpp`), el fallback para macOS tiene lógica separada, pero **el bloque `#else` (que cubre Linux) usa el mismo `HOME`**:

```cpp
#else
    // macOS: canonical base is ~/Library/BloomNucleus/logs
    const char* home = std::getenv(\"HOME\");
    if (home && home[0] != '\\0') {
        return std::string(home) + \"/Library/BloomNucleus/logs\";
    }
    return \"/tmp/bloom-nucleus/logs\";
#endif
```

**Este es el bug de Linux**: el bloque `#else` en `get_base_log_directory()` tiene el comentario `// macOS` pero cubre **tanto macOS como Linux** cuando la compilación no define `_WIN32`. El path `/Library/BloomNucleus/logs` es correcto en macOS pero **incorrecto en Linux** (donde debería ser `/.local/share/BloomNucleus/logs`). Como resultado, el logger en Linux intenta crear y escribir en `~/Library/BloomNucleus/logs/...` en lugar de `~/.local/share/BloomNucleus/logs/...`.

La ruta de mitigación existente (`initialize_from_telemetry()`) evita este problema porque usa paths absolutos de `telemetry.json`, pero si ese archivo no existe o no tiene la clave correcta, el logger cae al `initialize()` fallback y escribe en la ruta incorrecta.

---

## 13. Quién Lanza el Host — Por Plataforma

El mecanismo que determina cómo y cuándo se lanza bloom-host es diferente en cada plataforma. La distinción central es **quién registra el Native Messaging manifest** y con qué argumentos.

### Windows

En Windows, el registro del NM manifest es responsabilidad de **Brain** (`ignition_identity.go` o equivalente), que escribe la clave de registro:

```
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bloom.host
    → ruta al archivo JSON del manifest
```

El manifest contiene los argumentos que Chrome pasará al proceso:

```json
{
  "name": "com.bloom.host",
  "description": "Bloom Native Messaging Host",
  "path": "C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\bin\\host\\bloom-host.exe",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<extension_id>/"],
  "args": [
    "--profile-id", "<uuid>",
    "--launch-id", "<launch_id>",
    "--user-base-dir", "C:\\Users\\josev\\AppData\\Local\\BloomNucleus"
  ]
}
```

**Antes de que Chrome arranque**: Sentinel ejecuta `bloom-host --init --profile-id ... --launch-id ... --user-base-dir ...` con el token completo del usuario para crear la estructura de directorios de logs con los permisos correctos.

**Cuando Chrome lanza el host**: el proceso hereda el entorno de Chrome (que puede estar en Session 0/SYSTEM). Por eso `--user-base-dir` es crítico: provee el path resuelto con el token real de Sentinel.

### macOS

En macOS, el NM manifest se registra como archivo JSON en:

```
~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.bloom.host.json
```

El proceso lo registra Brain o Sentinel usando `macOS APIs` o escribiendo el archivo directamente. En macOS, Chrome no corre en un contexto de sesión separado: hereda correctamente el entorno del usuario, incluyendo `$HOME`. Por eso `initialize_from_telemetry()` funciona bien y el fallback a `~/Library/BloomNucleus/logs` también es correcto.

**`get_bloom_root()` en macOS** retorna siempre `~/Library/BloomNucleus` (no deriva el path desde `argv[0]` como en Windows), lo que es correcto para la ubicación canónica de instalación.

### Linux

En Linux, el NM manifest se registra en:

```
~/.config/google-chrome/NativeMessagingHosts/com.bloom.host.json
```

o, para Chromium:

```
~/.config/chromium/NativeMessagingHosts/com.bloom.host.json
```

Este archivo es creado por Sentinel o Brain durante el setup. Chrome en Linux **sí hereda** el entorno del usuario cuando se lanza desde la sesión de escritorio, por lo que `$HOME` está disponible y correctamente resuelto.

Sin embargo, como se detalla en la sección anterior, `get_base_log_directory()` en `synapse_logger.cpp` usa el path `~/Library/BloomNucleus/logs` para todo lo que no es Windows — incluyendo Linux. Si `initialize_from_telemetry()` no puede resolver los paths desde `telemetry.json`, el logger cae a `initialize()` y escribe en una ruta que no existe en Linux (`~/Library/` es una carpeta macOS).

**Quién está levantando el host en Linux**: Chrome, a través del NM manifest registrado en `~/.config/google-chrome/NativeMessagingHosts/`. El proceso recibe los argumentos definidos en ese manifest.

---

## 14. CLI — Comandos de Diagnóstico

### `--version` / `-v`

```
bloom-host version 2.1.0 build 142
```

Con `--json`:
```json
{
  "application": "bloom-host",
  "version": "2.1.0",
  "build": 142
}
```

### `--info` / `-i`

Muestra información completa del sistema en orden alfabético:

```
application_name: bloom-host
application_version: 2.1.0
architecture: x86_64
build_date: Jun 14 2026 10:32:15
build_number: 142
current_time: 2026-06-14 10:35:00
dependencies: libssl.so.3, libcrypto.so.3
max_message_size: 1020000
os: Linux
os_version: 5.15.0-88-generic
protocol: Synapse Native Messaging v2.1
runtime_engine: C++/GCC
runtime_version: 12.3.0
service_port: 5678
```

La detección de dependencias en runtime usa:
- **Windows**: `dumpbin /dependents`
- **macOS**: `otool -L`
- **Linux**: `ldd`

### `--health`

Ejecuta 4 verificaciones y reporta el resultado:

```
=== BLOOM-HOST HEALTH CHECK ===

[1/4] Platform Detection...
  [OK] OS: Linux 5.15.0-88-generic
  [OK] Arch: x86_64

[2/4] STDIO Availability...
  [OK] STDIN/STDOUT available

[3/4] Network Stack...
  [OK] POSIX sockets available

[4/4] Configuration...
  [OK] Version: 2.1.0
  [OK] Build: 142
  [OK] Target Port: 5678
  [OK] Max Message: 1020000 bytes

[OK] All health checks passed
```

Exit code `0` si todo pasa, `1` si alguna verificación falla. Útil para Metamorph durante reconciliación de estado.

### `--help` / `-h`

Renderizador visual con soporte ANSI colors y Unicode (auto-detecta si stdout es TTY). Categorías:

- **SYSTEM** — `--version`, `--info`, `--health`
- **LIFECYCLE** — `--init`, `--profile-id`, `--launch-id`, `--user-base-dir`
- **RUNTIME** — Argumentos de NM manifest (operación normal de Chrome)

---

## 15. Constantes y Límites del Protocolo

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `SERVICE_PORT` | `5678` | Puerto TCP de Brain |
| `MAX_MESSAGE_SIZE` | `50 MB` | Máximo tamaño de mensaje TCP (con Brain) |
| `MAX_CHROME_MSG_SIZE` | `1,020,000 bytes` | Muro de 1MB — máximo hacia Chrome |
| `RECONNECT_DELAY_MS` | `500 ms` | Delay base de reconexión TCP |
| `MAX_QUEUED_MESSAGES` | `500` | Máximo de mensajes en cola pendiente |
| `MAX_IDENTITY_WAIT_MS` | `10,000 ms` | Timeout de espera de identidad antes de REGISTER_HOST |
| `HEARTBEAT_INTERVAL_SEC` | `10 s` | Intervalo de heartbeat hacia Brain |
| `CHROME_KEEPALIVE_INTERVAL_MS` | `3,000 ms` | Intervalo de keepalive hacia Chrome |
| `MAX_PENDING` | `100` | Máximo de entradas en la cola de logs pendientes |

### Backoff exponencial de reconexión TCP

```
intento 1: 500ms
intento 2: 1000ms
intento 3: 2000ms
intento 4: 4000ms
intento 5: 8000ms
intento 6+: 16000ms (cap en 2^5)
```

---

## 16. Ciclo de Vida Completo

### Arranque (con manifest completo y `--init` previo)

```
Sentinel
  │
  ├─1─ bloom-host --init --profile-id X --launch-id Y --user-base-dir Z
  │     → crea dirs y archivos de log con token completo
  │     → exit 0
  │
  └─2─ registra/actualiza NM manifest con profile-id, launch-id, user-base-dir
       → Chrome detecta manifest registrado

Chrome
  └─3─ spawna bloom-host (con args del manifest)
        │
        ├─ PRE_BOOT: escribe host_boot_{launch_id}.log
        ├─ CLIParser::parse_and_execute() → no handled
        ├─ initialize_networking()
        ├─ setup_binary_io()
        ├─ set_user_base_dir(--user-base-dir)
        ├─ initialize_from_telemetry() → OK
        │   → logger ready, pending_queue vacía
        ├─ identity_resolved.store(true)
        │
        ├─ thread TCP → conecta a Brain:5678
        │               espera identity_cv (ya ok, pasa inmediato)
        │               envía REGISTER_HOST
        │               recibe REGISTER_ACK
        │               → send_host_ready_to_chrome()
        │
        ├─ thread heartbeat → cada 10s HEARTBEAT a Brain
        ├─ thread keepalive → espera HANDSHAKE_CONFIRMED (pendiente)
        │
        └─ main loop: espera mensajes de stdin
             │
             └─ extension_ready llega
                 → handle_extension_ready()
                 → handshake state ya != NONE → no-op (host_ready ya enviado)
```

### Operación normal (después del handshake)

```
Chrome/Cortex                bloom-host                     Brain
     │                           │                            │
     │── <command> ─────────────▶│── write_to_service() ─────▶│
     │                           │                            │
     │◀── <response> ────────────│◀── handle_service_msg() ───│
     │                           │                            │
     │                           │── HEARTBEAT ──────────────▶│  (cada 10s)
     │◀── keepalive ─────────────│                            │  (cada 3s)
```

### Shutdown

```
Chrome cierra pipe
  │
  └─ stdin EOF → main loop sale
      ├─ envía UNREGISTER_HOST a Brain (directo al socket)
      ├─ cierra socket TCP
      ├─ shutdown_requested.store(true)
      ├─ notify_all() en identity_cv
      ├─ join tcp_thread
      ├─ join heartbeat_thread
      ├─ join keepalive_thread
      ├─ cleanup_networking()
      └─ exit 0
```

---

## 17. Diagnóstico de Arranque — PRE_BOOT Log

El PRE_BOOT log es la **primera instrucción de `main()`**, antes de cualquier inicialización. Su propósito es diagnosticar si un crash ocurre antes de que el logger formal esté disponible.

### Dónde escribe

1. **stderr**: capturado por Sentinel o visible en consola
2. **OutputDebugString** (Windows): visible en DebugView (Sysinternals) incluso cuando Chrome redirige stderr
3. **Archivo en disco**: `logs/host/profiles/<profile_id>/<launch_id>/host_boot_<launch_id>.log`

El archivo solo se crea si `--profile-id` y `--launch-id` están presentes en los args. Si no hay args (invocación por Chrome sin manifest actualizado), no se escribe nada a disco.

### Qué registra

```
[PRE_BOOT] MAIN_ENTERED pid=12345 build=142 argc=7 exe=/path/to/bloom-host
[PRE_BOOT] Entering CLIParser::parse_and_execute
[PRE_BOOT] Entering initialize_networking
[PRE_BOOT] Entering setup_binary_io
[PRE_BOOT] setup_binary_io done — normal logging active
[BOOT] pid=12345 profile=14c11dbf-... launch=009_... base_dir=/home/... build=142
[INIT] logger_ready=true profile=... launch=... host_log=... ext_log=... log_dir=...
```

Si el proceso crashea y **no aparece** `[PRE_BOOT] MAIN_ENTERED`, el crash ocurrió antes de `main()` (fallo de DLL, inicialización estática, etc.). Si aparece pero no el siguiente checkpoint, el crash está en esa sección específica.

### `write_boot_log` lambda

```cpp
auto write_boot_log = [&](const std::string& line) {
    std::cerr << line;           // 1. stderr
    OutputDebugStringA(...);     // 2. DebugView (Windows only)
    std::ofstream f(path, app);  // 3. Disco (si hay identidad)
};
```

El path del archivo en disco usa la misma cascada que el logger: `--user-base-dir` si está disponible, luego `get_default_base_dir()`.

---

*Documentación generada a partir del análisis completo del código fuente de bloom-host.*
*Archivos analizados: `bloom-host.cpp`, `synapse_logger.cpp/h`, `platform_utils.cpp/h`, `chunked_buffer.cpp/h`, `cli_parser.h`, `cli_handler.h`, `help_renderer.h`, `build.sh`, `HostExecutor.ts`.*
