const fs = require('fs-extra');
const path = require('path');
const { execPromise } = require('../utils/exec-helper');
const { paths } = require('../config/paths');

/**
 * Instala el runtime de Python y el paquete Brain
 */
async function installCore() {
  console.log("📦 Installing AI Engine (Runtime + Brain)...");

  if (!fs.existsSync(paths.runtimeSource)) {
    throw new Error("Runtime Source not found. Run 'npm run prepare:runtime'");
  }

  // Instalar Python runtime
  console.log(" 📦 Installing Python runtime...");
  await fs.copy(paths.runtimeSource, paths.runtimeDir, {
    overwrite: true,
    filter: (src) => !src.includes('brain')
  });
  console.log(" ✅ Python runtime installed");

  // Instalar Brain package
  if (!fs.existsSync(paths.brainSource)) {
    throw new Error(`Brain Source not found: ${paths.brainSource}`);
  }

  console.log(" 📦 Installing Brain package...");
  const brainDest = paths.brainDir;
  await fs.ensureDir(path.dirname(brainDest));
  await fs.copy(paths.brainSource, brainDest, { overwrite: true });
  console.log(` ✅ Brain installed to: ${brainDest}`);

  // ⭐ CRÍTICO: Instalar dependencias de Brain
  await installBrainDependencies();

  // Verificar instalación
  const brainMain = path.join(brainDest, '__main__.py');
  if (!fs.existsSync(brainMain)) {
    throw new Error(`Brain __main__.py not found after installation: ${brainMain}`);
  }
  console.log(" ✅ Brain verified");

  // Configurar Python en modo ISOLATED
  await configurePythonPath();

  // Verificar dependencias críticas
  await verifyBrainDependencies();

  console.log(" ✅ AI Engine installation complete");
}

/**
 * Instala las dependencias de Brain en el runtime
 */
async function installBrainDependencies() {
  console.log(" 📦 Installing Brain dependencies...");
  
  const brainLibsSource = path.join(paths.brainSource, 'libs');
  const sitePackagesDest = path.join(paths.runtimeDir, 'Lib', 'site-packages');
  
  // Verificar que brain/libs exista
  if (!fs.existsSync(brainLibsSource)) {
    console.error(` ❌ Brain dependencies not found at: ${brainLibsSource}`);
    console.error(` 💡 You need to run: npm run prepare:brain`);
    throw new Error(
      'Brain dependencies not found. ' +
      'Run "npm run prepare:brain" first to install dependencies.'
    );
  }
  
  // Copiar todas las dependencias de brain/libs a runtime/Lib/site-packages
  console.log(` 📂 Source: ${brainLibsSource}`);
  console.log(` 📂 Destination: ${sitePackagesDest}`);
  
  await fs.ensureDir(sitePackagesDest);
  
  // Copiar todas las carpetas de libs a site-packages
  const libs = await fs.readdir(brainLibsSource);
  let copiedCount = 0;
  
  for (const lib of libs) {
    const libPath = path.join(brainLibsSource, lib);
    const destPath = path.join(sitePackagesDest, lib);
    
    // Copiar tanto carpetas como archivos
    await fs.copy(libPath, destPath, { 
      overwrite: true,
      filter: (src) => {
        // Excluir archivos innecesarios
        return !src.includes('__pycache__') && 
               !src.endsWith('.pyc') &&
               !src.includes('.dist-info/RECORD'); // Evitar conflictos
      }
    });
    
    copiedCount++;
  }
  
  console.log(` ✅ Installed ${copiedCount} dependencies to site-packages`);
  
  // Listar lo que se instaló (para debugging)
  const installedPackages = await fs.readdir(sitePackagesDest);
  console.log(` 📦 Installed packages: ${installedPackages.filter(p => !p.startsWith('_')).join(', ')}`);
}

/**
 * Configura el archivo python310._pth en MODO ISOLATED
 */
async function configurePythonPath() {
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  
  const pthContent = [
    '.',
    'python310.zip',
    'Lib',
    'Lib\\site-packages',
    // NO incluir "import site" - modo isolated
  ].join('\n');

  await fs.writeFile(pthFile, pthContent, 'utf8');
  console.log(" ✅ Python configured in ISOLATED mode");
}

/**
 * Verifica que todas las dependencias de Brain estén disponibles
 */
