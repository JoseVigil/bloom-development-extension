// src/initialization/initializeProfileAccounts.ts - ACTUALIZADO
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AiAccountChecker } from '../ai/AiAccountChecker';
import { WebSocketManager } from '../server/WebSocketManager';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { ProfileTreeProvider } from '../providers/profileTreeProvider';
import { registerProfileCommands } from '../initialization/registerProfileCommands';

/**
 * Inicializa todo lo relacionado con perfiles de Chrome, cuentas AI y árbol de perfiles
 * 
 * ACTUALIZADO: Ahora recibe WebSocketManager y ChromeProfileManager como parámetros
 * para evitar crear instancias duplicadas
 * 
 * @param context - ExtensionContext de VSCode
 * @param logger - Logger instance
 * @param wsManager - WebSocketManager singleton (ya inicializado en serverAndUiInitializer)
 * @param chromeManager - ChromeProfileManager (ya inicializado en managersInitializer)
 * @returns Objeto con instancias inicializadas
 */
export function initializeProfileAccounts(
    context: vscode.ExtensionContext,
    logger: Logger,
    wsManager: WebSocketManager,
    chromeManager: ChromeProfileManager
): {
    accountChecker: AiAccountChecker;
    profileTree: ProfileTreeProvider;
} {
    logger.info('🎨 Initializing Chrome profiles & AI accounts module...');

    // 1. AiAccountChecker (singleton con scheduler)
    const accountChecker = AiAccountChecker.init(context);
    accountChecker.start();
    logger.info('✅ AiAccountChecker started (scheduler active)');

    // 2. ProfileTreeProvider (singleton estático)
    ProfileTreeProvider.initialize(
        context,
        logger,
        chromeManager,
        wsManager,
        accountChecker
    );
    logger.info('✅ ProfileTreeProvider initialized and registered');

    // 3. Registrar comandos relacionados con perfiles y cuentas AI
    registerProfileCommands(context, logger, {
        chromeManager,
        profileTree: ProfileTreeProvider.getInstance(),
        wsManager,
        accountChecker
    });
    logger.info('✅ Profile & AI account commands registered');

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🎉 Chrome profiles & AI accounts module ready');
    logger.info('   🌐 WebSocket: Reusing existing instance');
    logger.info('   🎨 Chrome Manager: Reusing existing instance');
    logger.info('   🤖 AI Checker: Active with scheduler');
    logger.info('   🌲 Profile Tree: Registered in sidebar');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
        accountChecker,
        profileTree: ProfileTreeProvider.getInstance()
    };
}