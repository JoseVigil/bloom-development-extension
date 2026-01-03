import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { BrainExecutor } from '../utils/brainExecutor';
import * as path from 'path';

export function registerRegenerateContext(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.regenerateContext',
        async () => {
            logger.info('Ejecutando comando: Regenerate Context');

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto');
                return;
            }

            const bloomPath = path.join(workspaceFolder.uri.fsPath, '.bloom');
            const configPath = path.join(bloomPath, 'config.json');

            // Verificar que existe .bloom/config.json
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(configPath));
            } catch {
                vscode.window.showErrorMessage(
                    'No se encontró .bloom/config.json. Ejecuta "Bloom: Create BTIP Project" primero.'
                );
                return;
            }

            // Leer config para obtener estrategia
            let strategy = 'generic';
            try {
                const configContent = await vscode.workspace.fs.readFile(
                    vscode.Uri.file(configPath)
                );
                const config = JSON.parse(Buffer.from(configContent).toString('utf-8'));
                strategy = config.strategy || 'generic';
            } catch (error) {
                logger.error(`Error leyendo config.json: ${error}`);
            }

            // Confirmar regeneración
            const confirm = await vscode.window.showWarningMessage(
                `¿Regenerar .context.bl con estrategia "${strategy}"?\nEsto sobrescribirá el archivo actual.`,
                'Regenerar',
                'Cancelar'
            );

            if (confirm !== 'Regenerar') {
                return;
            }

            // Ejecutar regeneración
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Regenerando contexto',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ message: 'Analizando proyecto...' });

                    // ✅ MIGRATED: BrainExecutor.generateProjectContext
                    const result = await BrainExecutor.generateProjectContext(
                        workspaceFolder.uri.fsPath,
                        strategy,
                        {
                            outputPath: '.bloom/project',
                            skipExisting: false
                        }
                    );

                    if (result.status !== 'success') {
                        throw new Error(`Error regenerando contexto: ${result.error || result.message}`);
                    }

                    progress.report({ message: 'Regenerando tree.txt...' });

                    // ✅ MIGRATED: BrainExecutor.generateTree
                    const treeOutputPath = path.join(bloomPath, 'project', 'tree.txt');
                    const treeResult = await BrainExecutor.generateTree(
                        treeOutputPath,
                        [workspaceFolder.uri.fsPath],
                        {
                            hash: false,
                            exportJson: true
                        }
                    );

                    if (treeResult.status !== 'success') {
                        logger.warn(`Tree generation warning: ${treeResult.message}`);
                    }

                    logger.info('Contexto regenerado exitosamente');
                }
            );

            // Abrir archivo regenerado
            const openFile = await vscode.window.showInformationMessage(
                '✅ Contexto regenerado exitosamente',
                'Abrir .context.bl'
            );

            if (openFile === 'Abrir .context.bl') {
                const contextPath = vscode.Uri.file(
                    path.join(bloomPath, 'project', '.context.bl')
                );
                await vscode.window.showTextDocument(contextPath);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.regenerateContext" registrado');
}