import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export function registerOpenFileInVSCode(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.openFileInVSCode',
        async (fileUri: vscode.Uri) => {
            logger.info(`Abriendo archivo en VSCode: ${fileUri.fsPath}`);

            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.Two,
                    preserveFocus: false
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Error abriendo archivo: ${error}`);
                logger.error('Error abriendo archivo', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.openFileInVSCode" registrado');
}