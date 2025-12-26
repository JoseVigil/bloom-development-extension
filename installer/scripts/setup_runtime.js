/**
 * Setup Python Embedded Runtime for Bloom Nucleus
 * Descarga, verifica y prepara el runtime embebido de Python
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const unzipper = require('unzipper');

// Cargar configuración desde archivo externo
const CONFIG_PATH = path.join(__dirname, 'python-runtime.config.json');

function loadEngineConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `❌ Archivo de configuración no encontrado: ${CONFIG_PATH}\n` +
      `   Asegúrate de que python-runtime.config.json existe en installer/scripts/`
    );
  }
  
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(configData);
    
    // Validar campos requeridos
    const required = ['version', 'url', 'sha256', 'targetFolder'];
    const missing = required.filter(field => !config[field]);
    
    if (missing.length > 0) {
      throw new Error(
        `❌ Campos faltantes en configuración: ${missing.join(', ')}`
      );
    }
    
    console.log(`✅ Configuración cargada: Python ${config.version}`);
    return config;
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `❌ Error de sintaxis en ${CONFIG_PATH}\n` +
        `   ${error.message}`
      );
    }
    throw error;
  }
}

async function downloadWithProgress(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📥 Descargando desde: ${url}`);
    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      // Manejar redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        console.log('   ↪ Siguiendo redirect...');
        return downloadWithProgress(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;
      let lastPercent = 0;
      
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = Math.floor((downloaded / totalSize) * 100);
        
        if (percent > lastPercent && percent % 10 === 0) {
          process.stdout.write(`\r   Progreso: ${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`);
          lastPercent = percent;
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\n   ✅ Descarga completada');
        resolve();
      });
      
      file.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function verifyHash(filePath, expectedHash) {
  return new Promise((resolve, reject) => {
    console.log('\n🔐 Verificando integridad (SHA256)...');
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => {
      const fileHash = hash.digest('hex');
      if (fileHash === expectedHash) {
        console.log('   ✅ Hash verificado correctamente');
        resolve(true);
      } else {
        reject(new Error(
          `❌ Hash mismatch!\n` +
          `   Esperado: ${expectedHash}\n` +
          `   Obtenido: ${fileHash}\n` +
          `   El archivo puede estar corrupto o manipulado.`
        ));
      }
    });
    stream.on('error', reject);
  });
}

async function setupRuntime() {
  console.log('\n' + '='.repeat(70));
  console.log('🔧 Preparando Python Runtime Embebido para Bloom Nucleus');
  console.log('='.repeat(70));
  
  // Cargar configuración
  const ENGINE_CONFIG = loadEngineConfig();
  
  // Rutas
  const projectRoot = path.join(__dirname, '..', '..');
  const cacheDir = path.join(projectRoot, '.cache');
  const zipPath = path.join(cacheDir, `python-${ENGINE_CONFIG.version}.zip`);
  const outputDir = path.join(__dirname, '..', 'resources', ENGINE_CONFIG.targetFolder);
  
  try {
    // 1. Asegurar directorio de cache
    await fs.ensureDir(cacheDir);
    console.log(`\n📁 Directorio de cache: ${cacheDir}`);
    
    // 2. Descargar si no existe
    if (await fs.pathExists(zipPath)) {
      console.log('✅ Usando cache existente (omitiendo descarga)');
    } else {
      await downloadWithProgress(ENGINE_CONFIG.url, zipPath);
    }
    
    // 3. Verificar integridad
    await verifyHash(zipPath, ENGINE_CONFIG.sha256);
    
    // 4. Extraer
    console.log('\n📦 Extrayendo runtime...');
    await fs.emptyDir(outputDir);
    
    await fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: outputDir }))
      .promise();
    
    console.log(`   ✅ Extraído a: ${outputDir}`);
    
    // 5. Configurar aislamiento (._pth)
    console.log('\n⚙️  Configurando aislamiento de Python...');
    const pthFile = path.join(outputDir, 'python310._pth');
    
    // Usar paths desde configuración si existen, o valores por defecto
    const isolatedConfig = (ENGINE_CONFIG.isolatedPaths || [
      '.',
      'python310.zip',
      '../core/brain/libs',
      'import site'
    ]).join('\n');
    
    await fs.writeFile(pthFile, isolatedConfig, 'utf8');
    console.log('   ✅ Archivo python310._pth configurado');
    console.log('   ↪ Python ignorará PYTHONPATH del sistema');
    
    // 6. Validar instalación
    console.log('\n🔍 Validando instalación...');
    const pythonExe = path.join(outputDir, 'python.exe');
    
    if (!await fs.pathExists(pythonExe)) {
      throw new Error('❌ python.exe no encontrado después de extracción');
    }
    
    const stats = await fs.stat(pythonExe);
    console.log(`   ✅ python.exe encontrado (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // 7. Listar contenido para debug
    const files = await fs.readdir(outputDir);
    console.log(`   ✅ Archivos extraídos: ${files.length}`);
    
    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('✅ RUNTIME PREPARADO CORRECTAMENTE');
    console.log('='.repeat(70));
    console.log(`📍 Ubicación: ${outputDir}`);
    console.log(`📦 Versión: Python ${ENGINE_CONFIG.version} (Embedded)`);
    console.log(`🔒 Aislamiento: Activado (modo -I)`);
    console.log(`📄 Configuración: ${CONFIG_PATH}`);
    console.log('\n💡 Siguiente paso: npm run package (para empaquetar Electron)\n');
    
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ ERROR FATAL EN PREPARACIÓN DE RUNTIME');
    console.error('='.repeat(70));
    console.error(error.message);
    console.error('\n💡 Soluciones:');
    console.error('   1. Verifica tu conexión a internet');
    console.error('   2. Intenta borrar .cache/ y volver a ejecutar');
    console.error('   3. Verifica python-runtime.config.json');
    console.error('   4. Descarga manualmente desde: ' + ENGINE_CONFIG.url);
    console.error('');
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  setupRuntime();
}

module.exports = { setupRuntime };