// src/initialization/providersInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentTreeProvider } from '../providers/intentTreeProvider';
import { NucleusTreeProvider } from '../providers/nucleusTreeProvider';
import { ProfileTreeProvider } from '../providers/profileTreeProvider';
import { Managers } from './managersInitializer';
import { WebSocketManager } from '../server/WebSocketManager';
import { AiAccountChecker } from '../ai/AiAccountChecker';

export interface Providers {
    intentTreeProvider: IntentTreeProvider;
    nucleusTreeProvider: NucleusTreeProvider;
}

/**
 * Inicializa y registra todos los TreeDataProviders
 */
export function initializeProviders(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    logger: Logger,
    managers: Managers
): Providers {
    // Intent Tree Provider
    const intentTreeProvider = new IntentTreeProvider(
        workspaceFolder,
        logger,
        managers.metadataManager
    );
    vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);
    
    // Nucleus Tree Provider (Real)
    const nucleusTreeProvider = new NucleusTreeProvider(
        workspaceFolder.uri.fsPath,
        context
    );
    vscode.window.registerTreeDataProvider('bloomNucleus', nucleusTreeProvider);
    
    // Crear TreeView con configuración
    vscode.window.createTreeView('bloomNucleus', {
        treeDataProvider: nucleusTreeProvider,
        showCollapseAll: true
    });
    
    // Profile Tree Provider (Singleton)
    try {
        // Obtener o inicializar los managers faltantes (singletons)
        const wsManager = WebSocketManager.getInstance();
        wsManager.start(); // Asegurar que esté iniciado
        const accountChecker = AiAccountChecker.init(context);
        accountChecker.start(); // Asegurar que el scheduler esté activo

        ProfileTreeProvider.initialize(
            context,
            logger,
            managers.chromeProfileManager,
            wsManager,
            accountChecker
        );
        logger.info('✅ ProfileTreeProvider initialized');
    } catch (error: any) {
        logger.error('❌ Error initializing ProfileTreeProvider', error);
    }
    
    logger.info('✅ Tree providers registered');
    
    return {
        intentTreeProvider,
        nucleusTreeProvider
    };
}