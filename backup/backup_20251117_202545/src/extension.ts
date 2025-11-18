import * as vscode from 'vscode';
import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
import { registerGenerateIntent } from './commands/generateIntent';
import { registerOpenIntent } from './commands/openIntent';
import { registerCopyContextToClipboard } from './commands/copyContextToClipboard';
import { registerDeleteIntent } from './commands/deleteIntent';
import { Logger } from './utils/logger';
import { MetadataManager } from './core/metadataManager';
import { ContextGatherer } from './core/contextGatherer';
import { TokenEstimator } from './core/tokenEstimator';
import { IntentTreeProvider } from './providers/intentTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom plugin v2.0 activado');
    
    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const intentTreeProvider = new IntentTreeProvider(
            workspaceFolder,
            logger,
            metadataManager
        );
        
        vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);
        
        registerOpenIntent(context, logger, metadataManager);
        registerCopyContextToClipboard(context, logger, contextGatherer, tokenEstimator);
        registerDeleteIntent(context, logger, intentTreeProvider);
    }
    
    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);
    
    logger.info('Todos los comandos registrados exitosamente');
}

export function deactivate() {}