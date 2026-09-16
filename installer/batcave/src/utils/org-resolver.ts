import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const OwnershipSchema = z.object({
  organization_fingerprint: z.string().regex(/^bloom:org:[a-z0-9-]+$/),
  organization_name: z.string(),
  master_user: z.string(),
  key_fingerprint: z.string(),
  created_at: z.number(),
  // Fase 4 — Sovereign Tenant (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.4.2),
  // autorizada por Jose 2026-09-16. Opcional a propósito: los .ownership.json que ya
  // existen en producción no tienen este campo y no deben dejar de parsear por su
  // ausencia. Puramente informativo (Tenant confirmado como descriptivo, sin fingerprint
  // criptográficamente verificable — §5/§6.4 de la Propuesta) — discoverTenant() no lo
  // valida entre organizaciones, sólo lo reporta si está presente.
  tenant_fingerprint: z.string().regex(/^bloom:tenant:[a-z0-9-]+$/).optional()
});

export interface OrganizationContext {
  name: string;                    // e.g., "acme"
  fingerprint: string;              // e.g., "bloom:org:acme"
  nucleusRoot: string;              // e.g., ".bloom/.nucleus-acme"
  batcaveRoot: string;              // e.g., ".bloom/.nucleus-acme/.batcave"
  ownershipPath: string;            // e.g., ".bloom/.nucleus-acme/.ownership.json"
  alfredContractPath: string;       // e.g., ".bloom/.nucleus-acme/.core/.ai_bot.sovereign.bl"
  configPath: string;               // e.g., ".bloom/.nucleus-acme/.batcave/config/config.json"
}

/**
 * Detects organization from environment or discovery
 */
export async function resolveOrganization(): Promise<OrganizationContext> {
  // 1. Try from environment variable
  const orgFromEnv = process.env.BLOOM_ORGANIZATION;
  if (orgFromEnv) {
    return buildOrgContext(orgFromEnv);
  }

  // 2. Discover from filesystem (scan .bloom directory)
  const discovered = await discoverOrganization();
  if (discovered) {
    return discovered;
  }

  throw new Error('Cannot resolve organization. Set BLOOM_ORGANIZATION or ensure .ownership.json exists.');
}

/**
 * Build organization context from name
 */
function buildOrgContext(orgName: string): OrganizationContext {
  const nucleusRoot = path.join(process.cwd(), '.bloom', `.nucleus-${orgName}`);

  if (!existsSync(nucleusRoot)) {
    throw new Error(`Nucleus not found for organization: ${orgName} at ${nucleusRoot}`);
  }

  return {
    name: orgName,
    fingerprint: `bloom:org:${orgName}`,
    nucleusRoot,
    batcaveRoot: path.join(nucleusRoot, '.batcave'),
    ownershipPath: path.join(nucleusRoot, '.ownership.json'),
    alfredContractPath: path.join(nucleusRoot, '.core', '.ai_bot.sovereign.bl'),
    configPath: path.join(nucleusRoot, '.batcave', 'config', 'config.json')
  };
}

/**
 * Discover organization by scanning .bloom directory
 */
async function discoverOrganization(): Promise<OrganizationContext | null> {
  const bloomDir = path.join(process.cwd(), '.bloom');

  if (!existsSync(bloomDir)) {
    return null;
  }

  const entries = await readdir(bloomDir);

  for (const entry of entries) {
    if (entry.startsWith('.nucleus-')) {
      const orgName = entry.replace('.nucleus-', '');
      const ownershipPath = path.join(bloomDir, entry, '.ownership.json');

      if (existsSync(ownershipPath)) {
        // Validate ownership file
        const content = await readFile(ownershipPath, 'utf-8');
        const ownership = OwnershipSchema.parse(JSON.parse(content));

        return buildOrgContext(orgName);
      }
    }
  }

  return null;
}

export interface TenantDiscoveryResult {
  // Primer tenant_fingerprint encontrado entre las organizaciones descubiertas, o null si
  // ninguna lo declara. No se valida que todas coincidan — Tenant es puramente
  // descriptivo por ahora (ver comentario en OwnershipSchema); si en el futuro necesita
  // ser verificable, ese chequeo se agrega ahí, no acá.
  fingerprint: string | null;
  organizations: OrganizationContext[];
}

/**
 * Fase 4 — Sovereign Tenant (Propuesta_Arquitectura_Tenant_Soberano_v0_1.md §2.4.1),
 * autorizada por Jose 2026-09-16: a diferencia de discoverOrganization() (usado por
 * resolveOrganization(), sin cambios, sigue devolviendo la PRIMERA organización que
 * encuentra — ningún caller existente cambia de comportamiento), discoverTenant()
 * recorre TODAS las carpetas `.nucleus-*` bajo `.bloom` y devuelve el contexto de cada
 * una, para que un cliente (UI, Alfred, Batcave) pueda enumerar todas las organizaciones
 * de la instancia antes de elegir una.
 *
 * Mismo criterio que discoverOrganization() para qué cuenta como organización: una
 * carpeta `.nucleus-*` sin `.ownership.json` no es una organización todavía, se ignora
 * sin error (una instalación a medio provisionar es un estado válido). Un
 * `.ownership.json` presente pero inválido/corrupto, en cambio, SÍ es un error real y se
 * propaga (falla explícito) — exactamente la misma regla que ya aplica
 * discoverOrganization(), no una nueva.
 */
export async function discoverTenant(): Promise<TenantDiscoveryResult> {
  const bloomDir = path.join(process.cwd(), '.bloom');

  if (!existsSync(bloomDir)) {
    return { fingerprint: null, organizations: [] };
  }

  const entries = await readdir(bloomDir);
  const organizations: OrganizationContext[] = [];
  let fingerprint: string | null = null;

  // Orden determinístico (alfabético por entrada de directorio) — readdir() no garantiza
  // ningún orden particular entre filesystems/plataformas.
  for (const entry of [...entries].sort()) {
    if (!entry.startsWith('.nucleus-')) continue;
    const orgName = entry.replace('.nucleus-', '');
    const ownershipPath = path.join(bloomDir, entry, '.ownership.json');
    if (!existsSync(ownershipPath)) continue;

    const content = await readFile(ownershipPath, 'utf-8');
    const ownership = OwnershipSchema.parse(JSON.parse(content));

    organizations.push(buildOrgContext(orgName));
    if (ownership.tenant_fingerprint && fingerprint === null) {
      fingerprint = ownership.tenant_fingerprint;
    }
  }

  return { fingerprint, organizations };
}

/**
 * Extract organization name from fingerprint
 */
export function extractOrgName(fingerprint: string): string {
  const match = fingerprint.match(/^bloom:org:([a-z0-9-]+)$/);
  if (!match) {
    throw new Error(`Invalid organization fingerprint: ${fingerprint}`);
  }
  return match[1];
}
