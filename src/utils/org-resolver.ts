// src/utils/org-resolver.ts
import path from 'path';
import { readFile } from 'fs/promises';

interface NucleusConfig {
  onboarding: {
    workspace_path: string;
    workspace_org: string;
  };
}

let cachedOrg: string | null = null;

/**
 * Resuelve la organización real desde nucleus.json (instalación de máquina).
 * nucleus.json vive en bloomBase, NO en el workspace — mismo valor que
 * resolveAppDataDir() + 'BloomNucleus', pasado ya resuelto por el caller.
 *
 * Debe coincidir con supervisor.LoadNucleusConfig() del lado Go: misma
 * fuente (nucleus.json → onboarding.workspace_org), mismo campo.
 *
 * Antes esta función era un stub que devolvía 'default-org' fijo —
 * reemplazado acá por la lectura real (movida desde el extinto
 * fs/mandate-paths.ts).
 */
export async function resolveOrg(bloomBase: string): Promise<string> {
  if (cachedOrg) return cachedOrg;

  if (!bloomBase) {
    throw new Error('resolveOrg: bloomBase vacío — no se puede localizar nucleus.json');
  }

  const configPath = path.join(bloomBase, 'nucleus.json');
  const raw = await readFile(configPath, 'utf-8');
  const config = JSON.parse(raw) as NucleusConfig;

  if (!config.onboarding?.workspace_org) {
    throw new Error(`nucleus.json en ${configPath} no tiene onboarding.workspace_org`);
  }

  cachedOrg = config.onboarding.workspace_org;
  return cachedOrg;
}