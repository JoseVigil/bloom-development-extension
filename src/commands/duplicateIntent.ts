import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { IntentTreeItem, IntentTreeProvider } from '../providers/intentTreeProvider';
import { v4 as uuidv4 } from 'uuid';
import { joinPath } from '../utils/uriHelper';

export function registerDuplicateIntent(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager,
    treeProvider: IntentTreeProvider
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.duplicateIntent',
        async (treeItem: IntentTreeItem) => {
            const metadata = treeItem.intent.metadata;
            
            const newName = await vscode.window.showInputBox({
                prompt: 'Nombre del intent duplicado',
                value: `${metadata.name}-copy`,
                validateInput: (value) => {
                    if (!/^[a-z0-9-]+$/.test(value)) {
                        return 'Solo letras minúsculas, números y guiones';
                    }
                    return null;
                }
            });
            
            if (!newName) return;
            
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;
            
            const newFolder = joinPath(
                workspaceFolder.uri,
                '.bloom',
                'intents',
                newName
            );
            
            try {
                await vscode.workspace.fs.copy(treeItem.intent.folderUri, newFolder, { overwrite: false });
                
                const newMetadata = await metadataManager.read(newFolder);
                if (newMetadata) {
                    newMetadata.id = uuidv4();
                    newMetadata.name = newName;
                    newMetadata.created = new Date().toISOString();
                    newMetadata.updated = new Date().toISOString();
                    await metadataManager.save(newFolder, newMetadata);
                }
                
                treeProvider.refresh();
                
                vscode.window.showInformationMessage(
                    `✅ Intent duplicado como '${newName}'`
                );
                
                logger.info(`Intent duplicado: ${metadata.name} -> ${newName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${(error as Error).message}`);
                logger.error('Error en duplicateIntent', error as Error);
            }
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.duplicateIntent" registrado');
}