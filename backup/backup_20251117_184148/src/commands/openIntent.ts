import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { IntentTreeItem } from '../providers/intentTreeProvider';
import { joinPath } from '../utils/uriHelper';

export function registerOpenIntent(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.openIntent',
        async (treeItem: IntentTreeItem) => {
            logger.info(`Abriendo intent: ${treeItem.intent.metadata.name}`);
            
            const intentPath = joinPath(
                treeItem.intent.folderUri,
                'intent.bl'
            );
            
            const document = await vscode.workspace.openTextDocument(intentPath);
            await vscode.window.showTextDocument(document);
            
            await metadataManager.incrementOpens(treeItem.intent.folderUri);
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.openIntent" registrado');
}