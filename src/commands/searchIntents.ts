import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';

export function registerSearchIntents(
    context: vscode.ExtensionContext,
    logger: Logger,
    metadataManager: MetadataManager
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.searchIntents',
        async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;
            
            const intentsDir = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents'));
            
            try {
                const entries = await vscode.workspace.fs.readDirectory(intentsDir);
                const items = [];
                
                for (const [name, type] of entries) {
                    if (type === vscode.FileType.Directory) {
                        const intentFolder = vscode.Uri.file(path.join(intentsDir.fsPath, name));
                        const metadata = await metadataManager.read(intentFolder);
                        
                        if (metadata) {
                            items.push({
                                label: metadata.displayName || metadata.name,
                                description: metadata.tags?.join(', ') || '',
                                detail: `${metadata.files.filesCount} archivos | ${metadata.status}`,
                                intentFolder: intentFolder
                            });
                        }
                    }
                }
                
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Buscar intents por nombre, tags...'
                });
                
                if (selected) {
                    const intentPath = vscode.Uri.file(path.join(selected.intentFolder.fsPath, 'intent.bl'));
                    const document = await vscode.workspace.openTextDocument(intentPath);
                    await vscode.window.showTextDocument(document);
                }
                
            } catch (error) {
                logger.error('Error en searchIntents', error as Error);
            }
        }
    );
    
    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.searchIntents" registrado');
}