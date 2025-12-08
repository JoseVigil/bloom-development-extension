// src/initialization/managersInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { ContextGatherer } from '../core/contextGatherer';
import { TokenEstimator } from '../utils/tokenEstimator';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { GitManager } from '../utils/gitManager';

// ← Añadimos la importación del UserManager
import { UserManager } from '../managers/userManager';

export interface Managers {
    logger: Logger;
    metadataManager: MetadataManager;
    contextGatherer: ContextGatherer;
    tokenEstimator: TokenEstimator;
    chromeProfileManager: ChromeProfileManager;
    // ← Añadimos la propiedad al interfaz
    userManager: UserManager;
}

/**
 * Inicializa todos los managers del sistema
 */
export function initializeManagers(
    context: vscode.ExtensionContext,
    logger: Logger
): Managers {
    // Inicializar GitManager (singleton global)
    GitManager.initialize(context);
    
    // Crear instancias de managers
    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();
    const chromeProfileManager = new ChromeProfileManager(context, logger);
    
    // ← Inicializamos el UserManager con el contexto
    const userManager = UserManager.init(context);
    
    logger.info('✅ Managers initialized');
    
    return {
        logger,
        metadataManager,
        contextGatherer,
        tokenEstimator,
        chromeProfileManager,
        userManager          // ← Lo incluimos en el objeto devuelto
    };
}