# NUCLEUS + BRAIN SERVICE - Electron Integration Prompt

## 🎯 Contexto Crítico

La instalación de Nucleus y Brain Service **se ejecuta desde Electron**, que ya tiene permisos elevados. Los scripts `.bat` se ejecutan desde el código fuente (repository), NO desde AppData.

## ✅ Verdades Arquitectónicas

### Deployment en AppData
```
%LOCALAPPDATA%\BloomNucleus\
├── bin/
│   ├── nssm/
│   │   └── nssm.exe
│   ├── temporal/
│   │   └── temporal.exe
│   ├── nucleus/
│   │   └── nucleus.exe
│   └── brain/
│       └── brain.exe
└── logs/
    └── (estructura de logs)
```

### Scripts .bat en Origen
```
installer/nucleus/scripts/
├── install-nucleus-service.bat    ← Ejecutado desde AQUÍ (repo)
├── install-brain-service.bat      ← Ejecutado desde AQUÍ (repo)
├── reinstall-nucleus-service.bat  ← Ejecutado desde AQUÍ (repo)
├── reinstall-brain-service.bat    ← Ejecutado desde AQUÍ (repo)
├── uninstall-nucleus-service.bat  ← Copiado a AppData + ejecutado desde origen
└── uninstall-brain-service.bat    ← Copiado a AppData + ejecutado desde origen
```

**IMPORTANTE:** 
- Scripts de install/reinstall se ejecutan desde el repo
- Script de uninstall se COPIA a AppData (para desinstalación post-deployment)
- Electron ya tiene permisos elevados, no necesita `runas`

## 📋 Archivos a Modificar

### 1. installer.js

**Ubicación:** `install/installer.js`

**Cambios Requeridos:**

#### A. Milestone: `installBrainService`

**ANTES:**
```javascript
async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';
  
  await cleanupOldServices();
  await installWindowsService();
  await startService();
  
  await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
  return { success: true };
}
```

