import type * as vscode from 'vscode';
import type { FastifyInstance } from 'fastify';
import { WebSocketManager } from './WebSocketManager';
import { startAPIServer, stopAPIServer } from '../api/server';

/**
 * PluginApiServer - Wrapper for Fastify API server
 * 
 * UPDATED: Now uses Fastify + Swagger instead of native http.createServer
 * Maintains same external interface for compatibility with extension
 */
export class PluginApiServer {
  private fastifyServer: FastifyInstance | null = null;
  private port: number = 48215;
  private running: boolean = false;

  private context: vscode.ExtensionContext;
  private wsManager: WebSocketManager;
  private outputChannel: vscode.OutputChannel;

  constructor(config: {
    context: vscode.ExtensionContext;
    wsManager: WebSocketManager;
    outputChannel: vscode.OutputChannel;
    pluginVersion?: string;
  }) {
    this.context = config.context;
    this.wsManager = config.wsManager;
    this.outputChannel = config.outputChannel;
  }

  public getPort(): number {
    return this.port;
  }

  public async start(): Promise<void> {
    if (this.running) {
      this.log('Server already running');
      return;
    }

    try {
      this.fastifyServer = await startAPIServer({
        context: this.context,
        wsManager: this.wsManager,
        outputChannel: this.outputChannel,
        port: this.port
      });

      this.running = true;
      this.log(`✅ PluginApiServer started on http://localhost:${this.port}`);
      this.log(`📚 Swagger UI available at http://localhost:${this.port}/api/docs`);
    } catch (error: any) {
      this.log(`❌ Failed to start server: ${error.message}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.fastifyServer || !this.running) {
      this.log('Server not running');
      return;
    }

    try {
      await stopAPIServer(this.fastifyServer);
      this.running = false;
      this.fastifyServer = null;
      this.log('✅ PluginApiServer stopped');
    } catch (error: any) {
      this.log(`❌ Error stopping server: ${error.message}`);
      throw error;
    }
  }

  public isRunning(): boolean {
    return this.running;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.outputChannel.appendLine(logMessage);
    console.log(logMessage);
  }
}

/**
 * DEPRECATED METHODS REMOVED:
 * - runPythonScript() - Use BrainApiAdapter instead
 * - handleRequest() - Now handled by Fastify routes
 * - All handle*() methods - Migrated to route modules
 * 
 * PRESERVED:
 * - start() / stop() interface for extension compatibility
 * - getPort() for external consumers
 * - isRunning() status check
 */