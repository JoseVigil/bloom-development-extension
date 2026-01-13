// service-diagnostics.js
// Herramientas de diagnóstico para el servicio Windows

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../../config/paths');
const { SERVICE_NAME } = require('../../config/constants');

const execFileAsync = promisify(execFile);

/**
 * Ejecuta brain.exe directamente para ver si funciona
 */
async function testBrainDirectExecution() {
  console.log('\n🔍 TESTING BRAIN.EXE DIRECT EXECUTION');
  
  const brainExe = paths.brainExe;
  
  if (!fs.existsSync(brainExe)) {
    return {
      success: false,
      error: `Brain.exe not found at: ${brainExe}`
    };
  }
  
  return new Promise((resolve) => {
    console.log(`   Executing: "${brainExe}" --version`);
    
    const child = spawn(brainExe, ['--version'], {
      cwd: path.dirname(brainExe),
      env: {
        ...process.env,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      },
      windowsHide: false, // Mostrar ventana para debug
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`   [stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`   [stderr] ${data.toString().trim()}`);
    });
    
    child.on('close', (code) => {
      console.log(`   Exit code: ${code}`);
      
      if (code === 0) {
        console.log('   ✅ Brain.exe executed successfully');
        resolve({ success: true, stdout, stderr });
      } else {
        console.error('   ❌ Brain.exe failed to execute');
        resolve({ success: false, code, stdout, stderr });
      }
    });
    
    child.on('error', (err) => {
      console.error(`   ❌ Spawn error: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
    
    // Timeout de 10 segundos
    setTimeout(() => {
      if (!child.killed) {
        child.kill();
        resolve({ success: false, error: 'Execution timeout' });
      }
    }, 10000);
  });
}

/**
 * Prueba el comando exacto que usará el servicio
 */
async function testServiceCommand() {
  console.log('\n🔍 TESTING SERVICE COMMAND');
  
  const brainExe = paths.brainExe;
  
  if (!fs.existsSync(brainExe)) {
    return {
      success: false,
      error: `Brain.exe not found at: ${brainExe}`
    };
  }
  
  return new Promise((resolve) => {
    console.log(`   Executing: "${brainExe}" runtime run`);
    
    const child = spawn(brainExe, ['runtime', 'run'], {
      cwd: path.dirname(brainExe),
      env: {
        ...process.env,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      },
      windowsHide: false,
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    let hasOutput = false;
    
    child.stdout.on('data', (data) => {
      hasOutput = true;
      stdout += data.toString();
      console.log(`   [stdout] ${data.toString().trim()}`);
    });
    
    child.stderr.on('data', (data) => {
      hasOutput = true;
      stderr += data.toString();
      console.error(`   [stderr] ${data.toString().trim()}`);
    });
    
    child.on('close', (code) => {
      console.log(`   Exit code: ${code}`);
      
      resolve({ 
        success: code === 0 || hasOutput, 
        code, 
        stdout, 
        stderr,
        hasOutput 
      });
    });
    
    child.on('error', (err) => {
      console.error(`   ❌ Spawn error: ${err.message}`);
      resolve({ success: false, error: err.message });
    });
    
    // Dejar correr 5 segundos y luego matar (el servicio debería quedarse corriendo)
    setTimeout(() => {
      console.log('   ⏱️  Timeout - killing process (this is expected for a service)');
      if (!child.killed) {
        child.kill();
        resolve({ 
          success: hasOutput, 
          stdout, 
          stderr, 
          timeout: true,
          hasOutput 
        });
      }
    }, 5000);
  });
}

/**
 * Verifica los logs del servicio NSSM
 */
async function checkServiceLogs() {
  console.log('\n📋 CHECKING SERVICE LOGS');
  
  const logDir = path.join(paths.installDir, 'logs');
  const stdoutLog = path.join(logDir, 'service-stdout.log');
  const stderrLog = path.join(logDir, 'service-stderr.log');
  
  const logs = {
    stdout: '',
    stderr: ''
  };
  
  if (fs.existsSync(stdoutLog)) {
    try {
      logs.stdout = await fs.readFile(stdoutLog, 'utf8');
      console.log('\n📄 service-stdout.log:');
      console.log(logs.stdout.slice(-500)); // Últimas 500 chars
    } catch (e) {
      console.error('   ⚠️  Could not read stdout log:', e.message);
    }
  } else {
    console.log('   ℹ️  No stdout log found');
  }
  
  if (fs.existsSync(stderrLog)) {
    try {
      logs.stderr = await fs.readFile(stderrLog, 'utf8');
      console.log('\n📄 service-stderr.log:');
      console.log(logs.stderr.slice(-500));
    } catch (e) {
      console.error('   ⚠️  Could not read stderr log:', e.message);
    }
  } else {
    console.log('   ℹ️  No stderr log found');
  }
  
  return logs;
}

/**
 * Verifica la configuración del servicio en NSSM
 */
async function checkServiceConfig() {
  console.log('\n🔧 CHECKING SERVICE CONFIGURATION');
  
  const nssmPath = paths.nssmExe;
  
  if (!fs.existsSync(nssmPath)) {
    return { error: 'NSSM not found' };
  }
  
  const config = {};
  
  const params = [
    'Application',
    'AppParameters',
    'AppDirectory',
    'AppEnvironmentExtra',
    'AppStdout',
    'AppStderr',
    'Start',
    'DisplayName'
  ];
  
  for (const param of params) {
    try {
      const { stdout } = await execFileAsync(nssmPath, ['get', SERVICE_NAME, param], {
        timeout: 5000,
        windowsHide: true
      });
      config[param] = stdout.trim();
      console.log(`   ${param}: ${stdout.trim()}`);
    } catch (e) {
      config[param] = `Error: ${e.message}`;
      console.error(`   ${param}: ERROR - ${e.message}`);
    }
  }
  
  return config;
}

/**
 * Verifica permisos y dependencias
 */
async function checkDependencies() {
  console.log('\n🔍 CHECKING DEPENDENCIES');
  
  const checks = {
    brainExe: fs.existsSync(paths.brainExe),
    pythonDll: false,
    vcRedist: false,
    permissions: false
  };
  
  console.log(`   Brain.exe exists: ${checks.brainExe}`);
  
  if (checks.brainExe) {
    // Buscar python DLLs en el directorio de brain
    const brainDir = path.dirname(paths.brainExe);
    const pythonDlls = ['python311.dll', 'python310.dll', 'python39.dll'];
    
    for (const dll of pythonDlls) {
      const dllPath = path.join(brainDir, dll);
      if (fs.existsSync(dllPath)) {
        checks.pythonDll = dll;
        console.log(`   ✅ Found ${dll}`);
        break;
      }
    }
    
    if (!checks.pythonDll) {
      console.log('   ⚠️  No Python DLL found in brain directory');
    }
    
    // Verificar permisos de ejecución
    try {
      await fs.access(paths.brainExe, fs.constants.X_OK);
      checks.permissions = true;
      console.log('   ✅ Brain.exe has execute permissions');
    } catch {
      console.log('   ⚠️  Brain.exe may not have execute permissions');
    }
  }
  
  return checks;
}

/**
 * Diagnóstico completo
 */
async function runFullDiagnostics() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         🔬 SERVICE DIAGNOSTICS                         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    checks: {}
  };
  
  // 1. Verificar dependencias
  results.checks.dependencies = await checkDependencies();
  
  // 2. Probar ejecución directa
  results.checks.directExecution = await testBrainDirectExecution();
  
  // 3. Probar comando del servicio
  results.checks.serviceCommand = await testServiceCommand();
  
  // 4. Verificar configuración del servicio
  results.checks.serviceConfig = await checkServiceConfig();
  
  // 5. Revisar logs
  results.checks.serviceLogs = await checkServiceLogs();
  
  // Resumen
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         📊 DIAGNOSTIC SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  console.log('Dependencies:');
  console.log(`   Brain.exe exists: ${results.checks.dependencies.brainExe ? '✅' : '❌'}`);
  console.log(`   Python DLL: ${results.checks.dependencies.pythonDll || '❌'}`);
  console.log(`   Permissions: ${results.checks.dependencies.permissions ? '✅' : '❌'}`);
  
  console.log('\nDirect Execution:');
  console.log(`   Status: ${results.checks.directExecution.success ? '✅ PASS' : '❌ FAIL'}`);
  if (!results.checks.directExecution.success) {
    console.log(`   Error: ${results.checks.directExecution.error}`);
  }
  
  console.log('\nService Command:');
  console.log(`   Status: ${results.checks.serviceCommand.success ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Has Output: ${results.checks.serviceCommand.hasOutput ? '✅' : '❌'}`);
  
  // Guardar reporte completo
  const reportPath = path.join(paths.logsDir, 'service-diagnostics.json');
  await fs.writeJson(reportPath, results, { spaces: 2 });
  console.log(`\n💾 Full diagnostic report saved to: ${reportPath}`);
  
  return results;
}

module.exports = {
  testBrainDirectExecution,
  testServiceCommand,
  checkServiceLogs,
  checkServiceConfig,
  checkDependencies,
  runFullDiagnostics
};