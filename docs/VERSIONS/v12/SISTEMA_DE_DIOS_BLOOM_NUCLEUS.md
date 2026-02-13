# 🌌 BLOOM NUCLEUS - SISTEMA DE DIOS
## FUENTE DE VERDAD ABSOLUTA PARA INSTALACIÓN Y TROUBLESHOOTING

**Versión:** 1.0  
**Última actualización:** 2025-01-10  
**Estado:** Documento Maestro - Supera a "Perfil Nivel Dios"

---

## 📜 LAS 3 REGLAS INMUTABLES + DERIVADAS

### **REGLA 1: Electron NUNCA toca Chrome**
```
Electron → brain.exe CLI → Chrome Process
```
- Electron solo ejecuta `spawn('brain.exe', [...])`
- `brain.exe` es el ÚNICO autorizado para lanzar Chrome
- Mantener la abstracción: Jamás usar `child_process` directo a Chrome desde Electron

**DERIVADA 1A:** Electron verifica resultados parseando `stdout` de brain.exe en formato JSON (`--json` flag)

---

### **REGLA 2: Extension inicia el descubrimiento**
```
Chrome arranca → Extension carga → connectNative() → Host despierta
```
1. Chrome inicia con `--load-extension` y `--user-data-dir`
2. Extension ejecuta `chrome.runtime.connectNative('com.bloom.nucleus.bridge')`
3. Chrome lee Registry HKLM → Lanza `bloom-host.exe`
4. Host auto-detecta `profile_id` desde working directory
5. Host se registra en Brain Service (TCP puerto 5678)
6. Brain mapea: `profile_id → tcp_socket`

**DERIVADA 2A:** Si la extension NO se carga, el host NUNCA despierta (es un proceso hijo de Chrome, no standalone)

---

### **REGLA 3: Comunicación bidireccional**
```
Uplink:   Extension → Host → Brain Service → CLI/Electron
Downlink: CLI/Electron → Brain Service → Host (vía profile_id) → Extension
```

**DERIVADA 3A:** Brain Service es el HUB central (puerto 5678), NO ES OPCIONAL. Sin él, no hay multiplexing.

**DERIVADA 3B:** El `profile_id` es la KEY de routing. Sin él, no se puede dirigir mensajes a un perfil específico.

---

## 🏗️ ARQUITECTURA COMPLETA

### **Diagrama del Sistema (Flujo Completo)**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         BLOOM NUCLEUS SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1] ELECTRON INSTALLER/LAUNCHER                                        │
│       │                                                                  │
│       │ spawn('brain.exe', ['profile', 'launch', 'profile_abc', '--cockpit'])
│       ↓                                                                  │
│  [2] BRAIN.EXE CLI                                                      │
│       │ (Standalone ejecutable compilado con PyInstaller)              │
│       │                                                                  │
│       ├─→ profile launch → spawn Chrome con flags:                     │
│       │   --user-data-dir=C:\...\profiles\profile_abc                  │
│       │   --load-extension=C:\...\extension                            │
│       │   --cockpit (URL landing page)                                  │
│       │                                                                  │
│       └─→ health native-ping → Envía mensaje TCP al Service           │
│           (para test de fuego)                                          │
│                                                                          │
│  [3] CHROME PROCESS                                                     │
│       │ (Lanzado por brain.exe con perfil aislado)                     │
│       │                                                                  │
│       ├─→ Carga extension desde:                                        │
│       │   %LOCALAPPDATA%\BloomNucleus\extension\                       │
│       │                                                                  │
│       └─→ Extension ejecuta background.js                              │
│           chrome.runtime.connectNative('com.bloom.nucleus.bridge')     │
│                                                                          │
│  [4] BLOOM-HOST.EXE (Native Messaging Host)                            │
│       │ (Lanzado automáticamente por Chrome vía Registry HKLM)         │
│       │                                                                  │
│       ├─→ Detecta profile_id desde working directory:                  │
│       │   CWD = "...\profiles\profile_abc\Default" → profile_id = "profile_abc"
│       │                                                                  │
│       ├─→ Conecta a Brain Service vía TCP (127.0.0.1:5678)            │
│       │                                                                  │
│       └─→ Se registra: { type: "REGISTER_HOST", profile_id, pid }     │
│                                                                          │
│  [5] BRAIN SERVICE (TCP Hub - Puerto 5678)                             │
│       │ (Windows Service permanente, instalado con NSSM)               │
│       │                                                                  │
│       ├─→ DISCOVERY REGISTRY (Persistente - profiles.json)             │
│       │   {                                                             │
│       │     "profile_abc": {                                            │
│       │       "display_name": "MasterWorker",                           │
│       │       "directory_path": "C:\...\profiles\profile_abc",         │
│       │       "created_at": "2025-01-10T10:00:00Z",                    │
│       │       "status": "active" | "dormant"                            │
│       │     }                                                            │
│       │   }                                                             │
│       │                                                                  │
│       └─→ COMMUNICATION REGISTRY (Temporal - en memoria)                │
│           {                                                             │
│             "profile_abc": {                                            │
│               "host_pid": 12345,                                        │
│               "tcp_socket": <connection_handle>,                        │
│               "last_heartbeat": 1736510000,                             │
│               "message_queue": []                                       │
│             }                                                            │
│           }                                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 ARCHIVOS CLAVE DEL SISTEMA

