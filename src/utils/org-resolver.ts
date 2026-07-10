import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const BLOOM_DIR_NAME = '.bloom';
const NUCLEUS_PREFIX = '.nucleus-';
const NUCLEUS_CONFIG_REL_PATH = path.join('.core', 'nucleus-config.json');

/**
 * Espeja NucleusConfigFile (Go, internal/supervisor/service.go).
 * Solo se valida lo que ambos lados necesitan: el slug declarado adentro,
 * para chequear consistencia contra el nombre de carpeta.
 */
const NucleusConfigSchema = z
  .object({
    organization: z
      .object({
        slug: z.string().optional(),
        name: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Espeja OwnershipFile (.ownership.json). Ya NO es parte del mecanismo de
 * resolución (ver nota en resolveOrganization) — se deja acá como schema
 * exportado para quien necesite validar ownership explícitamente
 * (ej: chequeo de master_user antes de una operación sensible).
 */
export const OwnershipSchema = z.object({
  organization_fingerprint: z.string().regex(/^bloom:org:[a-z0-9-]+$/),
  organization_name: z.string(),
  master_user: z.string(),
  key_fingerprint: z.string(),
  created_at: z.number(),
});

export interface OrganizationContext {
  name: string; // slug, e.g. "acme"
  fingerprint: string; // e.g. "bloom:org:acme"
  workspacePath: string; // paridad con Config.WorkspacePath (Go)
  nucleusRoot: string; // .bloom/.nucleus-acme
  batcaveRoot: string; // .bloom/.nucleus-acme/.batcave
  ownershipPath: string; // .bloom/.nucleus-acme/.ownership.json
  alfredContractPath: string; // .bloom/.nucleus-acme/.core/.ai_bot.sovereign.bl
  configPath: string; // .bloom/.nucleus-acme/.core/nucleus-config.json
  raw: Record<string, unknown>; // paridad con Config.Raw (Go)
}

/**
 * Resuelve el Nucleus activo para el proceso actual.
 *
 * Mecanismo alineado a supervisor.LoadNucleusConfig() (Go) — ver
 * internal/supervisor/service.go. Antes este archivo tenía un mecanismo
 * paralelo y no equivalente (buscaba solo en process.cwd(), sin subir
 * directorios, y usaba .ownership.json como gate en vez de
 * .core/nucleus-config.json). Eso es lo que se corrige acá:
 *
 *   1. Subir desde `startDir` (default: CWD) hasta encontrar una carpeta
 *      .bloom — igual que findBloomDir() en Go, que sí sube directorios;
 *      la versión anterior de este archivo NO subía, solo miraba CWD.
 *   2. Dentro de .bloom, buscar subcarpetas ".nucleus-*". Debe haber
 *      exactamente una — multi-org en el mismo workspace no está
 *      soportado ni acá ni en Go (mismo error explícito en ambos lados).
 *   3. Extraer el slug del nombre de carpeta.
 *   4. Leer .core/nucleus-config.json bajo esa carpeta. Si
 *      organization.slug está presente y no coincide con el slug de la
 *      carpeta, error explícito — no se pisa en silencio (mismo criterio
 *      que el chequeo de inconsistencia en loadNucleusConfigFrom, Go).
 *
 * Decisión que dejo marcada, no tomada en silencio: BLOOM_ORGANIZATION no
 * existe del lado Go. Acá lo dejo como una aserción de consistencia
 * post-scan (si está seteada y no matchea el slug encontrado, error) en
 * vez de como atajo que evita el scan — así no queda un segundo camino sin
 * validar. Si el criterio real es que la API no debería aceptar overrides
 * de ningún tipo (paridad total con CLI), se puede borrar este bloque
 * entero; lo dejo porque no sé si algún caller depende de él todavía.
 */
export async function resolveOrganization(
  startDir: string = process.cwd()
): Promise<OrganizationContext> {
  const { workspacePath, bloomDir } = findBloomDir(startDir);
  const { slug, nucleusDir } = await findNucleusDir(bloomDir);

  const orgFromEnv = process.env.BLOOM_ORGANIZATION;
  if (orgFromEnv && orgFromEnv !== slug) {
    throw new Error(
      `BLOOM_ORGANIZATION=${orgFromEnv} no coincide con el Nucleus encontrado ` +
        `en el workspace (slug="${slug}" en ${nucleusDir}). El lado Go no tiene ` +
        `override de env var — si necesitás forzar otra organización, cambiá el ` +
        `directorio de trabajo en lugar de pisar el resolver.`
    );
  }

  return buildOrgContext(workspacePath, slug, nucleusDir);
}

/**
 * Alias de compatibilidad: create-mandate.handler.ts y server.ts importan
 * `resolveOrg`, no `resolveOrganization`. Ese nombre ya estaba en uso del
 * lado de los callers antes de este fix — el archivo original nunca lo
 * exportó, así que esto ya estaba roto, solo que no compilaba contra los
 * callers reales todavía. Si `resolveOrg` en esos archivos espera una
 * firma distinta (otros argumentos, otro shape de retorno), este alias no
 * alcanza y hace falta ver esos dos archivos para ajustarlo de verdad.
 */
export const resolveOrg = resolveOrganization;

function findBloomDir(start: string): { workspacePath: string; bloomDir: string } {
  let dir = path.resolve(start);

  while (true) {
    const candidate = path.join(dir, BLOOM_DIR_NAME);
    if (existsSync(candidate)) {
      return { workspacePath: dir, bloomDir: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`No encontré carpeta ${BLOOM_DIR_NAME} subiendo desde ${start}`);
    }
    dir = parent;
  }
}

async function findNucleusDir(
  bloomDir: string
): Promise<{ slug: string; nucleusDir: string }> {
  const entries = await readdir(bloomDir, { withFileTypes: true });
  const matches = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith(NUCLEUS_PREFIX)
  );

  if (matches.length === 0) {
    throw new Error(`No encontré ninguna carpeta ${NUCLEUS_PREFIX}* dentro de ${bloomDir}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Encontré ${matches.length} carpetas ${NUCLEUS_PREFIX}* en ${bloomDir} ` +
        `(${matches.map((m) => m.name).join(', ')}) — multi-org en el mismo ` +
        `workspace no está soportado, indefinido cuál usar.`
    );
  }

  const dirName = matches[0].name;
  const slug = dirName.slice(NUCLEUS_PREFIX.length);
  if (!slug) {
    throw new Error(`Carpeta "${dirName}" en ${bloomDir} no tiene slug después del prefijo`);
  }

  return { slug, nucleusDir: path.join(bloomDir, dirName) };
}

async function buildOrgContext(
  workspacePath: string,
  slug: string,
  nucleusDir: string
): Promise<OrganizationContext> {
  const configPath = path.join(nucleusDir, NUCLEUS_CONFIG_REL_PATH);

  let rawContent: string;
  try {
    rawContent = await readFile(configPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `No pude leer ${configPath} (¿nucleus mal inicializado?): ${(err as Error).message}`
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawContent);
  } catch (err) {
    throw new Error(`nucleus-config.json inválido en ${configPath}: ${(err as Error).message}`);
  }

  const parsed = NucleusConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`nucleus-config.json inválido en ${configPath}: ${parsed.error.message}`);
  }

  const declaredSlug = parsed.data.organization?.slug;
  if (declaredSlug && declaredSlug !== slug) {
    throw new Error(
      `Inconsistencia de org: carpeta "${NUCLEUS_PREFIX}${slug}" pero ` +
        `nucleus-config.json declara organization.slug="${declaredSlug}" — revisar manualmente.`
    );
  }

  return {
    name: slug,
    fingerprint: `bloom:org:${slug}`,
    workspacePath,
    nucleusRoot: nucleusDir,
    batcaveRoot: path.join(nucleusDir, '.batcave'),
    ownershipPath: path.join(nucleusDir, '.ownership.json'),
    alfredContractPath: path.join(nucleusDir, '.core', '.ai_bot.sovereign.bl'),
    configPath,
    raw,
  };
}

/**
 * Valida .ownership.json para un OrganizationContext ya resuelto.
 * Separado de resolveOrganization() a propósito: el mecanismo de
 * resolución (paridad con Go) no depende de ownership.json, pero algunos
 * callers sí necesitan validarlo (ej: confirmar master_user antes de
 * firmar). Quien lo necesite, lo llama explícitamente.
 */
export async function loadOwnership(ctx: OrganizationContext) {
  const content = await readFile(ctx.ownershipPath, 'utf-8');
  return OwnershipSchema.parse(JSON.parse(content));
}

export function extractOrgName(fingerprint: string): string {
  const match = fingerprint.match(/^bloom:org:([a-z0-9-]+)$/);
  if (!match) {
    throw new Error(`Invalid organization fingerprint: ${fingerprint}`);
  }
  return match[1];
}
