import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { z } from 'zod';

const OwnershipSchema = z.object({
  organization_fingerprint: z.string().regex(/^bloom:org:[a-z0-9-]+$/),
  organization_name: z.string(),
  master_user: z.string(),
  key_fingerprint: z.string(),
  created_at: z.number()
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
