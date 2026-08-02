import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const BLOOM_DIR_NAME = '.bloom';
const NUCLEUS_PREFIX = '.nucleus-';
const NUCLEUS_CONFIG_REL_PATH = path.join('.core', '.nucleus-config.json');

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
 *      .bloom que contenga un nucleus COMPLETO — no alcanza con que
 *      exista la carpeta .bloom; ver findValidNucleus() más abajo.
 *   2. Dentro de .bloom, buscar subcarpetas ".nucleus-*". Debe haber
 *      exactamente una — multi-org en el mismo workspace no está
 *      soportado ni acá ni en Go (mismo error explícito en ambos lados,
 *      y este caso SÍ es un hard-stop, no sigue subiendo — es ambigüedad,
 *      no ausencia).
 *   3. Extraer el slug del nombre de carpeta.
 *   4. Leer .core/nucleus-config.json bajo esa carpeta. Si
 *      organization.slug está presente y no coincide con el slug de la
 *      carpeta, error explícito — no se pisa en silencio (mismo criterio
 *      que el chequeo de inconsistencia en loadNucleusConfigFrom, Go).
 *
 * FIX (nucleus incompleto/huérfano): si un .bloom existe pero le falta la
 * carpeta .nucleus-{slug} o el .core/.nucleus-config.json adentro, ya NO
 * se trata como el nucleus real ni se lanza error ahí mismo — se sigue
 * subiendo, como si esa carpeta .bloom no existiera. Motivo: callers que
 * arman mal un workspacePath (ej: pasan la ruta de un proyecto individual
 * en vez de la raíz del workspace) pueden terminar con mkdir({recursive:
 * true}) creando un .bloom "cáscara" en un lugar que no es el nucleus real
 * — sin .core/.nucleus-config.json, porque nunca pasó por
 * buildOrgContext(). Antes de este fix, ese .bloom huérfano quedaba
 * "tapando" permanentemente al .bloom válido de un ancestro: cualquier
 * resolución futura encontraba el huérfano primero, paraba de subir, y
 * explotaba con "¿nucleus mal inicializado?" — un estado que no se
 * autoreparaba nunca, ni siquiera después de arreglar el bug que lo causó,
 * porque el archivo huérfano seguía en disco. Con este fix, un .bloom
 * incompleto ya no bloquea la búsqueda: se sigue subiendo hasta encontrar
 * un nucleus completo, o hasta llegar a la raíz del filesystem.
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
  const { workspacePath, slug, nucleusDir } = await findValidNucleus(startDir);

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

/**
 * Sube desde `startDir` buscando el primer nucleus COMPLETO: una carpeta
 * .bloom que contenga exactamente una subcarpeta .nucleus-{slug}, que a su
 * vez contenga .core/.nucleus-config.json.
 *
 * Un .bloom que existe pero no cumple esto (nucleus incompleto/huérfano)
 * NO se devuelve ni se trata como error inmediato — se registra en
 * `skipped` y se sigue subiendo. Solo se lanza error cuando se llega a la
 * raíz del filesystem sin encontrar ningún nucleus completo; en ese caso
 * el mensaje distingue si no se encontró NINGÚN .bloom, o si se
 * encontraron .bloom pero todos incompletos (más útil para debuggear).
 *
 * Excepción: múltiples carpetas .nucleus-* dentro de un mismo .bloom es
 * ambigüedad, no ausencia — eso sigue siendo un hard-stop inmediato, igual
 * que antes.
 */
async function findValidNucleus(
  startDir: string
): Promise<{ workspacePath: string; slug: string; nucleusDir: string }> {
  let dir = path.resolve(startDir);
  const skipped: string[] = [];

  while (true) {
    const bloomCandidate = path.join(dir, BLOOM_DIR_NAME);

    if (existsSync(bloomCandidate)) {
      const entries = await readdir(bloomCandidate, { withFileTypes: true });
      const matches = entries.filter(
        (e) => e.isDirectory() && e.name.startsWith(NUCLEUS_PREFIX)
      );

      if (matches.length > 1) {
        // Ambigüedad real dentro de este .bloom — no tiene sentido seguir
        // subiendo a buscar otro nucleus, el problema está acá.
        throw new Error(
          `Encontré ${matches.length} carpetas ${NUCLEUS_PREFIX}* en ${bloomCandidate} ` +
            `(${matches.map((m) => m.name).join(', ')}) — multi-org en el mismo ` +
            `workspace no está soportado, indefinido cuál usar.`
        );
      }

      if (matches.length === 1) {
        const dirName = matches[0].name;
        const slug = dirName.slice(NUCLEUS_PREFIX.length);
        if (!slug) {
          throw new Error(
            `Carpeta "${dirName}" en ${bloomCandidate} no tiene slug después del prefijo`
          );
        }
        const nucleusDir = path.join(bloomCandidate, dirName);
        const configPath = path.join(nucleusDir, NUCLEUS_CONFIG_REL_PATH);

        if (existsSync(configPath)) {
          return { workspacePath: dir, slug, nucleusDir };
        }

        // .nucleus-{slug} existe pero sin .core/.nucleus-config.json —
        // nucleus incompleto. No lo tratamos como válido; seguimos
        // subiendo por si hay un ancestro con un nucleus completo.
        skipped.push(nucleusDir);
      } else {
        // .bloom existe pero no tiene ninguna carpeta .nucleus-* adentro.
        skipped.push(bloomCandidate);
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      if (skipped.length > 0) {
        throw new Error(
          `Encontré ${skipped.length} carpeta(s) de nucleus incompletas subiendo desde ` +
            `${startDir} (${skipped.join(', ')}) pero ninguna tiene ` +
            `.core/.nucleus-config.json — nucleus mal inicializado.`
        );
      }
      throw new Error(`No encontré carpeta ${BLOOM_DIR_NAME} subiendo desde ${startDir}`);
    }
    dir = parent;
  }
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
    // findValidNucleus() ya confirmó existsSync(configPath) === true antes
    // de devolver este nucleusDir, así que llegar acá significa una falla
    // real (permisos, TOCTOU, etc.) — no un nucleus simplemente ausente.
    // No tiene sentido reintentar subiendo: el archivo existía hace un
    // instante y algo más concreto está fallando.
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
