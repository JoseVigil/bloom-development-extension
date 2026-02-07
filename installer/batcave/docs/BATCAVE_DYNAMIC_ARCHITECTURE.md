# BATCAVE DYNAMIC ARCHITECTURE
## Multi-Tenant Sovereign Control Plane

---

## CRITICAL DESIGN PRINCIPLE

**NO HARDCODED VALUES. EVERYTHING DERIVES FROM `{organization}`.**

```typescript
// ❌ FORBIDDEN
const nucleusPath = '.bloom/.nucleus-bloom-acme';
const ownershipFile = '.ownership.json';

// ✅ REQUIRED
const nucleusPath = `.bloom/.nucleus-${organization}`;
const ownershipFile = path.join(nucleusPath, '.ownership.json');
```

---

## DIRECTORY STRUCTURE (DYNAMIC)

```
simulation_env/
├── .bloom/
│   └── .nucleus-{organization}/              # Organization namespace root
│       ├── .batcave/                          # Sovereign Control Plane
│       │   ├── src/
│       │   │   ├── core/
│       │   │   │   ├── relay-engine.ts
│       │   │   │   ├── blind-judge.ts
│       │   │   │   └── alfred.ts
│       │   │   ├── api/
│       │   │   │   ├── rest/
│       │   │   │   │   ├── index.ts
│       │   │   │   │   ├── middleware/
│       │   │   │   │   │   ├── github-oauth.ts
│       │   │   │   │   │   └── org-validator.ts  # NEW: Validates org context
│       │   │   │   │   └── routes/
│       │   │   │   │       ├── status.ts
│       │   │   │   │       ├── sovereign-link.ts
│       │   │   │   │       └── commands.ts
│       │   │   │   └── ws/
│       │   │   │       ├── server.ts
│       │   │   │       └── handlers/
│       │   │   │           ├── auth.ts
│       │   │   │           ├── ai-stream.ts
│       │   │   │           └── heartbeat.ts
│       │   │   ├── security/
│       │   │   │   ├── ownership-loader.ts
│       │   │   │   ├── signature-verifier.ts
│       │   │   │   ├── nonce-manager.ts
│       │   │   │   └── lockdown.ts
│       │   │   ├── tunnel/
│       │   │   │   ├── manager.ts
│       │   │   │   ├── nucleus-client.ts
│       │   │   │   └── brain-client.ts
│       │   │   ├── config/
│       │   │   │   ├── loader.ts              # NEW: Dynamic config loader
│       │   │   │   └── paths.ts               # NEW: Organization path resolver
│       │   │   ├── utils/
│       │   │   │   ├── logger.ts
│       │   │   │   ├── qr-generator.ts
│       │   │   │   └── org-resolver.ts        # NEW: Organization detection
│       │   │   ├── types/
│       │   │   │   ├── ownership.ts
│       │   │   │   ├── commands.ts
│       │   │   │   ├── tunnel.ts
│       │   │   │   ├── organization.ts        # NEW: Org types
│       │   │   │   └── events.ts
│       │   │   └── index.ts
│       │   ├── config/
│       │   │   └── batcave.config.json        # Organization-specific config
│       │   ├── .data/                         # Runtime data (ephemeral)
│       │   │   ├── tunnels/
│       │   │   ├── sessions/
│       │   │   └── nonces/
│       │   ├── .logs/                         # Organization-scoped logs
│       │   │   ├── governance/
│       │   │   ├── security/
│       │   │   └── relay/
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   ├── .env.{organization}            # Org-specific environment
│       │   └── README.md
│       │
│       ├── .core/
│       │   ├── .ai_bot.governance.bl
│       │   ├── .ai_bot.plane.bl
│       │   ├── .ai_bot.sovereign.bl           # ← Alfred contract (REAL)
│       │   ├── .rules.bl
│       │   └── nucleus-config.json
│       │
│       ├── .governance/
│       │   ├── .architecture/
│       │   ├── .quality/
│       │   └── .security/
│       │
│       ├── .intents/
│       │   ├── .cor/
│       │   └── .exp/
│       │
│       ├── .relations/
│       │
│       ├── reports/
│       │   └── exports/
│       │
│       └── .ownership.json                    # ← Organization ownership (REAL)
│
└── .env.local                                 # Local machine config
```