async function verifyBrainDependencies() {
  console.log(" 🔍 Verifying Brain dependencies...");
  
  const python = paths.pythonExe;
  
  if (!fs.existsSync(python)) {
    throw new Error(`Python executable not found: ${python}`);
  }

  // Verificar dependencias críticas
  const command = `"${python}" -I -c "import typer, click, brain; print('OK')"`;
  
  try {
    const { stdout, stderr } = await execPromise(command, {
      timeout: 10000,
      cwd: paths.runtimeDir,
      env: {
        PYTHONNOUSERSITE: '1',
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
      }
    });
    
    if (stderr && stderr.trim() && !stdout.includes('OK')) {
      console.warn(" ⚠️  Warning:", stderr.trim());
    }
    
    if (!stdout.includes('OK')) {
      throw new Error('Verification failed: unexpected output');
    }
    
    console.log(" ✅ All dependencies verified (typer, click, brain)");
    return true;
    
  } catch (error) {
    console.error("\n❌ DEPENDENCY VERIFICATION FAILED");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Python:", python);
    console.error("Error:", error.message);
    
    if (error.stderr) {
      console.error("\nPython Error:");
      console.error(error.stderr);
    }
    
    // Listar qué hay realmente en site-packages
    const sitePackages = path.join(paths.runtimeDir, 'Lib', 'site-packages');
    try {
      const packages = await fs.readdir(sitePackages);
      console.error("\nInstalled packages in site-packages:");
      console.error(packages.filter(p => !p.startsWith('_')).join(', '));
    } catch (e) {
      console.error("Could not list site-packages:", e.message);
    }
    
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    throw new Error(
      'Brain dependencies verification failed. ' +
      'Make sure you ran "npm run prepare:brain" before installing.'
    );
  }
}

/**
 * Inicializa el perfil maestro de Brain
 */
async function initializeBrainProfile() {
  console.log("🧠 Initializing Master Profile...");

  const python = paths.pythonExe;
  const brainPath = paths.brainDir;

  if (!fs.existsSync(python)) {
    throw new Error(`Python not found: ${python}`);
  }

  if (!fs.existsSync(brainPath)) {
    throw new Error(`Brain not found: ${brainPath}`);
  }

  const brainMain = path.join(brainPath, '__main__.py');
  if (!fs.existsSync(brainMain)) {
    throw new Error(`Brain __main__.py not found: ${brainMain}`);
  }

  console.log(` 📂 Python: ${python}`);
  console.log(` 📂 Brain: ${brainPath}`);
  console.log(` 🔒 Mode: ISOLATED`);

  // Usar nombre sin espacios para evitar problemas de escaping en Windows
  const profileName = "MasterWorker";
  const command = `"${python}" -I -m brain --json profile create ${profileName}`;
  console.log(` 🚀 Executing: ${command}`);
  
  try {
    const { stdout, stderr } = await execPromise(command, {
      timeout: 15000,
      cwd: paths.runtimeDir,
      env: {
        PYTHONHOME: undefined,
        PYTHONPATH: undefined,
        PYTHONNOUSERSITE: '1',
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      }
    });

    if (stderr && stderr.trim()) {
      console.log(" ⚠️  Stderr:", stderr.trim());
    }

    console.log(" → Response:", stdout.trim());

    let result;
    try {
      result = JSON.parse(stdout);
    } catch (parseError) {
      console.error(" ❌ Invalid JSON response");
      console.error("    Output:", stdout);
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }

    let profileId = result.data?.id || result.id;
    
    if (!profileId && Array.isArray(result)) {
      profileId = result[0]?.id;
    }
    
    if (!profileId) {
      console.error(" ❌ No Profile ID in response");
      console.error("    Response:", JSON.stringify(result, null, 2));
      throw new Error("Couldn't get Profile ID");
    }

    console.log(` 👤 Profile Ready: ${profileId}`);

    // Guardar configuración
    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile)
      ? await fs.readJson(paths.configFile)
      : {};
    
    config.masterProfileId = profileId;
    config.brainPath = brainPath;
    config.pythonMode = 'isolated';
    
    await fs.writeJson(paths.configFile, config, { spaces: 2 });
    
    console.log(" ✅ Profile initialized");
    
    return profileId;
    
  } catch (error) {
    console.error("\n❌ PROFILE CREATION FAILED");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("Python:", python);
    console.error("Exists:", fs.existsSync(python));
    console.error("Brain:", brainPath);
    console.error("Exists:", fs.existsSync(brainPath));
    console.error("Error:", error.message);
    
    if (error.stderr) {
      console.error("\nPython Error:");
      console.error(error.stderr);
    }
    
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    
    throw new Error(`Failed to create profile: ${error.message}`);
  }
}

module.exports = {
  installCore,
  configurePythonPath,
  initializeBrainProfile,
  verifyBrainDependencies,
  installBrainDependencies
};