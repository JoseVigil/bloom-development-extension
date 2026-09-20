import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getBloomPaths,
  getMasterProfileExtensionPath,
  getRepoCortexExtensionDir,
} from '../config/bloom-paths';

/**
 * Preflight check que resuelve, en runtime, la pregunta que la Sección 7
 * punto 7 dejaba abierta.
 *
 * CONFIRMADO por lectura de código (ver bloom-paths.ts para el detalle):
 *   - templates/{discovery,companion,synapse-simulator,landing}/ →
 *     SIEMPRE en sync con el runtime (copia Python verbatim en cada
 *     creación de perfil). No requiere check — no puede desincronizarse
 *     sin tocar profile_create.py.
 *   - installer/cortex/extension/{background.js, background-companion.js,
 *     manifest.json, content.js, protocols/*.json} → llegan al perfil vía
 *     un empaquetado (build_cortex()) + instalación separados. ESTO SÍ
 *     puede desincronizarse del repo actual si el BloomNucleus instalado
 *     en esta máquina no fue reconstruido desde el último cambio en
 *     installer/cortex/extension/.
 *
 * Este check compara ambas copias por hash y, si difieren, NO aborta la
 * corrida (podría ser intencional en un entorno de CI con extension
 * pre-empaquetada) pero emite un warning fuerte y lo dejamos asentado en el
 * reporte de diagnóstico — exactamente el tipo de detección temprana que
 * pide la Sección 6 / consigna punto 4, aplicado a la propia infraestructura
 * del Runner, no solo al flujo de negocio.
 */

const FILES_TO_COMPARE = [
  'background.js',
  'background-companion.js',
  'manifest.json',
  'content.js',
  join('protocols', 'companion.schema.json'),
];

export interface ExtensionParityResult {
  checked: boolean;
  activeProfileExtensionPath?: string;
  repoExtensionPath: string;
  mismatches: string[];
  missingInActiveProfile: string[];
  identical: boolean;
  skippedReason?: string;
}

export function checkExtensionParity(repoRoot: string): ExtensionParityResult {
  const repoExtensionPath = getRepoCortexExtensionDir(repoRoot);

  let activeProfileExtensionPath: string | undefined;
  try {
    activeProfileExtensionPath = getMasterProfileExtensionPath(getBloomPaths());
  } catch (err) {
    return {
      checked: false,
      repoExtensionPath,
      mismatches: [],
      missingInActiveProfile: [],
      identical: false,
      skippedReason: err instanceof Error ? err.message : String(err),
    };
  }

  const mismatches: string[] = [];
  const missingInActiveProfile: string[] = [];

  for (const relFile of FILES_TO_COMPARE) {
    const repoFile = join(repoExtensionPath, relFile);
    const activeFile = join(activeProfileExtensionPath, relFile);

    if (!existsSync(repoFile)) {
      // No debería pasar — Sección 0 ya confirmó estas rutas contra el repo.
      continue;
    }
    if (!existsSync(activeFile)) {
      missingInActiveProfile.push(relFile);
      continue;
    }

    const repoHash = hashFile(repoFile);
    const activeHash = hashFile(activeFile);
    if (repoHash !== activeHash) {
      mismatches.push(relFile);
    }
  }

  return {
    checked: true,
    activeProfileExtensionPath,
    repoExtensionPath,
    mismatches,
    missingInActiveProfile,
    identical: mismatches.length === 0 && missingInActiveProfile.length === 0,
  };
}

function hashFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function formatParityResult(result: ExtensionParityResult): string {
  if (!result.checked) {
    return (
      `⚠️  [extension-parity] No se pudo verificar (perfil maestro no resuelto): ${result.skippedReason}\n` +
      `    El Runner va a proceder igual, pero no hay garantía de que la extensión activa refleje el repo actual.`
    );
  }
  if (result.identical) {
    return `✅ [extension-parity] La extensión del perfil maestro activo coincide byte a byte con installer/cortex/extension/ del repo.`;
  }
  const lines = [
    `🔴 [extension-parity] DESINCRONIZACIÓN DETECTADA entre el repo y la extensión activa.`,
    `    Repo:    ${result.repoExtensionPath}`,
    `    Activa:  ${result.activeProfileExtensionPath}`,
  ];
  if (result.mismatches.length > 0) {
    lines.push(`    Archivos con contenido distinto: ${result.mismatches.join(', ')}`);
  }
  if (result.missingInActiveProfile.length > 0) {
    lines.push(`    Archivos ausentes en el perfil activo: ${result.missingInActiveProfile.join(', ')}`);
  }
  lines.push(
    `    → Los selectores/aserciones del Runner contra background-companion.js pueden no ser representativos.`,
    `    → Reconstruí/reinstalá la extensión (ver 'brain extension install --force' / build_cortex()) antes de confiar en los resultados de la Capa 1/2.`,
  );
  return lines.join('\n');
}
