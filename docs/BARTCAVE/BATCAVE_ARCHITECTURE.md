# BATCAVE — Arquitectura del Control Plane Soberano
## Multi-Tenant Sovereign Control Plane · v1.0

---

## Índice

1. [Principio de diseño crítico](#1-principio-de-diseño-crítico)
2. [Rol de Batcave en el ecosistema Bloom](#2-rol-de-batcave-en-el-ecosistema-bloom)
3. [Estructura de directorios](#3-estructura-de-directorios)
4. [Sistema de resolución de organización](#4-sistema-de-resolución-de-organización)
5. [Módulos principales](#5-módulos-principales)
6. [Configuración dinámica](#6-configuración-dinámica)
7. [Endpoints organizacionales](#7-endpoints-organizacionales)
8. [Logging multi-tenant](#8-logging-multi-tenant)
9. [Alfred — El Agente Remoto Soberano](#9-alfred--el-agente-remoto-soberano)
10. [Workflow de inicialización](#10-workflow-de-inicialización)
11. [Invariantes críticos](#11-invariantes-críticos)
12. [Checklist de validación](#12-checklist-de-validación)

---

## 1. Principio de diseño crítico

**SIN VALORES HARDCODEADOS. TODO DERIVA DE `{organization}`.**

```typescript
// ❌ PROHIBIDO
const nucleusPath = '.bloom/.nucleus-bloom-acme';
const ownershipFile = '.ownership.json';

// ✅ REQUERIDO
const nucleusPath = `.bloom/.nucleus-${organization}`;
const ownershipFile = path.join(nucleusPath, '.ownership.json');
```

Batcave es multi-tenant por diseño. Cada organización tiene su propio namespace aislado, su propia configuración, sus propios logs y su propia instancia de Alfred. Ningún valor puede estar quemado en el código.

---

## 2. Rol de Batcave en el ecosistema Bloom

Batcave es el **control plane soberano remoto** del ecosistema Bloom. Corre en GitHub Codespaces y actúa como punto de contacto seguro entre el mundo exterior (aplicaciones móviles, bots, agentes remotos) y el sistema local donde vive Nucleus.

Sus tres responsabilidades son distintas e independientes:

| Responsabilidad | Descripción |
|---|---|
| **Canal de actualización** | Mirror inteligente que distribuye manifests firmados e ion recipes desde el servidor de origen hacia las instalaciones de Nucleus |
| **Sovereign Link** | Túnel seguro que permite a clientes autorizados conectarse al sistema local vía WebSocket |
| **Alfred Runtime** | Entorno de ejecución del agente remoto con conocimiento organizacional completo |

Batcave no contiene lógica de negocio. Es infraestructura soberana: valida identidad, enruta comandos y protege el acceso al Nucleus local.

---

## 3. Estructura de directorios

```
.bloom/
└── .nucleus-{organization}/              # Raíz del namespace organizacional
    ├── .batcave/                          # Control Plane Soberano
    │   ├── src/
    │   │   ├── core/
    │   │   │   ├── relay-engine.ts
    │   │   │   ├── blind-judge.ts
    │   │   │   └── alfred.ts              # ← Runtime del agente Alfred
    │   │   ├── api/
    │   │   │   ├── rest/
    │   │   │   │   ├── index.ts
    │   │   │   │   ├── middleware/
    │   │   │   │   │   ├── github-oauth.ts
    │   │   │   │   │   └── org-validator.ts
    │   │   │   │   └── routes/
    │   │   │   │       ├── status.ts
    │   │   │   │       ├── sovereign-link.ts
    │   │   │   │       └── commands.ts    # ← Recibe comandos de Alfred
    │   │   │   └── ws/
    │   │   │       ├── server.ts
    │   │   │       └── handlers/
    │   │   │           ├── auth.ts
    │   │   │           ├── ai-stream.ts   # ← Stream de respuestas de Alfred
    │   │   │           └── heartbeat.ts
    │   │   ├── security/
    │   │   │   ├── ownership-loader.ts
    │   │   │   ├── signature-verifier.ts
    │   │   │   ├── nonce-manager.ts
    │   │   │   └── lockdown.ts
    │   │   ├── tunnel/
    │   │   │   ├── manager.ts
    │   │   │   ├── nucleus-client.ts      # ← Puente hacia Nucleus local
    │   │   │   └── brain-client.ts        # ← Puente hacia Brain local
    │   │   ├── config/
    │   │   │   ├── loader.ts
    │   │   │   └── paths.ts
    │   │   ├── utils/
    │   │   │   ├── logger.ts
    │   │   │   ├── qr-generator.ts
    │   │   │   └── org-resolver.ts
    │   │   └── types/
    │   │       ├── ownership.ts
    │   │       ├── commands.ts
    │   │       ├── tunnel.ts
    │   │       ├── organization.ts
    │   │       └── events.ts
    │   ├── config/
    │   │   └── batcave.config.json        # Config específica de la organización
    │   ├── .data/                         # Runtime data (efímero)
    │   │   ├── tunnels/
    │   │   ├── sessions/
    │   │   └── nonces/
    │   ├── .logs/
    │   │   ├── governance/
    │   │   ├── security/
    │   │   └── relay/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── .env.{organization}
    │   └── README.md
    │
    ├── .core/
    │   ├── .ai_bot.governance.bl
    │   ├── .ai_bot.plane.bl
    │   ├── .ai_bot.sovereign.bl           # ← Contrato de Alfred (REAL)
    │   ├── .rules.bl
    │   └── nucleus-config.json
    │
    ├── .governance/
    │   ├── .architecture/
    │   ├── .quality/
    │   └── .security/
    │
    ├── .intents/
    │   ├── .cor/
    │   └── .exp/
    │
    ├── .relations/
    │
    ├── reports/
    │   └── exports/
    │
    └── .ownership.json                    # ← Fuente de verdad de identidad org
```

---

## 4. Sistema de resolución de organización

### 4.1 Detección de organización

`src/config/org-resolver.ts`

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
  fingerprint: string;             // e.g., "bloom:org:acme"
  nucleusRoot: string;             // e.g., "./bloom/.nucleus-acme"
  batcaveRoot: string;             // e.g., "./bloom/.nucleus-acme/.batcave"
  ownershipPath: string;           // e.g., "./bloom/.nucleus-acme/.ownership.json"
  alfredContractPath: string;      // e.g., "./bloom/.nucleus-acme/.core/.ai_bot.sovereign.bl"
  configPath: string;              // e.g., "./bloom/.nucleus-acme/.batcave/config/batcave.config.json"
}

export async function resolveOrganization(): Promise<OrganizationContext> {
  // 1. Desde variable de entorno
  const orgFromEnv = process.env.BLOOM_ORGANIZATION;
  if (orgFromEnv) {
    return buildOrgContext(orgFromEnv);
  }
  
  // 2. Descubrimiento por filesystem
  const discovered = await discoverOrganization();
  if (discovered) {
    return discovered;
  }
  
  throw new Error('Cannot resolve organization. Set BLOOM_ORGANIZATION or ensure .ownership.json exists.');
}

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

async function discoverOrganization(): Promise<OrganizationContext | null> {
  const bloomDir = path.join(process.cwd(), '.bloom');
  
  if (!existsSync(bloomDir)) return null;
  
  const entries = await readdir(bloomDir);
  
  for (const entry of entries) {
    if (entry.startsWith('.nucleus-')) {
      const orgName = entry.replace('.nucleus-', '');
      const ownershipPath = path.join(bloomDir, entry, '.ownership.json');
      
      if (existsSync(ownershipPath)) {
        const content = await readFile(ownershipPath, 'utf-8');
        OwnershipSchema.parse(JSON.parse(content));
        return buildOrgContext(orgName);
      }
    }
  }
  
  return null;
}
```

### 4.2 Resolución dinámica de paths

`src/config/paths.ts`

```typescript
import path from 'path';
import type { OrganizationContext } from './org-resolver.js';

export class PathResolver {
  constructor(private org: OrganizationContext) {}
  
  get nucleus(): string { return this.org.nucleusRoot; }
  get batcave(): string { return this.org.batcaveRoot; }
  get ownership(): string { return this.org.ownershipPath; }
  get alfredContract(): string { return this.org.alfredContractPath; }
  get batcaveData(): string { return path.join(this.org.batcaveRoot, '.data'); }
  get batcaveLogs(): string { return path.join(this.org.batcaveRoot, '.logs'); }
  get batcaveConfig(): string { return this.org.configPath; }
  get governance(): string { return path.join(this.org.nucleusRoot, '.governance'); }
  get intents(): string { return path.join(this.org.nucleusRoot, '.intents'); }
  get reports(): string { return path.join(this.org.nucleusRoot, 'reports'); }

  tunnelState(tunnelId: string): string {
    return path.join(this.batcaveData, 'tunnels', `${tunnelId}.json`);
  }
  sessionData(sessionId: string): string {
    return path.join(this.batcaveData, 'sessions', `${sessionId}.json`);
  }
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

## 5. Módulos principales

### 5.1 Entry point

`src/index.ts`

```typescript
import { startBatcave } from './core/batcave.js';
import { resolveOrganization } from './config/org-resolver.js';
import { PathResolver } from './config/paths.js';
import { loadBatcaveConfig } from './config/loader.js';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

async function main() {
  const org = await resolveOrganization();
  const paths = new PathResolver(org);
  const config = await loadBatcaveConfig(org);
  
  dotenv.config({ path: `${paths.batcave}/.env.${org.name}` });
  
  await startBatcave(org, paths, config);
}

main();
```

### 5.2 Batcave core

`src/core/batcave.ts`

```typescript
export async function startBatcave(
  org: OrganizationContext,
  paths: PathResolver,
  config: BatcaveConfig
) {
  // 1. Cargar y validar ownership
  const ownership = await loadOwnership(paths.ownership);
  if (ownership.organization_fingerprint !== org.fingerprint) {
    throw new Error(`Organization mismatch: expected ${org.fingerprint}`);
  }

  // 2. Inicializar capa de seguridad
  const blindJudge = new BlindJudge(ownership, config, paths);

  // 3. Inicializar relay engine
  const relayEngine = new RelayEngine(blindJudge, config, paths, org);

  // 4. Inicializar Alfred con su contrato organizacional
  const alfred = new Alfred(relayEngine, blindJudge, paths.alfredContract, org);

  // 5. Levantar REST API
  await startRestAPI(relayEngine, blindJudge, alfred, config, org);

  // 6. Levantar WebSocket server
  await startWebSocketServer(alfred, blindJudge, config, org);

  // 7. Esperar túnel soberano local
  relayEngine.waitForTunnel();
}
```

### 5.3 Ownership loader

`src/security/ownership-loader.ts`

```typescript
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
  return OwnershipSchema.parse(JSON.parse(content));
}
```

---

## 6. Configuración dinámica

`src/config/loader.ts`

```typescript
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
```

### Variables de entorno

`.env.{organization}`

```bash
# Contexto organizacional
BLOOM_ORGANIZATION=acme

# GitHub OAuth (app específica de la org)
GITHUB_OAUTH_CLIENT_ID=Iv1.org-acme-client-id
GITHUB_OAUTH_CLIENT_SECRET=org-acme-secret
GITHUB_CALLBACK_URL=https://acme-batcave.bloom.io/auth/github/callback

# Servidor
PORT_REST=48215
PORT_WSS=4124
NODE_ENV=production

# Codespace (auto-inyectado por GitHub)
CODESPACE_NAME=${CODESPACE_NAME}
GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}

# Dominio custom (opcional)
CUSTOM_DOMAIN=batcave.bloom.io

LOG_LEVEL=info
```

---

## 7. Endpoints organizacionales

`src/utils/endpoint-generator.ts`

```typescript
export class EndpointGenerator {
  constructor(
    private org: OrganizationContext,
    private config: BatcaveConfig
  ) {}
  
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

## 8. Logging multi-tenant

`src/utils/logger.ts`

```typescript
export async function createOrgLogger(
  org: OrganizationContext,
  logType: 'governance' | 'security' | 'relay'
) {
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
          options: { colorize: true, translateTime: 'SYS:standard' }
        },
        {
          target: 'pino/file',
          level: 'info',
          options: { destination: logFile, mkdir: true }
        }
      ]
    }
  });
}
```

Cada log entry queda etiquetado con `organization` y `fingerprint`. Los logs de organizaciones diferentes nunca se mezclan. La rotación opera por fecha dentro del directorio de cada organización.

---

## 9. Alfred — El Agente Remoto Soberano

### 9.1 Qué es Alfred

Alfred es el agente de inteligencia artificial que opera remotamente a través de Batcave. A diferencia de los componentes del sistema local (Nucleus, Brain, Sentinel), Alfred vive en el control plane remoto y se comunica con el sistema local a través del túnel soberano que provee Batcave.

Alfred no es un chatbot genérico. Es un agente con **conocimiento total del modelo de negocio de la organización**: conoce la arquitectura de Bloom, el significado de cada tipo de intent, la jerarquía de Mandates, las reglas de gobernanza del Nucleus, y el estado actual de los proyectos. Su contrato operacional está definido en `.ai_bot.sovereign.bl`, un archivo que especifica sus capacidades, restricciones y alcance de autoridad dentro de la organización.

La capacidad central de Alfred es **ejecutar intents y Mandates de forma remota**. Un usuario con acceso autorizado puede instruir a Alfred desde una aplicación móvil, y Alfred traduce esa instrucción en la acción concreta dentro del sistema local: crea un intent, dispara un Mandate, consulta el estado de un pipeline, o reporta el resultado de una ejecución. Alfred es, en definitiva, **la voz del Nucleus hacia el exterior**.

### 9.2 Modelo de capacidades

Alfred puede instruir al sistema a ejecutar cualquier acción que un intent o Mandate puede expresar:

| Acción | Tipo de instrucción | Efecto en el sistema local |
|---|---|---|
| Explorar una alternativa técnica | Intent `exp` | Nucleus instancia el intent, Brain lo ejecuta |
| Coordinar un merge cognitivo | Intent `cor` | Nucleus orquesta la resolución entre intents conflictivos |
| Desarrollar una feature | Intent `dev` | Nucleus delega al Project correspondiente |
| Documentar una decisión | Intent `doc` | Nucleus persiste el conocimiento en el filesystem |
| Ejecutar un proceso complejo de múltiples pasos | Mandate | Nucleus firma el contrato y lo persiste vía Temporal |

Alfred no ejecuta estos pasos directamente. Traduce la instrucción del usuario en el intent o Mandate correcto, lo envía al Nucleus local a través del túnel de Batcave, y devuelve el resultado al usuario en tiempo real vía streaming WebSocket.

### 9.3 Contrato de Alfred: `.ai_bot.sovereign.bl`

El contrato soberano es el archivo que define la identidad operacional de Alfred para una organización específica. Contiene:

- La descripción del modelo de negocio de la organización en lenguaje natural
- Las reglas de gobernanza que Alfred debe respetar (qué puede y qué no puede hacer sin aprobación humana)
- El mapa de proyectos activos y su estado
- Las capacidades habilitadas para esta instancia de Alfred
- Los usuarios autorizados a interactuar con Alfred y sus niveles de permiso

Este archivo vive en `.nucleus-{organization}/.core/.ai_bot.sovereign.bl` y es cargado por Alfred al inicializarse. Es la diferencia entre un agente genérico y uno que conoce que la organización tiene tres proyectos activos, que el Mandate de estabilización de autenticación está en curso, y que solo el Master puede aprobar merges en producción.

```typescript
// src/core/alfred.ts
export class Alfred {
  private contractPath: string;
  private org: OrganizationContext;
  private relayEngine: RelayEngine;
  private blindJudge: BlindJudge;
  
  constructor(
    relayEngine: RelayEngine,
    blindJudge: BlindJudge,
    contractPath: string,    // path a .ai_bot.sovereign.bl
    org: OrganizationContext
  ) {
    this.contractPath = contractPath;
    this.org = org;
    this.relayEngine = relayEngine;
    this.blindJudge = blindJudge;
  }
  
  async initialize(): Promise<void> {
    // Carga el contrato soberano de la organización
    // Establece el contexto de negocio para las sesiones
  }
  
  async handleSession(session: AlfredSession): Promise<void> {
    // Procesa instrucciones del usuario externo
    // Traduce a intents/Mandates
    // Enruta al Nucleus local via relayEngine
    // Devuelve resultado via streaming WebSocket
  }
}
```

### 9.4 Flujo de ejecución remota

Cuando un usuario interactúa con Alfred desde la aplicación móvil, el flujo completo es:

```
Usuario (app mobile)
    │  instrucción en lenguaje natural o comando estructurado
    ▼
Batcave (WebSocket / wss-endpoint)
    │  autenticación GitHub OAuth + validación de nonce
    ▼
BlindJudge (validación de autoridad)
    │  verifica que el usuario tiene permiso para la acción solicitada
    ▼
Alfred (src/core/alfred.ts)
    │  interpreta la instrucción usando el contrato soberano
    │  construye el intent o Mandate correspondiente
    ▼
RelayEngine (src/core/relay-engine.ts)
    │  enruta hacia el túnel soberano local
    ▼
Nucleus (sistema local)
    │  valida, firma y ejecuta el intent/Mandate
    ▼
Brain / Temporal (sistema local)
    │  ejecución concreta
    ▼
Resultado → RelayEngine → Alfred → WebSocket stream → app mobile
```

Cada paso es auditado. Los logs de governance registran qué instrucción llegó, qué intent fue creado, qué resultado retornó, y en qué timestamp. El usuario ve el progreso en tiempo real vía el stream de Alfred.

### 9.5 Autenticación y autorización

Alfred solo acepta sesiones que pasen por el protocolo completo de Batcave:

1. **GitHub OAuth**: el usuario se autentica con su cuenta de GitHub. Batcave valida que ese usuario pertenezca a la organización.
2. **QR + nonce**: el acceso inicial desde la app mobile usa un QR efímero (TTL: 30 segundos) que contiene los endpoints de Batcave y un nonce de un solo uso.
3. **BlindJudge**: verifica la firma de cada comando antes de enviarlo a Alfred. Un comando sin firma válida activa lockdown automático.
4. **Nivel de permiso**: el contrato soberano define qué puede hacer cada usuario. Un Specialist puede crear intents `exp` y `doc`. Solo el Master puede crear Mandates o aprobar intents `dev` en producción.

```typescript
// Configuración de seguridad (de batcave.config.json)
security: {
  qr_ttl_seconds: 30,          // QR expira en 30 segundos
  nonce_ttl_seconds: 30,        // Nonce de un solo uso, TTL 30s
  max_pending_commands: 100,    // Cola máxima de comandos
  lockdown_on_signature_fail: true  // Lockdown automático si la firma falla
}
```

### 9.6 Configuración de Alfred

Alfred tiene su propia sección en `batcave.config.json`:

```json
{
  "alfred": {
    "stream_chunk_size": 1024,
    "max_concurrent_sessions": 10
  }
}
```

`stream_chunk_size` controla el tamaño de los chunks de respuesta en el stream WebSocket. `max_concurrent_sessions` limita cuántos usuarios pueden tener sesiones activas con Alfred simultáneamente por instancia de Batcave.

### 9.7 Qué puede hacer Alfred que ningún otro componente puede

Alfred es el único punto del ecosistema Bloom que permite **operar el sistema desde el exterior sin estar físicamente en la máquina local**. Todos los demás componentes (Conductor, Sentinel, Brain) requieren presencia local. Alfred rompe esa restricción de forma soberana: el acceso es remoto, pero la autoridad sigue siendo local. Nucleus sigue siendo quien firma y valida. Brain sigue siendo quien ejecuta. Alfred es el canal gobernado que los conecta con el usuario móvil.

Esto lo convierte en el mecanismo central para:

- **Supervisión remota**: consultar el estado de un Mandate en curso desde el teléfono mientras el sistema corre en la máquina de desarrollo.
- **Aprobación de acciones**: recibir una notificación de que un intent `cor` requiere decisión humana y resolverlo desde la app.
- **Instrucción asíncrona**: iniciar un `exp` intent antes de llegar a la oficina para que Brain ya tenga resultados cuando el usuario se siente.
- **Reporting bajo demanda**: pedirle a Alfred que genere y envíe el reporte de estado del Nucleus sin necesidad de abrir el Conductor.

---

## 10. Workflow de inicialización

### Primera vez — inicializar organización

```bash
export BLOOM_ORGANIZATION=acme

# Crear estructura de Nucleus
mkdir -p .bloom/.nucleus-acme/{.core,.governance,.intents,.relations,reports}

# Crear ownership
cat > .bloom/.nucleus-acme/.ownership.json << EOF
{
  "organization_fingerprint": "bloom:org:acme",
  "organization_name": "acme",
  "master_user": "github_username",
  "key_fingerprint": "ed25519:SHA256:abc123",
  "created_at": $(date +%s)000
}
EOF

# Copiar contrato de Alfred
cp path/to/.ai_bot.sovereign.bl .bloom/.nucleus-acme/.core/

# Inicializar Batcave
cd .bloom/.nucleus-acme
npx degit your-org/batcave-template .batcave
cd .batcave && npm install
```

### Script de inicio

`scripts/start-batcave.sh`

```bash
#!/bin/bash

if [ -z "$BLOOM_ORGANIZATION" ]; then
  NUCLEUS_DIR=$(find .bloom -maxdepth 1 -type d -name '.nucleus-*' | head -n 1)
  
  if [ -z "$NUCLEUS_DIR" ]; then
    echo "❌ No Nucleus found. Initialize organization first."
    exit 1
  fi
  
  export BLOOM_ORGANIZATION=$(basename "$NUCLEUS_DIR" | sed 's/\.nucleus-//')
fi

echo "🦇 Starting Batcave for organization: $BLOOM_ORGANIZATION"

BATCAVE_DIR=".bloom/.nucleus-$BLOOM_ORGANIZATION/.batcave"

if [ ! -d "$BATCAVE_DIR" ]; then
  echo "❌ Batcave not found at $BATCAVE_DIR"
  exit 1
fi

cd "$BATCAVE_DIR"

if [ -f ".env.$BLOOM_ORGANIZATION" ]; then
  export $(cat ".env.$BLOOM_ORGANIZATION" | xargs)
fi

[ ! -d "node_modules" ] && npm install
[ ! -d "dist" ] && npm run build

npm start
```

### Inicio rápido

```bash
# Desde la raíz del proyecto
BLOOM_ORGANIZATION=acme bash .bloom/.nucleus-acme/.batcave/scripts/start-batcave.sh

# Desde el directorio de Batcave
cd .bloom/.nucleus-acme/.batcave && npm start
```

---

## 11. Invariantes críticos

```
INVARIANT-ORG-001: Sin nombres de organización hardcodeados
INVARIANT-ORG-002: Todos los paths derivan de OrganizationContext
INVARIANT-ORG-003: Configs cargan desde archivos org-específicos
INVARIANT-ORG-004: Logs segregados por organización
INVARIANT-ORG-005: Endpoints namespaciados por organización
INVARIANT-ORG-006: Runtime data aislado por organización
INVARIANT-ORG-007: .ownership.json es la fuente de verdad de identidad
INVARIANT-ALF-001: Alfred solo opera bajo un contrato soberano válido
INVARIANT-ALF-002: Cada instrucción remota pasa por BlindJudge antes de llegar a Alfred
INVARIANT-ALF-003: Alfred no ejecuta intents directamente — los enruta a Nucleus local
INVARIANT-ALF-004: El contrato .ai_bot.sovereign.bl nunca se carga desde fuera del Nucleus org
```

---

## 12. Checklist de validación

### Resolución de organización
- [ ] Variable de entorno `BLOOM_ORGANIZATION` funciona
- [ ] Auto-descubrimiento desde directorio `.bloom` funciona
- [ ] Fingerprint validado contra `.ownership.json`

### Resolución de paths
- [ ] Todo acceso a archivos usa `PathResolver`
- [ ] Sin paths hardcodeados en el codebase
- [ ] `.ownership.json` cargado desde path org-específico
- [ ] Contrato de Alfred cargado desde path org-específico

### Configuración
- [ ] Config carga desde `.batcave/config/batcave.config.json`
- [ ] Environment carga desde `.env.{organization}`
- [ ] Overrides funcionan correctamente

### Logging
- [ ] Logs escriben en `.batcave/.logs/{governance,security,relay}`
- [ ] Cada entry etiquetado con organización
- [ ] Rotación por fecha funciona por organización

### Multi-tenant
- [ ] Múltiples organizaciones coexisten en `.bloom/`
- [ ] Cada organización aislada en `.nucleus-{org}` separado
- [ ] Sin data leakage entre organizaciones

### Alfred
- [ ] Contrato soberano carga correctamente al iniciar
- [ ] Autenticación GitHub OAuth funciona
- [ ] QR + nonce expiran en TTL configurado
- [ ] BlindJudge rechaza comandos sin firma válida
- [ ] Lockdown se activa ante fallo de firma
- [ ] Stream WebSocket devuelve progreso en tiempo real
- [ ] Intent creado por Alfred es firmado por Nucleus local (no por Alfred)
- [ ] Logs de governance registran cada sesión de Alfred con timestamp y usuario

---

*BATCAVE — Bloom Sovereign Control Plane*
*Referencia: BTIPS v4.0 · BATCAVE_DYNAMIC_ARCHITECTURE · IMPL_PROMPT_METAMORPH*
