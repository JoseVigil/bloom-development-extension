import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { IntentTreeItem, IntentTreeProvider } from '../providers/intentTreeProvider';

export function registerEditIntent(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager,
    treeProvider: IntentTreeProvider
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.editIntent',
        async (treeItem: IntentTreeItem) => {
            const intentPath = vscode.Uri.file(path.join(treeItem.intent.folderUri.fsPath, 'intent.bl'));
            
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