---

## ORGANIZATION RESOLUTION SYSTEM

### 1. Organization Detection

#### `src/config/org-resolver.ts`
```typescript
import { readFile } from 'fs/promises';
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
  nucleusRoot: string;              // e.g., "./bloom/.nucleus-acme"
  batcaveRoot: string;              // e.g., "./bloom/.nucleus-acme/.batcave"
  ownershipPath: string;            // e.g., "./bloom/.nucleus-acme/.ownership.json"
  alfredContractPath: string;       // e.g., "./bloom/.nucleus-acme/.core/.ai_bot.sovereign.bl"
  configPath: string;               // e.g., "./bloom/.nucleus-acme/.batcave/config/batcave.config.json"
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
    configPath: path.join(nucleusRoot, '.batcave', 'config', 'batcave.config.json')
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
```

---

### 2. Dynamic Path Resolution

#### `src/config/paths.ts`
```typescript
import path from 'path';
import type { OrganizationContext } from './org-resolver.js';

export class PathResolver {
  constructor(private org: OrganizationContext) {}
  
  // Core paths
  get nucleus(): string {
    return this.org.nucleusRoot;
  }
  
  get batcave(): string {
    return this.org.batcaveRoot;
  }
  
  get ownership(): string {
    return this.org.ownershipPath;
  }
  
  get alfredContract(): string {
    return this.org.alfredContractPath;
  }
  
  // Batcave internal paths
  get batcaveData(): string {
    return path.join(this.org.batcaveRoot, '.data');
  }
  
  get batcaveLogs(): string {
    return path.join(this.org.batcaveRoot, '.logs');
  }
  
  get batcaveConfig(): string {
    return this.org.configPath;
  }
  
  // Governance paths
  get governance(): string {
    return path.join(this.org.nucleusRoot, '.governance');
  }
  
  get securityStandards(): string {
    return path.join(this.governance, '.security', '.security-standards.bl');
  }
  
  // Intent paths
  get intents(): string {
    return path.join(this.org.nucleusRoot, '.intents');
  }
  
  // Reports paths
  get reports(): string {
    return path.join(this.org.nucleusRoot, 'reports');
  }
  
  get exports(): string {
    return path.join(this.reports, 'exports');
  }
  
  // Dynamic data paths
  tunnelState(tunnelId: string): string {
    return path.join(this.batcaveData, 'tunnels', `${tunnelId}.json`);
  }
  
  sessionData(sessionId: string): string {
    return path.join(this.batcaveData, 'sessions', `${sessionId}.json`);
  }
  
  nonceCache(nonceId: string): string {
    return path.join(this.batcaveData, 'nonces', `${nonceId}.json`);
  }
  
  // Log paths
  governanceLog(date: string): string {
    return path.join(this.batcaveLogs, 'governance', `${date}.log`);
  }
  
  securityLog(date: string): string {
    return path.join(this.batcaveLogs, 'security', `${date}.log`);
  }
  
  relayLog(date: string): string {
    return path.join(this.batcaveLogs, 'relay', `${date}.log`);
  }
}
```

---

### 3. Dynamic Configuration Loader

