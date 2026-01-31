# Bloom Nucleus - Electron Installer

Instalador de escritorio para Bloom Nucleus que configura el servicio Windows, extensión Chrome y runtime Python.

## 📋 Requisitos Previos

- Windows 10/11 (64-bit)
- Privilegios de Administrador
- Visual C++ Redistributable 2015-2022
- Node.js 18+ (solo para desarrollo)

## 🚀 Ejecución

### Desarrollo (Con Privilegios)

```bash
cd installer/electron-app
npm install
npm run dev
```

Esto automáticamente:
- Solicita privilegios de administrador (UAC prompt)
- Inicia Electron con permisos elevados
- Permite instalar el servicio Windows

### Desarrollo (Sin Privilegios - Solo UI)

```bash
cd installer/electron-app
npm run dev:no-admin
```

**Nota:** No podrás instalar el servicio, útil solo para desarrollo de interfaz.

### Verificar Privilegios Actuales

```bash
npm run check-admin
```

## 🔨 Build para Producción

### Build Completo (Instalador .exe)

```bash
cd installer/electron-app
npm run build
```

**Output:** `dist/Bloom Nucleus Installer-Setup-1.0.0.exe`

Este instalador:
- Solicita privilegios automáticamente al ejecutarse
- Instala el servicio Windows con NSSM
- Configura Native Messaging para Chrome
- Despliega la extensión

### Build Portable (Sin instalador)

```bash
npm run build:portable
```

**Output:** `dist/Bloom Nucleus Installer-Portable-1.0.0.exe`

## 📦 Preparación de Recursos

Antes del primer build, preparar dependencias:

```bash
# Desde la raíz del proyecto
npm run prepare:runtime      # Empaqueta Python runtime
npm run prepare:all          # Runtime + brain dependencies
```

## 🗂️ Estructura de Directorios

```
installer/electron-app/
├── main.js                 # Proceso principal
├── preload.js              # Bridge IPC
├── package.json            # Configuración Electron
├── src/
│   ├── index.html          # UI del instalador
│   └── renderer.js         # Lógica del frontend
├── assets/
│   └── bloom.ico           # Icono de la app
└── dist/                   # Output de builds
```

## 🔧 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo con privilegios admin |
| `npm run dev:no-admin` | Desarrollo sin privilegios |
| `npm run electron:dev` | Ejecuta Electron directamente |
| `npm run check-admin` | Verifica privilegios actuales |
| `npm run build` | Build instalador NSIS |
| `npm run build:portable` | Build portable |
| `npm run build:dir` | Build sin empaquetar |
| `npm run prepare:all` | Prepara runtime + brain |
| `npm run clean` | Limpia builds |

## 🐛 Troubleshooting

### Error: "Se requieren privilegios de administrador"

**Solución:** Ejecuta `npm run dev` (no `npm run dev:no-admin`)

### Error: "NSSM no encontrado"

**Verificar:** `installer/native/nssm/win64/nssm.exe` existe

**Descargar:** https://nssm.cc/release/nssm-2.24.zip

### Error: "Runtime Source no encontrado"

**Solución:**
```bash
cd ../../  # Ir a raíz del proyecto
npm run prepare:runtime
```

### Error 1053: "El servicio no responde"

**Causa:** El binario `bloom-host.exe` no es un servicio nativo de Windows

**Solución:** NSSM lo envuelve automáticamente. Verifica que NSSM esté presente.

### Verificar Estado del Servicio

```powershell
# Ver estado
sc query BloomNucleusHost

# Iniciar manualmente
sc start BloomNucleusHost

# Detener
sc stop BloomNucleusHost

# Eliminar
sc delete BloomNucleusHost
```

## 📍 Ubicaciones de Instalación

### Usuario (Sin Privilegios)

```
%LOCALAPPDATA%\BloomNucleus\
├── engine\
│   └── runtime\           # Python portable
├── native\
│   ├── bloom-host.exe     # Host nativo
│   └── nssm.exe           # Service wrapper
├── extension\             # Extensión Chrome (unpacked)
└── config\
    ├── installer-config.json
    └── logs\
```

### Sistema (Registry)

```
HKCU\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.bloom.nucleus.bridge
→ Apunta a: %LOCALAPPDATA%\BloomNucleus\native\com.bloom.nucleus.bridge.json
```

### Servicio Windows

```
Nombre: BloomNucleusHost
Display: Bloom Nucleus Host
Inicio: Automático
Binario: %LOCALAPPDATA%\BloomNucleus\native\bloom-host.exe --server --port=5678
```

## 🔐 Seguridad

- **Privilegios Admin:** Solo necesarios para instalar el servicio Windows
- **User Scope:** Archivos instalados en `%LOCALAPPDATA%` (por usuario)
- **Registry:** Solo se modifica HKCU (no HKLM)
- **Servicio:** Se ejecuta con los permisos del usuario que lo instaló

## 📝 Logs

### Durante Instalación

- DevTools de Electron (F12)
- Stdout del proceso principal

### Post-Instalación

```
%LOCALAPPDATA%\BloomNucleus\config\logs\installer.log
```

### Servicio Windows

```
Event Viewer → Windows Logs → Application
Buscar: "BloomNucleusHost"
```

## 🆘 Soporte

Si encuentras problemas:

1. **Logs del instalador:** Abre DevTools (F12) durante la instalación
2. **Estado del servicio:** `sc query BloomNucleusHost`
3. **Verificar archivos:** Navega a `%LOCALAPPDATA%\BloomNucleus`
4. **Reinstalación limpia:**
   ```powershell
   sc stop BloomNucleusHost
   sc delete BloomNucleusHost
   rmdir /s "%LOCALAPPDATA%\BloomNucleus"
   ```

## 📄 Licencia

MIT License - BTIP Studio