**DESPUÉS:**
```javascript
async function installBrainService(win) {
  const MILESTONE = 'brain_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 6, 10, 'Installing Brain Service...');

  try {
    logger.separator('INSTALLING BRAIN SERVICE');

    // Ejecutar install-brain-service.bat desde el repo
    const scriptPath = path.join(__dirname, '..', 'installer', 'nucleus', 'scripts', 'install-brain-service.bat');
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    // Ejecutar con spawn (Electron ya tiene permisos elevados)
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Brain Service installation failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute script: ${err.message}`));
      });
    });

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}
```

#### B. NUEVO Milestone: `installNucleusService`

**Agregar DESPUÉS de `seedMasterProfile` y ANTES de `runCertification`:**

```javascript
async function installNucleusService(win) {
  const MILESTONE = 'nucleus_service_install';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);
  emitProgress(win, 9.5, 10, 'Installing Nucleus Service...');

  try {
    logger.separator('INSTALLING NUCLEUS SERVICE');

    // Ejecutar install-nucleus-service.bat desde el repo
    const scriptPath = path.join(__dirname, '..', 'installer', 'nucleus', 'scripts', 'install-nucleus-service.bat');
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Script not found: ${scriptPath}`);
    }

    // Ejecutar con spawn (Electron ya tiene permisos elevados)
    const result = await new Promise((resolve, reject) => {
      const proc = spawn(scriptPath, [], {
        stdio: 'inherit',
        windowsVerbatimArguments: true
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Nucleus Service installation failed with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute script: ${err.message}`));
      });
    });

    await nucleusManager.completeMilestone(MILESTONE, { service_running: true });
    return result;

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}
```

#### C. Actualizar Main Orchestrator

**ANTES:**
```javascript
async function installService(win) {
  try {
    // ...
    await seedMasterProfile(win);
    await runCertification(win);
    // ...
  }
}
```

**DESPUÉS:**
```javascript
async function installService(win) {
  try {
    logger.separator('BLOOM NUCLEUS INSTALLATION');

    await nucleusManager.initialize();

    const summary = nucleusManager.getInstallationSummary();
    logger.info('Installation state:', summary);

    if (summary.next_milestone) {
      logger.info(`Resuming from: ${summary.next_milestone}`);
    }

    await createDirectories(win);
    await runChromiumInstall(win);
    await runRuntimeInstall(win);
    await runBinariesDeploy(win);
    await runConductorDeploy(win);
    await installBrainService(win);       // ← Brain Service primero
    await initOrchestration(win);
    await initOllama(win);
    await seedMasterProfile(win);
    await installNucleusService(win);     // ← Nucleus Service DESPUÉS de seed
    await runCertification(win);

    await nucleusManager.markInstallationComplete();

    logger.success('🎉 INSTALLATION COMPLETE');

    if (win && win.webContents) {
      win.webContents.send('installation-complete', {
        success: true,
        profile_id: nucleusManager.state.master_profile
      });
    }

    return {
      success: true,
      profile_id: nucleusManager.state.master_profile
    };

  } catch (error) {
    logger.error('Installation failed:', error.message);

    if (win && win.webContents) {
      win.webContents.send('installation-error', {
        error: error.message,
        stack: error.stack
      });
    }

    throw error;
  }
}
```

### 2. service-installer.js (Brain Service)

**Ubicación:** `install/service-installer.js`

**Cambios según BRAIN_LOGGING_CORRECTIONS.md:**

#### A. Agregar dependencia file locking

```bash
npm install proper-lockfile
```

#### B. Actualizar imports

```javascript
const lockfile = require('proper-lockfile');
```

#### C. Actualizar `updateTelemetry()`

```javascript
async function updateTelemetry(logPath) {
  const telemetryPath = path.join(paths.logsDir, 'telemetry.json');
  
  // Asegurar que telemetry.json existe
  if (!fs.existsSync(telemetryPath)) {
    await fs.writeJson(telemetryPath, { active_streams: {} }, { spaces: 2 });
  }
  
  // Acquire lock with retry
  let release;
  try {
    release = await lockfile.lock(telemetryPath, {
      retries: {
        retries: 5,
        minTimeout: 50,
        maxTimeout: 200
      }
    });
  } catch (err) {
    console.error('⚠️ Could not acquire lock on telemetry.json:', err.message);
    return;
  }
  
  try {
    let telemetry = await fs.readJson(telemetryPath);
    
    telemetry.active_streams.brain_service = {
      label: "🧠 BRAIN SERVICE",
      path: logPath.replace(/\\/g, '/'),
      priority: 1,  // ← Cambiado de 3 a 1
      last_update: new Date().toISOString()
    };
    
    await fs.writeJson(telemetryPath, telemetry, { spaces: 2 });
    console.log('📊 Telemetry updated');
    
  } finally {
    if (release) {
      await release();
    }
  }
}
```

#### D. Actualizar `installWindowsService()`

```javascript
async function installWindowsService() {
  console.log('\n📦 INSTALANDO SERVICIO: BloomBrainService\n');
  
  const nssmPath = path.join(paths.binDir, 'nssm', 'nssm.exe');  // ← Nueva ubicación
  const binaryPath = paths.brainExe;
  const workDir = path.dirname(binaryPath);
  
  // 1. Validaciones
  if (!fs.existsSync(nssmPath)) throw new Error(`NSSM not found at ${nssmPath}`);
  if (!fs.existsSync(binaryPath)) throw new Error(`Brain binary not found at ${binaryPath}`);

  // 2. Limpieza preventiva
  if (serviceExists(NEW_SERVICE_NAME)) {
    console.log('🔄 Updating existing service...');
    await removeService(NEW_SERVICE_NAME);
  }

  // 3. Crear Logs con timestamp diario
  const logDir = path.join(paths.logsDir, 'brain', 'service');
  await fs.ensureDir(logDir);
  
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const serviceLog = path.join(logDir, `brain_service_${dateStr}.log`);  // ← Con timestamp

  // 4. Rotar log si existe y es muy grande
  await rotateLogIfNeeded(serviceLog);

  console.log(`🔧 Configuring NSSM...`);
  console.log(`   Bin: ${binaryPath}`);
  console.log(`   Dir: ${workDir}`);
  console.log(`   Log: ${serviceLog}`);

  // [Resto de comandos NSSM sin cambios...]
  
  await runCommand(`"${nssmPath}" install "${NEW_SERVICE_NAME}" "${binaryPath}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppParameters "service start"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppDirectory "${workDir}"`);
  
  const envExtra = [
    `PYTHONUNBUFFERED=1`,
    `PYTHONIOENCODING=utf-8`,
    `LOCALAPPDATA=${paths.baseDir.replace('\\BloomNucleus', '')}`
  ].join(' ');
  
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppEnvironmentExtra "${envExtra}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStdout "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppStderr "${serviceLog}"`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" Start SERVICE_AUTO_START`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" AppExit Default Restart`);
  await runCommand(`"${nssmPath}" set "${NEW_SERVICE_NAME}" DisplayName "Bloom Brain Service"`);

  // G. Actualizar telemetry
  await updateTelemetry(serviceLog);

  console.log('✅ Service registered.');
}
```

### 3. Copiar uninstall scripts a AppData

**En `runBinariesDeploy()` o nuevo milestone:**

```javascript
async function copyUninstallScripts(win) {
  const MILESTONE = 'copy_uninstall_scripts';
  
  if (nucleusManager.isMilestoneCompleted(MILESTONE)) {
    logger.info(`⭐️ ${MILESTONE} completed, skipping`);
    return { success: true, skipped: true };
  }

  await nucleusManager.startMilestone(MILESTONE);

  try {
    logger.info('Copying uninstall scripts to AppData...');

    const sourceDir = path.join(__dirname, '..', 'installer', 'nucleus', 'scripts');
    const destDir = path.join(paths.nucleusDir, 'scripts');

    await fs.ensureDir(destDir);

    // Solo copiar scripts de uninstall
    const scriptsToCopy = [
      'uninstall-brain-service.bat',
      'uninstall-nucleus-service.bat'
    ];

    for (const script of scriptsToCopy) {
      const source = path.join(sourceDir, script);
      const dest = path.join(destDir, script);
      
      if (fs.existsSync(source)) {
        await fs.copy(source, dest);
        logger.success(`✓ Copied: ${script}`);
      } else {
        logger.warn(`⚠️ Script not found: ${script}`);
      }
    }

    await nucleusManager.completeMilestone(MILESTONE, { scripts_copied: scriptsToCopy.length });
    return { success: true };

  } catch (error) {
    await nucleusManager.failMilestone(MILESTONE, error.message);
    throw error;
  }
}
```

### 4. Actualizar scripts .bat

#### install-nucleus-service.bat

**Cambiar rutas para apuntar a AppData:**

```batch
REM Configuración de rutas
set SCRIPT_DIR=%~dp0
set NSSM=%LOCALAPPDATA%\BloomNucleus\bin\nssm\nssm.exe
set NUCLEUS_EXE=%LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe
set TEMPORAL_EXE=%LOCALAPPDATA%\BloomNucleus\bin\temporal\temporal.exe
set SERVICE_NAME=BloomNucleusService
set LOG_BASE=%LOCALAPPDATA%\BloomNucleus\logs\nucleus\service
```

**IMPORTANTE:** El script sigue estando en el repo, pero apunta a binarios en AppData.

#### install-brain-service.bat

```batch
REM Configuración de rutas
set SCRIPT_DIR=%~dp0
set NSSM=%LOCALAPPDATA%\BloomNucleus\bin\nssm\nssm.exe
set BRAIN_EXE=%LOCALAPPDATA%\BloomNucleus\bin\brain\brain.exe
set SERVICE_NAME=BloomBrainService
set LOG_BASE=%LOCALAPPDATA%\BloomNucleus\logs\brain\service
```

#### uninstall scripts

Estos SÍ se copian a AppData y se ejecutan desde allí:

```batch
REM En uninstall-nucleus-service.bat
set NSSM=%LOCALAPPDATA%\BloomNucleus\bin\nssm\nssm.exe
set SERVICE_NAME=BloomNucleusService
```

## 🔄 Secuencia de Instalación Completa

```
1. createDirectories()
2. runChromiumInstall()
3. runRuntimeInstall()
4. runBinariesDeploy()
   └── Copia nucleus.exe, temporal.exe, brain.exe, nssm.exe a AppData