### **Instalador (Electron)**
- `installer/electron-app/main.js` - Entry point, IPC handlers
- `installer/electron-app/install/installer.js` - Secuencia maestra de instalación
- `installer/electron-app/install/extension-installer.js` - Copia extension + calcula ID
- `installer/electron-app/install/service-installer.js` - NSSM + Windows Service
- `installer/electron-app/install/native-host-installer.js` - Copia binarios (brain.exe, bloom-host.exe)
- `installer/electron-app/renderer.js` - UI + Test de Fuego (PASO 5)

### **Runtime (Python → Compilado)**
- `brain/cli/profile_commands.py` - create, launch, list, destroy
- `brain/cli/health_commands.py` - native-ping, full-stack
- `brain/core/service/server_manager.py` - TCP Hub multiplexor
- `brain/core/browser/profile_manager.py` - Launch Chrome con Perfil Dios

### **Native Host (C++)**
- `installer/native/bloom-host.cpp` - Cliente TCP + stdio bridge
- `installer/native/com.bloom.nucleus.bridge.json` - Manifest (template)

### **Extension (JavaScript)**
- `installer/chrome-extension/manifest.json` - Con "key" fija para ID estable
- `installer/chrome-extension/background.js` - Service worker + connectNative()
- `installer/chrome-extension/content.js` - Content script injection

### **Configuración (Post-instalación)**
- `%LOCALAPPDATA%\BloomNucleus\config\config.json` - ExtensionId, ProfileId, paths
- `%LOCALAPPDATA%\BloomNucleus\.brain\profiles.json` - Discovery Registry
- `HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge` - Registry key

---

## 🔧 SECUENCIA DE INSTALACIÓN (runFullInstallation)

### **FASE 0: Limpieza Previa**
```javascript
cleanupOldServices()       // Detiene servicios legacy (BloomNucleusHost, etc)
killAllBloomProcesses()    // Mata brain.exe, bloom-host.exe, pythonw.exe
cleanNativeDir()           // Limpia native/ (preserva extension/)
```

### **FASE 1: Estructura Base**
```javascript
createDirectories()        // Crea bloomBase, binDir, logsDir, etc.
```

### **FASE 2: Extension + ID (CRÍTICO)**
```javascript
installExtension()
  └─> findExtensionSource() // Busca manifest.json (root o /src)
  └─> fs.copy(source, extensionDir) // Copia PLANA
  └─> Verificar manifest.json existe en destino

calculateExtensionIdFromManifest()
  └─> Lee manifest.json
  └─> Limpia "key" (elimina \r\n\s)
  └─> calculateExtensionId(cleanKey)
      1. Buffer.from(base64Key, 'base64')
      2. SHA256(buffer)
      3. Tomar primeros 32 caracteres hex
      4. Mapear [0-9a-f] → [a-p]
      5. Retorna: "fpbwkmlnaoigc..." (32 chars)
```

**⚠️ PUNTO CRÍTICO:** Si la key del manifest tiene saltos de línea o espacios, el ID calculado NO coincidirá con el ID real de Chrome. `extension-installer.js` sanitiza la key antes de calcular.

