const fs = require('fs-extra');
const path = require('path'); 
const { execPromise } = require('../utils/exec-helper');
const { paths } = require('../config/paths');

/**
 * 
 * Esta función SOLO configura Python en modo aislado
 */
async function installRuntime() {
  console.log("🐍 Configuring Python Runtime...");

  // NOTA: runtime/ y brain/ ya fueron copiados en deployAllSystemBinaries()
  // Aquí solo configuramos Python
  await configurePythonPath();

  console.log(" ✅ Python Runtime configured");
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