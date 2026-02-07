import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { z } from 'zod';
import type { OrganizationContext } from '../utils/org-resolver.js';

const BatcaveConfigSchema = z.object({
  server: z.object({
    port_rest: z.number().default(48215),
    port_wss: z.number().default(4124),
    host: z.string().default('0.0.0.0')
  }).optional(),
  
  github: z.object({
    oauth_client_id: z.string().optional(),
    oauth_client_secret: z.string().optional(),
    callback_url: z.string().optional()
  }).optional(),
  
  security: z.object({
    nonce_ttl_seconds: z.number().default(300),
    session_ttl_seconds: z.number().default(86400)
  }).optional(),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    pretty: z.boolean().default(true)
  }).optional()
});

export type BatcaveConfig = z.infer<typeof BatcaveConfigSchema>;

/**
 * Load configuration with environment overrides
 */
export async function loadConfig(org: OrganizationContext): Promise<BatcaveConfig> {
  let fileConfig: BatcaveConfig = {};
  
  // Load from config file if exists
  if (existsSync(org.configPath)) {
    const content = await readFile(org.configPath, 'utf-8');
    fileConfig = JSON.parse(content);
  }
  
  // Merge with environment variables (env takes precedence)
  const config: BatcaveConfig = {
    server: {
      port_rest: parseInt(process.env.PORT_REST || String(fileConfig.server?.port_rest || 48215)),
      port_wss: parseInt(process.env.PORT_WSS || String(fileConfig.server?.port_wss || 4124)),
      host: process.env.HOST || fileConfig.server?.host || '0.0.0.0'
    },
    
    github: {
      oauth_client_id: process.env.GITHUB_OAUTH_CLIENT_ID || fileConfig.github?.oauth_client_id,
      oauth_client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET || fileConfig.github?.oauth_client_secret,
      callback_url: process.env.GITHUB_CALLBACK_URL || fileConfig.github?.callback_url
    },
    
    security: {
      nonce_ttl_seconds: parseInt(process.env.NONCE_TTL || String(fileConfig.security?.nonce_ttl_seconds || 300)),
      session_ttl_seconds: parseInt(process.env.SESSION_TTL || String(fileConfig.security?.session_ttl_seconds || 86400))
    },
    
    logging: {
      level: (process.env.LOG_LEVEL as any) || fileConfig.logging?.level || 'info',
      pretty: process.env.LOG_PRETTY === 'false' ? false : (fileConfig.logging?.pretty ?? true)
    }
  };
  
  // Validate
  return BatcaveConfigSchema.parse(config);
}

/**
 * Get Codespace URL if running in GitHub Codespaces
 */
export function getCodespaceUrl(port: number): string | null {
  const codespaceName = process.env.CODESPACE_NAME;
  const portForwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  
  if (codespaceName && portForwardingDomain) {
    return `https://${codespaceName}-${port}.${portForwardingDomain}`;
  }
  
  return null;
}