5. deployConductor()
6. copyUninstallScripts()
   └── Copia uninstall-*.bat a AppData
7. installBrainService()
   └── Ejecuta install-brain-service.bat desde REPO
   └── Script usa binarios de AppData
8. initOrchestration()
9. initOllama()
10. seedMasterProfile()
11. installNucleusService()
    └── Ejecuta install-nucleus-service.bat desde REPO
    └── Script usa binarios de AppData
12. runCertification()
```

## ✅ Estructura Final

### En Repo (origen)
```
installer/nucleus/scripts/
├── install-nucleus-service.bat    ← Ejecutado desde aquí
├── install-brain-service.bat      ← Ejecutado desde aquí
├── reinstall-nucleus-service.bat  ← Ejecutado desde aquí
├── reinstall-brain-service.bat    ← Ejecutado desde aquí
├── uninstall-nucleus-service.bat  ← También en AppData
└── uninstall-brain-service.bat    ← También en AppData
```

### En AppData
```
%LOCALAPPDATA%\BloomNucleus\
├── bin/
│   ├── nssm/
│   │   └── nssm.exe
│   ├── temporal/
│   │   └── temporal.exe
│   ├── nucleus/
│   │   ├── nucleus.exe
│   │   └── scripts/
│   │       ├── uninstall-nucleus-service.bat  ← SOLO uninstall
│   │       └── uninstall-brain-service.bat    ← SOLO uninstall
│   └── brain/
│       └── brain.exe
└── logs/
    ├── telemetry.json
    ├── nucleus/
    ├── temporal/
    └── brain/
