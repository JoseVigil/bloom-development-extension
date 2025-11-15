import * as vscode from 'vscode';
import { IntentFormPanel } from '../ui/intentFormPanel';
import { Logger } from '../utils/logger';
import * as path from 'path';

export function registerGenerateIntent(context: vscode.ExtensionContext, logger: Logger): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.generateIntent',
        async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
            logger.info('Ejecutando comando: Bloom: Generate Intent');

            // Obtener archivos seleccionados
            let files: vscode.Uri[] = [];

            if (selectedUris && selectedUris.length > 0) {
                files = selectedUris;
            } else if (uri) {
                files = [uri];
            }

            // Validar que hay archivos seleccionados
            if (files.length === 0) {
                vscode.window.showErrorMessage(
                    'Por favor selecciona al menos un archivo antes de generar un intent.'
                );
                logger.warn('No hay archivos seleccionados');
                return;
            }

            logger.info(`Archivos seleccionados: ${files.length}`);
            
            // Validar límite de archivos
            if (files.length > 1000) {
                vscode.window.showErrorMessage(
                    `Has seleccionado ${files.length} archivos. El límite máximo es 1000.`
                );
                logger.warn(`Límite de archivos excedido: ${files.length}`);
                return;
            }

            // Obtener workspace folder
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto.');
                logger.error('No hay workspace folder');
                return;
            }

            // Convertir URIs a rutas relativas
            const relativePaths = files.map(file => {
                return path.relative(workspaceFolder.uri.fsPath, file.fsPath);
            });

            logger.info(`Rutas relativas: ${relativePaths.join(', ')}`);

            // Abrir formulario de intent
            const formPanel = new IntentFormPanel(
                context,
                logger,
                workspaceFolder,
                files,
                relativePaths
            );

            formPanel.show();
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.generateIntent" registrado');
}