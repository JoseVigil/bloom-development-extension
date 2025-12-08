// src/server/index.ts
import * as vscode from 'vscode';
import { PluginApiServer } from './PluginApiServer';
import { WebSocketManager } from './WebSocketManager';
import { HostExecutor } from '../host/HostExecutor';
import { BTIPExplorerController } from './BTIPExplorerController';

// ============================================================================
// STUB IMPLEMENTATIONS - Reemplazar cuando existan las clases reales
// ============================================================================

class StubNucleusManager {
    async create(data: any) { 
        return { success: true, message: 'Stub: nucleus created' }; 
    }
    async clone(data: any) { 
        return { success: true, message: 'Stub: nucleus cloned' }; 
    }
    async list() { 
        return []; 
    }
}

class StubProjectManager {
    async create(data: any) { 
        return { success: true, message: 'Stub: project created' }; 
    }
    async list() { 
        return []; 
    }
}

class StubIntentManager {
    async list() { 
        return []; 
    }
    async get(id: string) { 
        return { id, content: 'Stub intent' }; 
    }
    async run(data: any) { 
        return { success: true, message: 'Stub: intent run' }; 
    }
}

class StubGeminiClient {
    async generate(data: any) { 
        return { success: true, content: 'Stub: generated content' }; 
    }
    async refine(data: any) { 
        return { success: true, content: 'Stub: refined content' }; 
    }
    async summarize(data: any) { 
        return { success: true, summary: 'Stub: summary' }; 
    }
}

class StubHostClient {
    async getStatus() { 
        return { 
            connected: false, 
            message: 'Stub: host not connected' 
        }; 
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initializeServer(context: vscode.ExtensionContext) {
    console.log('[Server] Initializing components...');

    // 1. Crear OutputChannel para logs del servidor
    const outputChannel = vscode.window.createOutputChannel('Bloom Server');
    context.subscriptions.push(outputChannel);

    // 2. Obtener versión del plugin
    const pluginVersion = context.extension.packageJSON.version || '1.0.0';

    // 3. Crear dependencias (stubs temporales)
    // TODO: Reemplazar con implementaciones reales cuando existan
    const nucleusManager = new StubNucleusManager();
    const projectManager = new StubProjectManager();
    const intentManager = new StubIntentManager();
    const geminiClient = new StubGeminiClient();
    const hostClient = new StubHostClient();

    // 4. Inicializar WebSocket Manager (singleton)
    const ws = WebSocketManager.getInstance();
    await ws.start();
    context.subscriptions.push({
        dispose: () => ws.stop()
    });
    console.log('[Server] WebSocketManager started on port 4124');

    // 5. Inicializar API Server
    const api = new PluginApiServer({
        context,
        wsManager: ws,
        nucleusManager,
        projectManager,
        intentManager,
        geminiClient,
        hostClient,
        outputChannel,
        pluginVersion
    });
    await api.start();
    console.log(`[Server] PluginApiServer started on port ${api.getPort()}`);
    
    context.subscriptions.push({
        dispose: () => api.stop()
    });

    // 6. Inicializar HostExecutor
    const host = new HostExecutor(context);
    
    // 7. Vincular Host con WebSocketManager
    ws.attachHost(host);
    console.log('[Server] HostExecutor attached to WebSocketManager');

    // 8. Configurar FileSystemWatcher para .bloom/**
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

    // 9. Limpieza al desactivar
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