### **FASE 3: Runtime (Motor Python)**
```javascript
installRuntime()           // Instala Python embebido si no existe
```

### **FASE 4: Binarios (brain.exe, bloom-host.exe)**
```javascript
deployBinaries()
  └─> Copia bloom-host.exe a nativeDir
  └─> Copia brain.exe a binDir/brain/
  └─> copyWithRetry() // Maneja archivos bloqueados (taskkill si necesario)
```

### **FASE 5: Native Messaging Bridge + Registry HKLM**
```javascript
createHostManifestInHKLM(extensionId)
  1. Crear JSON:
     {
       "name": "com.bloom.nucleus.bridge",
       "path": "C:\\...\\bloom-host.exe",
       "type": "stdio",
       "allowed_origins": [
         "chrome-extension://fpbwkmlnaoigc.../"
       ]
     }
  2. Guardar en: nativeDir/com.bloom.nucleus.bridge.json
  3. Registrar en HKLM:
     reg add "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge"
         /ve /t REG_SZ /d "C:\...\com.bloom.nucleus.bridge.json" /f
  4. Verificar con: reg query "HKLM\..."
```

**⚠️ PUNTO CRÍTICO:** Si el Extension ID en `allowed_origins` NO coincide con el ID real, Chrome bloqueará la conexión con "Access denied".

### **FASE 6: Servicio Windows (NSSM)**
```javascript
installWindowsService()
  └─> nssm install BloomBrainService "C:\...\brain.exe" runtime run
  └─> nssm set BloomBrainService DisplayName "Bloom Brain Service"
  └─> nssm set BloomBrainService Start SERVICE_AUTO_START
  └─> nssm set BloomBrainService AppEnvironmentExtra "LOCALAPPDATA=C:\..."
  └─> nssm set BloomBrainService AppStdout "...\logs\service-stdout.log"

startService()
  └─> nssm start BloomBrainService
```

**⚠️ PUNTO CRÍTICO:** Si `LOCALAPPDATA` no se inyecta en el servicio, brain.exe no sabrá dónde están los archivos.

### **FASE 7: Perfil Maestro**
```javascript
initializeMasterProfile()
  └─> execFile('brain.exe', ['--json', 'profile', 'create', 'MasterWorker'])
  └─> Parsear stdout JSON → Extraer profile_id
  └─> Guardar en config.json
```

### **FASE 8: Configuración Final**
```javascript
fs.writeJson(configFile, {
  extensionId: "fpbwkmlnaoigc...",
  profileId: "profile_abc123",
  extensionPath: "C:\\...\\extension",
  brainPath: "C:\\...\\brain.exe",
  installed_at: "2025-01-10T12:00:00Z"
})
```

---

## 🔥 TEST DE FUEGO (PASO 5 del renderer.js)

### **Objetivo**
Verificar que toda la cadena de comunicación funciona end-to-end:
```
Electron → Brain CLI → Brain Service → Host → Extension → Host → Service → CLI → Electron
```

### **Secuencia del Test (renderer.js líneas 200-268)**

```javascript
// PASO 1: Delay inicial (Chrome iniciando)
statusEl.textContent = '⏳ Chrome iniciando...';
await sleep(3000);

// PASO 2: Chrome iniciado
statusEl.textContent = '✓ Chrome iniciado correctamente';
await sleep(1500);

// PASO 3: Cargando extensión
statusEl.textContent = '⏳ Cargando extensión de Chrome...';
await sleep(2000);

// PASO 4: Extensión cargada
statusEl.textContent = '✓ Extensión cargada exitosamente';
await sleep(1500);

// PASO 5: Conectando con host
statusEl.textContent = '🔌 Estableciendo conexión con el host...';
await sleep(2000);

// PASO 6: POLLING REAL (CRÍTICO)
setInterval(async () => {
  const status = await api.checkExtensionHeartbeat();
  
  // status = { chromeConnected: true/false, latency: 123, protocol: "tcp", port: 5678 }
  
  if (status && status.chromeConnected) {
    clearInterval(interval);
    // ✅ ÉXITO: Toda la cadena funciona
    dotEl.classList.add('green');
    statusEl.textContent = '✓ Host conectado exitosamente';
  }
}, 3000);
```

