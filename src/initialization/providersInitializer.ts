// src/initialization/providersInitializer.ts - ACTUALIZADO
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentTreeProvider } from '../providers/intentTreeProvider';
import { NucleusTreeProvider } from '../providers/nucleusTreeProvider';
import { Managers } from './managersInitializer';

export interface Providers {
    intentTreeProvider: IntentTreeProvider;
    nucleusTreeProvider: NucleusTreeProvider;
}

/**
 * Inicializa y registra los TreeDataProviders LEGACY
 * 
 * ACTUALIZADO: Eliminada la inicialización de ProfileTreeProvider
 * ya que se maneja en initializeProfileAccounts.ts para evitar duplicación
 * 
 * ProfileTreeProvider requiere WebSocketManager y AiAccountChecker que se
 * inicializan DESPUÉS en el flujo de activación
 */
export function initializeProviders(
    context: vscode.ExtensionContext,
    workspaceFolder: vscode.WorkspaceFolder,
    logger: Logger,
    managers: Managers
): Providers {
    logger.info('🌲 Initializing tree providers...');

    // 1. Intent Tree Provider
    const intentTreeProvider = new IntentTreeProvider(
        workspaceFolder,
        logger,
        managers.metadataManager
    );
    vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);
    logger.info('✅ IntentTreeProvider registered');
    
    // 2. Nucleus Tree Provider (Real)
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
    logger.info('✅ NucleusTreeProvider registered with TreeView');
    
    // ⚠️ ProfileTreeProvider se inicializa en initializeProfileAccounts.ts
    // después de que WebSocketManager y AiAccountChecker estén listos
    
    logger.info('✅ Legacy tree providers initialized');
    
    return {
        intentTreeProvider,
        nucleusTreeProvider
    };
}