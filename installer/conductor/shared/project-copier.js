'use strict';

/**
 * conductor/shared/project-copier.js
 *
 * Copia física de un proyecto de una carpeta arbitraria del usuario
 * (sourcePath) al root de Nucleus (destPath).
 *
 * Consumido vía require() con path relativo, tanto desde el proceso main
 * de onboarding-Electron (una sola vez, primer proyecto / Genesis Mandate)
 * como — a futuro — de Workspace Core (repetidamente, cada vez que se
 * anexa un proyecto nuevo). Ver PROJECT-COPIER-SPEC-AND-CONTEXT.md §0.5.
 *
 * Mismo molde que shared/synapse-bridge.js: CommonJS puro, 'use strict',
 * solo require() de Node core, sin build step, module.exports plano al final.
 *
 * CONTRATO (spec §2.2):
 *   - Copia recursiva de todo sourcePath → destPath.
 *   - Única exclusión: cualquier directorio llamado '.git', en cualquier
 *     nivel del árbol (no solo la raíz — cubre submódulos/repos anidados).
 *   - No se excluye nada más (node_modules, .env, etc.) salvo pedido explícito.
 *   - Corre en el proceso main de Electron (I/O potencialmente pesada,
 *     el renderer no tiene fs directo) — el renderer lo dispara vía IPC.
 *
 * OPEN ITEM heredado del spec (§3.3) — destPath:
 *   No hay, en ningún código auditado (Electron ni Go), una convención
 *   existente para calcular destPath a partir de workspace_path. Este
 *   archivo expone `resolveProjectDestPath()` con la convención MÁS OBVIA
 *   (project como subcarpeta directa del root de Nucleus), pero es una
 *   PROPUESTA, no algo confirmado contra el binario nucleus/brain — ver
 *   spec §3.3, punto 2 ("Confirmar contra el binario real si --source... ").
 *   El caller (el IPC handler) es libre de calcular destPath de otra forma
 *   sin tocar copyProject(), que solo conoce sourcePath/destPath ya resueltos.
 */

const fs = require('fs');
const path = require('path');

// Nombre del directorio a excluir en cualquier nivel del árbol.
const GIT_DIR_NAME = '.git';

/**
 * Copia recursivamente sourcePath → destPath, excluyendo cualquier
 * directorio '.git' encontrado en cualquier nivel.
 *
 * @param {object} params
 * @param {string} params.sourcePath - Carpeta origen (arbitraria, fuera del root de Nucleus).
 * @param {string} params.destPath   - Carpeta destino (dentro del root de Nucleus). Se crea si no existe.
 * @returns {Promise<{success: boolean, sourcePath: string, destPath: string, gitExcluded: string[]}>}
 *   gitExcluded: paths absolutos de cada directorio '.git' que se excluyó de la copia
 *   (dato pensado para mostrarle al usuario "no se copió el historial de commits" — spec §2.2).
 * @throws {Error} si sourcePath no existe, no es un directorio, o coincide con destPath.
 */
async function copyProject({ sourcePath, destPath }) {
  if (!sourcePath || !destPath) {
    throw new Error('project-copier: sourcePath y destPath son requeridos');
  }

  const resolvedSource = path.resolve(sourcePath);
  const resolvedDest = path.resolve(destPath);

  if (resolvedSource === resolvedDest) {
    throw new Error('project-copier: sourcePath y destPath no pueden ser el mismo directorio');
  }
  // Evita el caso patológico de copiar un directorio dentro de sí mismo
  // (destPath anidado bajo sourcePath) — recursión infinita en potencia.
  const sep = path.sep;
  if ((resolvedDest + sep).startsWith(resolvedSource + sep)) {
    throw new Error('project-copier: destPath no puede estar dentro de sourcePath');
  }

  const sourceStat = await fs.promises.stat(resolvedSource).catch(() => null);
  if (!sourceStat || !sourceStat.isDirectory()) {
    throw new Error(`project-copier: sourcePath no existe o no es un directorio: ${resolvedSource}`);
  }

  const gitExcluded = [];
  await fs.promises.mkdir(resolvedDest, { recursive: true });
  await _copyDir(resolvedSource, resolvedDest, gitExcluded);

  return {
    success: true,
    sourcePath: resolvedSource,
    destPath: resolvedDest,
    gitExcluded,
  };
}

/**
 * Copia recursiva interna, entrada por entrada, con exclusión de '.git'.
 * @param {string} srcDir
 * @param {string} destDir
 * @param {string[]} gitExcluded - acumulador mutado in-place
 */
async function _copyDir(srcDir, destDir, gitExcluded) {
  const entries = await fs.promises.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcEntryPath = path.join(srcDir, entry.name);
    const destEntryPath = path.join(destDir, entry.name);

    if (entry.isSymbolicLink()) {
      // Preservar el symlink tal cual en vez de seguirlo — evita duplicar
      // contenido o, peor, entrar en loops si el link es circular.
      const linkTarget = await fs.promises.readlink(srcEntryPath);
      await fs.promises.symlink(linkTarget, destEntryPath).catch(() => {
        // Target inválido en destino (ej. link relativo roto fuera de
        // contexto) — no bloqueante, se omite ese symlink puntual.
      });
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === GIT_DIR_NAME) {
        gitExcluded.push(srcEntryPath);
        continue;
      }
      await fs.promises.mkdir(destEntryPath, { recursive: true });
      await _copyDir(srcEntryPath, destEntryPath, gitExcluded);
      continue;
    }

    if (entry.isFile()) {
      await fs.promises.copyFile(srcEntryPath, destEntryPath);
    }
    // Otros tipos (socket, fifo, etc.) se ignoran deliberadamente — no
    // aplica a proyectos de usuario reales, y copyFile fallaría igual.
  }
}

/**
 * Convención PROPUESTA (no confirmada) para calcular destPath a partir de
 * workspace_path — ver OPEN ITEM en el header de este archivo y spec §3.3.
 *
 * project como subcarpeta directa del root de Nucleus, consistente con
 * cómo se arma workspace_path en onboarding-handlers.js
 * (`nucleusPath = path.join(basePath, folderName)`).
 *
 * NO usar esto como verdad asumida si en algún momento se confirma que el
 * binario nucleus/brain espera otra ubicación — ver spec §3.3 punto 2.
 *
 * @param {string} workspacePath - onboarding.workspace_path (root de Nucleus)
 * @param {string} projectName
 * @returns {string}
 */
function resolveProjectDestPath(workspacePath, projectName) {
  if (!workspacePath || !projectName) {
    throw new Error('project-copier: workspacePath y projectName son requeridos para resolveProjectDestPath');
  }
  return path.join(workspacePath, projectName);
}

module.exports = {
  copyProject,
  resolveProjectDestPath,
  GIT_DIR_NAME,
};
