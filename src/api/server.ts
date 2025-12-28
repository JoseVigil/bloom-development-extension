import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import type * as vscode from 'vscode';
import { WebSocketManager } from '../server/WebSocketManager';

// Import routes
import { nucleusRoutes } from './routes/nucleus.routes';
import { intentRoutes } from './routes/intent.routes';
import { projectRoutes } from './routes/project.routes';
import { profileRoutes } from './routes/profile.routes';
import { authRoutes } from './routes/auth.routes';
import { explorerRoutes } from './routes/explorer.routes';

// Import middleware
import { errorHandler } from './middleware/errorHandler';

//Import Health
import { healthRoutes } from './routes/health.routes';

export interface BloomApiServerConfig {
  context: vscode.ExtensionContext;
  wsManager: WebSocketManager;
  outputChannel: vscode.OutputChannel;
  port?: number;
}

/**
 * Creates and configures the Fastify API server
 * Replaces PluginApiServer.ts with modern Fastify + Swagger architecture
 */
export async function createAPIServer(config: BloomApiServerConfig): Promise<FastifyInstance> {
  const port = config.port || 48215;

  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  });

  // Inject dependencies for routes
  fastify.decorate('deps', config);

  // CORS - Allow VSCode webviews and localhost
  await fastify.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:3000',
      /^vscode-webview:\/\/.*/
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  // Swagger OpenAPI Documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Bloom Plugin API',
        description: 'REST API for Bloom VSCode Extension - Brain CLI Integration',
        version: '1.0.0',
        contact: {
          name: 'Bloom Team'
        }
      },
      servers: [
        { url: `http://localhost:${port}`, description: 'Local Development' }
      ],
      tags: [
        { name: 'health', description: 'System health check endpoints - Brain CLI integration' }, // ← AGREGAR PRIMERO
        { name: 'nucleus', description: 'Nucleus management operations' },
        { name: 'intent', description: 'Intent lifecycle and workflow' },
        { name: 'project', description: 'Project detection and linking' },
        { name: 'profile', description: 'Chrome profiles & AI accounts' },
        { name: 'auth', description: 'GitHub and Gemini authentication' },
        { name: 'explorer', description: 'File system explorer' }
      ],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key'
          }
        }
      }
    }
  });

  // Swagger UI
  await fastify.register(swaggerUI, {
    routePrefix: '/api/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayOperationId: true,
      defaultModelsExpandDepth: 3,
      defaultModelExpandDepth: 3,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Health check
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['system'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            version: { type: 'string' }
          }
        }
      }
    }
  }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }));

  // Register all route modules
  await fastify.register(healthRoutes, { prefix: '/api/v1/health' }); 
  await fastify.register(nucleusRoutes, { prefix: '/api/v1/nucleus' });
  await fastify.register(intentRoutes, { prefix: '/api/v1/intent' });
  await fastify.register(projectRoutes, { prefix: '/api/v1/project' });
  await fastify.register(profileRoutes, { prefix: '/api/v1/profile' });
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(explorerRoutes, { prefix: '/api/v1/explorer' });

  // Error handler (must be last)
  fastify.setErrorHandler(errorHandler);

  return fastify;
}

/**
 * Start the API server and listen on the specified port
 */
export async function startAPIServer(config: BloomApiServerConfig): Promise<FastifyInstance> {
  const port = config.port || 48215;
  const server = await createAPIServer(config);

  try {
    await server.listen({ port, host: '127.0.0.1' });
    config.outputChannel.appendLine(`[Bloom API] Server started on http://localhost:${port}`);
    config.outputChannel.appendLine(`[Bloom API] Swagger UI: http://localhost:${port}/api/docs`);
    console.log(`✅ Bloom API Server started`);
    console.log(`📚 Swagger UI: http://localhost:${port}/api/docs`);
    return server;
  } catch (err: any) {
    server.log.error(err);
    throw new Error(`Failed to start API server: ${err.message}`);
  }
}

/**
 * Stop the API server gracefully
 */
export async function stopAPIServer(server: FastifyInstance): Promise<void> {
  try {
    await server.close();
    console.log('✅ Bloom API Server stopped gracefully');
  } catch (err: any) {
    console.error('❌ Error stopping API server:', err);
    throw err;
  }
}

/**
 * BloomApiServer - Wrapper class for managing Fastify server lifecycle
 * Used by extension.ts for easy start/stop
 */
export class BloomApiServer {
  private server: FastifyInstance | null = null;
  private config: BloomApiServerConfig;

  constructor(config: BloomApiServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Server is already running');
    }
    this.server = await startAPIServer(this.config);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    await stopAPIServer(this.server);
    this.server = null;
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number {
    return this.config.port || 48215;
  }

  getServer(): FastifyInstance | null {
    return this.server;
  }
}