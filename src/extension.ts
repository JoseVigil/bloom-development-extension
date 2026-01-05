// src/extension.ts - VERSIÓN CONSOLIDADA Y LIMPIA
import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { BrainExecutor } from './utils/brainExecutor';
import { initializeContext } from './initialization/contextInitializer';
import { initializeManagers } from './initialization/managersInitializer';
import { initializeProviders } from './initialization/providersInitializer';
import { initializeProfileAccounts } from './initialization/initializeProfileAccounts';
import { initializeServerAndUI } from './initialization/serverAndUiInitializer';
import { registerAllCommands } from './initialization/commandRegistry';
import { registerCriticalCommands } from './initialization/criticalCommandsInitializer';

/**
 * Activación del plugin Bloom
 * Versión consolidada que integra stable + current
 */
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('🚀 Bloom BTIP + Nucleus Premium activando...');

    try {
        // 0. CRITICAL: Initialize BrainExecutor FIRST
        logger.info('[0/7] Initializing Brain CLI...');
        BrainExecutor.initialize(context.extensionPath);
        logger.info('✅ Brain CLI initialized');

        // 1. Inicializar contexto global (UserManager singleton)
        logger.info('[1/7] Initializing context...');
        const isRegistered = initializeContext(context, logger);
        
        // 2. Inicializar managers (singletons)
        logger.info('[2/7] Initializing managers...');
        const managers = initializeManagers(context, logger);
        
        // 3. Verificar workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            logger.warn('⚠️ No workspace folder - Limited functionality');
            registerCriticalCommands(context, logger);
            return;
        }
        
        // 4. Inicializar providers (legacy tree providers)
        logger.info('[3/7] Initializing tree providers...');
        const providers = initializeProviders(context, workspaceFolder, logger, managers);

        // 5. Inicializar Server Stack (API + WebSocket + Host + OAuth)
        logger.info('[4/7] Initializing server stack...');
        const serverComponents = await initializeServerAndUI(context, logger, managers);

        // 6. Inicializar perfiles Chrome y cuentas AI
        logger.info('[5/7] Initializing Chrome profiles & AI accounts...');
        const profileModules = initializeProfileAccounts(
            context,
            logger,
            serverComponents.wsManager,
            managers.chromeProfileManager
        );

        // 7. Registrar TODOS los comandos
        logger.info('[6/7] Registering all commands...');
        registerAllCommands(context, logger, managers, providers);
        
        // 8. Show success notification
        logger.info('[7/7] Activation complete!');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        logger.info('🎉 Bloom Extension Activated Successfully!');
        logger.info('');
        logger.info(`📡 API Server: http://localhost:${serverComponents.api.getPort()}`);
        logger.info('🔌 WebSocket: ws://localhost:4124');
        logger.info('📚 Swagger Docs: http://localhost:48215/api/docs');
        logger.info('🎨 UI: http://localhost:5173');
        logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        vscode.window.showInformationMessage(
            '🌸 Bloom is ready!',
            'Open UI',
            'View Docs'
        ).then(selection => {
            if (selection === 'Open UI') {
                vscode.env.openExternal(vscode.Uri.parse('http://localhost:5173'));
            } else if (selection === 'View Docs') {
                vscode.env.openExternal(vscode.Uri.parse('http://localhost:48215/api/docs'));
            }
        });
        
    } catch (error: any) {
        logger.error('❌ Critical error during activation', error);
        vscode.window.showErrorMessage(
            `Bloom activation failed: ${error.message}`
        );
        throw error;
    }
}

/**
 * Desactivación del plugin
 */
export async function deactivate() {
    console.log('🛑 Bloom BTIP deactivating...');
    
    try {
        // Cleanup is handled automatically by context.subscriptions
        console.log('✅ Bloom Extension Deactivated');
    } catch (error: any) {
        console.error('❌ Deactivation error:', error.message);
    }
}