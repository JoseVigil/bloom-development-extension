import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { IntentTreeItem, IntentTreeProvider } from '../providers/intentTreeProvider';
import { joinPath } from '../utils/uriHelper';

export function registerEditIntent(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager,
    treeProvider: IntentTreeProvider
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.editIntent',
        async (treeItem: IntentTreeItem) => {
            const intentPath = joinPath(treeItem.intent.folderUri, 'intent.bl');
            
            const document = await vscode.workspace.openTextDocument(intentPath);
            await vscode.window.showTextDocument(document);
            
            await metadataManager.update(treeItem.intent.folderUri, {
                updated: new Date().toISOString()
            });
            
            treeProvider.refresh();
            
            logger.info(`Intent editado: ${treeItem.intent.metadata.name}`);
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.editIntent" registrado');
}