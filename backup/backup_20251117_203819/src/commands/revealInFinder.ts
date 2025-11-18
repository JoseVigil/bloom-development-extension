import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export function registerRevealInFinder(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.revealInFinder',
        async (fileUri: vscode.Uri) => {
            logger.info(`Revelando en Finder: ${fileUri.fsPath}`);

            try {
                await vscode.commands.executeCommand('revealFileInOS', fileUri);
            } catch (error) {
                vscode.window.showErrorMessage(`Error revelando archivo: ${error}`);
                logger.error('Error revelando archivo', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.revealInFinder" registrado');
}