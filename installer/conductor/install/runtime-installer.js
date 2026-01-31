const fs = require('fs-extra');
const path = require('path'); 
const { execPromise } = require('../utils/exec-helper');
const { paths } = require('../config/paths');

async function installRuntime() {
  console.log("📦 Installing AI Engine (Runtime + Brain)...");

  // 1. Instalar Python runtime
  console.log(" 📦 Installing Python runtime...");
  await fs.copy(paths.runtimeSource, paths.runtimeDir, {
    overwrite: true
  });
  console.log(" ✅ Python runtime installed");

  // 2. Copiar brain.exe a bin/brain/
  console.log(" 📦 Installing Brain executable...");
  const brainExeSrc = path.join(paths.brainSource, 'brain.exe');
  const brainExeDest = paths.brainExe;
  
  await fs.ensureDir(path.dirname(brainExeDest));
  await fs.copy(brainExeSrc, brainExeDest, { overwrite: true });
  console.log(` ✅ Brain.exe installed to: ${brainExeDest}`);

  // 3. Copiar _internal a bin/brain/_internal/
  const internalSrc = path.join(paths.brainSource, '_internal');
  const internalDest = path.join(path.dirname(brainExeDest), '_internal');
  
  if (fs.existsSync(internalSrc)) {
    await fs.copy(internalSrc, internalDest, { overwrite: true });
    console.log(` ✅ Brain _internal copied`);
  }

  // 4. Configurar Python path
  await configurePythonPath();

  console.log(" ✅ AI Engine installation complete");
}

async function configurePythonPath() {
  const pthFile = path.join(paths.runtimeDir, 'python310._pth');
  const pthContent = ['.', 'python310.zip', 'Lib', 'Lib\\site-packages'].join('\n');
  await fs.writeFile(pthFile, pthContent, 'utf8');
  console.log(" ✅ Python configured in ISOLATED mode");
}

async function initializeBrainProfile() {
  console.log("🧠 Initializing Master Profile...");
  
  const brainExe = paths.brainExe;
  const profileName = "MasterWorker";
  const command = `"${brainExe}" --json profile create ${profileName}`;
  
  try {
    const { stdout } = await execPromise(command, {
      timeout: 15000,
      env: {
        LOCALAPPDATA: process.env.LOCALAPPDATA
      }
    });

    const result = JSON.parse(stdout);
    const profileId = result.data?.id || result.id || (Array.isArray(result) ? result[0]?.id : null);
    
    if (!profileId) throw new Error("Couldn't get Profile ID");

    await fs.ensureDir(paths.configDir);
    const config = fs.existsSync(paths.configFile) ? await fs.readJson(paths.configFile) : {};
    config.masterProfileId = profileId;
    config.brainExe = brainExe;
    await fs.writeJson(paths.configFile, config, { spaces: 2 });    
    
    return profileId;
  } catch (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }
}

module.exports = {
  installRuntime,
  initializeBrainProfile
};