### **¿Qué ejecuta `api.checkExtensionHeartbeat()`?**

**Backend (main.js):**
```javascript
ipcMain.handle('check-extension-heartbeat', async () => {
  const result = await execFile('brain.exe', ['health', 'native-ping'], {
    timeout: 5000
  });
  // Parsea stdout → JSON
  return JSON.parse(result.stdout);
});
```

**Brain CLI (`brain health native-ping`):**
1. Conecta a Brain Service (TCP puerto 5678)
2. Envía: `{ command: "ping", source: "cli" }`
3. Service routea al host del perfil activo (si existe)
4. Host responde: `{ command: "pong", status: "ok" }`
5. Service reenvía respuesta
6. CLI retorna JSON: `{ chromeConnected: true, latency: 45, port: 5678 }`

---

## 🚨 DIAGNÓSTICO DE FALLAS (Decision Tree)

### **❌ FALLA: Extension no se carga en Chrome**

**Síntomas:**
- Chrome abre pero NO muestra el ícono de la extension en la barra
- `chrome://extensions` muestra "No se pudo cargar la extensión"

**Verificaciones:**
```powershell
# 1. ¿Existe el manifest.json en la ruta correcta?
dir "%LOCALAPPDATA%\BloomNucleus\extension\manifest.json"

# 2. ¿El manifest.json tiene la propiedad "key"?
type "%LOCALAPPDATA%\BloomNucleus\extension\manifest.json" | findstr "key"

# 3. ¿Chrome se lanzó con el flag correcto?
# En Task Manager → Details → Buscar chrome.exe
# Click derecho → Properties → Ver línea de comandos
# Debe contener: --load-extension="C:\...\extension"
```

**Solución 1: Path incorrecto**
```javascript
// En installer.js, línea ~342
// Verificar que extensionDir apunta a la carpeta CORRECTA
console.log('Extension Source:', await findExtensionSource(paths.extensionSource));
console.log('Extension Dest:', paths.extensionDir);
```

**Solución 2: Manifest corrupto**
```powershell
# Eliminar y reinstalar extension
rmdir /s /q "%LOCALAPPDATA%\BloomNucleus\extension"
# Ejecutar installer nuevamente
```

**Solución 3: Key con saltos de línea**
```javascript
// extension-installer.js DEBE sanitizar la key:
const cleanKey = manifest.key.replace(/[\r\n\s]+/g, '');
```

---

### **❌ FALLA: Host no se registra en Brain Service**

**Síntomas:**
- Extension se carga en Chrome (ícono visible)
- `native-ping` retorna `{ chromeConnected: false }`
- En Task Manager NO aparece `bloom-host.exe`

**Verificaciones:**
```powershell
# 1. ¿Está registrado en HKLM?
reg query "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge"

# 2. ¿Existe el archivo JSON del manifest?
dir "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"

# 3. ¿El Extension ID coincide?
type "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json" | findstr "allowed_origins"
type "%LOCALAPPDATA%\BloomNucleus\extension\manifest.json" | findstr "key"

# Calcular ID manualmente:
brain --json profile list
# Buscar extensionId en config.json
type "%LOCALAPPDATA%\BloomNucleus\config\config.json" | findstr "extensionId"
```

**Solución 1: Extension ID mismatch**
```powershell
# Recalcular Extension ID y regenerar manifest del host
cd "%LOCALAPPDATA%\BloomNucleus"
brain health full-stack  # Este comando debe revelar el mismatch

# Reinstalar:
# 1. Matar Chrome
taskkill /F /IM chrome.exe

# 2. Re-ejecutar FASE 5 del installer (createHostManifestInHKLM)
```

**Solución 2: Host bloqueado por permisos**
```powershell
# ¿Chrome puede ejecutar bloom-host.exe?
icacls "%LOCALAPPDATA%\BloomNucleus\native\bloom-host.exe"

# Debe permitir ejecución (RX)
# Si no:
icacls "%LOCALAPPDATA%\BloomNucleus\native\bloom-host.exe" /grant Users:RX
```

**Solución 3: Registry corrupta**
```powershell
# Eliminar y re-registrar
reg delete "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge" /f

# Re-ejecutar installer.js → createHostManifestInHKLM()
```

---

### **❌ FALLA: Brain Service no responde**

