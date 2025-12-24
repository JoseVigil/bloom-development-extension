// src/server/index.ts
import * as vscode from 'vscode';
import { BloomApiServer } from '../api/server';
import { WebSocketManager } from './WebSocketManager';
import { HostExecutor } from '../host/HostExecutor';
import { BTIPExplorerController } from './BTIPExplorerController';

/**
 * Inicializa el servidor API, WebSocket Manager y Host Executor
 */
export async function initializeServer(context: vscode.ExtensionContext) {
    console.log('[Server] Initializing components...');

    // 1. Crear OutputChannel para logs del servidor
    const outputChannel = vscode.window.createOutputChannel('Bloom Server');
    context.subscriptions.push(outputChannel);

    // 2. Inicializar WebSocket Manager (singleton)
    const ws = WebSocketManager.getInstance();
    await ws.start();
    context.subscriptions.push({
        dispose: () => ws.stop()
    });
    console.log('[Server] WebSocketManager started on port 4124');

    // 3. Inicializar API Server
    const api = new BloomApiServer({
        context,
        wsManager: ws,
        outputChannel,
        port: 48215
    });
    
    await api.start();
    console.log(`[Server] BloomApiServer started on port ${api.getPort()}`);
    
    context.subscriptions.push({
        dispose: () => api.stop()
    });

    // 4. Inicializar HostExecutor
    const host = new HostExecutor(context);
    
    // 5. Vincular Host con WebSocketManager
    ws.attachHost(host);
    console.log('[Server] HostExecutor attached to WebSocketManager');

    // 6. Configurar FileSystemWatcher para .bloom/**
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/.bloom/**/*');

    const notifyUpdate = (uri: vscode.Uri) => {
        const path = uri.fsPath;
        ws.broadcast('btip:updated', { path });
        BTIPExplorerController.notifyUpdate(path);
    };

    fileWatcher.onDidChange(notifyUpdate);
    fileWatcher.onDidCreate(notifyUpdate);
    fileWatcher.onDidDelete((uri) => {
        const path = uri.fsPath;
        ws.broadcast('btip:deleted', { path });
        BTIPExplorerController.notifyUpdate(path);
    });

    context.subscriptions.push(fileWatcher);

    // 7. Limpieza al desactivar
    context.subscriptions.push({
        dispose: () => {
            console.log('[Server] Cleaning up Host...');
            if (host.isRunning()) {
                host.stop();
            }
        }
    });

    console.log('[Server] ✅ All components initialized');

    // Retornar instancias para uso externo si es necesario
    return {
        api,
        ws,
        host
    };
}