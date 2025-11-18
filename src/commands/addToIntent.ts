import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { CodebaseGenerator } from '../core/codebaseGenerator';
import { IntentGenerator } from '../core/intentGenerator';
import { IntentSession } from '../core/intentSession';
import * as path from 'path';

export function registerAddToIntent(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.addToIntent',
        async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
            logger.info('Ejecutando comando: Bloom: Add to Intent');

            let files: vscode.Uri[] = [];

            if (selectedUris && selectedUris.length > 0) {
                files = selectedUris;
            } else if (uri) {
                files = [uri];
            }

            if (files.length === 0) {
                vscode.window.showErrorMessage('No hay archivos seleccionados.');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto.');
                return;
            }

            const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');

            try {
                const intentDirs = await vscode.workspace.fs.readDirectory(
                    vscode.Uri.file(intentsPath)
                );

                const intentNames = intentDirs
                    .filter(([name, type]) => type === vscode.FileType.Directory)
                    .map(([name]) => name);

                if (intentNames.length === 0) {
                    vscode.window.showInformationMessage('No hay intents disponibles.');
                    return;
                }

                const selected = await vscode.window.showQuickPick(intentNames, {
                    placeHolder: 'Selecciona el intent al que agregar archivos'
                });

                if (!selected) return;

                const intentFolder = vscode.Uri.file(path.join(intentsPath, selected));
                
                const metadataManager = new MetadataManager(logger);
                const codebaseGenerator = new CodebaseGenerator();
                const intentGenerator = new IntentGenerator(logger);

                const session = await IntentSession.forIntent(
                    selected,
                    workspaceFolder,
                    metadataManager,
                    codebaseGenerator,
                    intentGenerator,
                    logger
                );

                await session.addFiles(files);

                vscode.window.showInformationMessage(
                    `✅ ${files.length} archivo(s) agregado(s) a '${selected}'`
                );

            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${error}`);
                logger.error('Error en addToIntent', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.addToIntent" registrado');
}