**Síntomas:**
- Host aparece en Task Manager (PID activo)
- Logs de host muestran: "Lost connection. Reconnecting..."
- `native-ping` timeout

**Verificaciones:**
```powershell
# 1. ¿Está corriendo el servicio?
nssm status BloomBrainService

# 2. ¿Está escuchando en puerto 5678?
netstat -ano | findstr :5678

# 3. ¿Hay lockfiles corruptos?
dir "%LOCALAPPDATA%\BloomNucleus\.brain\service.pid"
dir "%LOCALAPPDATA%\BloomNucleus\.brain\service.lock"
```

**Solución 1: Servicio parado**
```powershell
# Iniciar manualmente
nssm start BloomBrainService

# Ver logs de error
type "%LOCALAPPDATA%\BloomNucleus\logs\service-stderr.log"
```

**Solución 2: Puerto bloqueado**
```powershell
# Ver qué proceso usa el puerto 5678
netstat -ano | findstr :5678
# Matar proceso zombie
taskkill /F /PID <PID>

# Reiniciar servicio
nssm restart BloomBrainService
```

**Solución 3: Lockfiles corruptos**
```powershell
# Limpiar lockfiles
nssm stop BloomBrainService
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.pid"
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.lock"
nssm start BloomBrainService
```

**Solución 4: LOCALAPPDATA no inyectado**
```powershell
# Verificar variable de entorno del servicio
nssm get BloomBrainService AppEnvironmentExtra

# Debe mostrar: LOCALAPPDATA=C:\Users\...\AppData\Local
# Si no existe:
nssm set BloomBrainService AppEnvironmentExtra "LOCALAPPDATA=%LOCALAPPDATA%"
nssm restart BloomBrainService
```

---

### **❌ FALLA: Test de Fuego timeout (PASO 5)**

**Síntomas:**
- Chrome abre correctamente
- Extension carga (ícono visible)
- Heartbeat nunca se pone verde
- Después de 60 segundos: "Timeout: Chrome no respondió"

**Diagnóstico Granular:**

**PASO A: ¿La extension intenta conectar?**
```javascript
// En Chrome: F12 (DevTools) → Console
// Debe mostrar:
// "🔌 [Bloom] Conectando a com.bloom.nucleus.bridge..."
```

Si NO aparece → background.js no se ejecutó.

**Solución A:**
```javascript
// Verificar en chrome://extensions → Bloom Nucleus Bridge → Inspect service worker
// Ver errores en consola
```

**PASO B: ¿Chrome lanza el host?**
```powershell
# Mientras Chrome está abierto:
tasklist | findstr bloom-host.exe

# Debe mostrar:
# bloom-host.exe    12345 Console    1     15,234 K
```

Si NO aparece → Chrome no pudo lanzar el host.

**Solución B:**
```powershell
# Verificar Registry:
reg query "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge" /ve

# Verificar que el path en el output existe:
dir "C:\...\com.bloom.nucleus.bridge.json"

# Verificar Extension ID en manifest:
type "C:\...\com.bloom.nucleus.bridge.json" | findstr "allowed_origins"
```

**PASO C: ¿El host conecta al Service?**
```powershell
# Ver logs del host (C++ debug logs):
type "%LOCALAPPDATA%\BloomNucleus\logs\host_client.log"

# Debe mostrar:
# [INFO] Connected to Brain Service at 127.0.0.1:5678
# [INFO] Profile ID detected: profile_abc123
```

Si NO muestra "Connected" → Service no responde (ver sección anterior).

**PASO D: ¿El Service registró el host?**
```powershell
# Ver logs del servicio:
type "%LOCALAPPDATA%\BloomNucleus\logs\service-stdout.log"

# Debe mostrar:
# [2025-01-10 12:00:00] New host registered: profile_abc123 (PID: 12345)
```

Si NO aparece → Host no envió REGISTER_HOST o Service no lo procesó.

**Solución D:**
```powershell
# Restart completo:
nssm stop BloomBrainService
taskkill /F /IM chrome.exe
taskkill /F /IM bloom-host.exe

# Limpiar Communication Registry (temporal):
del "%LOCALAPPDATA%\BloomNucleus\.brain\active_hosts.json"

# Reiniciar:
nssm start BloomBrainService
brain profile launch profile_abc123 --cockpit
```

