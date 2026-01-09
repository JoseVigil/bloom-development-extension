// install/native-host-manifest.js
// ============================================================================
// RESPONSABILIDAD: Gestionar el manifest del Native Messaging Host
// - Crear el archivo JSON con el Extension ID correcto
// - Registrar en Windows Registry
// - Validar la configuración
// ============================================================================

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { paths } = require('../config/paths');

// ============================================================================
// CONSTANTES
// ============================================================================

const HOST_NAME = 'com.bloom.nucleus.bridge';
const REGISTRY_KEY = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Crea el archivo manifest JSON del Native Host
 * Este archivo le dice a Chrome:
 * - Dónde está el ejecutable del host
 * - Qué extensión puede conectarse (por Extension ID)
 * 
 * @param {string} extensionId - Extension ID calculado desde manifest.key
 * @param {string} hostBinaryPath - Ruta absoluta al bloom-host.exe
 * @param {string} manifestOutputPath - Dónde guardar el JSON
 */
async function createNativeHostManifest(extensionId, hostBinaryPath, manifestOutputPath) {
  console.log('\n📝 CREATING NATIVE HOST MANIFEST');
  console.log(`   Extension ID: ${extensionId}`);
  console.log(`   Host Binary: ${hostBinaryPath}`);
  console.log(`   Output Path: ${manifestOutputPath}`);
  
  // Validar inputs
  if (!extensionId || extensionId.length !== 32) {
    throw new Error(`Invalid Extension ID: ${extensionId}. Must be exactly 32 characters (a-p)`);
  }
  
  if (!hostBinaryPath || !path.isAbsolute(hostBinaryPath)) {
    throw new Error(`Invalid host binary path: ${hostBinaryPath}. Must be absolute path`);
  }
  
  // Verificar que el binario existe
  if (!await fs.pathExists(hostBinaryPath)) {
    console.warn(`⚠️ WARNING: Host binary not found at ${hostBinaryPath}`);
    console.warn('   This is normal if binaries are deployed in a later step');
  }
  
  // Crear el contenido del manifest
  const manifestContent = {
    name: HOST_NAME,
    description: 'Bloom Nucleus Native Messaging Host',
    path: hostBinaryPath,
    type: 'stdio',
    allowed_origins: [
      `chrome-extension://${extensionId}/`
    ]
  };
  
  // Asegurar que el directorio existe
  await fs.ensureDir(path.dirname(manifestOutputPath));
  
  // Escribir el archivo JSON
  await fs.writeJson(manifestOutputPath, manifestContent, { spaces: 2 });
  
  console.log('✅ Native Host manifest created successfully');
  console.log(`   Manifest: ${manifestOutputPath}`);
  console.log(`   Allowed Origin: chrome-extension://${extensionId}/`);
  
  return {
    success: true,
    manifestPath: manifestOutputPath,
    extensionId: extensionId
  };
}

/**
 * Registra el Native Host en el Windows Registry
 * Chrome busca aquí para saber dónde está el manifest JSON
 * 
 * @param {string} manifestPath - Ruta absoluta al JSON del manifest
 */
