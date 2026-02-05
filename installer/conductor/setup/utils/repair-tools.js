// repair-tools.js - HERRAMIENTAS DE DIAGNÓSTICO Y REPARACIÓN
// Reemplaza fix_bridge_id.py con lógica JS nativa

const path = require('path');
const fs = require('fs-extra');
const { spawnSync } = require('child_process');
const { paths } = require('../config/paths');
const { calculateExtensionIdFromManifest } = require('./extension-installer');

/**
 * REPARAR Y VALIDAR MANIFEST.JSON
 * Verifica que todos los campos requeridos estén presentes y sean válidos
 */
async function sanitizeAndValidateManifest() {
  console.log('\n🧹 [Sanitize] Validando manifest.json...');
  
  const manifestPath = path.join(paths.extensionDir, 'manifest.json');
  
  if (!await fs.pathExists(manifestPath)) {
    throw new Error(`Manifest no encontrado en: ${manifestPath}`);
  }
  
  try {
    // 1. Leer manifest actual
    const manifest = await fs.readJson(manifestPath);
    let changed = false;
    
    // 2. Validar campos REQUERIDOS según Manifest V3
    const requiredFields = {
      manifest_version: 3,
      name: 'Bloom Nucleus Bridge',
      version: '1.0.0',
      description: 'Native messaging bridge for browser automation'
    };
    
    for (const [field, defaultValue] of Object.entries(requiredFields)) {
      if (!manifest[field]) {
        console.log(`  🔧 Agregando campo faltante: ${field}`);
        manifest[field] = defaultValue;
        changed = true;
      }
    }
    
    // 3. Validar y limpiar KEY (crítico para Extension ID)
    const GOLDEN_KEY = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvpLkwKzeLGXF3Me4LckWSMQO6ktiL7gbLC3E8d3jpKfZLTL+lhCOXULTygRUi4vSvWQyy0KrI1eVTUYPrvA6s3pYGhn7GFfmCDXA6JvZjANc+4pq3hcxdVZdMa02E4f1UsIJm17qKBlk5Z6Jv1wD1LtXi2yk+lI/NcAq0XsQSTBDVElDp4/t8QpxRRHGm1WuaoN7DCu7Tmmzq1ztMC434+nmnjqkfMrxG6uC/iC+z+qDLUvolC1eWNPnMFbi2NG+KiZo/ZXEnTpc17OOo3VewOt2/ogTdHp8kpcK1OwXM9d+RUdls9DEUB5QdyWX7uUDsGKISsSawb+j5NiQbgACcQIDAQAB";
    
    if (!manifest.key || manifest.key !== GOLDEN_KEY) {
      console.log('  🔑 Corrigiendo key corrupta o faltante');
      manifest.key = GOLDEN_KEY;
      changed = true;
    }
    
    // 4. Validar PERMISOS requeridos para Native Messaging
    const requiredPermissions = ['nativeMessaging', 'tabs', 'scripting', 'activeTab', 'storage'];
    
    if (!manifest.permissions) {
      manifest.permissions = requiredPermissions;
      changed = true;
    } else {
      for (const perm of requiredPermissions) {
        if (!manifest.permissions.includes(perm)) {
          console.log(`  🔧 Agregando permiso faltante: ${perm}`);
          manifest.permissions.push(perm);
          changed = true;
        }
      }
    }
    
    // 5. Validar host_permissions
    if (!manifest.host_permissions || !manifest.host_permissions.includes('<all_urls>')) {
      console.log('  🔧 Agregando host_permissions: <all_urls>');
      manifest.host_permissions = ['<all_urls>'];
      changed = true;
    }
    
    // 6. Validar background service_worker
    if (!manifest.background || !manifest.background.service_worker) {
      console.log('  🔧 Configurando background service_worker');
      manifest.background = {
        service_worker: 'background.js'
      };
      changed = true;
    }
    
    // 7. Guardar cambios si es necesario
    if (changed) {
      console.log('  💾 Guardando manifest sanitizado...');
      await fs.writeJson(manifestPath, manifest, { 
        spaces: 2,
        encoding: 'utf8'
      });
      console.log('  ✅ Manifest actualizado');
    } else {
      console.log('  ✅ Manifest ya está correcto');
    }
    
    return {
      success: true,
      changed,
      manifest
    };
    
  } catch (error) {
    console.error('❌ [Sanitize] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * REPARAR CONEXIÓN DEL BRIDGE
 * Detecta el Extension ID real y actualiza el bridge.json + Registry
 */
async function repairBridgeConnection() {
  console.log('\n🔧 [Repair] Iniciando reparación de bridge...');
  
  try {
    // 0. Primero sanitizar el manifest
    console.log('  🧹 Sanitizando manifest...');
    const sanitizeResult = await sanitizeAndValidateManifest();
    
    if (!sanitizeResult.success) {
      throw new Error(`Manifest sanitization failed: ${sanitizeResult.error}`);
    }
    
    // 1. Calcular Extension ID desde el manifest
    console.log('  📝 Leyendo manifest.json...');
    const extensionId = await calculateExtensionIdFromManifest(paths.extensionDir);
    console.log(`  🔑 Extension ID detectado: ${extensionId}`);
    
    // 2. Actualizar bridge.json
    console.log('  📄 Actualizando bridge.json...');
    const bridgePath = path.join(paths.nativeDir, 'com.bloom.nucleus.bridge.json');
    
    if (!await fs.pathExists(bridgePath)) {
      throw new Error(`Bridge config no encontrado en: ${bridgePath}`);
    }
    
    const bridgeConfig = await fs.readJson(bridgePath);
    const oldOrigins = bridgeConfig.allowed_origins || [];
    
    bridgeConfig.allowed_origins = [
      `chrome-extension://${extensionId}/`
    ];
    
    await fs.writeJson(bridgePath, bridgeConfig, { spaces: 2 });
    console.log('  ✅ bridge.json actualizado');
    
    // 3. Actualizar Registry HKLM
    console.log('  📋 Actualizando Windows Registry...');
    await updateRegistryKey(bridgePath, extensionId);
    
    // 4. Verificación
    console.log('  🔍 Verificando cambios...');
    const verifyConfig = await fs.readJson(bridgePath);
    const newOrigins = verifyConfig.allowed_origins || [];
    
    if (newOrigins[0] === `chrome-extension://${extensionId}/`) {
      console.log('✅ [Repair] Bridge reparado exitosamente');
      return {
        success: true,
        extensionId,
        oldOrigins,
        newOrigins,
        bridgePath,
        manifestSanitized: sanitizeResult.changed
      };
    } else {
      throw new Error('Verificación falló: Bridge no se actualizó correctamente');
    }
    
  } catch (error) {
    console.error('❌ [Repair] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ACTUALIZAR REGISTRY KEY
 */
async function updateRegistryKey(bridgePath, extensionId) {
  const hostName = 'com.bloom.nucleus.bridge';
  const registryKey = `HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
  const manifestPathWindows = bridgePath.replace(/\//g, '\\');
  
  try {
    // Intentar HKLM primero (requiere admin)
    const result = spawnSync('reg', [
      'add', registryKey,
      '/ve', '/t', 'REG_SZ',
      '/d', manifestPathWindows,
      '/f'
    ], {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    if (result.status === 0) {
      console.log('  ✅ Registry HKLM actualizada');
      return true;
    } else {
      throw new Error('HKLM write failed');
    }
    
  } catch (error) {
    // Fallback a HKCU
    console.log('  ⚠️  HKLM falló, intentando HKCU...');
    const hkcuKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
    
    const fallbackResult = spawnSync('reg', [
      'add', hkcuKey,
      '/ve', '/t', 'REG_SZ',
      '/d', manifestPathWindows,
      '/f'
    ], {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    if (fallbackResult.status === 0) {
      console.log('  ✅ Registry HKCU actualizada (fallback)');
      return true;
    } else {
      throw new Error('No se pudo actualizar Registry (HKLM ni HKCU)');
    }
  }
}

/**
 * VALIDAR INSTALACIÓN
 * Verifica que todos los componentes están correctamente instalados
 */
async function validateInstallation() {
  console.log('\n🔍 [Validation] Verificando instalación...');
  
  const checks = {
    directories: false,
    binaries: false,
    extension: false,
    manifest: false,
    bridge: false,
    registry: false,
    service: false
  };
  
  try {
    // 1. Directorios
    const requiredDirs = [
      paths.bloomBase,
      paths.engineDir,
      paths.extensionDir,
      paths.nativeDir,
      paths.binDir
    ];
    
    checks.directories = (await Promise.all(
      requiredDirs.map(d => fs.pathExists(d))
    )).every(Boolean);
    
    console.log(`  ${checks.directories ? '✅' : '❌'} Directorios`);
    
    // 2. Binarios
    const requiredBinaries = [
      paths.brainExe,
      paths.hostBinary,
      paths.pythonExe
    ];
    
    checks.binaries = (await Promise.all(
      requiredBinaries.map(b => fs.pathExists(b))
    )).every(Boolean);
    
    console.log(`  ${checks.binaries ? '✅' : '❌'} Binarios`);
    
    // 3. Extensión
    const manifestPath = path.join(paths.extensionDir, 'manifest.json');
    checks.extension = await fs.pathExists(manifestPath);
    console.log(`  ${checks.extension ? '✅' : '❌'} Extensión Chrome`);
    
    // 4. Manifest válido
    if (checks.extension) {
      try {
        const manifest = await fs.readJson(manifestPath);
        checks.manifest = manifest.key && manifest.key.length > 100;
      } catch (e) {
        checks.manifest = false;
      }
    }
    console.log(`  ${checks.manifest ? '✅' : '❌'} Manifest válido`);
    
    // 5. Bridge config
    const bridgePath = path.join(paths.nativeDir, 'com.bloom.nucleus.bridge.json');
    checks.bridge = await fs.pathExists(bridgePath);
    console.log(`  ${checks.bridge ? '✅' : '❌'} Bridge config`);
    
    // 6. Registry
    const registryKey = 'HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.bloom.nucleus.bridge';
    const regResult = spawnSync('reg', ['query', registryKey, '/ve'], {
      windowsHide: true,
      encoding: 'utf8'
    });
    checks.registry = regResult.status === 0 && regResult.stdout.includes('com.bloom.nucleus.bridge.json');
    console.log(`  ${checks.registry ? '✅' : '❌'} Registry HKLM`);
    
    // 7. Servicio
    const { SERVICE_NAME } = require('../config/constants');
    const svcResult = spawnSync('sc', ['query', SERVICE_NAME], {
      windowsHide: true,
      encoding: 'utf8'
    });
    checks.service = svcResult.status === 0 && svcResult.stdout.includes('RUNNING');
    console.log(`  ${checks.service ? '✅' : '❌'} Servicio corriendo`);
    
    // Resultado final
    const allPassed = Object.values(checks).every(Boolean);
    
    if (allPassed) {
      console.log('\n✅ [Validation] Instalación válida');
    } else {
      console.log('\n⚠️  [Validation] Instalación incompleta - ejecutar reparación');
    }
    
    return {
      success: allPassed,
      checks,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ [Validation] Error:', error.message);
    return {
      success: false,
      checks,
      error: error.message
    };
  }
}

/**
 * DIAGNÓSTICO COMPLETO
 * Recopila información del sistema para debugging
 */
async function runDiagnostics() {
  console.log('\n🔬 [Diagnostics] Recopilando información del sistema...');
  
  const diagnostics = {
    timestamp: new Date().toISOString(),
    paths: {},
    processes: {},
    network: {},
    files: {}
  };
  
  try {
    // 1. Paths
    diagnostics.paths = {
      bloomBase: paths.bloomBase,
      extensionDir: paths.extensionDir,
      nativeDir: paths.nativeDir,
      brainExe: paths.brainExe
    };
    
    // 2. Procesos
    const tasklist = spawnSync('tasklist', [], {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    diagnostics.processes = {
      brain: tasklist.stdout.includes('brain.exe'),
      host: tasklist.stdout.includes('bloom-host.exe'),
      chrome: tasklist.stdout.includes('chrome.exe')
    };
    
    // 3. Red (puerto 5678)
    const netstat = spawnSync('netstat', ['-ano'], {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    diagnostics.network = {
      port5678InUse: netstat.stdout.includes(':5678')
    };
    
    // 4. Archivos críticos
    diagnostics.files = {
      manifest: await fs.pathExists(path.join(paths.extensionDir, 'manifest.json')),
      bridge: await fs.pathExists(path.join(paths.nativeDir, 'com.bloom.nucleus.bridge.json')),
      brainExe: await fs.pathExists(paths.brainExe),
      config: await fs.pathExists(paths.configFile)
    };
    
    // 5. Validación
    const validation = await validateInstallation();
    diagnostics.validation = validation;
    
    console.log('\n📊 [Diagnostics] Resultados:');
    console.log(JSON.stringify(diagnostics, null, 2));
    
    return diagnostics;
    
  } catch (error) {
    console.error('❌ [Diagnostics] Error:', error.message);
    diagnostics.error = error.message;
    return diagnostics;
  }
}

module.exports = {
  repairBridgeConnection,
  sanitizeAndValidateManifest,  // 🆕 Nueva función exportada
  validateInstallation,
  runDiagnostics
};