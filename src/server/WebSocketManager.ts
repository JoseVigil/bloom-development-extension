import WebSocket, { WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { HostExecutor } from '../host/HostExecutor';
import { EventEmitter } from 'events';
import * as vscode from 'vscode'; // Necesario para acceder al workspace
import { CopilotNativeAdapter } from '../ai/adapters/CopilotNativeAdapter'; // <--- IMPORTAR

// Extensión limpia de WebSocket para agregar isAlive
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
}

interface WebSocketMessage {
  event: string;
  data?: any;
}

interface WebSocketError {
  event: 'error';
  data: {
    message: string;
  };
}

interface StatusResponse {
  plugin: string;
  host: any;
  gemini: any;
  connectedClients: number;
}

/**
 * WebSocketManager - Transport layer para eventos bidireccionales
 */
export class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager;

  private wss: WebSocketServer | null = null;
  private clients: Set<ExtendedWebSocket> = new Set();
  private intentSubscribers: Set<ExtendedWebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private attachedHost: HostExecutor | null = null;
  private copilotAdapter: CopilotNativeAdapter; // <--- Instancia del Adapter

  private readonly PORT = 4124;
  private readonly HEARTBEAT_INTERVAL = 20000; // 20 segundos

  private constructor() {
    super();
    this.copilotAdapter = new CopilotNativeAdapter(); // <--- Inicializar
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  async start(): Promise<void> {
    if (this.wss) {
      console.log('[WebSocketManager] Ya está iniciado');
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
            console.warn('[WebSocketManager] Conexión rechazada desde origen:', origin);
            return false;
          },
        });

        this.wss.on('connection', (ws: WebSocket) => {
          this.handleConnection(ws as ExtendedWebSocket);
        });

        this.wss.on('error', (error: Error) => {
          console.error('[WebSocketManager] Error del servidor WebSocket:', error);
        });

        this.startHeartbeat();

        console.log(`[WebSocketManager] Servidor WebSocket iniciado en ws://localhost:${this.PORT}`);
        resolve();
      } catch (err) {
        console.error('[WebSocketManager] Fallo al iniciar servidor:', err);
        reject(err);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

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
          console.log('[WebSocketManager] Servidor WebSocket detenido');
          this.wss = null;
          resolve();
        });
      });
    }
  }

  private handleConnection(ws: ExtendedWebSocket): void {
    console.log('[WebSocketManager] Nueva conexión entrante');
    this.clients.add(ws);
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(ws, data.toString());
    });

    ws.on('close', () => {
      console.log('[WebSocketManager] Cliente desconectado');
      this.clients.delete(ws);
      this.intentSubscribers.delete(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('[WebSocketManager] Error en cliente:', error);
      this.clients.delete(ws);
      this.intentSubscribers.delete(ws);
    });

    this.sendToClient(ws, 'connected', {
      timestamp: Date.now(),
      clients: this.clients.size,
    });
  }

  private async handleMessage(ws: ExtendedWebSocket, rawMessage: string): Promise<void> {
    let message: WebSocketMessage;
    try {
      message = JSON.parse(rawMessage);
    } catch (err) {
      this.sendError(ws, 'Mensaje JSON inválido');
      return;
    }

    console.log(`[WebSocketManager] Evento recibido: ${message.event}`);

    try {
      switch (message.event) {
        case 'request_status':
          await this.handleRequestStatus(ws);
          break;

        case 'subscribe_intents':
          this.handleSubscribeIntents(ws);
          break;

        case 'run_gemini_dev_to_doc':
          await this.handleRunGeminiDevToDoc(ws, message.data);
          break;

        case 'open_intent':
          await this.handleOpenIntent(ws, message.data);
          break;
        
        // --- Chat con Copilot ---
        case 'btip_chat_prompt':
          await this.handleCopilotChat(ws, message.data);
          break;
        // --------------------------------------

        default:
          this.sendError(ws, `Evento desconocido: ${message.event}`);
      }
    } catch (err: any) {
      console.error('[WebSocketManager] Error procesando mensaje:', err);
      this.sendError(ws, err.message || 'Error interno');
    }
  }

  // --- Lógica del Chat ---
  private async handleCopilotChat(ws: ExtendedWebSocket, payload: any) {
    const { intentId, text } = payload;
    
    // Obtener ruta del proyecto (asumiendo single root workspace por simplicidad)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        this.sendError(ws, 'No hay un proyecto abierto en VS Code');
        return;
    }
    const projectRoot = workspaceFolders[0].uri.fsPath;

    // 1. Notificar inicio de stream
    this.sendToClient(ws, 'chat_stream_start', { intentId, timestamp: Date.now() });

    // 2. Ejecutar Copilot con Callback para Streaming
    await this.copilotAdapter.streamResponse(
        text,
        intentId,
        projectRoot,
        (chunk) => {
            this.sendToClient(ws, 'chat_stream_chunk', {
                intentId,
                chunk
            });
        }
    );

    // 3. Notificar fin
    this.sendToClient(ws, 'chat_stream_end', { intentId, timestamp: Date.now() });
  }
  // -----------------------

  private async handleRequestStatus(ws: ExtendedWebSocket): Promise<void> {
    const status: StatusResponse = {
      plugin: 'bloom-vscode-plugin',
      host: this.attachedHost && typeof (this.attachedHost as any).hostStatus === 'function'
        ? (this.attachedHost as any).hostStatus()
        : { connected: false },
      gemini: this.getGeminiStatus(),
      connectedClients: this.clients.size,
    };

    this.sendToClient(ws, 'status', status);
  }

  private handleSubscribeIntents(ws: ExtendedWebSocket): void {
    this.intentSubscribers.add(ws);
    console.log(`[WebSocketManager] Cliente suscrito a intents (${this.intentSubscribers.size} total)`);
    this.sendToClient(ws, 'subscribed', { type: 'intents', timestamp: Date.now() });
  }

  private async handleRunGeminiDevToDoc(ws: ExtendedWebSocket, data: any): Promise<void> {
    console.log('[WebSocketManager] Ejecutando pipeline gemini_dev_to_doc...', data);
    this.sendToClient(ws, 'gemini_pipeline_started', { timestamp: Date.now(), data });
    // TODO: Delegar a PluginApiServer cuando esté listo
  }

  private async handleOpenIntent(ws: ExtendedWebSocket, data: any): Promise<void> {
    const { id } = data || {};
    if (!id) {
      this.sendError(ws, 'Falta ID del intent');
      return;
    }

    console.log(`[WebSocketManager] Abriendo intent: ${id}`);
    // TODO: await IntentController.openIntent(id);
    this.sendToClient(ws, 'intent_opened', { id, timestamp: Date.now() });
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
    console.log(`[WebSocketManager] Broadcast '${event}' → ${sent} clientes`);
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

  currentStatus(): { clients: number } {
    return { clients: this.clients.size };
  }

  attachHost(host: HostExecutor): void {
    this.attachedHost = host;
    console.log('[WebSocketManager] HostExecutor adjuntado');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('heartbeat', { timestamp: Date.now() });

      this.clients.forEach(ws => {
        if (!ws.isAlive) {
          console.log('[WebSocketManager] Cliente muerto detectado, cerrando...');
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

  private getGeminiStatus(): any {
    return { configured: false, apiKey: false };
  }

  notifyIntentsUpdated(data: any): void {
    const message = JSON.stringify({ event: 'intents_updated', data });
    let sent = 0;
    this.intentSubscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message); 
        sent++;
      }
    });
    console.log(`[WebSocketManager] intents_updated → ${sent} suscriptores`);
  }

  notifyHostEvent(eventType: string, data: any): void {
    this.broadcast('host_event', { type: eventType, ...data, timestamp: Date.now() });
  }
}