#### `src/config/loader.ts`
```typescript
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { z } from 'zod';
import type { OrganizationContext } from './org-resolver.js';

const BatcaveConfigSchema = z.object({
  organization: z.string(),
  
  server: z.object({
    rest_port: z.number().default(48215),
    wss_port: z.number().default(4124),
    host: z.string().default('0.0.0.0')
  }),
  
  security: z.object({
    qr_ttl_seconds: z.number().default(30),
    nonce_ttl_seconds: z.number().default(30),
    max_pending_commands: z.number().default(100),
    lockdown_on_signature_fail: z.boolean().default(true)
  }),
  
  tunnel: z.object({
    heartbeat_interval_ms: z.number().default(30000),
    reconnect_delay_ms: z.number().default(5000),
    max_reconnect_attempts: z.number().default(5)
  }),
  
  alfred: z.object({
    stream_chunk_size: z.number().default(1024),
    max_concurrent_sessions: z.number().default(10)
  }),
  
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    governance_events: z.boolean().default(true),
    security_events: z.boolean().default(true),
    relay_events: z.boolean().default(true)
  }),
  
  endpoints: z.object({
    codespace_name: z.string().optional(),
    codespace_domain: z.string().optional(),
    custom_domain: z.string().optional()
  })
});

export type BatcaveConfig = z.infer<typeof BatcaveConfigSchema>;

export async function loadBatcaveConfig(org: OrganizationContext): Promise<BatcaveConfig> {
  const configPath = org.configPath;
  
  // Create default config if doesn't exist
  if (!existsSync(configPath)) {
    return createDefaultConfig(org);
  }
  
  const content = await readFile(configPath, 'utf-8');
  const parsed = JSON.parse(content);
  
  return BatcaveConfigSchema.parse(parsed);
}

function createDefaultConfig(org: OrganizationContext): BatcaveConfig {
  return {
    organization: org.name,
    server: {
      rest_port: 48215,
      wss_port: 4124,
      host: '0.0.0.0'
    },
    security: {
      qr_ttl_seconds: 30,
      nonce_ttl_seconds: 30,
      max_pending_commands: 100,
      lockdown_on_signature_fail: true
    },
    tunnel: {
      heartbeat_interval_ms: 30000,
      reconnect_delay_ms: 5000,
      max_reconnect_attempts: 5
    },
    alfred: {
      stream_chunk_size: 1024,
      max_concurrent_sessions: 10
    },
    logging: {
      level: 'info',
      governance_events: true,
      security_events: true,
      relay_events: true
    },
    endpoints: {
      codespace_name: process.env.CODESPACE_NAME,
      codespace_domain: process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    }
  };
}
```

---

## UPDATED CORE MODULES

### `src/index.ts` (Entry Point)
```typescript
import { startBatcave } from './core/batcave.js';
import { resolveOrganization } from './config/org-resolver.js';
import { PathResolver } from './config/paths.js';
import { loadBatcaveConfig } from './config/loader.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

async function main() {
  try {
    // 1. Resolve organization context
    logger.info('Resolving organization context...');
    const org = await resolveOrganization();
    logger.info({ 
      organization: org.name, 
      fingerprint: org.fingerprint,
      nucleusRoot: org.nucleusRoot 
    }, 'Organization resolved');
    
    // 2. Initialize path resolver
    const paths = new PathResolver(org);
    
    // 3. Load organization-specific config
    const config = await loadBatcaveConfig(org);
    
    // 4. Load environment variables (org-specific)
    const envPath = `${paths.batcave}/.env.${org.name}`;
    dotenv.config({ path: envPath });
    
    // 5. Start Batcave with organization context
    logger.info('🦇 Initializing Bloom Batcave...');
    await startBatcave(org, paths, config);
    
  } catch (error) {
    logger.fatal(error, 'Failed to start Batcave');
    process.exit(1);
  }
}

main();
```

---

