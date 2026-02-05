// diagnose-service.js
// Script standalone para diagnosticar problemas del servicio
// 
// USO: node diagnose-service.js

const path = require('path');
const fs = require('fs');
const { execFileSync, spawnSync } = require('child_process');
const os = require('os');

// ============================================================================
// PATHS
// ============================================================================

function getBloomBasePath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return path.join(homeDir, 'AppData', 'Local', 'BloomNucleus');
  } else if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus');
  } else {
    return path.join(homeDir, '.local', 'share', 'BloomNucleus');
  }
}

const BLOOM_BASE = getBloomBasePath();
const BRAIN_EXE = path.join(BLOOM_BASE, 'bin', 'brain', 'brain.exe');
const LOGS_DIR = path.join(BLOOM_BASE, 'logs');
const SERVICE_NAME = 'BloomBrainService';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              🔬 BLOOM SERVICE DIAGNOSTICS                     ║
╚═══════════════════════════════════════════════════════════════╝

📂 Bloom Base: ${BLOOM_BASE}
🧠 Brain.exe:  ${BRAIN_EXE}
📋 Logs Dir:   ${LOGS_DIR}
⚙️  Service:    ${SERVICE_NAME}

`);

// ============================================================================
// CHECK 1: File Existence
// ============================================================================

console.log('═'.repeat(65));
console.log('CHECK 1: File Existence');
console.log('═'.repeat(65));

const checks = {
  bloomBase: fs.existsSync(BLOOM_BASE),
  brainExe: fs.existsSync(BRAIN_EXE),
  logsDir: fs.existsSync(LOGS_DIR)
};

console.log(`Bloom Base exists:  ${checks.bloomBase ? '✅' : '❌'}`);
console.log(`Brain.exe exists:   ${checks.brainExe ? '✅' : '❌'}`);
console.log(`Logs dir exists:    ${checks.logsDir ? '✅' : '❌'}`);

if (!checks.brainExe) {
  console.error('\n❌ FATAL: brain.exe not found. Installation incomplete.\n');
  process.exit(1);
}

// ============================================================================
// CHECK 2: Brain.exe Direct Execution
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('CHECK 2: Brain.exe Direct Execution (--version)');
console.log('═'.repeat(65));

try {
  const result = spawnSync(BRAIN_EXE, ['--version'], {
    cwd: path.dirname(BRAIN_EXE),
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    timeout: 10000,
    encoding: 'utf8'
  });
  
  if (result.error) {
    console.error(`❌ Spawn Error: ${result.error.message}`);
  } else {
    console.log(`Exit Code: ${result.status}`);
    console.log(`Stdout: ${result.stdout || '(empty)'}`);
    console.log(`Stderr: ${result.stderr || '(empty)'}`);
    
    if (result.status === 0) {
      console.log('✅ Brain.exe executed successfully');
    } else {
      console.error('❌ Brain.exe failed with non-zero exit code');
    }
  }
} catch (e) {
  console.error(`❌ Exception: ${e.message}`);
}

// ============================================================================
// CHECK 3: Service Command Test (runtime run)
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('CHECK 3: Service Command Test (runtime run)');
console.log('═'.repeat(65));
console.log('⏱️  Will run for 3 seconds then kill (this is expected behavior)\n');

try {
  const result = spawnSync(BRAIN_EXE, ['runtime', 'run'], {
    cwd: path.dirname(BRAIN_EXE),
    env: {
      ...process.env,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    },
    timeout: 3000, // 3 segundos
    encoding: 'utf8'
  });
  
  if (result.error && result.error.code !== 'ETIMEDOUT') {
    console.error(`❌ Spawn Error: ${result.error.message}`);
  } else {
    if (result.error && result.error.code === 'ETIMEDOUT') {
      console.log('⏱️  Process timed out (EXPECTED - service should run indefinitely)');
    } else {
      console.log(`Exit Code: ${result.status}`);
    }
    
    console.log(`Stdout: ${result.stdout || '(empty)'}`);
    console.log(`Stderr: ${result.stderr || '(empty)'}`);
    
    const hasOutput = (result.stdout && result.stdout.length > 0) || 
                      (result.stderr && result.stderr.length > 0);
    
    if (hasOutput) {
      console.log('✅ Service command produced output (good sign)');
    } else {
      console.error('⚠️  No output from service command (may indicate issue)');
    }
  }
} catch (e) {
  console.error(`❌ Exception: ${e.message}`);
}

// ============================================================================
// CHECK 4: Service Logs
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('CHECK 4: Service Logs');
console.log('═'.repeat(65));

const stdoutLog = path.join(LOGS_DIR, 'service-stdout.log');
const stderrLog = path.join(LOGS_DIR, 'service-stderr.log');

console.log('\n📄 service-stdout.log:');
if (fs.existsSync(stdoutLog)) {
  try {
    const content = fs.readFileSync(stdoutLog, 'utf8');
    if (content.trim().length > 0) {
      console.log(content.slice(-1000)); // Últimos 1000 chars
    } else {
      console.log('(empty)');
    }
  } catch (e) {
    console.error(`Error reading: ${e.message}`);
  }
} else {
  console.log('❌ File not found');
}

console.log('\n📄 service-stderr.log:');
if (fs.existsSync(stderrLog)) {
  try {
    const content = fs.readFileSync(stderrLog, 'utf8');
    if (content.trim().length > 0) {
      console.log(content.slice(-1000));
    } else {
      console.log('(empty)');
    }
  } catch (e) {
    console.error(`Error reading: ${e.message}`);
  }
} else {
  console.log('❌ File not found');
}

// ============================================================================
// CHECK 5: NSSM Service Configuration
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('CHECK 5: NSSM Service Configuration');
console.log('═'.repeat(65));

// Buscar NSSM
const possibleNssmPaths = [
  path.join(BLOOM_BASE, 'bin', 'nssm.exe'),
  path.join(__dirname, '..', 'native', 'bin', 'win32', 'nssm.exe'),
  'C:\\Program Files\\NSSM\\nssm.exe'
];

let nssmPath = null;
for (const p of possibleNssmPaths) {
  if (fs.existsSync(p)) {
    nssmPath = p;
    break;
  }
}

if (!nssmPath) {
  console.error('❌ NSSM not found in expected locations');
  console.log('Searched:');
  possibleNssmPaths.forEach(p => console.log(`  - ${p}`));
} else {
  console.log(`✅ NSSM found: ${nssmPath}\n`);
  
  const params = [
    'Application',
    'AppParameters',
    'AppDirectory',
    'AppEnvironmentExtra',
    'AppStdout',
    'AppStderr',
    'Start'
  ];
  
  for (const param of params) {
    try {
      const result = spawnSync(nssmPath, ['get', SERVICE_NAME, param], {
        encoding: 'utf8',
        timeout: 5000
      });
      
      if (result.status === 0) {
        console.log(`${param}: ${result.stdout.trim()}`);
      } else {
        console.error(`${param}: ERROR (${result.stderr.trim()})`);
      }
    } catch (e) {
      console.error(`${param}: Exception - ${e.message}`);
    }
  }
  
  // Status del servicio
  console.log('\n⚙️  Service Status:');
  try {
    const statusResult = spawnSync(nssmPath, ['status', SERVICE_NAME], {
      encoding: 'utf8',
      timeout: 5000
    });
    
    const status = statusResult.stdout.trim().toUpperCase();
    console.log(`Status: ${status}`);
    
    if (status === 'SERVICE_STOPPED') {
      console.log('\n🔄 Attempting to start service...');
      
      const startResult = spawnSync(nssmPath, ['start', SERVICE_NAME], {
        encoding: 'utf8',
        timeout: 10000
      });
      
      console.log(`Start result: ${startResult.status === 0 ? '✅ Success' : '❌ Failed'}`);
      console.log(`Stdout: ${startResult.stdout}`);
      console.log(`Stderr: ${startResult.stderr}`);
      
      // Esperar y verificar
      console.log('⏱️  Waiting 3 seconds...');
      setTimeout(() => {}, 3000);
      
      const finalStatus = spawnSync(nssmPath, ['status', SERVICE_NAME], {
        encoding: 'utf8',
        timeout: 5000
      });
      
      console.log(`Final status: ${finalStatus.stdout.trim()}`);
    }
  } catch (e) {
    console.error(`Status check failed: ${e.message}`);
  }
}

// ============================================================================
// CHECK 6: Dependencies
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('CHECK 6: Dependencies');
console.log('═'.repeat(65));

const brainDir = path.dirname(BRAIN_EXE);
const pythonDlls = ['python311.dll', 'python310.dll', 'python39.dll', 'python38.dll'];

console.log('\nPython DLLs in brain directory:');
let foundDll = false;
for (const dll of pythonDlls) {
  const dllPath = path.join(brainDir, dll);
  if (fs.existsSync(dllPath)) {
    console.log(`✅ ${dll}`);
    foundDll = true;
  }
}

if (!foundDll) {
  console.error('❌ No Python DLL found (this may cause startup issues)');
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '═'.repeat(65));
console.log('📊 DIAGNOSTIC SUMMARY');
console.log('═'.repeat(65));

console.log(`
✅ = Pass  |  ⚠️  = Warning  |  ❌ = Fail

1. File Existence:      ${checks.brainExe ? '✅' : '❌'}
2. Direct Execution:    (see above)
3. Service Command:     (see above)
4. Service Logs:        (see above)
5. NSSM Config:         (see above)
6. Dependencies:        ${foundDll ? '✅' : '❌'}

📋 Next Steps:
   - Check service logs above for specific errors
   - If brain.exe crashes immediately, there may be a Python runtime issue
   - If NSSM cannot start the service, check Windows Event Viewer
   - Ensure LOCALAPPDATA environment variable is set correctly

💡 Common Issues:
   - Missing Python DLL → Reinstall runtime
   - Access denied → Run as Administrator
   - Service crashes → Check dependencies (VC++ Redistributable)
   - No output in logs → Brain.exe may not be producing any output

`);

console.log('🔬 Diagnostics complete\n');