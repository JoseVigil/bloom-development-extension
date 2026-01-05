// src/initialization/serverAndUiInitializer.ts - CONSOLIDADO
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { BloomApiServer } from '../api/server';
import { WebSocketManager } from '../server/WebSocketManager';
import { HostExecutor } from '../host/HostExecutor';
import { BTIPExplorerController } from '../server/BTIPExplorerController';
import { registerStartGithubOAuthCommand, stopGithubOAuthServer } from '../commands/auth/startGithubOAuth';
import { Managers } from './managersInitializer';

export interface ServerAndUIComponents {
    api: BloomApiServer;
    wsManager: WebSocketManager;
    hostExecutor: HostExecutor;
    outputChannel: vscode.OutputChannel;
}

/**
 * Inicializa el stack completo de servidores:
 * - BloomApiServer (Fastify + Swagger)
 * - WebSocketManager (singleton)
 * - HostExecutor
 * - GitHub OAuth Server
 * - UI Commands (openHome, openBTIPExplorer, etc.)
 * - FileSystemWatcher para .bloom/**
 * 
 * CONSOLIDADO: Fusiona server/index.ts + serverAndUiInitializer.ts
 */
export async function initializeServerAndUI(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers
): Promise<ServerAndUIComponents> {
    logger.info('🔧 Starting server stack initialization...');

    // 1. Crear OutputChannel para el servidor
    const outputChannel = vscode.window.createOutputChannel('Bloom Server');
    context.subscriptions.push(outputChannel);
    outputChannel.show();

    // 2. Inicializar WebSocket Manager (singleton)
    const wsManager = WebSocketManager.getInstance();
    await wsManager.start();
    logger.info('✅ WebSocket server running on ws://localhost:4124');
    
    context.subscriptions.push({
        dispose: () => wsManager.stop()
    });

    // 3. Inicializar HostExecutor
    const hostExecutor = new HostExecutor(context);
    
    // 4. Vincular Host con WebSocketManager
    wsManager.attachHost(hostExecutor);
    await hostExecutor.start();
    logger.info('✅ HostExecutor attached and started');
    
    context.subscriptions.push({
        dispose: () => {
            if (hostExecutor.isRunning()) {
                hostExecutor.stop();
            }
        }
    });

    // 5. Iniciar BloomApiServer (Fastify)
    const api = new BloomApiServer({
        context,
        wsManager,
        outputChannel,
        port: 48215,
        userManager: managers.userManager
    });
    
    await api.start();
    logger.info(`✅ API server running on http://localhost:${api.getPort()}`);
    logger.info(`📚 Swagger docs: http://localhost:${api.getPort()}/api/docs`);
    
    context.subscriptions.push({
        dispose: () => api.stop()
    });

    // 6. Registrar GitHub OAuth Command
    registerStartGithubOAuthCommand(
        context,
        outputChannel,
        managers.userManager,
        wsManager,
        api.getPort()
    );
    logger.info('✅ GitHub OAuth command registered');

    // 7. Registrar comandos de UI (Home, BTIP Explorer, Host, Status, etc.)
    registerUICommands(context, api, wsManager, hostExecutor, logger);

    // 8. FileSystemWatcher para cambios en .bloom/**
    setupFileWatcher(context, wsManager, logger);

    logger.info('🎉 Server stack initialization complete');

    return {
        api,
        wsManager,
        hostExecutor,
        outputChannel
    };
}

// ============================================================================
// UI COMMANDS
// ============================================================================

/**
 * Registra todos los comandos relacionados con UI y servidores
 */