### `src/core/batcave.ts` (Updated)
```typescript
import { RelayEngine } from './relay-engine.js';
import { BlindJudge } from './blind-judge.js';
import { Alfred } from './alfred.js';
import { startRestAPI } from '../api/rest/index.js';
import { startWebSocketServer } from '../api/ws/server.js';
import { loadOwnership } from '../security/ownership-loader.js';
import { logger } from '../utils/logger.js';
import type { OrganizationContext } from '../config/org-resolver.js';
import type { PathResolver } from '../config/paths.js';
import type { BatcaveConfig } from '../config/loader.js';

export async function startBatcave(
  org: OrganizationContext,
  paths: PathResolver,
  config: BatcaveConfig
) {
  // 1. Load ownership manifest (from organization-specific path)
  const ownership = await loadOwnership(paths.ownership);
  
  // Validate organization match
  if (ownership.organization_fingerprint !== org.fingerprint) {
    throw new Error(
      `Organization mismatch: expected ${org.fingerprint}, got ${ownership.organization_fingerprint}`
    );
  }
  
  logger.info({ 
    organization: org.name,
    fingerprint: ownership.organization_fingerprint,
    master: ownership.master_user
  }, 'Ownership validated');
  
  // 2. Initialize security layer
  const blindJudge = new BlindJudge(ownership, config, paths);
  
  // 3. Initialize relay engine
  const relayEngine = new RelayEngine(blindJudge, config, paths, org);
  
  // 4. Initialize Alfred (with organization-specific contract)
  const alfred = new Alfred(
    relayEngine, 
    blindJudge, 
    paths.alfredContract,
    org
  );
  
  // 5. Start REST API
  const restAPI = await startRestAPI(
    relayEngine, 
    blindJudge, 
    alfred, 
    config,
    org
  );
  logger.info({ 
    port: config.server.rest_port,
    organization: org.name
  }, 'REST API listening');
  
  // 6. Start WebSocket server
  const wss = await startWebSocketServer(
    alfred, 
    blindJudge, 
    config,
    org
  );
  logger.info({ 
    port: config.server.wss_port,
    organization: org.name
  }, 'WebSocket server listening');
  
  // 7. Wait for local tunnel
  logger.info({ organization: org.name }, 'Waiting for local sovereign tunnel...');
  relayEngine.waitForTunnel();
}
```

---

### `src/security/ownership-loader.ts` (Updated)
```typescript
import { readFile } from 'fs/promises';
import { z } from 'zod';
import type { OwnershipManifest } from '../types/ownership.js';

const OwnershipSchema = z.object({
  organization_fingerprint: z.string().regex(/^bloom:org:[a-z0-9-]+$/),
  organization_name: z.string(),
  master_user: z.string(),
  key_fingerprint: z.string(),
  created_at: z.number(),
  sovereignty_metadata: z.object({
    sovereign_machine_id: z.string(),
    initialization_timestamp: z.number(),
    authority_chain: z.array(z.string())
  }).optional()
});

export async function loadOwnership(ownershipPath: string): Promise<OwnershipManifest> {
  const content = await readFile(ownershipPath, 'utf-8');
  const data = JSON.parse(content);
  
  return OwnershipSchema.parse(data);
}
```

---

## ORGANIZATION-SCOPED ENDPOINTS

### Dynamic Endpoint Generation

