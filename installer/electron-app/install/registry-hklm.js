// install/registry-hklm.js
const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

/**
 * Escribe en HKEY_LOCAL_MACHINE para que Chrome de CUALQUIER usuario
 * pueda ver el Native Messaging Host
 */
async function registerNativeHostInHKLM(extensionId, manifestPath) {
  if (process.platform !== 'win32') {
    throw new Error('Registry solo funciona en Windows');
  }

  const hostName = 'com.bloom.nucleus.bridge';
  const registryKey = `HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
  
  // Convertir ruta a formato Windows con dobles barras
  const manifestPathWindows = manifestPath.replace(/\//g, '\\');
  
  console.log('\n📝 REGISTRANDO EN HKLM (Global)');
  console.log(`   Clave: ${registryKey}`);
  console.log(`   Manifest: ${manifestPathWindows}`);
  console.log(`   Extension ID: ${extensionId}`);
  
  try {
    // Crear/sobrescribir la clave en HKLM
    const regCommand = `reg add "${registryKey}" /ve /t REG_SZ /d "${manifestPathWindows}" /f`;
    
    execSync(regCommand, {
      stdio: 'inherit',
      windowsHide: true
    });
    
    console.log('✅ Registry HKLM actualizada correctamente');
    
    // Verificar que se escribió
    const verifyCommand = `reg query "${registryKey}" /ve`;
    const result = execSync(verifyCommand, { encoding: 'utf8' });
    
    if (result.includes(manifestPathWindows)) {
      console.log('✅ Verificación exitosa: Manifest registrado en HKLM');
      return { success: true, registryKey, manifestPath: manifestPathWindows };
    } else {
      throw new Error('Verificación falló: Manifest no encontrado en HKLM');
    }
    
  } catch (error) {
    console.error('❌ Error escribiendo en Registry:', error.message);
    
    // Fallback: intentar con HKCU del usuario actual
    console.log('\n⚠️ Fallback: Intentando HKCU del usuario actual...');
    return await registerNativeHostInHKCU(extensionId, manifestPath);
  }
}

/**
 * Fallback: Escribir en HKCU del usuario actual
 * (Solo funciona si el instalador corre SIN privilegios de Admin)
 */
async function registerNativeHostInHKCU(extensionId, manifestPath) {
  const hostName = 'com.bloom.nucleus.bridge';
  const registryKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
  const manifestPathWindows = manifestPath.replace(/\//g, '\\');
  
  console.log('\n📝 REGISTRANDO EN HKCU (Usuario actual)');
  console.log(`   Clave: ${registryKey}`);
  
  try {
    const regCommand = `reg add "${registryKey}" /ve /t REG_SZ /d "${manifestPathWindows}" /f`;
    execSync(regCommand, { stdio: 'inherit', windowsHide: true });
    
    console.log('✅ Registry HKCU actualizada');
    return { success: true, registryKey, manifestPath: manifestPathWindows };
    
  } catch (error) {
    throw new Error(`No se pudo escribir en Registry: ${error.message}`);
  }
}

module.exports = {
  registerNativeHostInHKLM,
  registerNativeHostInHKCU
};