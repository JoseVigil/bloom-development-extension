import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { IntentTreeItem, IntentTreeProvider } from '../providers/intentTreeProvider';
import { IntentStatus } from '../models/intent';

export function registerChangeIntentStatus(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager,
    treeProvider: IntentTreeProvider
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.changeIntentStatus',
        async (treeItem: IntentTreeItem, newStatus: IntentStatus) => {
            await metadataManager.changeStatus(treeItem.intent.folderUri, newStatus);
            
            treeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `✅ Intent marcado como '${newStatus}'`
            );
            
            logger.info(`Status cambiado: ${treeItem.intent.metadata.name} -> ${newStatus}`);
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.changeIntentStatus" registrado');
}