// src/initialization/serverAndUiInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { BloomApiServer } from '../api/server';
import { WebSocketManager } from '../server/WebSocketManager';
import { HostExecutor } from '../host/HostExecutor';
import { BTIPExplorerController } from '../server/BTIPExplorerController';
import { Managers } from './managersInitializer';
import { Providers } from './providersInitializer';

export interface ServerAndUIComponents {
    apiServer: BloomApiServer;
    wsManager: WebSocketManager;
    hostExecutor: HostExecutor;
}

/**
 * Inicializa todo lo relacionado con:
 * - Servidor API local (BloomApiServer)
 * - WebSocketManager
 * - HostExecutor
 * - Comandos de UI (bloom.openHome, bloom.openBTIPExplorer, bloom.executeHost)
 * - FileSystemWatcher de .bloom/**
 */
export async function initializeServerAndUI(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers,
    providers: Providers
): Promise<ServerAndUIComponents> {
    logger.info('Iniciando BloomApiServer y WebSocketManager...');

    // 1. Crear OutputChannel para el servidor
    const outputChannel = vscode.window.createOutputChannel('Bloom Server');
    context.subscriptions.push(outputChannel);

    // 2. Obtener instancia singleton de WebSocket Manager
    const wsManager = WebSocketManager.getInstance();
    await wsManager.start();
    context.subscriptions.push({
        dispose: () => wsManager.stop()
    });

    // 3. Iniciar API Server con configuración moderna
    const apiServer = new BloomApiServer({
        context,
        wsManager,
        outputChannel,
        port: 48215
    });
    
    await apiServer.start();
    logger.info(`BloomApiServer corriendo en puerto ${apiServer.getPort()}`);

    context.subscriptions.push({
        dispose: () => apiServer.stop()
    });

    // 4. Host Executor (solo acepta context)
    const hostExecutor = new HostExecutor(context);

    // 5. Vincular Host con WebSocketManager
    wsManager.attachHost(hostExecutor);

    // 6. Registrar comandos de UI
    registerUICommands(context, apiServer, hostExecutor, logger);

    // 7. FileSystemWatcher para cambios en .bloom/**
    setupFileWatcher(context, wsManager);

    logger.info('✅ Server, WebSocket, comandos UI y watcher inicializados correctamente');

    return { apiServer, wsManager, hostExecutor };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Registra los comandos de UI (Home, BTIP Explorer, Host)
 */
function registerUICommands(
    context: vscode.ExtensionContext,
    apiServer: BloomApiServer,
    hostExecutor: HostExecutor,
    logger: Logger
): void {
    // Comando: Abrir Home
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

            panel.webview.html = getHomeHTML(apiServer.getPort());

            panel.webview.onDidReceiveMessage(
                (message) => {
                    if (message.type === 'ready') {
                        panel.webview.postMessage({
                            type: 'config',
                            baseUrl: `http://localhost:${apiServer.getPort()}`
                        });
                    }
                },
                undefined,
                context.subscriptions
            );
        })
    );

    // Comando: Abrir BTIP Explorer
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openBTIPExplorer', () => {
            BTIPExplorerController.open(context);
        })
    );

    // Comando: Ejecutar Host
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

    logger.info('✅ Comandos UI registrados');
}

/**
 * Configura el FileSystemWatcher para .bloom/**
 */
function setupFileWatcher(
    context: vscode.ExtensionContext,
    wsManager: WebSocketManager
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
}

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