---

## 🧪 COMANDOS DE RECUPERACIÓN

### **Hard Reset (Limpieza Total)**
```powershell
# 1. Detener todo
nssm stop BloomBrainService
taskkill /F /IM chrome.exe /T
taskkill /F /IM bloom-host.exe /T
taskkill /F /IM brain.exe /T
taskkill /F /IM pythonw.exe /T

# 2. Limpiar servicios
nssm remove BloomBrainService confirm

# 3. Limpiar lockfiles
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.pid"
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.lock"
del "%LOCALAPPDATA%\BloomNucleus\.brain\active_hosts.json"

# 4. Limpiar Registry
reg delete "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge" /f

# 5. Reinstalar
cd "C:\...\installer\electron-app"
npm run start
```

### **Reinstalación Parcial (Solo Binarios + Registry)**
```powershell
# Si extension e ID están bien, solo rehacer binarios:

# 1. Detener servicio
nssm stop BloomBrainService

# 2. Matar procesos
taskkill /F /IM bloom-host.exe
taskkill /F /IM brain.exe

# 3. Copiar binarios (FASE 4)
copy "C:\...\dist\bloom-host.exe" "%LOCALAPPDATA%\BloomNucleus\native\"
copy "C:\...\dist\brain.exe" "%LOCALAPPDATA%\BloomNucleus\bin\brain\"

# 4. Re-registrar Native Host (FASE 5)
# Leer Extension ID:
type "%LOCALAPPDATA%\BloomNucleus\config\config.json" | findstr "extensionId"

# Crear manifest JSON:
echo { > "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo   "name": "com.bloom.nucleus.bridge", >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo   "path": "%LOCALAPPDATA%\\BloomNucleus\\native\\bloom-host.exe", >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo   "type": "stdio", >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo   "allowed_origins": [ >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo     "chrome-extension://[TU_EXTENSION_ID]/" >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo   ] >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"
echo } >> "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json"

# Registrar en HKLM:
reg add "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge" /ve /t REG_SZ /d "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json" /f

# 5. Reiniciar servicio
nssm start BloomBrainService
```

---

## 📊 LOGGING STRATEGY

### **¿Qué loguear en cada componente?**

#### **Extension (background.js)**
```javascript
// Console logs (visible en chrome://extensions → Inspect)
console.log('🔌 [Bloom] Conectando a com.bloom.nucleus.bridge...');
console.log('✅ [Bloom] Conexión establecida: Host C++ <-> Brain Service');
console.error('❌ [Bloom] Error de conexión:', chrome.runtime.lastError);
```

#### **Host (bloom-host.cpp → host_client.log)**
```cpp
g_logger.info("=== Bloom Host v1.4.0 Starting ===");
g_logger.info("Profile ID detected: " + profile_id);
g_logger.info("Connected to Brain Service at 127.0.0.1:5678");
g_logger.error("Lost connection. Reconnecting...");
```

**Ubicación:** `%LOCALAPPDATA%\BloomNucleus\logs\host_client.log`

#### **Brain Service (service-stdout.log / service-stderr.log)**
```python
# stdout (capturado por NSSM)
print("[2025-01-10 12:00:00] Brain Service started on port 5678")
print("[INFO] New host registered: profile_abc123 (PID: 12345)")
print("[INFO] Message routed: CLI → profile_abc123")

# stderr (errores)
sys.stderr.write("[ERROR] Port 5678 already in use\n")
```

**Ubicación:** `%LOCALAPPDATA%\BloomNucleus\logs\service-stdout.log`

#### **Brain CLI (stdout JSON)**
```json
// brain --json health native-ping
{
  "status": "success",
  "data": {
    "chromeConnected": true,
    "latency": 45,
    "protocol": "tcp",
    "port": 5678
  }
}
```

#### **Electron Installer (renderer.js + main.js)**
```javascript
// Console del renderer (F12 en ventana de Electron)
console.log("🚀 [AUTO] Iniciando flujo automático...");
console.log("✅ [AUTO] Instalación completa");
console.error("❌ [AUTO] Error:", error);

// Main process (stdout de npm run start)
console.log('[Installer] Running full installation...');
console.log('[Installer] Extension ID:', extensionId);
```