```typescript
// src/utils/endpoint-generator.ts

import type { OrganizationContext } from '../config/org-resolver.js';
import type { BatcaveConfig } from '../config/loader.js';

export class EndpointGenerator {
  constructor(
    private org: OrganizationContext,
    private config: BatcaveConfig
  ) {}
  
  /**
   * Generate Batcave public REST endpoint
   */
  getRestEndpoint(): string {
    if (this.config.endpoints.custom_domain) {
      return `https://${this.org.name}.${this.config.endpoints.custom_domain}`;
    }
    
    if (this.config.endpoints.codespace_name) {
      const { codespace_name, codespace_domain } = this.config.endpoints;
      return `https://${codespace_name}-${this.config.server.rest_port}.${codespace_domain}`;
    }
    
    return `http://localhost:${this.config.server.rest_port}`;
  }
  
  /**
   * Generate Batcave public WSS endpoint
   */
  getWssEndpoint(): string {
    if (this.config.endpoints.custom_domain) {
      return `wss://${this.org.name}-ws.${this.config.endpoints.custom_domain}`;
    }
    
    if (this.config.endpoints.codespace_name) {
      const { codespace_name, codespace_domain } = this.config.endpoints;
      return `wss://${codespace_name}-${this.config.server.wss_port}.${codespace_domain}`;
    }
    
    return `ws://localhost:${this.config.server.wss_port}`;
  }
  
  /**
   * Generate organization-scoped QR payload
   */
  generateQRPayload(nonce: string, expiresAt: number): object {
    return {
      organization_fingerprint: this.org.fingerprint,
      organization_name: this.org.name,
      device_id: `batcave-${this.org.name}`,
      batcave_endpoint_rest: this.getRestEndpoint(),
      batcave_endpoint_wss: this.getWssEndpoint(),
      nonce,
      expires_at: expiresAt,
      protocol_version: 'bloom-batcave-v1'
    };
  }
}
```

---

## MULTI-TENANT LOGGING

### Organization-Scoped Logger

```typescript
// src/utils/logger.ts (Updated)

import pino from 'pino';
import { mkdir } from 'fs/promises';
import path from 'path';
import type { OrganizationContext } from '../config/org-resolver.js';

export async function createOrgLogger(org: OrganizationContext, logType: 'governance' | 'security' | 'relay') {
  const logDir = path.join(org.batcaveRoot, '.logs', logType);
  await mkdir(logDir, { recursive: true });
  
  const date = new Date().toISOString().split('T')[0];
  const logFile = path.join(logDir, `${date}.log`);
  
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    base: {
      organization: org.name,
      fingerprint: org.fingerprint,
      log_type: logType
    },
    transport: {
      targets: [
        {
          target: 'pino-pretty',
          level: 'info',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        },
        {
          target: 'pino/file',
          level: 'info',
          options: {
            destination: logFile,
            mkdir: true
          }
        }
      ]
    }
  });
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
});
```

---

## ENVIRONMENT CONFIGURATION

### `.env.{organization}` Template
```bash
# Organization Context
BLOOM_ORGANIZATION=acme

# GitHub OAuth (organization-specific app)
GITHUB_OAUTH_CLIENT_ID=Iv1.org-acme-client-id
GITHUB_OAUTH_CLIENT_SECRET=org-acme-secret
GITHUB_CALLBACK_URL=https://acme-batcave.bloom.io/auth/github/callback

# Server (defaults from config)
PORT_REST=48215
PORT_WSS=4124
NODE_ENV=production

# Codespace (auto-injected by GitHub)
CODESPACE_NAME=${CODESPACE_NAME}
GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}

# Custom domain (optional)
CUSTOM_DOMAIN=batcave.bloom.io

# Logging
LOG_LEVEL=info
```

---

## STARTUP SCRIPT (ORGANIZATION-AWARE)

### `scripts/start-batcave.sh`
```bash
#!/bin/bash

# Detect organization from environment or discovery
if [ -z "$BLOOM_ORGANIZATION" ]; then
  echo "🔍 No BLOOM_ORGANIZATION set, discovering..."
  
  # Find first .nucleus-* directory
  NUCLEUS_DIR=$(find .bloom -maxdepth 1 -type d -name '.nucleus-*' | head -n 1)
  
  if [ -z "$NUCLEUS_DIR" ]; then
    echo "❌ No Nucleus found. Initialize organization first."
    exit 1
  fi
  
  # Extract organization name
  export BLOOM_ORGANIZATION=$(basename "$NUCLEUS_DIR" | sed 's/\.nucleus-//')
fi

echo "🦇 Starting Batcave for organization: $BLOOM_ORGANIZATION"

# Navigate to batcave directory
BATCAVE_DIR=".bloom/.nucleus-$BLOOM_ORGANIZATION/.batcave"

if [ ! -d "$BATCAVE_DIR" ]; then
  echo "❌ Batcave not found at $BATCAVE_DIR"
  exit 1
