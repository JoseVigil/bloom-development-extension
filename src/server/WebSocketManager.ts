// src/server/WebSocketManager.ts (corregido con attachHost agregado)

import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import { CopilotNativeAdapter } from '../ai/adapters/CopilotNativeAdapter';
import { BrainApiAdapter } from '../api/adapters/BrainApiAdapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HostExecutor } from '../host/HostExecutor';  // Import agregado basado en la ubicación proporcionada (src/host/HostExecutor.ts)

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  clientId?: string;
}

interface WebSocketMessage {
  event: string;
  data?: any;
}

interface CopilotProcess {
  processId: string;
  context: 'onboarding' | 'genesis' | 'dev' | 'doc';
  intentId?: string;
  profileId?: string;
  sequence: number;
  startedAt: number;
  status: 'streaming' | 'completed' | 'cancelled' | 'error';
  client: ExtendedWebSocket;
}

export class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager;
  private wss: WebSocketServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private intentSubscribers: Set<ExtendedWebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private copilotAdapter: CopilotNativeAdapter;
  private activeProcesses: Map<string, CopilotProcess> = new Map();
  private readonly PORT = 4124;
  private readonly HEARTBEAT_INTERVAL = 20000;

  // Nueva propiedad para el HostExecutor
  private hostExecutor?: HostExecutor;

  private constructor() {
    super();
    this.copilotAdapter = new CopilotNativeAdapter();
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  async start(): Promise<void> {
    if (this.wss) {
      console.log('[WebSocketManager] Already started');
      return;
    }
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.PORT,
          verifyClient: (info: { origin: string; req: IncomingMessage; secure: boolean }) => {
            const origin = info.origin || (info.req.headers.origin as string | undefined);
            
            // Allow vscode webviews
            if (origin?.startsWith('vscode-webview://')) return true;
            
            // Allow localhost/127.0.0.1
            if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) return true;
            
            // Allow file:// protocol (Electron) and null origin (same)
            if (!origin || origin === 'null' || origin.startsWith('file://')) {
              console.log('[WebSocketManager] Allowing connection from file:// or null origin');
              return true;
            }
            
            console.warn('[WebSocketManager] Connection rejected from origin:', origin);
            return false;
          },
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws as ExtendedWebSocket);
        });

        this.wss.on('error', (error: Error) => {
          console.error('[WebSocketManager] WebSocket server error:', error);
        });

        this.startHeartbeat();
        console.log(`[WebSocketManager] WebSocket server started on ws://localhost:${this.PORT}`);
        resolve();
      } catch (err) {
        console.error('[WebSocketManager] Failed to start server:', err);
        reject(err);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Cancel all active processes
    this.activeProcesses.forEach(process => {
      this.sendToClient(process.client, 'copilot.cancelled', {
        processId: process.processId,
        reason: 'server_shutdown'
      });
    });
    this.activeProcesses.clear();

    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, 'Server shutting down');
      }
    });

    this.clients.clear();
    this.intentSubscribers.clear();

    if (this.wss) {
      await new Promise<void>(resolve => {
        this.wss!.close(() => {
          console.log('[WebSocketManager] WebSocket server stopped');
          this.wss = null;
          resolve();
        });
      });
    }
  }

  private handleConnection(ws: ExtendedWebSocket): void {
    console.log('[WebSocketManager] New connection');
    ws.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.clients.add(ws);
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      console.log('[WebSocketManager] Client disconnected');
      
      // Cancel client's active processes
      this.activeProcesses.forEach((process, processId) => {
        if (process.client === ws) {
          process.status = 'cancelled';
          this.activeProcesses.delete(processId);
        }
      });
      
      this.clients.delete(ws);
      this.intentSubscribers.delete(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocketManager] Client error:', error);
      this.clients.delete(ws);
      this.intentSubscribers.delete(ws);
    });

    this.sendToClient(ws, 'connected', {
      clientId: ws.clientId,
      timestamp: Date.now(),
      protocolVersion: '1.0.0'
    });
  }

  private async handleMessage(ws: ExtendedWebSocket, rawMessage: string): Promise<void> {
    let message: WebSocketMessage;
    try {
      message = JSON.parse(rawMessage);
    } catch (err) {
      this.sendError(ws, 'Invalid JSON message');
      return;
    }
    console.log(`[WebSocketManager] Event received: ${message.event}`);

    try {
      switch (message.event) {
        case 'subscribe_intents':
          this.handleSubscribeIntents(ws);
          break;

        case 'copilot.prompt':
          await this.handleCopilotPrompt(ws, message.data);
          break;

        case 'copilot.cancel':
          await this.handleCopilotCancel(ws, message.data);
          break;

        case 'intent:subscribe':
          this.handleIntentSubscribe(ws, message.data);
          break;

        default:
          this.sendError(ws, `Unknown event: ${message.event}`);
      }
    } catch (err: any) {
      console.error('[WebSocketManager] Error processing message:', err);
      this.sendError(ws, err.message || 'Internal error');
    }
  }

  // ============================================================================
  // COPILOT HANDLERS
  // ============================================================================

  private async handleCopilotPrompt(ws: ExtendedWebSocket, payload: any): Promise<void> {
    const { context, intentId, text, profileId } = payload;
    // Generate unique process ID
    const processId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate context
    const validContexts = ['onboarding', 'genesis', 'dev', 'doc'];
    if (!validContexts.includes(context)) {
      this.sendToClient(ws, 'copilot.error', {
        processId,
        error_code: 'INVALID_CONTEXT',
        message: `Invalid context: ${context}. Must be one of: ${validContexts.join(', ')}`,
        recoverable: false
      });
      return;
    }

    // Get workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.sendToClient(ws, 'copilot.error', {
        processId,
        error_code: 'NO_WORKSPACE',
        message: 'No workspace open',
        recoverable: false
      });
      return;
    }
    const projectRoot = workspaceFolders[0].uri.fsPath;

    // Register process
    const process: CopilotProcess = {
      processId,
      context,
      intentId,
      profileId,
      sequence: 0,
      startedAt: Date.now(),
      status: 'streaming',
      client: ws
    };
    this.activeProcesses.set(processId, process);

    try {
      // Load contract file
      const contractContent = await this.loadContract(context, projectRoot);
      
      // Load intent context if applicable
      let intentContext = '';
      if (intentId && (context === 'dev' || context === 'doc')) {
        intentContext = await this.loadIntentContextViaBrain(projectRoot, context, intentId);
      }
      
      // Build enhanced prompt
      const enhancedPrompt = this.buildEnhancedPrompt({
        contract: contractContent,
        context,
        intentId,
        intentContext,
        projectRoot,
        userMessage: text
      });
      
      // Notify stream start
      this.sendToClient(ws, 'copilot.stream_start', {
        processId,
        context,
        intentId,
        timestamp: Date.now(),
        cancellable: true
      });
      
      // Stream response using CopilotNativeAdapter
      await this.copilotAdapter.streamResponse(
        enhancedPrompt,
        intentId || 'global',
        projectRoot,
        (chunk: string) => {
          // Check if process was cancelled
          if (process.status === 'cancelled') {
            throw new Error('Process cancelled by user');
          }
          
          process.sequence++;
          this.sendToClient(ws, 'copilot.stream_chunk', {
            processId,
            context,
            intentId,
            sequence: process.sequence,
            chunk
          });
        }
      );
      
      // Mark as completed
      process.status = 'completed';
      this.sendToClient(ws, 'copilot.stream_end', {
        processId,
        context,
        intentId,
        timestamp: Date.now()
      });
      
    } catch (error: any) {
      console.error('[WebSocketManager] Copilot prompt failed:', error);
      process.status = 'error';
      
      this.sendToClient(ws, 'copilot.error', {
        processId,
        context,
        intentId,
        error_code: this.classifyError(error),
        message: error.message,
        recoverable: this.isRecoverableError(error),
        retry_after: error.retryAfter || 5000
      });
    } finally {
      // Cleanup after 30 seconds
      setTimeout(() => {
        this.activeProcesses.delete(processId);
      }, 30000);
    }
  }

  private async handleCopilotCancel(ws: ExtendedWebSocket, payload: any): Promise<void> {
    const { processId } = payload;
    const process = this.activeProcesses.get(processId);
    if (!process) {
      this.sendError(ws, 'Process not found');
      return;
    }

    // Verify ownership
    if (process.client !== ws) {
      this.sendToClient(ws, 'copilot.error', {
        processId,
        error_code: 'PROCESS_UNAUTHORIZED',
        message: 'Cannot cancel another client\'s process',
        recoverable: false
      });
      return;
    }

    // Mark as cancelled
    process.status = 'cancelled';

    this.sendToClient(ws, 'copilot.cancelled', {
      processId,
      partial_output: true,
      timestamp: Date.now()
    });

    // Cleanup immediately
    this.activeProcesses.delete(processId);
  }

  private async loadContract(context: string, projectRoot: string): Promise<string> {
    const contractMap: Record<string, string> = {
      onboarding: '.bloom/.core/.copilot.bootstrap.bl',
      genesis: '.bloom/.core/.copilot.genesis.bl',
      dev: '.bloom/.project/.copilot.dev.intent.bl',
      doc: '.bloom/.project/.copilot.doc.intent.bl'
    };
    const relativePath = contractMap[context];
    if (!relativePath) {
      return this.getDefaultContract(context);
    }

    const contractPath = path.join(projectRoot, relativePath);

    try {
      const content = await fs.readFile(contractPath, 'utf-8');
      console.log(`[WebSocketManager] Loaded contract: ${contractPath}`);
      return content;
    } catch (error) {
      console.warn(`[WebSocketManager] Contract not found: ${contractPath}, using default`);
      return this.getDefaultContract(context);
    }
  }

  private async loadIntentContextViaBrain(
    projectRoot: string,
    context: 'dev' | 'doc',
    intentId: string
  ): Promise<string> {
    try {
      const result = await BrainApiAdapter.intentGet(intentId, projectRoot);
      if (result.status === 'success' && result.data) {
        return this.formatIntentContext(result.data);
      }
      
      return `\n[Intent ${intentId} context unavailable]\n`;
    } catch (error) {
      console.warn(`[WebSocketManager] Could not load intent via Brain: ${error}`);
      return `\n[Intent ${intentId} context unavailable]\n`;
    }
  }

  private formatIntentContext(intentData: any): string {
    const state = intentData.state;
    return `═══════════════════════════════════════════════════════════════ INTENT CONTEXT ═══════════════════════════════════════════════════════════════
Intent ID: ${state.id}
Type: ${state.type.toUpperCase()}
Phase: ${state.phase}
Status: ${state.status}
Locked: ${state.locked ? `Yes (by ${state.locked_by})` : 'No'}

FILES:
${state.initial_files.map((f: string) => `  - ${f}`).join('\n')}

${intentData.briefing ? `BRIEFING:
Problem: ${intentData.briefing.problem}
Expected Output: ${intentData.briefing.expected_output}` : ''}

${intentData.turns && intentData.turns.length > 0 ? `CHAT HISTORY (${intentData.turns.length} turns):
${intentData.turns.slice(-3).map((t: any) => `    [${t.actor}]: ${t.content.substring(0, 100)}...`).join('\n')}` : ''}

═══════════════════════════════════════════════════════════════
`;
  }

  private buildEnhancedPrompt(params: {
    contract: string;
    context: string;
    intentId?: string;
    intentContext: string;
    projectRoot: string;
    userMessage: string;
  }): string {
    return `${params.contract}
═══════════════════════════════════════════════════════════════
EXECUTION CONTEXT
═══════════════════════════════════════════════════════════════
Mode: ${params.context.toUpperCase()}
${params.intentId ? `Intent: ${params.intentId}` : 'Global Context'}
Project Root: ${params.projectRoot}
${params.intentContext}
═══════════════════════════════════════════════════════════════
USER REQUEST
═══════════════════════════════════════════════════════════════
${params.userMessage}
═══════════════════════════════════════════════════════════════
Respond according to the contract rules above. If this is a DEV or DOC intent,
ensure you read and respect the current phase and state. If structural health
markers indicate issues, surface them immediately.
`;
  }

  private getDefaultContract(context: string): string {
    const defaults: Record<string, string> = {
      onboarding: `# ONBOARDING MODE
You are assisting with initial system setup. Guide the user through:

Authentication
Profile creation
Nucleus setup
Project linking
Do not generate code or make architectural decisions.`,
      genesis: `# GENESIS MODE
You are executing one-time project initialization. Your authority:

Create PROJECT_STRATEGY.md
Execute nucleus.sync
Ingest documentation
Mark genesis complete
Do not execute intents or modify code.`,
      dev: `# DEV MODE
You are assisting with development within an active intent. Rules:
Respect phase authority (briefing/execution/refinement)
Only modify files within the active intent
Check structural health before suggesting changes
Follow the declared plan in context_dev_plan.json`,
      doc: `# DOC MODE
You are assisting with documentation within an active intent. Rules:
Read-only access to code
Write access to DOC intent files only
No structural changes
Explain and derive, don't implement`
    };
    return defaults[context] || defaults.dev;
  }

  private classifyError(error: any): string {
    const msg = error.message?.toLowerCase() || '';
    if (msg.includes('rate limit')) return 'AI_RATE_LIMIT';
    if (msg.includes('quota')) return 'AI_QUOTA_EXCEEDED';
    if (msg.includes('authentication')) return 'AI_AUTH_FAILED';
    if (msg.includes('timeout')) return 'AI_TIMEOUT';
    if (msg.includes('cancelled')) return 'PROCESS_CANCELLED';
    return 'AI_EXECUTION_FAILED';
  }

  private isRecoverableError(error: any): boolean {
    const code = this.classifyError(error);
    const recoverable = ['AI_RATE_LIMIT', 'AI_TIMEOUT', 'AI_QUOTA_EXCEEDED'];
    return recoverable.includes(code);
  }

  // ============================================================================
  // OTHER HANDLERS
  // ============================================================================

  private handleSubscribeIntents(ws: ExtendedWebSocket): void {
    this.intentSubscribers.add(ws);
    console.log(`[WebSocketManager] Client subscribed to intents (${this.intentSubscribers.size} total)`);
    this.sendToClient(ws, 'subscribed', { type: 'intents', timestamp: Date.now() });
  }

  private handleIntentSubscribe(ws: ExtendedWebSocket, data: any): void {
    const { intentId } = data;
    console.log(`[WebSocketManager] Client subscribed to intent: ${intentId}`);
    this.sendToClient(ws, 'intent:subscribed', { intentId, timestamp: Date.now() });
  }

  // ============================================================================
  // BROADCAST METHODS
  // ============================================================================

  broadcast(event: string, payload?: any): void {
    const message = JSON.stringify({ event, data: payload });
    let sent = 0;
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sent++;
      }
    });
    console.log(`[WebSocketManager] Broadcast '${event}' → ${sent} clients`);
  }

  sendToClient(ws: ExtendedWebSocket, event: string, payload?: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event, data: payload }));
    }
  }

  private sendError(ws: ExtendedWebSocket, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: 'error', data: { message } }));
    }
  }

  // ============================================================================
  // HEARTBEAT
  // ============================================================================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach(ws => {
        if (!ws.isAlive) {
          console.log('[WebSocketManager] Dead client detected, terminating...');
          ws.terminate();
          this.clients.delete(ws);
          this.intentSubscribers.delete(ws);
          return;
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  currentStatus(): { clients: number; activeProcesses: number } {
    return {
      clients: this.clients.size,
      activeProcesses: this.activeProcesses.size
    };
  }

  // Método agregado como recomendado por Claude
  public attachHost(hostExecutor: HostExecutor): void {
    this.hostExecutor = hostExecutor;
    console.log('[WebSocketManager] HostExecutor attached successfully');
    // Integración adicional: Si es necesario, puedes agregar lógica aquí para usar el hostExecutor en otros métodos.
    // Por ejemplo, en handleCopilotPrompt, podrías delegar ejecuciones al hostExecutor si aplica.
    // Ejemplo básico: this.hostExecutor.onMessage((msg) => this.broadcast('host_message', msg));
  }
}