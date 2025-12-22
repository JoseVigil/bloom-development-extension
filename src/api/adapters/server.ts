import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { WebSocketManager } from '../server/WebSocketManager';
import * as vscode from 'vscode';

// Route imports
import { nucleusRoutes } from './routes/nucleus.routes';
import { intentRoutes } from './routes/intent.routes';
import { projectRoutes } from './routes/project.routes';
import { profileRoutes } from './routes/profile.routes';
import { authRoutes } from './routes/auth.routes';
import { copilotRoutes } from './routes/copilot.routes';

export interface ServerConfig {
  port: number;
  wsManager: WebSocketManager;
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
}

export class BloomApiServer {
  private server: FastifyInstance;
  private config: ServerConfig;
  private running: boolean = false;

  constructor(config: ServerConfig) {
    this.config = config;
    this.server = Fastify({
      logger: false,
      requestTimeout: 120000, // 2 minutes
      bodyLimit: 10485760 // 10MB
    });

    this.setupMiddleware();
    this.setupSwagger();
    this.setupRoutes();
    this.setupErrorHandlers();
  }

  private setupMiddleware() {
    // CORS for localhost only
    this.server.register(cors, {
      origin: (origin, cb) => {
        if (!origin || 
            origin.includes('localhost') || 
            origin.includes('127.0.0.1') ||
            origin.startsWith('vscode-webview://')) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true
    });

    // Add context to all requests
    this.server.decorateRequest('context', null);
    this.server.addHook('onRequest', async (request, reply) => {
      (request as any).context = this.config.context;
      (request as any).wsManager = this.config.wsManager;
      (request as any).outputChannel = this.config.outputChannel;
    });

    // Log all requests
    this.server.addHook('onRequest', async (request, reply) => {
      this.log(`${request.method} ${request.url}`);
    });
  }

  private setupSwagger() {
    // Swagger documentation
    this.server.register(swagger, {
      swagger: {
        info: {
          title: 'Bloom Plugin API',
          description: 'REST API for Bloom Development Plugin - Brain CLI Integration',
          version: '2.0.0'
        },
        host: `localhost:${this.config.port}`,
        schemes: ['http'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'nucleus', description: 'Nucleus project management' },
          { name: 'intent', description: 'Intent lifecycle operations' },
          { name: 'project', description: 'Project detection and linking' },
          { name: 'profile', description: 'Chrome profile and AI account management' },
          { name: 'auth', description: 'Authentication (GitHub, Gemini)' },
          { name: 'copilot', description: 'AI Copilot chat streaming' }
        ],
        securityDefinitions: {
          localhost: {
            type: 'apiKey',
            name: 'X-Localhost-Only',
            in: 'header',
            description: 'Only localhost connections allowed'
          }
        }
      }
    });

    // Swagger UI
    this.server.register(swaggerUI, {
      routePrefix: '/api/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true
      },
      staticCSP: true,
      transformStaticCSP: (header) => header
    });
  }

  private setupRoutes() {
    // Health check (no prefix)
    this.server.get('/health', async (request, reply) => {
      return { 
        status: 'ok', 
        timestamp: Date.now(),
        version: '2.0.0'
      };
    });

    // API v1 routes
    this.server.register(async (fastify) => {
      fastify.register(nucleusRoutes, { prefix: '/nucleus' });
      fastify.register(intentRoutes, { prefix: '/intent' });
      fastify.register(projectRoutes, { prefix: '/project' });
      fastify.register(profileRoutes, { prefix: '/profile' });
      fastify.register(authRoutes, { prefix: '/auth' });
      fastify.register(copilotRoutes, { prefix: '/copilot' });
    }, { prefix: '/api/v1' });
  }

  private setupErrorHandlers() {
    this.server.setErrorHandler((error, request, reply) => {
      this.log(`Error: ${error.message}`);
      
      // Brain CLI specific errors
      if (error.message.includes('not_authenticated')) {
        return reply.code(401).send({
          error: 'Authentication required',
          message: 'GitHub or Gemini authentication missing'
        });
      }
      
      if (error.message.includes('not_nucleus')) {
        return reply.code(400).send({
          error: 'Not a Nucleus project',
          message: 'Current directory is not a valid Nucleus'
        });
      }

      // Validation errors
      if (error.validation) {
        return reply.code(400).send({
          error: 'Validation failed',
          details: error.validation
        });
      }

      // Generic error
      return reply.code(500).send({
        error: 'Internal server error',
        message: error.message
      });
    });

    // 404 handler
    this.server.setNotFoundHandler((request, reply) => {
      return reply.code(404).send({
        error: 'Not found',
        path: request.url
      });
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      this.log('Server already running');
      return;
    }

    try {
      await this.server.listen({ 
        port: this.config.port, 
        host: '127.0.0.1' 
      });
      
      this.running = true;
      this.log(`✅ Bloom API Server running on http://localhost:${this.config.port}`);
      this.log(`📚 Swagger docs: http://localhost:${this.config.port}/api/docs`);
    } catch (error: any) {
      this.log(`❌ Failed to start server: ${error.message}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.log('Server not running');
      return;
    }

    try {
      await this.server.close();
      this.running = false;
      this.log('✅ Bloom API Server stopped');
    } catch (error: any) {
      this.log(`❌ Error stopping server: ${error.message}`);
      throw error;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getPort(): number {
    return this.config.port;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [BloomApiServer] ${message}`;
    this.config.outputChannel.appendLine(logMessage);
    console.log(logMessage);
  }
}