---

## 📝 ERRORES COMUNES (Pitfalls de la última semana)

### **1. Rutas Relativas vs Absolutas**
**Problema:**
```javascript
// ❌ INCORRECTO
spawn('brain.exe', ['profile', 'launch', profile_id]);
```

En producción (asar compilado), `brain.exe` no está en PATH.

**Solución:**
```javascript
// ✅ CORRECTO
const brainExe = path.join(paths.binDir, 'brain', 'brain.exe');
spawn(brainExe, ['profile', 'launch', profile_id]);
```

---

### **2. Extension ID Mismatch**
**Problema:**
- Manifest tiene key con saltos de línea: `"key": "MIIB\nIjAN..."`
- calculateExtensionId() calcula ID basándose en key SUCIA
- Chrome calcula ID basándose en key LIMPIA (ignora \n automáticamente)
- IDs NO coinciden → Access denied

**Solución:**
```javascript
// extension-installer.js
const cleanKey = manifest.key.replace(/[\r\n\s]+/g, '');
manifest.key = cleanKey; // Sobrescribir en disco
await fs.writeJson(manifestPath, manifest, { spaces: 2 });
```

---

### **3. Service no arranca por lockfiles**
**Problema:**
```powershell
nssm start BloomBrainService
# Error: "The service did not respond to the start or control request"
```

**Causa:** Lockfile corrupto de ejecución anterior.

**Solución:**
```powershell
nssm stop BloomBrainService
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.pid"
del "%LOCALAPPDATA%\BloomNucleus\.brain\service.lock"
nssm start BloomBrainService
```

---

### **4. Registry keys no creadas por falta de permisos**
**Problema:**
```powershell
reg add "HKLM\..." /ve /t REG_SZ /d "..." /f
# Error: Access denied
```

**Causa:** Installer no corrió como Admin.

**Solución:**
```javascript
// main.js (Electron)
if (process.platform === 'win32' && !(await isElevated())) {
  relaunchAsAdmin();
  return;
}
```

---

### **5. Procesos zombie bloqueando archivos**
**Problema:**
```powershell
# Al intentar copiar brain.exe:
# Error: EBUSY: resource busy or locked
```

**Causa:** brain.exe anterior sigue corriendo.

**Solución:**
```javascript
// service-installer.js → copyWithRetry()
try {
  execSync(`taskkill /F /IM brain.exe`, { stdio: 'ignore' });
} catch {}
await sleep(2000);
await fs.copy(src, dest, { overwrite: true });
```

---

## 🎯 REFERENCE CARD (Cheat Sheet de 1 página)

### **Comandos de Verificación Rápida**
```powershell
# ¿Servicio corriendo?
nssm status BloomBrainService

# ¿Puerto 5678 abierto?
netstat -ano | findstr :5678

# ¿Extension instalada?
dir "%LOCALAPPDATA%\BloomNucleus\extension\manifest.json"

# ¿Extension ID correcto?
type "%LOCALAPPDATA%\BloomNucleus\config\config.json" | findstr "extensionId"
type "%LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json" | findstr "allowed_origins"

# ¿Registry OK?
reg query "HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge" /ve

# Test de fuego (CLI)
brain health native-ping

# Test completo
brain health full-stack

# Ver logs
type "%LOCALAPPDATA%\BloomNucleus\logs\service-stdout.log"
type "%LOCALAPPDATA%\BloomNucleus\logs\host_client.log"
```

### **Comandos de Launch Manual (para troubleshooting)**
```powershell
# Crear perfil
brain --json profile create "TestProfile"

# Listar perfiles
brain profile list

# Lanzar con cockpit (landing page)
brain profile launch <PROFILE_ID> --cockpit

# Destruir perfil
brain profile destroy <PROFILE_ID> -f
```

### **Rutas Clave**
```
%LOCALAPPDATA%\BloomNucleus\
  ├── bin\brain\brain.exe          # CLI principal
  ├── native\bloom-host.exe        # Native Host
  ├── native\com.bloom.nucleus.bridge.json  # Manifest
  ├── extension\                   # Extension source
  │   ├── manifest.json (con "key")
  │   └── background.js
  ├── profiles\                    # Perfiles de Chrome
  │   └── profile_abc123\
  ├── .brain\
  │   ├── profiles.json            # Discovery Registry
  │   ├── service.pid
  │   └── service.lock
  ├── config\config.json           # Configuración global
  └── logs\
      ├── service-stdout.log       # Brain Service
      ├── service-stderr.log
      └── host_client.log          # bloom-host.exe
```

