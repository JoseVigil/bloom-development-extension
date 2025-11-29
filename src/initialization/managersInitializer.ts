// src/initialization/managersInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { ContextGatherer } from '../core/contextGatherer';
import { TokenEstimator } from '../utils/tokenEstimator';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { WelcomeView } from '../ui/welcome/welcomeView';
import { GitManager } from '../utils/gitManager';

export interface Managers {
    logger: Logger;
    metadataManager: MetadataManager;
    contextGatherer: ContextGatherer;
    tokenEstimator: TokenEstimator;
    chromeProfileManager: ChromeProfileManager;
    welcomeView: WelcomeView;
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
    const welcomeView = new WelcomeView(context);
    
    logger.info('✅ Managers initialized');
    
    return {
        logger,
        metadataManager,
        contextGatherer,
        tokenEstimator,
        chromeProfileManager,
        welcomeView
    };
}