function registerUICommands(
    context: vscode.ExtensionContext,
    api: BloomApiServer,
    wsManager: WebSocketManager,
    hostExecutor: HostExecutor,
    logger: Logger
): void {
    // Command: Open Bloom UI
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openUI', () => {
            vscode.env.openExternal(vscode.Uri.parse('http://localhost:5173'));
        })
    );

    // Command: Open API Docs
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openApiDocs', () => {
            vscode.env.openExternal(vscode.Uri.parse('http://localhost:48215/api/docs'));
        })
    );

    // Command: Open Home (Webview)
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openHome', async () => {
            const panel = vscode.window.createWebviewPanel(
                'bloomHome',
                'Bloom Home',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [context.extensionUri]
                }
            );

            panel.webview.html = getHomeHTML(api.getPort());

            panel.webview.onDidReceiveMessage(
                (message) => {
                    if (message.type === 'ready') {
                        panel.webview.postMessage({
                            type: 'config',
                            baseUrl: `http://localhost:${api.getPort()}`
                        });
                    }
                },
                undefined,
                context.subscriptions
            );
        })
    );

    // Command: Open BTIP Explorer
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openBTIPExplorer', () => {
            BTIPExplorerController.open(context);
        })
    );

    // Command: Execute Host
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.executeHost', async () => {
            try {
                if (hostExecutor.isRunning()) {
                    vscode.window.showInformationMessage('Host ya está en ejecución');
                    return;
                }
                
                await hostExecutor.start();
                vscode.window.showInformationMessage('✅ Host iniciado correctamente');
                logger.info('Host iniciado desde comando');
            } catch (error: any) {
                const errorMsg = `Error al iniciar Host: ${error.message}`;
                vscode.window.showErrorMessage(errorMsg);
                logger.error(errorMsg, error);
            }
        })
    );

    // Command: Restart Servers
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.restartServers', async () => {
            try {
                logger.info('🔄 Restarting servers...');
                
                if (api) {
                    await api.stop();
                    await api.start();
                }
                
                if (wsManager) {
                    await wsManager.stop();
                    await wsManager.start();
                }
                
                vscode.window.showInformationMessage('✅ Bloom servers restarted successfully');
                logger.info('✅ Servers restarted');
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to restart: ${error.message}`);
                logger.error(`❌ Restart failed: ${error.message}`, error);
            }
        })
    );

    // Command: Show Server Status
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showStatus', () => {
            const apiRunning = api?.isRunning() || false;
            const wsStatus = wsManager?.currentStatus() || { clients: 0, activeProcesses: 0 };
            
            const statusMessage = `
Bloom Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
API Server: ${apiRunning ? '✅ Running' : '❌ Stopped'}
  Port: ${api?.getPort() || 'N/A'}
  Docs: http://localhost:48215/api/docs

WebSocket Server: ${wsStatus.clients > 0 ? '✅ Active' : '⚠️ No clients'}
  Port: 4124
  Connected Clients: ${wsStatus.clients}
  Active Processes: ${wsStatus.activeProcesses}

UI: http://localhost:5173
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            `.trim();
            
            vscode.window.showInformationMessage(statusMessage, { modal: true });
        })
    );

    logger.info('✅ UI commands registered');
}

// ============================================================================
// FILE WATCHER
// ============================================================================

/**
 * Configura el FileSystemWatcher para .bloom/**
 */
function setupFileWatcher(
    context: vscode.ExtensionContext,
    wsManager: WebSocketManager,
    logger: Logger
): void {
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/.bloom/**/*');

    const notifyUpdate = (uri: vscode.Uri) => {
        const path = uri.fsPath;
        wsManager.broadcast('btip:updated', { path });
        BTIPExplorerController.notifyUpdate(path);
    };

    fileWatcher.onDidChange(notifyUpdate);
    fileWatcher.onDidCreate(notifyUpdate);
    fileWatcher.onDidDelete((uri) => {
        const path = uri.fsPath;
        wsManager.broadcast('btip:deleted', { path });
        BTIPExplorerController.notifyUpdate(path);
    });

    context.subscriptions.push(fileWatcher);
    logger.info('✅ FileSystemWatcher configured for .bloom/**');
}

// ============================================================================
// WEBVIEW HTML
// ============================================================================

/**
 * Genera el HTML para el webview Home
 */
function getHomeHTML(port: number): string {
    const nonce = getNonce();

    return /* html */`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; connect-src http://localhost:${port} ws://localhost:4124; style-src 'unsafe-inline';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bloom Home</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 20px;
                }
                .status {
                    padding: 10px;
                    border-radius: 4px;
                    margin: 10px 0;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                .connected { color: var(--vscode-terminal-ansiGreen); }
                .disconnected { color: var(--vscode-terminal-ansiRed); }
            </style>
        </head>
        <body>
            <h1>🌸 Bloom Home</h1>
            <div id="root">
                <div class="status">
                    <p>API Server: <span class="connected">Running on port ${port}</span></p>
                    <p>WebSocket: <span id="ws-status" class="disconnected">Connecting...</span></p>
                </div>
                <p>Connecting to Bloom services...</p>
            </div>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                window.vscode = vscode;
                
                // Conectar WebSocket
                const ws = new WebSocket('ws://localhost:4124');
                const wsStatus = document.getElementById('ws-status');
                
                ws.onopen = () => {
                    wsStatus.textContent = 'Connected';
                    wsStatus.className = 'connected';
                    console.log('WebSocket connected');
                };
                
                ws.onclose = () => {
                    wsStatus.textContent = 'Disconnected';
                    wsStatus.className = 'disconnected';
                    console.log('WebSocket disconnected');
                };
                
                ws.onerror = (error) => {
                    wsStatus.textContent = 'Error';
                    wsStatus.className = 'disconnected';
                    console.error('WebSocket error:', error);
                };
                
                ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        console.log('Message from server:', message);
                    } catch (error) {
                        console.error('Error parsing message:', error);
                    }
                };
                
                // Notificar que el webview está listo
                vscode.postMessage({ type: 'ready' });
            </script>
        </body>
        </html>
    `;
}

/**
 * Genera un nonce aleatorio para CSP
 */
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Cleanup del servidor OAuth al desactivar
 */
export function cleanupServerStack(): void {
    stopGithubOAuthServer();
}