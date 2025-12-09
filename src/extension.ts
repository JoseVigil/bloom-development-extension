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
import { initializeProfileAccounts } from './initialization/initializeProfileAccounts'; 

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom BTIP + Nucleus Premium activando...');

    try {
        // 1. Inicializar contexto global
        initializeContext(context, logger);
        
        // 2. Inicializar managers
        const managers = initializeManagers(context, logger);
        
        // 3. Verificar workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        
        if (!workspaceFolder) {
            logger.warn('No workspace folder - Limited functionality');
            registerCriticalCommands(context, logger);
            return;
        }
        
        // 4. Inicializar providers (antiguos)
        const providers = initializeProviders(context, workspaceFolder, logger, managers);

        // 5. NUEVO: Inicializar perfiles Chrome, cuentas AI y árbol de perfiles
        const profileModules = initializeProfileAccounts(context, logger);

        // 6. (Opcional) Account Checker duplicado? → Ya está dentro de initializeProfileAccounts
        // Se mantiene solo por compatibilidad vieja, pero ya no es necesario duplicar
        // const checker = AiAccountChecker.init(context);
        // checker.start();

        // 7. Inicializar servidor (API, WebSocket, Host)
        initializeServer(context)
            .then(({ api, ws, host }) => {
                logger.info('Server components initialized');
                logger.info(`API Server: http://localhost:${api.getPort()}`);
                logger.info(`WebSocket: ws://localhost:4124`);

                const outputChannel = vscode.window.createOutputChannel('Bloom GitHub OAuth');
                context.subscriptions.push(outputChannel);

                registerStartGithubOAuthCommand(
                    context,
                    outputChannel,
                    managers.userManager,
                    ws,
                    api.getPort()
                );

                logger.info('GitHub OAuth command registered');
            })
            .catch(err => {
                logger.error('Error initializing server', err);
                vscode.window.showErrorMessage(
                    `Bloom: Error al iniciar el servidor - ${err.message}`
                );
            });
        
        // 8. Registrar comandos principales (los tuyos clásicos)
        registerAllCommands(context, logger, managers, providers);
        
        logger.info('Bloom BTIP + Nucleus Premium activation complete');
        logger.info('Perfil Chrome, cuentas AI y WebSocket listos');
        
    } catch (error: any) {
        logger.error('Critical error during activation', error);
        vscode.window.showErrorMessage(
            `Bloom BTIP falló al activarse: ${error.message}`
        );
    }
}

export function deactivate() {
    stopGithubOAuthServer();
    console.log('Bloom BTIP deactivated');
}