```

## 🚨 Errores a Evitar

1. ❌ NO copiar install/reinstall scripts a AppData (se ejecutan desde repo)
2. ❌ NO usar `%ProgramData%` (usar `%LOCALAPPDATA%`)
3. ❌ NO intentar elevar permisos (Electron ya los tiene)
4. ❌ NO usar rutas relativas en .bat (usar variables de entorno)
5. ❌ NO olvidar file locking en telemetry.json

## 📋 Checklist de Implementación

- [ ] Instalar `proper-lockfile` en proyecto Node.js
- [ ] Actualizar `service-installer.js` con file locking
- [ ] Cambiar priority de Brain Service de 3 a 1
- [ ] Actualizar naming de logs: `brain_service_YYYYMMDD.log`
- [ ] Modificar `installer.js` con nuevos milestones
- [ ] Crear función `installNucleusService()`
- [ ] Crear función `copyUninstallScripts()`
- [ ] Actualizar rutas en todos los .bat a `%LOCALAPPDATA%`
- [ ] Verificar que scripts usan binarios de AppData
- [ ] Testing completo del flujo de instalación

## 🎯 Objetivo Final

Cuando el usuario instala Bloom:

1. Electron (con permisos elevados) ejecuta `installer.js`
2. `installer.js` copia binarios a AppData
3. `installer.js` ejecuta `install-brain-service.bat` desde repo
4. Script instala Brain Service usando binarios de AppData
5. `installer.js` ejecuta `install-nucleus-service.bat` desde repo
6. Script instala Nucleus Service usando binarios de AppData
7. Ambos servicios quedan instalados y corriendo
8. Scripts de uninstall disponibles en AppData para el usuario

---

**IMPORTANTE:** Este prompt debe usarse para implementar la integración correcta con Electron. Los archivos Go (supervisor.go, service.go, dev_start.go) ya están listos y no necesitan cambios adicionales.
