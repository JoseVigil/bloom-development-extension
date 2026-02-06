// src/server/WebSocketManager.ts
// NUCLEUS CONTROL PLANE - WebSocket Server
// Owner: nucleus-server (NO VS Code dependency)
// Lifecycle: Managed by Nucleus, not IDE

import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import OllamaNativeAdapter from '../ai/adapters/OllamaNativeAdapter';
import { AIRuntimeAdapter } from '../api/adapters/AIRuntimeAdapter';
import * as fs from 'fs/promises';
import * as path from 'path';
import { HostExecutor } from '../host/HostExecutor';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  clientId?: string;
}

interface WebSocketMessage {
  event: string;
  data?: any;
}

interface AIExecutionProcess {
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
  private ollamaAdapter: OllamaNativeAdapter;
  private activeProcesses: Map<string, AIExecutionProcess> = new Map();
  private readonly PORT = 4124;
  private readonly HEARTBEAT_INTERVAL = 20000;

  private hostExecutor?: HostExecutor;

  private constructor() {
    super();
    this.ollamaAdapter = new OllamaNativeAdapter();
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
            
            if (origin?.startsWith('vscode-webview://')) return true;
            if (origin?.includes('localhost') || origin?.includes('127.0.0.1')) return true;
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

    this.activeProcesses.forEach(process => {
      this.sendToClient(process.client, 'bloom.ai.execution.cancelled', {
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

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[WebSocketManager] Connection closed: ${code} - ${reason.toString()}`);
      this.clients.delete(ws);
      this.intentSubscribers.delete(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocketManager] Client error:', error);
    });

    this.sendToClient(ws, 'bloom.ai.execution.connected', {
      clientId: ws.clientId,
      timestamp: Date.now()
    });
  }

  private async handleMessage(ws: ExtendedWebSocket, rawMessage: string): Promise<void> {
    try {
      const message: WebSocketMessage = JSON.parse(rawMessage);
      console.log(`[WebSocketManager] Received: ${message.event}`);

      switch (message.event) {
        case 'bloom.ai.execution.prompt':
          await this.handleAIExecutionPrompt(ws, message.data);
          break;

        case 'bloom.ai.execution.cancel':
          await this.handleAIExecutionCancel(ws, message.data);
          break;

        case 'subscribe_intents':
          this.handleSubscribeIntents(ws);
          break;

        case 'intent:subscribe':
          this.handleIntentSubscribe(ws, message.data);
          break;

        case 'ping':
          this.sendToClient(ws, 'pong', { timestamp: Date.now() });
          break;

        default:
          console.warn(`[WebSocketManager] Unknown event: ${message.event}`);
          this.sendError(ws, `Unknown event: ${message.event}`);
      }
    } catch (error) {
      console.error('[WebSocketManager] Message handling error:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  private async handleAIExecutionPrompt(ws: ExtendedWebSocket, data: any): Promise<void> {
    const { context, text, intentId, profileId, metadata } = data;

    if (!context || !text) {
      this.sendError(ws, 'Missing required fields: context or text');
      return;
    }

    const processId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const process: AIExecutionProcess = {
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

    this.sendToClient(ws, 'bloom.ai.execution.stream_start', {
      processId,
      context,
      intentId,
      timestamp: Date.now(),
      cancellable: true
    });

    try {
      const result = await this.ollamaAdapter.executePrompt({
        prompt: text,
        context: { intentId, profileId, metadata },
        stream: true
      });

      for await (const chunk of result.chunks) {
        process.sequence++;
        this.sendToClient(ws, 'bloom.ai.execution.stream_chunk', {
          processId,
          context,
          intentId,
          sequence: process.sequence,
          chunk
        });
      }

      process.status = 'completed';
      this.sendToClient(ws, 'bloom.ai.execution.stream_end', {
        processId,
        context,
        intentId,
        timestamp: Date.now(),
        total_chunks: process.sequence,
        total_chars: result.totalChars
      });
    } catch (error: any) {
      process.status = 'error';
      const code = this.classifyError(error);
      this.sendToClient(ws, 'bloom.ai.execution.error', {
        processId,
        error_code: code,
        details: error?.message || 'Unknown error'
      });

      if (this.isRecoverableError(error)) {
        console.log('[WebSocketManager] Recoverable error detected');
      }
    } finally {
      this.activeProcesses.delete(processId);
    }
  }

  private async handleAIExecutionCancel(ws: ExtendedWebSocket, data: any): Promise<void> {
    const { processId } = data;

    const process = this.activeProcesses.get(processId);
    if (!process) {
      this.sendError(ws, `Process not found: ${processId}`);
      return;
    }

    await this.ollamaAdapter.cancelProcess(processId);

    process.status = 'cancelled';
    this.sendToClient(ws, 'bloom.ai.execution.cancelled', {
      processId,
      reason: 'user_request'
    });

    this.activeProcesses.delete(processId);
  }

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

  private getSystemContract(): string {
    return `
You are Bloom AI Runtime - Arquitecto de Campo.
Rules:
- You are sovereign, persistent, with memory and authority.
- Respect the current phase and state.
- If structural health markers indicate issues, surface them immediately.
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
    if (msg.includes('ollama') && msg.includes('not running')) return 'AI_EXECUTION_OLLAMA_NOT_RUNNING';
    return 'AI_EXECUTION_FAILED';
  }

  private isRecoverableError(error: any): boolean {
    const code = this.classifyError(error);
    const recoverable = [
      'AI_RATE_LIMIT',
      'AI_TIMEOUT',
      'AI_QUOTA_EXCEEDED',
      'AI_EXECUTION_OLLAMA_NOT_RUNNING'
    ];
    return recoverable.includes(code);
  }

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

  public attachHost(hostExecutor: HostExecutor): void {
    this.hostExecutor = hostExecutor;
    console.log('[WebSocketManager] HostExecutor attached successfully');
  }
}