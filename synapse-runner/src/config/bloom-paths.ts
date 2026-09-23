import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { env } from './env';

/**
 * Resolución de paths de BloomNucleus, en Node, espejando
 * brain/shared/paths.py::Paths (modo NO frozen / desarrollo).
 *
 * Por qué existe este archivo (resolución del punto bloqueante de la
 * Sección 7, punto 7 — ver README para el desarrollo completo):
 *
 *   templates/{discovery,companion,synapse-simulator,landing}/ SÍ se
 *   sincronizan automáticamente con el runtime — pero NO vía un build
 *   tradicional (webpack/tsc/etc.), sino vía una copia Python verbatim
 *   (shutil.copy2, sin transformación) que corre en
 *   brain/core/profile/profile_create.py::_generate_profile_pages() cada
 *   vez que se crea un perfil, invocando a
 *   brain/core/profile/web/{companion,discovery,synapse_simulator,landing}_generator.py.
 *
 *   El extension "base" (background.js, background-companion.js,
 *   manifest.json, content.js, protocols/*.json) vive SOLO en
 *   installer/cortex/extension/ dentro del repo, y llega al perfil por un
 *   camino DISTINTO: build-all.py::build_cortex() empaqueta ese directorio
 *   en un .blx (installer/native/bin/cortex/), que el instalador/updater
 *   de BloomNucleus despliega en <base_dir>/bin/extension — desde ahí,
 *   profile_create.py::_copy_extension_to_profile() lo clona (shutil.copytree)
 *   al perfil maestro, y perfiles regulares clonan del perfil maestro.
 *
 *   CONSECUENCIA PRÁCTICA (la que le importa a Playwright): el directorio
 *   que Chrome carga de verdad para un perfil es
 *   <base_dir>/profiles/<profile_id>/extension/ — ensamblado en DOS pasos
 *   de origen distinto. La parte discovery/companion/synapse-simulator/landing
 *   SIEMPRE refleja el repo actual (copia verbatim en cada creación de
 *   perfil). La parte background*.js/manifest.json puede estar DESACTUALIZADA
 *   si el <base_dir>/bin/extension instalado no fue reconstruido/reinstalado
 *   desde el último cambio en installer/cortex/extension/. Por eso
 *   preflight/extension-parity-check.ts compara ambas copias byte a byte
 *   ANTES de correr la suite, en vez de asumir que están sincronizadas.
 */

export interface BloomPaths {
  baseDir: string;
  binDir: string;
  configDir: string;
  profilesDir: string;
  profilesJson: string;
  nucleusJson: string;
}

/** Espeja Paths._resolve_base_directory() de brain/shared/paths.py — SOLO modo desarrollo (no frozen). */
export function resolveBloomNucleusBaseDir(): string {
  if (env.bloomNucleusBaseDirOverride) {
    return resolve(env.bloomNucleusBaseDirOverride);
  }

  const plat = platform();
  if (plat === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    return localAppData
      ? join(localAppData, 'BloomNucleus')
      : join(homedir(), 'AppData', 'Local', 'BloomNucleus');
  }
  if (plat === 'darwin') {
    return join(homedir(), 'Library', 'BloomNucleus');
  }
  // Linux
  const xdg = process.env.XDG_DATA_HOME;
  return xdg ? join(xdg, 'BloomNucleus') : join(homedir(), '.local', 'share', 'BloomNucleus');
}

export function getBloomPaths(): BloomPaths {
  const baseDir = resolveBloomNucleusBaseDir();
  return {
    baseDir,
    binDir: join(baseDir, 'bin'),
    configDir: join(baseDir, 'config'),
    profilesDir: join(baseDir, 'profiles'),
    profilesJson: join(baseDir, 'config', 'profiles.json'),
    nucleusJson: join(baseDir, 'config', 'nucleus.json'),
  };
}

interface ProfilesJsonShape {
  profiles?: Array<{ id: string; master?: boolean; extension_path?: string; alias?: string }>;
}

/**
 * Espeja Paths.get_master_profile_extension_path() de brain/shared/paths.py.
 * Lanza si no hay profiles.json o perfil maestro — el Runner NO debe asumir
 * un path hardcodeado (ver comentario de arriba: hay al menos 2-3
 * convenciones de base_dir distintas conviviendo en el codebase auditado).
 */
