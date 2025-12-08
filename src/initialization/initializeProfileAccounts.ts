// src/initialization/initializeProfileAccounts.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AiAccountChecker } from '../ai/AiAccountChecker';
import { WebSocketManager } from '../server/WebSocketManager';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { ProfileTreeProvider } from '../providers/profileTreeProvider';
import { registerProfileCommands } from '../initialization/registerProfileCommands';

/**
 * Inicializa todo lo relacionado con perfiles de Chrome, cuentas AI y árbol de perfiles
 * @returns Objeto con instancias inicializadas para uso posterior si es necesario
 */
export function initializeProfileAccounts(
    context: vscode.ExtensionContext,
    logger: Logger
): {
    wsManager: WebSocketManager;
    accountChecker: AiAccountChecker;
    chromeManager: ChromeProfileManager;
    profileTree: ProfileTreeProvider;
} {
    logger.info('Inicializando módulos de perfiles y cuentas AI...');

    // 1. WebSocket Manager (singleton)
    const wsManager = WebSocketManager.getInstance();
    wsManager.start();
    logger.info('WebSocketManager conectado');

    // 2. AiAccountChecker (singleton con scheduler)
    const accountChecker = AiAccountChecker.init(context);
    accountChecker.start();
    logger.info('AiAccountChecker iniciado (scheduler activo)');

    // 3. ChromeProfileManager
    const chromeManager = new ChromeProfileManager(context, logger);
    logger.info('ChromeProfileManager inicializado');

    // 4. ProfileTreeProvider (singleton estático)
    ProfileTreeProvider.initialize(
        context,
        logger,
        chromeManager,
        wsManager,
        accountChecker
    );
    logger.info('ProfileTreeProvider inicializado y registrado');

    // 5. Registrar comandos relacionados con perfiles y cuentas AI
    registerProfileCommands(context, logger, {
        chromeManager,
        profileTree: ProfileTreeProvider.getInstance(),
        wsManager,
        accountChecker
    });
    logger.info('Comandos de perfiles y cuentas AI registrados');

    return {
        wsManager,
        accountChecker,
        chromeManager,
        profileTree: ProfileTreeProvider.getInstance()
    };
}