async function registerInWindowsRegistry(manifestPath) {
  console.log('\n🗃️ REGISTERING NATIVE HOST IN WINDOWS REGISTRY');
  
  if (os.platform() !== 'win32') {
    console.log('⚠️ Not Windows platform, skipping registry registration');
    return { success: true, skipped: true, reason: 'Not Windows' };
  }
  
  if (!manifestPath || !path.isAbsolute(manifestPath)) {
    throw new Error(`Invalid manifest path: ${manifestPath}. Must be absolute path`);
  }
  
  // Verificar que el manifest existe
  if (!await fs.pathExists(manifestPath)) {
    throw new Error(`Manifest file not found at: ${manifestPath}`);
  }
  
  console.log(`   Registry Key: ${REGISTRY_KEY}`);
  console.log(`   Manifest Path: ${manifestPath}`);
  
  // Comando para crear/actualizar la clave del registro
  // /ve = establece el valor por defecto (Default)
  // /t REG_SZ = tipo string
  // /d = datos (la ruta al JSON)
  // /f = forzar (no preguntar confirmación)
  const regCommand = `reg add "${REGISTRY_KEY}" /ve /t REG_SZ /d "${manifestPath}" /f`;
  
  try {
    const output = execSync(regCommand, {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    console.log('✅ Registry key created/updated successfully');
    if (output) {
      console.log(`   Output: ${output.trim()}`);
    }
    
    return {
      success: true,
      registryKey: REGISTRY_KEY,
      manifestPath: manifestPath
    };
    
  } catch (error) {
    console.error('❌ Failed to update Windows Registry');
    console.error(`   Command: ${regCommand}`);
    console.error(`   Error: ${error.message}`);
    throw new Error(`Registry registration failed: ${error.message}`);
  }
}

/**
 * Verifica que el registro está correctamente configurado
 */
async function verifyRegistryConfiguration() {
  console.log('\n🔍 VERIFYING REGISTRY CONFIGURATION');
  
  if (os.platform() !== 'win32') {
    console.log('⚠️ Not Windows, skipping verification');
    return { success: true, skipped: true };
  }
  
  try {
    const queryCommand = `reg query "${REGISTRY_KEY}" /ve`;
    const output = execSync(queryCommand, {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    console.log('✅ Registry key exists');
    console.log('   Current value:');
    console.log(output.trim().split('\n').map(line => `   ${line}`).join('\n'));
    
    // Extraer la ruta del manifest del output
    const match = output.match(/REG_SZ\s+(.+)/);
    const registeredPath = match ? match[1].trim() : null;
    
    if (!registeredPath) {
      console.warn('⚠️ Could not parse registered manifest path from registry');
      return { success: false, error: 'Could not parse registry value' };
    }
    
    // Verificar que el archivo existe
    if (await fs.pathExists(registeredPath)) {
      console.log(`✅ Manifest file exists at registered path: ${registeredPath}`);
      
      // Leer y validar el contenido
      try {
        const manifest = await fs.readJson(registeredPath);
        console.log(`✅ Manifest is valid JSON`);
        console.log(`   Host Name: ${manifest.name}`);
        console.log(`   Allowed Origins: ${manifest.allowed_origins?.length || 0}`);
        
        return {
          success: true,
          registeredPath: registeredPath,
          manifest: manifest
        };
      } catch (jsonError) {
        console.error('❌ Manifest file is not valid JSON:', jsonError.message);
        return { success: false, error: 'Invalid JSON in manifest' };
      }
    } else {
      console.error(`❌ Manifest file not found at: ${registeredPath}`);
      return { success: false, error: 'Manifest file not found' };
    }
    
  } catch (error) {
    console.error('❌ Registry key not found or query failed');
    console.error(`   Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Elimina el registro del Native Host (cleanup)
 */
async function unregisterFromRegistry() {
  console.log('\n🗑️ UNREGISTERING NATIVE HOST FROM REGISTRY');
  
  if (os.platform() !== 'win32') {
    console.log('⚠️ Not Windows, skipping');
    return { success: true, skipped: true };
  }
  
  try {
    const deleteCommand = `reg delete "${REGISTRY_KEY}" /f`;
    execSync(deleteCommand, {
      windowsHide: true,
      encoding: 'utf8'
    });
    
    console.log('✅ Registry key deleted successfully');
    return { success: true };
    
  } catch (error) {
    // No es error crítico si la clave no existe
    if (error.message.includes('unable to find')) {
      console.log('⚠️ Registry key was not found (already clean)');
      return { success: true, wasNotFound: true };
    }
    
    console.error('❌ Failed to delete registry key:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Configuración completa: crear manifest + registrar
 * Esta es la función "todo-en-uno" más común
 */
async function setupNativeHostBridge(extensionId) {
  console.log('\n🔗 SETTING UP NATIVE HOST BRIDGE');
  
  // Usar las rutas del config
  const hostBinaryPath = paths.hostBinary;
  const manifestPath = paths.manifestPath;
  
  console.log(`   Extension ID: ${extensionId}`);
  console.log(`   Host Binary: ${hostBinaryPath}`);
  console.log(`   Manifest: ${manifestPath}`);
  
  // Paso 1: Crear el manifest JSON
  const manifestResult = await createNativeHostManifest(
    extensionId,
    hostBinaryPath,
    manifestPath
  );
  
  if (!manifestResult.success) {
    throw new Error('Failed to create manifest');
  }
  
  // Paso 2: Registrar en Windows Registry
  const registryResult = await registerInWindowsRegistry(manifestPath);
  
  if (!registryResult.success && !registryResult.skipped) {
    throw new Error('Failed to register in Windows Registry');
  }
  
  console.log('✅ Native Host Bridge setup completed successfully');
  
  return {
    success: true,
    extensionId: extensionId,
    manifestPath: manifestPath,
    registryKey: REGISTRY_KEY
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Funciones principales
  createNativeHostManifest,
  registerInWindowsRegistry,
  setupNativeHostBridge,
  
  // Funciones auxiliares
  verifyRegistryConfiguration,
  unregisterFromRegistry,
  
  // Constantes
  HOST_NAME,
  REGISTRY_KEY
};