fi

cd "$BATCAVE_DIR"

# Load organization-specific environment
if [ -f ".env.$BLOOM_ORGANIZATION" ]; then
  export $(cat ".env.$BLOOM_ORGANIZATION" | xargs)
fi

# Ensure dependencies
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build if needed
if [ ! -d "dist" ]; then
  echo "🔨 Building Batcave..."
  npm run build
fi

# Start server
echo "🚀 Launching Batcave Control Plane..."
npm start
```

---

## PACKAGE.JSON (UPDATED)

```json
{
  "name": "@bloom/batcave",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "init": "node scripts/init-org.js"
  },
  "dependencies": {
    "fastify": "^4.26.0",
    "@fastify/cors": "^8.5.0",
    "@fastify/oauth2": "^7.8.0",
    "ws": "^8.16.0",
    "tweetnacl": "^1.0.3",
    "tweetnacl-util": "^0.15.1",
    "qrcode": "^1.5.3",
    "pino": "^8.17.2",
    "pino-pretty": "^10.3.1",
    "dotenv": "^16.3.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "@types/qrcode": "^1.5.5",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0"
  }
}
```

---

## INITIALIZATION WORKFLOW

### 1. Initialize Organization (First Time)

```bash
# Set organization name
export BLOOM_ORGANIZATION=acme

# Create nucleus structure
mkdir -p .bloom/.nucleus-acme/{.core,.governance,.intents,.relations,reports}

# Create .ownership.json
cat > .bloom/.nucleus-acme/.ownership.json << EOF
{
  "organization_fingerprint": "bloom:org:acme",
  "organization_name": "acme",
  "master_user": "github_username",
  "key_fingerprint": "ed25519:SHA256:abc123",
  "created_at": $(date +%s)000
}
EOF

# Copy Alfred contract
cp path/to/.ai_bot.sovereign.bl .bloom/.nucleus-acme/.core/

# Initialize Batcave
cd .bloom/.nucleus-acme
npx degit your-org/batcave-template .batcave
cd .batcave
npm install
```

### 2. Start Batcave

```bash
# From project root
BLOOM_ORGANIZATION=acme bash .bloom/.nucleus-acme/.batcave/scripts/start-batcave.sh

# OR from batcave directory
cd .bloom/.nucleus-acme/.batcave
npm start
```

---

## CRITICAL INVARIANTS

```typescript
// All code must respect these invariants:

INVARIANT-ORG-001: No hardcoded organization names
INVARIANT-ORG-002: All paths derive from OrganizationContext
INVARIANT-ORG-003: Configs load from org-specific files
INVARIANT-ORG-004: Logs segregated by organization
INVARIANT-ORG-005: Endpoints namespaced by organization
INVARIANT-ORG-006: Runtime data isolated per organization
INVARIANT-ORG-007: .ownership.json is source of truth for org identity
```

---

## VALIDATION CHECKLIST

```
Organization Resolution:
[ ] BLOOM_ORGANIZATION environment variable works
[ ] Auto-discovery from .bloom directory works
[ ] Organization fingerprint validated against .ownership.json

Path Resolution:
[ ] All file access uses PathResolver
[ ] No hardcoded paths in codebase
[ ] .ownership.json loaded from org-specific location
[ ] Alfred contract loaded from org-specific location

Configuration:
[ ] Config loads from .batcave/config/batcave.config.json
[ ] Environment loads from .env.{organization}
[ ] All settings override properly

Logging:
[ ] Logs write to .batcave/.logs/{governance,security,relay}
[ ] Each log entry tagged with organization
[ ] Log rotation works per organization

Multi-Tenant:
[ ] Multiple organizations can coexist in .bloom/
[ ] Each organization isolated in separate .nucleus-{org}
[ ] No data leakage between organizations
```

---

**END OF DYNAMIC ARCHITECTURE**