---

## ✅ CHECKLIST FINAL DE ÉXITO

### **Pre-instalación**
- [ ] Windows 10/11 con permisos de Admin
- [ ] Chrome instalado (versión 120+)
- [ ] .NET Framework 4.8+ (para NSSM)

### **Post-instalación (CRÍTICO)**
- [ ] `nssm status BloomBrainService` retorna "SERVICE_RUNNING"
- [ ] `netstat -ano | findstr :5678` muestra listener activo
- [ ] `dir %LOCALAPPDATA%\BloomNucleus\extension\manifest.json` existe
- [ ] `reg query HKLM\...\NativeMessagingHosts\...` existe y apunta a JSON correcto
- [ ] `type config.json | findstr extensionId` coincide con `allowed_origins` del JSON

### **Test de Fuego (PASO 5)**
- [ ] Chrome abre con ícono de extension visible
- [ ] F12 en extension → Console muestra "Conexión establecida"
- [ ] Task Manager muestra `bloom-host.exe` corriendo
- [ ] `brain health native-ping` retorna `chromeConnected: true`
- [ ] Heartbeat en Electron UI se pone verde (<60 segundos)

---

## 🎓 TROUBLESHOOTING CON brain CLI

### **Escenario: Test de Fuego falló, necesito debugging granular**

```powershell
# PASO 1: Verificar que el servicio está sano
brain health native-ping
# Si falla: Ver sección "Brain Service no responde"

# PASO 2: Crear perfil de prueba
brain --json profile create "DebugProfile"
# Output: { "status": "success", "data": { "id": "profile_xyz789" } }

# PASO 3: Lanzar manualmente con cockpit
brain profile launch profile_xyz789 --cockpit

# PASO 4: Abrir DevTools de extension (mientras Chrome está abierto)
# chrome://extensions → Bloom Nucleus Bridge → Inspect service worker
# Ver console logs

# PASO 5: Verificar registro del host en Service
type "%LOCALAPPDATA%\BloomNucleus\logs\service-stdout.log" | findstr "profile_xyz789"
# Debe mostrar: "New host registered: profile_xyz789 (PID: ...)"

# PASO 6: Si todo lo anterior está OK pero native-ping falla
# → El problema es el routing en Brain Service (bug de código)
# → Ver server_manager.py (fuera del scope de este documento)

# PASO 7: Destruir perfil de prueba
brain profile destroy profile_xyz789 -f
```

---

## 📌 NOTAS FINALES

1. **Este documento supera al "Perfil Nivel Dios"** porque integra brain.exe en la arquitectura.
2. **brain.exe es el ÚNICO que controla Chrome**. Electron solo habla con brain.exe.
3. **El Extension ID es CRÍTICO**. Si no coincide entre manifest.json y allowed_origins, nada funciona.
4. **Brain Service (puerto 5678) es NO OPCIONAL**. Sin él, no hay multiplexing ni comunicación bidireccional.
5. **El Test de Fuego (PASO 5) es la prueba definitiva**. Si pasa, toda la arquitectura funciona.

---

**Última revisión:** 2025-01-10  
**Autor:** Sistema de Dios - Bloom Nucleus  
**Mantenimiento:** Este documento debe actualizarse si se modifica la arquitectura core.

---

## 🔗 APÉNDICE: Comandos Brain CLI Relevantes

```
brain health native-ping      # Test de conectividad Host ↔ Service
brain health full-stack       # Test completo (incluye extension)
brain health dev-check        # Test de puertos (Vite, API, WebSocket)

brain profile create <ALIAS>  # Crear perfil
brain profile launch <ID> [--cockpit]  # Lanzar Chrome
brain profile list            # Listar perfiles
brain profile destroy <ID> -f # Eliminar perfil

brain runtime run             # Iniciar Brain Service (modo blocking)
brain service service -p 5678 # Iniciar multiplexor TCP (alternativo)
```

---

**FIN DEL DOCUMENTO**
