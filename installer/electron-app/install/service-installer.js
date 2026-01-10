const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');
const { SERVICE_NAME } = require('../config/constants');

const execFileAsync = promisify(execFile);

const LEGACY_SERVICES = ['BloomNucleusHost', 'BloomNativeHost', 'BloomHost', 'BloomBrainService'];

async function runNSSM(args) {
  const nssmPath = paths.nssmExe;
  
  if (!fs.existsSync(nssmPath)) {
    throw new Error(`NSSM not found: ${nssmPath}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync(nssmPath, args, {
      timeout: 30000,
      windowsHide: true
    });
    return { stdout, stderr, success: true };
  } catch (error) {
    return { stdout: error.stdout || '', stderr: error.stderr || '', success: false, code: error.code };
  }
}

async function cleanupOldServices() {
  console.log('🧹 Cleaning up old services...');
  
  const allServices = [...LEGACY_SERVICES, SERVICE_NAME];
  
  for (const serviceName of allServices) {
    try {
      console.log(`  🗑️  Removing service: ${serviceName}`);
      
      await runNSSM(['stop', serviceName]);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await runNSSM(['remove', serviceName, 'confirm']);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`    ✅ Removed: ${serviceName}`);
    } catch (error) {
      console.log(`    ℹ️  ${serviceName} skipped`);
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log('✅ Old services cleanup complete');
}

async function killAllBloomProcesses() {
  console.log('🔫 Killing all Bloom-related processes...');
  
  const procs = ['brain.exe', 'python.exe', 'pythonw.exe', 'bloom-host.exe', 'nssm.exe'];

  for (const proc of procs) {
    try {
      await execFileAsync('taskkill', ['/F', '/IM', proc, '/T'], {
        timeout: 5000,
        windowsHide: true
      });
    } catch {}
  }

  console.log('🧹 Cleaning lockfiles...');
  const lockfiles = [
    path.join(paths.bloomBase, '.brain', 'service.pid'),
    path.join(paths.bloomBase, '.brain', 'service.lock'),
    path.join(paths.logsDir, 'brain.log.lock')
  ];
  
  for (const lockfile of lockfiles) {
    try {
      if (await fs.pathExists(lockfile)) {
        await fs.remove(lockfile);
        console.log(`  🗑️  Removed lockfile: ${path.basename(lockfile)}`);
      }
    } catch (e) {
      console.warn(`  ⚠️  Could not remove ${lockfile}: ${e.message}`);
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('✅ Process cleanup complete');
}

async function installWindowsService() {
  console.log('🔧 Installing Windows Service with NSSM...');

  const brainExe = paths.brainExe;

  if (!fs.existsSync(brainExe)) {
    throw new Error(`Brain.exe not found: ${brainExe}`);
  }

  console.log('  📦 Installing service...');
  const installResult = await runNSSM(['install', SERVICE_NAME, brainExe, 'runtime', 'run']);
  
  if (!installResult.success && installResult.code === 5) {
    console.log('  ⚠️  Service exists, force removing...');
    await killAllBloomProcesses();
    await runNSSM(['remove', SERVICE_NAME, 'confirm']);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await runNSSM(['install', SERVICE_NAME, brainExe, 'runtime', 'run']);
  }
  
  await runNSSM(['set', SERVICE_NAME, 'DisplayName', 'Bloom Brain Service']);
  await runNSSM(['set', SERVICE_NAME, 'Description', 'AI Agent Runtime for Bloom Nucleus']);
  await runNSSM(['set', SERVICE_NAME, 'Start', 'SERVICE_AUTO_START']);
  await runNSSM(['set', SERVICE_NAME, 'AppDirectory', path.dirname(brainExe)]);

  const userLocalAppData = process.env.LOCALAPPDATA;
  console.log(`  🔑 Injecting LOCALAPPDATA: ${userLocalAppData}`);
  
  await runNSSM(['set', SERVICE_NAME, 'AppEnvironmentExtra', `LOCALAPPDATA=${userLocalAppData}`]);

  const logDir = path.join(paths.installDir, 'logs');
  await fs.ensureDir(logDir);
  await runNSSM(['set', SERVICE_NAME, 'AppStdout', path.join(logDir, 'service-stdout.log')]);
  await runNSSM(['set', SERVICE_NAME, 'AppStderr', path.join(logDir, 'service-stderr.log')]);
  await runNSSM(['set', SERVICE_NAME, 'AppRotateFiles', '1']);
  await runNSSM(['set', SERVICE_NAME, 'AppRotateBytes', '10485760']);

  await runNSSM(['set', SERVICE_NAME, 'AppExit', 'Default', 'Restart']);
  await runNSSM(['set', SERVICE_NAME, 'AppRestartDelay', '5000']);

  console.log('✅ Service installation complete');
}

async function startService() {
  console.log('🚀 Starting service...');

  const result = await runNSSM(['start', SERVICE_NAME]);
  
  if (result.success || result.stdout.includes('started')) {
    console.log('✅ Service started successfully');
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  } else {
    throw new Error('Service failed to start');
  }
}

async function stopService() {
  console.log('🛑 Stopping service...');
  await runNSSM(['stop', SERVICE_NAME]);
  await new Promise(resolve => setTimeout(resolve, 2000));
  return true;
}

async function getServiceStatus() {
  try {
    const result = await runNSSM(['status', SERVICE_NAME]);
    const status = result.stdout.trim().toUpperCase();
    
    const statusMap = {
      'SERVICE_RUNNING': 'RUNNING',
      'SERVICE_STOPPED': 'STOPPED',
      'SERVICE_START_PENDING': 'STARTING'
    };
    
    return statusMap[status] || status || 'UNKNOWN';
  } catch {
    return 'NOT_INSTALLED';
  }
}

module.exports = {
  installWindowsService,
  startService,
  stopService,
  getServiceStatus,
  cleanupOldServices,
  killAllBloomProcesses
};