// service-installer-ollama.js
// Instalador Windows de Ollama como servicio administrado por NSSM.

'use strict';

const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { paths } = require('../config/paths');

const OLLAMA_SERVICE_NAME = 'BloomOllamaService';
const OLLAMA_DISPLAY_NAME = 'Bloom Ollama Service';
const OLLAMA_DESCRIPTION = 'Bloom Ollama Service - local LLM runtime';

function runNssm(args) {
  return new Promise((resolve, reject) => {
    execFile(paths.nssmExe, args, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      // NSSM puede escribir mensajes en stderr aun con exit code 0; un error
      // real de proceso nunca debe considerarse exitoso por su texto.
      if (error) {
        return reject(new Error(
          `NSSM command failed: ${args.join(' ')}\n${stderr || error.message}`
        ));
      }
      resolve(stdout || stderr || '');
    });
  });
}

function serviceExists() {
  try {
    execFileSync('sc.exe', ['query', OLLAMA_SERVICE_NAME], {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function removeOllamaService() {
  if (!serviceExists()) return;

  try { await runNssm(['stop', OLLAMA_SERVICE_NAME]); } catch (_) {}
  try { await runNssm(['remove', OLLAMA_SERVICE_NAME, 'confirm']); } catch (_) {}

  // El SCM puede mantener el servicio marcado para eliminación unos instantes.
  for (let attempt = 0; attempt < 10 && serviceExists(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (serviceExists()) {
    throw new Error(
      `${OLLAMA_SERVICE_NAME} is still pending deletion. Close service-management tools and retry.`
    );
  }
}

async function installOllamaService() {
  console.log('\n🦙 INSTALANDO OLLAMA SERVICE (Windows NSSM)\n');

  const nssmPath = paths.nssmExe;
  const ollamaExe = paths.ollamaExe || path.join(paths.binDir, 'ollama', 'ollama.exe');
  const workDir = path.dirname(ollamaExe);
  const modelsDir = path.join(paths.baseDir, 'models');
  const logDir = path.join(paths.logsDir, 'ollama', 'service');
  const serviceLog = path.join(logDir, 'ollama_service.log');

  if (!await fs.pathExists(nssmPath)) {
    throw new Error(`NSSM not found: ${nssmPath}`);
  }
  if (!await fs.pathExists(ollamaExe)) {
    throw new Error(`Ollama binary not found: ${ollamaExe}`);
  }

  await fs.ensureDir(modelsDir);
  await fs.ensureDir(logDir);

  if (serviceExists()) {
    console.log('🔄 Actualizando Ollama Service existente...');
    await removeOllamaService();
  }

  await runNssm(['install', OLLAMA_SERVICE_NAME, ollamaExe]);

  try {
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppParameters', 'serve']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppDirectory', workDir]);
    await runNssm([
      'set', OLLAMA_SERVICE_NAME, 'AppEnvironmentExtra',
      'OLLAMA_HOST=127.0.0.1:11434',
      `OLLAMA_MODELS=${modelsDir}`,
      `LOCALAPPDATA=${process.env.LOCALAPPDATA || path.dirname(paths.baseDir)}`
    ]);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppStdout', serviceLog]);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppStderr', serviceLog]);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppRotateFiles', '1']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppRotateOnline', '1']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppRotateBytes', String(10 * 1024 * 1024)]);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'Start', 'SERVICE_AUTO_START']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppExit', 'Default', 'Restart']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'AppRestartDelay', '15000']);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'DisplayName', OLLAMA_DISPLAY_NAME]);
    await runNssm(['set', OLLAMA_SERVICE_NAME, 'Description', OLLAMA_DESCRIPTION]);
  } catch (error) {
    // No dejar un servicio parcialmente configurado si falla un `set`.
    try { await removeOllamaService(); } catch (_) {}
    throw error;
  }

  console.log(`✅ ${OLLAMA_DISPLAY_NAME} registrado`);
  console.log(`   Bin: ${ollamaExe}`);
  console.log(`   Models: ${modelsDir}`);
  console.log(`   Log: ${serviceLog}`);
  return true;
}

async function startOllamaService() {
  if (!serviceExists()) {
    console.error(`❌ ${OLLAMA_SERVICE_NAME} no está instalado`);
    return false;
  }

  try {
    await runNssm(['start', OLLAMA_SERVICE_NAME]);

    for (let attempt = 1; attempt <= 10; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      const status = execFileSync('sc.exe', ['query', OLLAMA_SERVICE_NAME], {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      if (/STATE\s*:\s*4\s+RUNNING/i.test(status)) {
        console.log(`✅ ${OLLAMA_DISPLAY_NAME} RUNNING`);
        return true;
      }
    }

    console.error(`❌ ${OLLAMA_SERVICE_NAME} no alcanzó el estado RUNNING`);
    return false;
  } catch (error) {
    // NSSM devuelve error si ya estaba iniciado; verificar el estado real.
    try {
      const status = execFileSync('sc.exe', ['query', OLLAMA_SERVICE_NAME], {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      if (/STATE\s*:\s*4\s+RUNNING/i.test(status)) return true;
    } catch (_) {}

    console.error(`❌ No se pudo iniciar ${OLLAMA_SERVICE_NAME}: ${error.message}`);
    return false;
  }
}

module.exports = {
  installOllamaService,
  startOllamaService,
  removeOllamaService,
  OLLAMA_SERVICE_NAME,
  OLLAMA_DISPLAY_NAME,
};
