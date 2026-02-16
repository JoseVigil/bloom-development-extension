// src/server/index.ts
// NUCLEUS CONTROL PLANE INITIALIZER
// WebSocket ownership: nucleus-server (independiente de VS Code)
// El plugin solo se conecta como cliente pasivo

import * as vscode from 'vscode';
import { BloomApiServer } from '../api/server';
import { WebSocketManager } from './WebSocketManager';
import { HostExecutor } from '../../installer/host/HostExecutor';
import { BTIPExplorerController } from './BTIPExplorerController';
import { UserManager } from '../managers/userManager';

export async function initializeServer(context: vscode.ExtensionContext) {
    console.log('[Server] Initializing components...');

    const outputChannel = vscode.window.createOutputChannel('Bloom Server');
    context.subscriptions.push(outputChannel);

    const ws = WebSocketManager.getInstance();
    await ws.start();
    context.subscriptions.push({
        dispose: () => ws.stop()
    });
    console.log('[Server] WebSocketManager started on port 4124');

    const userManager = UserManager.init(context);

    const api = new BloomApiServer({
        context,
        wsManager: ws,
        outputChannel,
        port: 48215,
        userManager
    });
    
    await api.start();
    console.log(`[Server] BloomApiServer started on port ${api.getPort()}`);
    
    context.subscriptions.push({
        dispose: () => api.stop()
    });

    const host = new HostExecutor(context);
    ws.attachHost(host);
    console.log('[Server] HostExecutor attached to WebSocketManager');

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

    context.subscriptions.push({
        dispose: () => {
            console.log('[Server] Cleaning up Host...');
            if (host.isRunning()) {
                host.stop();
            }
        }
    });

    console.log('[Server] ✅ All components initialized');

    return {
        api,
        ws,
        host
    };
}