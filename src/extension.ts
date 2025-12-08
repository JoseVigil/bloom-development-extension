// src/extension.ts
import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { initializeContext } from './initialization/contextInitializer';
import { initializeProviders } from './initialization/providersInitializer';
import { initializeManagers } from './initialization/managersInitializer';
import { registerAllCommands } from './initialization/commandRegistry';
import { registerCriticalCommands } from './initialization/criticalCommandsInitializer';
import { initializeServer } from './server'; // ← Cambio: importar desde server/index.ts

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('🌸 Bloom BTIP + Nucleus Premium activando...');

    try {
        // 1. Inicializar contexto global
        const isRegistered = initializeContext(context, logger);
        
        // 2. Inicializar managers
        const managers = initializeManagers(context, logger);
        
        // 3. Verificar workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            logger.warn('⚠️ No workspace folder - Limited functionality');
            registerCriticalCommands(context, logger, managers.welcomeView);
            return;
        }
        
        // 4. Inicializar providers
        const providers = initializeProviders(context, workspaceFolder, logger, managers);

        // 5. Inicializar servidor (API, WebSocket, Host) ← Cambio: usar initializeServer
        initializeServer(context)
            .then(({ api, ws, host }) => {
                logger.info('✅ Server components initialized');
                logger.info(`📡 API Server: http://localhost:${api.getPort()}`);
                logger.info(`🔌 WebSocket: ws://localhost:4124`);
            })
            .catch(err => {
                logger.error('❌ Error initializing server', err);
                vscode.window.showErrorMessage(
                    `Bloom: Error al iniciar el servidor - ${err.message}`
                );
            });
        
        // 6. Registrar comandos principales
        registerAllCommands(context, logger, managers, providers);
        
        // 7. Welcome en primera instalación
        if (!isRegistered) {
            logger.info('📋 Primera instalación - Mostrando Welcome');
            setTimeout(() => {
                try {
                    managers.welcomeView.show();
                } catch (error: any) {
                    logger.error('Error showing welcome', error);
                }
            }, 1000);
        }
        
        logger.info('✅ Bloom BTIP activation complete');
        
    } catch (error: any) {
        logger.error('❌ Critical error during activation', error);
        vscode.window.showErrorMessage(
            `Bloom BTIP falló al activarse: ${error.message}`
        );
    }
}

export function deactivate() {
    // VSCode limpia automáticamente los subscriptions
    console.log('🌸 Bloom BTIP deactivated');
}