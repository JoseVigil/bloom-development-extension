import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentTreeItem, IntentTreeProvider } from '../providers/intentTreeProvider';

export function registerDeleteIntent(
    context: vscode.ExtensionContext,
    logger: Logger,
    treeProvider: IntentTreeProvider
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.deleteIntent',
        async (treeItem: IntentTreeItem) => {
            const metadata = treeItem.intent.metadata;
            
            const confirm = await vscode.window.showWarningMessage(
                `¿Eliminar intent '${metadata.displayName || metadata.name}'?`,
                { modal: true, detail: 'Esta acción no se puede deshacer.' },
                'Eliminar'
            );
            
            if (confirm !== 'Eliminar') return;
            
            try {
                await vscode.workspace.fs.delete(treeItem.intent.folderUri, { recursive: true });
                
                treeProvider.refresh();
                
                vscode.window.showInformationMessage(
                    `🗑️ Intent '${metadata.name}' eliminado`
                );
                
                logger.info(`Intent eliminado: ${metadata.name}`);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error al eliminar intent: ${(error as Error).message}`
                );
                logger.error('Error en deleteIntent', error as Error);
            }
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.deleteIntent" registrado');
}