// src/initialization/providersInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentTreeProvider } from '../providers/intentTreeProvider';
import { NucleusTreeProvider } from '../providers/nucleusTreeProvider';
import { NucleusWelcomeProvider } from '../providers/nucleusWelcomeProvider';
import { ProfileTreeProvider } from '../providers/profileTreeProvider';
import { Managers } from './managersInitializer';

export interface Providers {
    intentTreeProvider: IntentTreeProvider;
    nucleusTreeProvider: NucleusTreeProvider;
    nucleusWelcomeProvider: NucleusWelcomeProvider;
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
    
    // Nucleus Welcome Provider (Para primera vez)
    const nucleusWelcomeProvider = new NucleusWelcomeProvider(context);
    vscode.window.registerTreeDataProvider('bloomNucleusWelcome', nucleusWelcomeProvider);
    
    // Profile Tree Provider (Singleton)
    try {
        ProfileTreeProvider.initialize(context, logger, managers.chromeProfileManager);
        logger.info('✅ ProfileTreeProvider initialized');
    } catch (error: any) {
        logger.error('❌ Error initializing ProfileTreeProvider', error);
    }
    
    logger.info('✅ Tree providers registered');
    
    return {
        intentTreeProvider,
        nucleusTreeProvider,
        nucleusWelcomeProvider
    };
}