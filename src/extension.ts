// src/extension.ts
import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { initializeContext } from './initialization/contextInitializer';
import { initializeProviders } from './initialization/providersInitializer';
import { initializeManagers } from './initialization/managersInitializer';
import { registerAllCommands } from './initialization/commandRegistry';
import { registerCriticalCommands } from './initialization/criticalCommandsInitializer';
import { initializeServer } from './server';
import { registerStartGithubOAuthCommand, stopGithubOAuthServer } from './commands/auth/startGithubOAuth';
import { AiAccountChecker } from './ai/AiAccountChecker';


export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('🌸 Bloom BTIP + Nucleus Premium activando...');

    try {
        // 1. Inicializar contexto global
        initializeContext(context, logger);
        
        // 2. Inicializar managers
        const managers = initializeManagers(context, logger);
        
        // 3. Verificar workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            logger.warn('⚠️ No workspace folder - Limited functionality');
            registerCriticalCommands(context, logger);
            return;
        }
        
        // 4. Inicializar providers
        const providers = initializeProviders(context, workspaceFolder, logger, managers);

        // 5. Account Checkers
        const checker = AiAccountChecker.init(context);
        checker.start();

        // 6. Inicializar servidor (API, WebSocket, Host)
        initializeServer(context)
            .then(({ api, ws, host }) => {
                logger.info('✅ Server components initialized');
                logger.info(`📡 API Server: http://localhost:${api.getPort()}`);
                logger.info(`🔌 WebSocket: ws://localhost:4124`);

                // 6. Registrar comando GitHub OAuth con referencias al servidor
                const outputChannel = vscode.window.createOutputChannel('Bloom GitHub OAuth');
                context.subscriptions.push(outputChannel);

                registerStartGithubOAuthCommand(
                    context,
                    outputChannel,
                    managers.userManager,
                    ws,
                    api.getPort()
                );

                logger.info('✅ GitHub OAuth command registered');
            })
            .catch(err => {
                logger.error('❌ Error initializing server', err);
                vscode.window.showErrorMessage(
                    `Bloom: Error al iniciar el servidor - ${err.message}`
                );
            });
        
        // 7. Registrar comandos principales
        registerAllCommands(context, logger, managers, providers);
        
        logger.info('✅ Bloom BTIP activation complete');
        
    } catch (error: any) {
        logger.error('❌ Critical error during activation', error);
        vscode.window.showErrorMessage(
            `Bloom BTIP falló al activarse: ${error.message}`
        );
    }
}

export function deactivate() {
    // Cleanup OAuth server
    stopGithubOAuthServer();
    
    // VSCode limpia automáticamente los subscriptions
    console.log('🌸 Bloom BTIP deactivated');
}