export function getMasterProfileExtensionPath(paths: BloomPaths = getBloomPaths()): string {
  if (!existsSync(paths.profilesJson)) {
    throw new Error(
      `[bloom-paths] profiles.json no encontrado en ${paths.profilesJson}. ` +
        `¿BloomNucleus corrió al menos una vez en este entorno? ` +
        `(base_dir resuelto: ${paths.baseDir})`,
    );
  }

  const raw = readFileSync(paths.profilesJson, 'utf-8');
  const data = JSON.parse(raw) as ProfilesJsonShape;
  const master = data.profiles?.find((p) => p.master);

  if (!master) {
    throw new Error(`[bloom-paths] No se encontró perfil maestro en ${paths.profilesJson}`);
  }
  if (!master.extension_path) {
    throw new Error(
      `[bloom-paths] El perfil maestro (${master.id}) no tiene 'extension_path' en profiles.json`,
    );
  }

  return master.extension_path;
}

/**
 * Resetea el estado del wizard de onboarding en nucleus.json a "nunca
 * arrancado", borrando la clave `onboarding` por completo.
 *
 * POR QUÉ EXISTE (diagnóstico 2026-09-22 — "el test saltea backend_identity_check
 * y arranca directo en Workspace"): resolution-engine.js::resolveEntryPoint()
 * calcula el step de entrada leyendo nucleus.json de disco, NO resetea nada
 * por su cuenta. Confirmado: sin este reset, una corrida de
 * onboarding-flow.spec.ts que ya dejó `onboarding.completed_steps:
 * ["backend_identity_check"]` en nucleus.json (de una corrida anterior)
 * hace que la corrida SIGUIENTE arranque directo en 'nucleus_create' — el
 * wizard hace exactamente lo correcto (resume real), pero el test deja de
 * ejercitar backend_identity_check, que es justamente lo que se quiere
 * probar. Confirmado también que borrar la clave completa es seguro:
 * resolution-engine.js hace `if (nucleusData.onboarding)` antes de tocarla, y
 * con la clave ausente arranca desde cero como una instalación nunca
 * iniciada (mismo resultado que `onboarding:get-resume-state` devolvió en
 * el primer boot de la sesión: `{"stepId":"backend_identity_check","produced":[]}`).
 * No toca ninguna otra clave de nucleus.json (installation, system_map,
 * master_profile, etc.) —esas no son estado del wizard.
 *
 * Llamar SIEMPRE al principio de un test que ejercita el wizard de
 * onboarding desde cero, antes de `launchConductor()`.
 */
export function resetOnboardingState(paths: BloomPaths = getBloomPaths()): void {
  if (!existsSync(paths.nucleusJson)) {
    throw new Error(`[bloom-paths] nucleus.json no encontrado en ${paths.nucleusJson} — no se puede resetear.`);
  }
  const raw = readFileSync(paths.nucleusJson, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>;
  delete data.onboarding;
  data.updated_at = new Date().toISOString();
  writeFileSync(paths.nucleusJson, JSON.stringify(data, null, 2));
}

export function getExtensionIdFromNucleusJson(paths: BloomPaths = getBloomPaths()): string {
  if (!existsSync(paths.nucleusJson)) {
    throw new Error(`[bloom-paths] nucleus.json no encontrado en ${paths.nucleusJson}`);
  }
  const raw = readFileSync(paths.nucleusJson, 'utf-8');
  const data = JSON.parse(raw) as { system_map?: { extension_id?: string } };
  const extensionId = data.system_map?.extension_id;
  if (!extensionId) {
    throw new Error(`[bloom-paths] 'extension_id' no encontrado en system_map de ${paths.nucleusJson}`);
  }
  return extensionId;
}

/** Ruta al extension "base" DENTRO DEL REPO — la fuente que empaqueta build_cortex(). */
export function getRepoCortexExtensionDir(repoRoot: string): string {
  return join(repoRoot, 'installer', 'cortex', 'extension');
}

/** Ruta a templates/ dentro del repo — fuente de verdad para discovery/companion/synapse-simulator/landing. */
export function getRepoWebTemplatesDir(repoRoot: string): string {
  return join(repoRoot, 'brain', 'core', 'profile', 'web', 'templates');
}
